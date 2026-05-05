-- Phase 5: Lesson disputes (şikayet & iade akışı).
--
-- Customer reports that a paid lesson did not happen as expected
-- (instructor no-show, lesson not held, etc). Admin reviews from the
-- Operasyon → İtirazlar tab and either approves with a refund amount
-- (free slots, mark booking refunded, cancel pending payout) or
-- rejects (keeps the money with the instructor).
--
-- Idempotent. Safe to re-run.

------------------------------------------------------------
-- 1. disputes table
------------------------------------------------------------
create table if not exists disputes (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  customer_id uuid not null references users(id) on delete cascade,
  instructor_id uuid not null references users(id) on delete cascade,
  reason text not null check (reason in (
    'lesson_not_held',
    'instructor_no_show',
    'instructor_late',
    'safety_concern',
    'other'
  )),
  description text not null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected'
  )),
  refund_amount integer,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Only one open or resolved dispute per booking.
create unique index if not exists disputes_booking_unique on disputes(booking_id);

create index if not exists disputes_status_created_idx
  on disputes(status, created_at desc);

------------------------------------------------------------
-- 2. RLS
------------------------------------------------------------
alter table disputes enable row level security;

drop policy if exists "disputes_customer_read" on disputes;
create policy "disputes_customer_read" on disputes
  for select using (auth.uid() = customer_id);

drop policy if exists "disputes_instructor_read" on disputes;
create policy "disputes_instructor_read" on disputes
  for select using (auth.uid() = instructor_id);

drop policy if exists "disputes_admin_all" on disputes;
create policy "disputes_admin_all" on disputes
  for all using (public.is_admin()) with check (public.is_admin());

-- Inserts only via RPC (security definer); no direct insert policy.

------------------------------------------------------------
-- 3. Allow payouts to be cancelled when a dispute is approved.
------------------------------------------------------------
alter table payouts drop constraint if exists payouts_status_check;
alter table payouts add constraint payouts_status_check
  check (status in ('pending', 'released', 'cancelled'));

------------------------------------------------------------
-- 4. RPC: file_dispute (customer)
------------------------------------------------------------
create or replace function file_dispute(
  p_booking uuid,
  p_reason text,
  p_description text
) returns disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_booking bookings%rowtype;
  v_existing disputes%rowtype;
  v_row disputes%rowtype;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if p_description is null or length(trim(p_description)) < 10 then
    raise exception 'açıklama en az 10 karakter olmalı';
  end if;
  if p_reason not in (
    'lesson_not_held','instructor_no_show','instructor_late',
    'safety_concern','other'
  ) then
    raise exception 'invalid reason';
  end if;

  select * into v_booking from bookings where id = p_booking;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.customer_id <> v_caller then
    raise exception 'not your booking';
  end if;
  if v_booking.payment_status <> 'paid' then
    raise exception 'sadece ödenmiş rezervasyonlar için itiraz açabilirsin';
  end if;
  -- Customer can dispute once the lesson date has arrived (they need to
  -- know the lesson actually happened or not).
  if v_booking.lesson_date > current_date then
    raise exception 'ders tarihinden önce itiraz açılamaz';
  end if;

  select * into v_existing from disputes where booking_id = p_booking;
  if found then
    raise exception 'bu rezervasyon için zaten bir itiraz açılmış';
  end if;

  insert into disputes (booking_id, customer_id, instructor_id, reason, description)
    values (p_booking, v_caller, v_booking.instructor_id, p_reason, trim(p_description))
    returning * into v_row;
  return v_row;
end;
$$;
grant execute on function file_dispute(uuid, text, text) to authenticated;

------------------------------------------------------------
-- 5. RPC: admin_resolve_dispute
------------------------------------------------------------
create or replace function admin_resolve_dispute(
  p_dispute uuid,
  p_action text,           -- 'approve' | 'reject'
  p_refund_kurus integer,  -- only used when approving; null = full refund
  p_note text
) returns disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_role text;
  v_dispute disputes%rowtype;
  v_booking bookings%rowtype;
  v_refund integer;
  v_pct smallint;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  select role into v_role from users where id = v_caller;
  if v_role <> 'admin' then raise exception 'admin only'; end if;

  if p_action not in ('approve','reject') then
    raise exception 'invalid action';
  end if;

  select * into v_dispute from disputes where id = p_dispute for update;
  if not found then raise exception 'dispute not found'; end if;
  if v_dispute.status <> 'pending' then
    raise exception 'dispute already resolved';
  end if;

  if p_action = 'reject' then
    update disputes
       set status = 'rejected',
           resolution_note = nullif(trim(coalesce(p_note,'')),''),
           resolved_at = now(),
           resolved_by = v_caller
     where id = p_dispute
     returning * into v_dispute;
    return v_dispute;
  end if;

  -- approve → refund booking and free slots
  select * into v_booking from bookings where id = v_dispute.booking_id for update;
  if not found then raise exception 'booking not found'; end if;

  -- Refuse approval if instructor was already paid out — refund/clawback
  -- needs to be handled out-of-band before this can proceed safely.
  if exists (
    select 1 from payouts
     where booking_id = v_booking.id and status = 'released'
  ) then
    raise exception 'eğitmene ödeme yapılmış, önce iadeyi geri al';
  end if;

  v_refund := coalesce(p_refund_kurus, v_booking.total_price);
  if v_refund < 0 or v_refund > v_booking.total_price then
    raise exception 'invalid refund amount';
  end if;
  v_pct := round(v_refund * 100.0 / nullif(v_booking.total_price,0))::smallint;

  update time_slots
     set status = 'available', booking_id = null
   where booking_id = v_booking.id;

  update bookings
     set lesson_status = 'cancelled',
         payment_status = case when v_refund > 0 then 'refunded' else 'paid' end,
         refund_amount = v_refund,
         refund_pct = v_pct,
         cancellation_reason = 'admin: itiraz kabul edildi',
         cancelled_by = v_caller,
         cancelled_at = now()
   where id = v_booking.id;

  -- Cancel any pending payout tied to this booking so we don't pay
  -- out the instructor for a lesson that didn't happen.
  if v_refund > 0 then
    update payouts
       set status = 'cancelled'
     where booking_id = v_booking.id and status = 'pending';
  end if;

  update disputes
     set status = 'approved',
         refund_amount = v_refund,
         resolution_note = nullif(trim(coalesce(p_note,'')),''),
         resolved_at = now(),
         resolved_by = v_caller
   where id = p_dispute
   returning * into v_dispute;
  return v_dispute;
end;
$$;
grant execute on function admin_resolve_dispute(uuid, text, integer, text) to authenticated;
