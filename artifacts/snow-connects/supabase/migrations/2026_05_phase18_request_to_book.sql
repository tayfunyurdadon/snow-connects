-- ============================================================
-- Phase 18 — Request-to-Book (Airbnb-style instructor approval)
-- ============================================================
-- Customers no longer auto-charge on booking. Instead they SEND a
-- REQUEST; the instructor has 12h SLA to accept/reject. After 12h
-- the request is NOT killed — it moves to 'awaiting_response' so the
-- customer is asked whether to keep waiting or cancel. Hard guardrail:
-- the system auto-cancels any still-pending request when the lesson
-- date is < 24h away.
--
-- Instructors may opt into "Anında Onay" (instant book), which keeps
-- the legacy auto-paid flow.
--
-- This migration is idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema changes
-- ------------------------------------------------------------

alter table bookings
  add column if not exists approval_status text
    check (approval_status in (
      'pending',             -- instructor has not responded yet, within 12h SLA
      'awaiting_response',   -- 12h elapsed, customer asked to extend or cancel
      'approved',            -- instructor accepted (payment captured)
      'rejected',            -- instructor declined
      'expired',             -- auto-cancelled by 24h-before-lesson guardrail
      'customer_cancelled'   -- customer pulled the request
    )),
  add column if not exists requested_at timestamptz,
  add column if not exists approval_deadline timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists extension_count int not null default 0,
  add column if not exists payment_method_token text;

create index if not exists idx_bookings_approval_status
  on bookings(approval_status) where approval_status is not null;

create index if not exists idx_bookings_approval_deadline
  on bookings(approval_deadline) where approval_deadline is not null;

alter table instructor_profiles
  add column if not exists instant_book_enabled boolean not null default false;

-- Push notification token storage. One user can have multiple devices.
create table if not exists push_tokens (
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table push_tokens enable row level security;

drop policy if exists push_tokens_self_rw on push_tokens;
create policy push_tokens_self_rw on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Helper: business-day release date (re-used by accept RPC)
-- ------------------------------------------------------------
create or replace function _add_business_days(p_start date, p_n integer)
returns date language plpgsql immutable as $$
declare
  v_d date := p_start;
  v_added int := 0;
begin
  while v_added < p_n loop
    v_d := v_d + 1;
    if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
  end loop;
  return v_d;
end;
$$;

-- ------------------------------------------------------------
-- 3. request_booking: replaces create_booking for the request flow.
--    Falls back to the legacy auto-pay flow when the instructor has
--    instant_book_enabled=true OR when test_mode=true.
-- ------------------------------------------------------------
create or replace function request_booking(
  p_instructor uuid,
  p_resort uuid,
  p_date date,
  p_slot_times text[],
  p_students json,
  p_payment_method_token text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_base integer;
  v_base_total integer;
  v_vat_rate numeric;
  v_bank_rate numeric;
  v_fee integer;
  v_test_mode boolean;
  v_vat integer;
  v_lesson integer;
  v_bank integer;
  v_total integer;
  v_platform integer;
  v_slot_ids uuid[];
  v_booking_id uuid;
  v_student json;
  v_slot_count integer := array_length(p_slot_times, 1);
  v_student_count integer := json_array_length(p_students);
  v_year integer;
  v_season_start date;
  v_season_end date;
  v_season_start_month smallint;
  v_season_start_day smallint;
  v_season_end_month smallint;
  v_season_end_day smallint;
  v_status text;
  v_existing time_slots%rowtype;
  v_slot_id uuid;
  v_payment_status text;
  v_approval_status text;
  v_approval_deadline timestamptz;
  v_release date;
  v_instant boolean;
  v_school_id uuid;
  v_school_price integer;
  v_recipient_type text;
  v_recipient_id uuid;
  v_d date;
  v_added int;
  i integer;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select status into v_status from users where id = v_customer;
  if v_status = 'blocked' then raise exception 'account blocked'; end if;
  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;

  perform release_expired_pending_bookings();

  select vat_rate, bank_commission_rate, transaction_fee_kurus, test_mode,
         season_start_month, season_start_day,
         season_end_month,   season_end_day
    into v_vat_rate, v_bank_rate, v_fee, v_test_mode,
         v_season_start_month, v_season_start_day,
         v_season_end_month,   v_season_end_day
    from app_config where id = 1;

  v_year := extract(year from p_date)::int;
  v_season_start := make_date(
    case when extract(month from p_date)::int >= v_season_start_month then v_year else v_year - 1 end,
    v_season_start_month, v_season_start_day
  );
  v_season_end := make_date(
    extract(year from v_season_start)::int + 1,
    v_season_end_month, v_season_end_day
  );
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  -- Hard guardrail: can't request a lesson less than 24h out.
  if p_date < (current_date + 1) then
    raise exception 'lesson_too_soon';
  end if;

  -- Verification gate (school-affiliated approval also accepted)
  declare
    v_verif text;
    v_school_appr text;
  begin
    select verification_status, school_approval_status, school_id, instant_book_enabled
      into v_verif, v_school_appr, v_school_id, v_instant
      from instructor_profiles where user_id = p_instructor;
    if v_verif is null then raise exception 'instructor not found'; end if;
    if v_verif <> 'approved' and v_school_appr is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  -- Effective tier price: school overlay -> instructor tier -> legacy base
  select case
      when v_student_count >= 4 then coalesce(nullif(price_4plus_kurus, 0), 0)
      when v_student_count = 3   then coalesce(nullif(price_3_kurus, 0),     0)
      when v_student_count = 2   then coalesce(nullif(price_2_kurus, 0),     0)
      else                            coalesce(nullif(price_1_kurus, 0),     0)
    end
    into v_school_price
    from ski_schools where id = v_school_id;

  select case
      when v_school_price is not null and v_school_price > 0 then v_school_price
      when v_student_count >= 4 then coalesce(nullif(price_4_plus_person, 0), base_price)
      when v_student_count = 3   then coalesce(nullif(price_3_person, 0),     base_price)
      when v_student_count = 2   then coalesce(nullif(price_2_person, 0),     base_price)
      else                            coalesce(nullif(price_1_person, 0),     base_price)
    end
    into v_base
    from instructor_profiles where user_id = p_instructor;
  if v_base is null then raise exception 'instructor not found'; end if;

  v_base_total := v_base * v_student_count * v_slot_count;
  v_vat        := round(v_base_total * v_vat_rate)::int;
  v_lesson     := v_base_total + v_vat;
  v_bank       := round(v_lesson * v_bank_rate)::int;
  v_total      := v_lesson + v_fee;
  v_platform   := v_bank + v_fee;

  -- Lock slots (tentative hold; freed if request expires/rejected/cancelled)
  v_slot_ids := array[]::uuid[];
  for i in 1..v_slot_count loop
    select * into v_existing from time_slots
      where instructor_id = p_instructor and date = p_date and slot_time = p_slot_times[i] for update;
    if found then
      if v_existing.status <> 'available' then
        raise exception 'slot taken: %', p_slot_times[i];
      end if;
      update time_slots set status = 'booked' where id = v_existing.id returning id into v_slot_id;
    else
      insert into time_slots (instructor_id, date, slot_time, status)
        values (p_instructor, p_date, p_slot_times[i], 'booked') returning id into v_slot_id;
    end if;
    v_slot_ids := array_append(v_slot_ids, v_slot_id);
  end loop;

  -- Decide flow: instant book / test mode -> auto-pay; otherwise request.
  if coalesce(v_instant, false) or coalesce(v_test_mode, false) then
    v_payment_status   := 'paid';
    v_approval_status  := 'approved';
    v_approval_deadline := null;
  else
    v_payment_status   := 'pending';
    v_approval_status  := 'pending';
    v_approval_deadline := now() + interval '12 hours';
  end if;

  insert into bookings (
    customer_id, instructor_id, resort_id, slot_ids, student_count,
    base_amount, vat_amount, commission_amount, total_price, lesson_date,
    payment_status, is_test_booking,
    transaction_fee, bank_commission,
    approval_status, requested_at, approval_deadline, approved_at,
    payment_method_token,
    payment_deadline   -- IMPORTANT: NULL for request flow so the 15-min sweeper ignores it
  ) values (
    v_customer, p_instructor, p_resort, v_slot_ids, v_student_count,
    v_base_total, v_vat, v_platform, v_total, p_date,
    v_payment_status, coalesce(v_test_mode, false),
    v_fee, v_bank,
    v_approval_status, now(), v_approval_deadline,
    case when v_approval_status = 'approved' then now() else null end,
    p_payment_method_token,
    null
  )
  returning id into v_booking_id;

  update time_slots set booking_id = v_booking_id where id = any(v_slot_ids);

  for v_student in select * from json_array_elements(p_students) loop
    insert into students (booking_id, first_name, last_name, age, experience_level)
      values (v_booking_id,
              v_student->>'firstName',
              v_student->>'lastName',
              (v_student->>'age')::int,
              v_student->>'experienceLevel');
  end loop;

  -- If instant/test-mode: insert payout immediately (mirrors create_booking)
  if v_approval_status = 'approved' then
    v_release := _add_business_days(p_date, 21);
    if v_school_id is not null then
      v_recipient_type := 'school';
      v_recipient_id := v_school_id;
    else
      v_recipient_type := 'instructor';
      v_recipient_id := p_instructor;
    end if;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status,
                         recipient_type, recipient_id)
      values (p_instructor, v_booking_id, v_lesson, v_bank, v_lesson - v_bank,
              p_date, v_release, 'pending',
              v_recipient_type, v_recipient_id);
  end if;

  return json_build_object(
    'booking_id', v_booking_id,
    'total', v_total,
    'lesson_amount', v_lesson,
    'vat', v_vat,
    'bank_commission', v_bank,
    'transaction_fee', v_fee,
    'payment_status', v_payment_status,
    'approval_status', v_approval_status,
    'approval_deadline', v_approval_deadline,
    'is_instant', coalesce(v_instant, false) or coalesce(v_test_mode, false)
  );
end;
$$;
grant execute on function request_booking(uuid, uuid, date, text[], json, text) to authenticated;

-- ------------------------------------------------------------
-- 4. instructor_accept_request: capture payment, mark approved
-- ------------------------------------------------------------
create or replace function instructor_accept_request(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
  v_release date;
  v_lesson integer;
  v_recipient_type text;
  v_recipient_id uuid;
  v_school_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_b.instructor_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.approval_status not in ('pending', 'awaiting_response') then
    raise exception 'cannot accept in status %', v_b.approval_status;
  end if;

  -- Stub payment capture. Real Param.com integration goes here later.
  update bookings
     set approval_status = 'approved',
         approved_at = now(),
         payment_status = 'paid',
         payment_deadline = null
   where id = p_booking;

  if not exists (select 1 from payouts where booking_id = p_booking) then
    select school_id into v_school_id from instructor_profiles where user_id = v_uid;
    if v_school_id is not null then
      v_recipient_type := 'school';
      v_recipient_id := v_school_id;
    else
      v_recipient_type := 'instructor';
      v_recipient_id := v_uid;
    end if;
    v_release := _add_business_days(v_b.lesson_date, 21);
    v_lesson  := v_b.base_amount + v_b.vat_amount;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status,
                         recipient_type, recipient_id)
      values (v_uid, p_booking, v_lesson, v_b.bank_commission,
              v_lesson - v_b.bank_commission, v_b.lesson_date, v_release, 'pending',
              v_recipient_type, v_recipient_id);
  end if;

  return json_build_object('booking_id', p_booking, 'approval_status', 'approved');
end;
$$;
grant execute on function instructor_accept_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. instructor_reject_request: free slots, no charge
-- ------------------------------------------------------------
create or replace function instructor_reject_request(p_booking uuid, p_reason text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_b.instructor_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.approval_status not in ('pending', 'awaiting_response') then
    raise exception 'cannot reject in status %', v_b.approval_status;
  end if;

  update bookings
     set approval_status = 'rejected',
         lesson_status = 'cancelled',
         payment_status = 'failed',
         rejection_reason = p_reason,
         cancelled_by = v_uid,
         cancelled_at = now(),
         cancellation_reason = coalesce(p_reason, 'Eğitmen reddetti'),
         payment_deadline = null
   where id = p_booking;

  -- Free the slots
  update time_slots
     set status = 'available', booking_id = null
   where id = any(v_b.slot_ids);

  return json_build_object('booking_id', p_booking, 'approval_status', 'rejected');
end;
$$;
grant execute on function instructor_reject_request(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 6. customer_extend_request: customer chose "keep waiting"
-- ------------------------------------------------------------
create or replace function customer_extend_request(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
  v_new_deadline timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_b.customer_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.approval_status not in ('pending', 'awaiting_response') then
    raise exception 'cannot extend in status %', v_b.approval_status;
  end if;

  -- Don't push the deadline past lesson_date - 24h
  v_new_deadline := least(
    now() + interval '12 hours',
    (v_b.lesson_date::timestamptz - interval '24 hours')
  );

  update bookings
     set approval_status = 'pending',
         approval_deadline = v_new_deadline,
         extension_count = extension_count + 1
   where id = p_booking;

  return json_build_object(
    'booking_id', p_booking,
    'approval_status', 'pending',
    'approval_deadline', v_new_deadline
  );
end;
$$;
grant execute on function customer_extend_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. customer_cancel_request: customer pulled the request
-- ------------------------------------------------------------
create or replace function customer_cancel_request(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_b.customer_id <> v_uid then raise exception 'not your booking'; end if;
  if v_b.approval_status not in ('pending', 'awaiting_response') then
    raise exception 'cannot cancel in status %', v_b.approval_status;
  end if;

  update bookings
     set approval_status = 'customer_cancelled',
         lesson_status = 'cancelled',
         payment_status = 'failed',
         cancelled_by = v_uid,
         cancelled_at = now(),
         cancellation_reason = 'Müşteri talebi geri çekti'
   where id = p_booking;

  update time_slots
     set status = 'available', booking_id = null
   where id = any(v_b.slot_ids);

  return json_build_object('booking_id', p_booking, 'approval_status', 'customer_cancelled');
end;
$$;
grant execute on function customer_cancel_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. mark_overdue_requests: 12h elapsed without instructor response
--    -> approval_status = 'awaiting_response' (slots stay locked,
--    customer is asked to extend or cancel via the UI).
-- ------------------------------------------------------------
create or replace function mark_overdue_requests()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with upd as (
    update bookings
       set approval_status = 'awaiting_response'
     where approval_status = 'pending'
       and approval_deadline is not null
       and approval_deadline < now()
    returning id
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$$;
grant execute on function mark_overdue_requests() to authenticated, anon;

-- ------------------------------------------------------------
-- 9. auto_cancel_late_requests: still-pending requests within 24h
--    of lesson date -> cancelled, slots freed, no charge.
-- ------------------------------------------------------------
create or replace function auto_cancel_late_requests()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_b bookings%rowtype;
begin
  for v_b in
    select * from bookings
     where approval_status in ('pending', 'awaiting_response')
       and lesson_date <= (current_date + 1)
     for update
  loop
    update bookings
       set approval_status = 'expired',
           lesson_status = 'cancelled',
           payment_status = 'failed',
           cancelled_at = now(),
           cancellation_reason = 'Eğitmenden 24 saat içinde dönüş alınamadı'
     where id = v_b.id;
    update time_slots
       set status = 'available', booking_id = null
     where id = any(v_b.slot_ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function auto_cancel_late_requests() to authenticated, anon;

-- ------------------------------------------------------------
-- 10. instructor_set_instant_book: opt in/out of fast-path
-- ------------------------------------------------------------
create or replace function instructor_set_instant_book(p_enabled boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update instructor_profiles
     set instant_book_enabled = p_enabled
   where user_id = v_uid;
  return json_build_object('instant_book_enabled', p_enabled);
end;
$$;
grant execute on function instructor_set_instant_book(boolean) to authenticated;

-- ------------------------------------------------------------
-- 11. register_push_token: client uploads its Expo push token
-- ------------------------------------------------------------
create or replace function register_push_token(p_token text, p_platform text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_token is null or length(p_token) = 0 then return; end if;
  insert into push_tokens (user_id, token, platform, updated_at)
    values (v_uid, p_token, p_platform, now())
    on conflict (user_id, token) do update set updated_at = now(), platform = excluded.platform;
end;
$$;
grant execute on function register_push_token(text, text) to authenticated;

-- ------------------------------------------------------------
-- 12. Backfill: existing paid bookings get approval_status='approved'
-- ------------------------------------------------------------
update bookings
   set approval_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where approval_status is null
   and payment_status = 'paid';

-- Older pending (15-min payment) bookings — leave approval_status NULL so
-- the legacy create_booking + confirm_payment flow still works for them.

-- ------------------------------------------------------------
-- 13. pg_cron jobs (best-effort: only schedules if extension exists)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove old jobs of the same name if they exist
    perform cron.unschedule(jobid)
      from cron.job where jobname in ('snowconnects_mark_overdue', 'snowconnects_auto_cancel');
    perform cron.schedule(
      'snowconnects_mark_overdue', '*/5 * * * *',
      'select mark_overdue_requests();'
    );
    perform cron.schedule(
      'snowconnects_auto_cancel', '*/15 * * * *',
      'select auto_cancel_late_requests();'
    );
  end if;
end$$;
