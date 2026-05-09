-- Phase 14: school → instructor cash transfers.
-- Schools collect customer payments (recipient='school' on payouts) and
-- then settle their instructors out-of-band (bank wire / cash). Until
-- now there was no record of those settlements. This phase tracks them.
--
-- Rules:
-- * A school admin can record a payment to one of their own approved
--   instructors at any time, but the running total cannot exceed the
--   instructor's earned share of RELEASED school payouts (i.e. the
--   money has actually been collected from the customer).
-- * The instructor sees their own payment history.
-- * Payments are append-only history records, not financial postings —
--   they don't touch the `payouts` table.

------------------------------------------------------------
-- 1. Table
------------------------------------------------------------
create table if not exists public.school_instructor_payments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.ski_schools(id) on delete cascade,
  instructor_id   uuid not null references public.users(id) on delete cascade,
  amount_kurus    integer not null check (amount_kurus > 0),
  note            text,
  paid_at         timestamptz not null default now(),
  created_by      uuid references public.users(id) on delete set null
);

create index if not exists school_instructor_payments_school_idx
  on public.school_instructor_payments(school_id, paid_at desc);
create index if not exists school_instructor_payments_instructor_idx
  on public.school_instructor_payments(instructor_id, paid_at desc);

alter table public.school_instructor_payments enable row level security;

-- School admin reads their own school's payments
drop policy if exists sip_select_school on public.school_instructor_payments;
create policy sip_select_school on public.school_instructor_payments
  for select to authenticated
  using (
    exists (
      select 1 from public.ski_schools s
       where s.id = school_id and s.admin_user_id = auth.uid()
    )
  );

-- Instructor reads their own payments
drop policy if exists sip_select_instructor on public.school_instructor_payments;
create policy sip_select_instructor on public.school_instructor_payments
  for select to authenticated
  using (instructor_id = auth.uid());

-- All writes go through SECURITY DEFINER RPCs; no direct insert/update/delete.

------------------------------------------------------------
-- 2. Helpers
------------------------------------------------------------

-- Earned (released) instructor share for one instructor at one school,
-- measured in kuruş. Mirrors the math in school_instructor_breakdown:
--   share = released_total * instructor_share_rate   (rounded)
create or replace function public._school_instructor_earned_kurus(
  p_school uuid, p_instructor uuid
) returns bigint
language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(p.net_amount), 0)
               * coalesce(s.instructor_share_rate, 0))::bigint
    from public.ski_schools s
    left join public.payouts p
      on p.recipient_type = 'school'
     and p.recipient_id = s.id
     and p.instructor_id = p_instructor
     and p.status = 'released'
   where s.id = p_school
   group by s.instructor_share_rate;
$$;

create or replace function public._school_instructor_paid_kurus(
  p_school uuid, p_instructor uuid
) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_kurus), 0)::bigint
    from public.school_instructor_payments
   where school_id = p_school and instructor_id = p_instructor;
$$;

------------------------------------------------------------
-- 3. RPCs — school side
------------------------------------------------------------

-- Per-instructor settlement summary for the school admin.
create or replace function public.school_instructor_payment_summary()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_rate   numeric;
  v_result json;
begin
  select id, instructor_share_rate into v_school, v_rate
    from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  with earned as (
    -- Instructor share of RELEASED school payouts, per instructor.
    select p.instructor_id,
           round(sum(p.net_amount) * v_rate)::bigint as earned_kurus,
           count(*) as released_lesson_count
      from public.payouts p
     where p.recipient_type = 'school'
       and p.recipient_id = v_school
       and p.status = 'released'
     group by p.instructor_id
  ), paid as (
    select instructor_id,
           coalesce(sum(amount_kurus), 0)::bigint as paid_kurus,
           max(paid_at) as last_paid_at,
           count(*) as payment_count
      from public.school_instructor_payments
     where school_id = v_school
     group by instructor_id
  ), roster as (
    -- Anyone who is on the school's roster (approved or pending) OR
    -- has any earned/paid history. This covers an instructor who has
    -- since left the school but still has unsettled balance.
    select ip.user_id as instructor_id
      from public.instructor_profiles ip
     where ip.school_id = v_school
    union
    select instructor_id from earned
    union
    select instructor_id from paid
  )
  select coalesce(json_agg(json_build_object(
    'instructor_id',          r.instructor_id,
    'instructor_name',        coalesce(u.name, 'Eğitmen'),
    'instructor_iban',        iv.iban,
    'school_approval_status', ip.school_approval_status,
    'earned_kurus',           coalesce(e.earned_kurus, 0),
    'paid_kurus',             coalesce(pd.paid_kurus, 0),
    'balance_kurus',          coalesce(e.earned_kurus, 0) - coalesce(pd.paid_kurus, 0),
    'released_lesson_count',  coalesce(e.released_lesson_count, 0),
    'payment_count',          coalesce(pd.payment_count, 0),
    'last_paid_at',           pd.last_paid_at
  ) order by (coalesce(e.earned_kurus, 0) - coalesce(pd.paid_kurus, 0)) desc,
              coalesce(u.name, '')), '[]'::json)
  into v_result
  from roster r
  left join public.users u on u.id = r.instructor_id
  left join public.instructor_profiles ip on ip.user_id = r.instructor_id
  left join public.instructor_verification iv on iv.user_id = r.instructor_id
  left join earned e on e.instructor_id = r.instructor_id
  left join paid pd on pd.instructor_id = r.instructor_id;

  return v_result;
end;
$$;
grant execute on function public.school_instructor_payment_summary() to authenticated;

-- Record a school → instructor payment (cash / bank wire happens
-- outside the app; this is just bookkeeping). Validates the new
-- running total stays within the released earned amount.
create or replace function public.school_record_instructor_payment(
  p_instructor   uuid,
  p_amount_kurus integer,
  p_note         text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_earned bigint;
  v_paid   bigint;
  v_id     uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id into v_school from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  -- Serialize concurrent payment writes for the same (school, instructor)
  -- pair so two simultaneous calls cannot both pass the balance check
  -- and overdraw. Uses a transaction-scoped advisory lock keyed on the
  -- instructor uuid (school is implied by the admin's session). The
  -- lock is released automatically at COMMIT/ROLLBACK.
  perform pg_advisory_xact_lock(
    hashtextextended(v_school::text || ':' || p_instructor::text, 0)
  );

  v_earned := public._school_instructor_earned_kurus(v_school, p_instructor);
  v_paid   := public._school_instructor_paid_kurus(v_school, p_instructor);

  if coalesce(v_earned, 0) <= 0 then
    raise exception 'no released earnings for this instructor yet';
  end if;
  if v_paid + p_amount_kurus > v_earned then
    raise exception 'amount exceeds remaining balance (% kurus left)',
      (v_earned - v_paid);
  end if;

  insert into public.school_instructor_payments
    (school_id, instructor_id, amount_kurus, note, created_by)
    values (v_school, p_instructor, p_amount_kurus,
            nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;
grant execute on function public.school_record_instructor_payment(uuid, integer, text) to authenticated;

-- Payment history for one instructor (school view).
create or replace function public.school_instructor_payment_history(
  p_instructor uuid
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_result json;
begin
  select id into v_school from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  select coalesce(json_agg(json_build_object(
    'id',           p.id,
    'amount_kurus', p.amount_kurus,
    'note',         p.note,
    'paid_at',      p.paid_at
  ) order by p.paid_at desc), '[]'::json)
  into v_result
  from public.school_instructor_payments p
  where p.school_id = v_school and p.instructor_id = p_instructor;

  return v_result;
end;
$$;
grant execute on function public.school_instructor_payment_history(uuid) to authenticated;

-- Allow a school admin to delete a mistaken entry (last 24h only —
-- keeps history audit-friendly while letting the admin fix typos).
create or replace function public.school_delete_instructor_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_row    public.school_instructor_payments%rowtype;
begin
  select id into v_school from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  select * into v_row from public.school_instructor_payments where id = p_id;
  if not found or v_row.school_id <> v_school then
    raise exception 'payment not found';
  end if;
  if v_row.paid_at < now() - interval '24 hours' then
    raise exception 'payments older than 24h cannot be deleted';
  end if;

  delete from public.school_instructor_payments where id = p_id;
end;
$$;
grant execute on function public.school_delete_instructor_payment(uuid) to authenticated;

------------------------------------------------------------
-- 4. RPCs — instructor side
------------------------------------------------------------

-- Instructor's own school payment history, with school name.
create or replace function public.instructor_my_school_payments()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_result json;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select coalesce(json_agg(json_build_object(
    'id',           p.id,
    'school_id',    p.school_id,
    'school_name',  s.name,
    'amount_kurus', p.amount_kurus,
    'note',         p.note,
    'paid_at',      p.paid_at
  ) order by p.paid_at desc), '[]'::json)
  into v_result
  from public.school_instructor_payments p
  left join public.ski_schools s on s.id = p.school_id
  where p.instructor_id = auth.uid();

  return v_result;
end;
$$;
grant execute on function public.instructor_my_school_payments() to authenticated;
