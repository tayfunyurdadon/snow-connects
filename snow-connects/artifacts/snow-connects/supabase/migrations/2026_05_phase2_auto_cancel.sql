-- Phase 2: auto-cancel of unpaid bookings.
--
-- Problem: when create_booking succeeds it marks slots as 'booked' and
-- the booking row as 'pending' payment. If the customer abandons the
-- payment screen the slot stays locked forever, blocking real customers.
--
-- Fix: every pending booking gets a `payment_deadline` (default 15 min
-- from creation). Anyone calling create_booking — or the dedicated
-- release RPC — first sweeps expired pendings: slots are freed and the
-- booking row is marked 'failed' (kept for audit, hidden from customer
-- by the payment_status='paid' filter on the bookings list).
--
-- Idempotent: safe to run repeatedly.

------------------------------------------------------------
-- 1. Schema: payment_deadline column
------------------------------------------------------------
alter table bookings
  add column if not exists payment_deadline timestamptz;

-- Backfill: any existing pending booking gets a deadline 15 min from
-- its creation. Already-expired ones will be cleaned by the next
-- create_booking call (or the manual release RPC).
update bookings
   set payment_deadline = created_at + interval '15 minutes'
 where payment_status = 'pending'
   and payment_deadline is null;

create index if not exists idx_bookings_pending_deadline
  on bookings(payment_deadline)
  where payment_status = 'pending';

------------------------------------------------------------
-- 2. Sweeper: release expired pending bookings
------------------------------------------------------------
-- Returns the number of bookings released. SECURITY DEFINER so callers
-- without write access to bookings can still trigger the sweep.
create or replace function release_expired_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired uuid[];
  v_count integer;
begin
  select coalesce(array_agg(id), array[]::uuid[])
    into v_expired
    from bookings
   where payment_status = 'pending'
     and payment_deadline is not null
     and payment_deadline < now();

  v_count := array_length(v_expired, 1);
  if v_count is null or v_count = 0 then
    return 0;
  end if;

  -- Free the slots first so a concurrent create_booking can grab them.
  update time_slots
     set status = 'available',
         booking_id = null
   where booking_id = any(v_expired);

  -- Mark the bookings as failed (kept for audit; customers don't see
  -- non-paid rows in their list).
  update bookings
     set payment_status = 'failed',
         lesson_status = 'cancelled'
   where id = any(v_expired);

  return v_count;
end;
$$;

grant execute on function release_expired_pending_bookings() to authenticated, anon;

------------------------------------------------------------
-- 3. create_booking: sweep first, then set deadline on insert
------------------------------------------------------------
create or replace function create_booking(
  p_instructor uuid,
  p_resort uuid,
  p_date date,
  p_slot_times text[],
  p_students json
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_base integer;
  v_base_total integer;
  v_vat_rate numeric;
  v_commission_rate numeric;
  v_test_mode boolean;
  v_vat integer;
  v_commission integer;
  v_total integer;
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
  v_deadline timestamptz;
  i integer;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select status into v_status from users where id = v_customer;
  if v_status = 'blocked' then raise exception 'account blocked'; end if;
  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;

  -- Lazy cleanup: free any slots whose pending booking has expired
  -- before we check availability for this new booking.
  perform release_expired_pending_bookings();

  select vat_rate, commission_rate, test_mode,
         season_start_month, season_start_day,
         season_end_month,   season_end_day
    into v_vat_rate, v_commission_rate, v_test_mode,
         v_season_start_month, v_season_start_day,
         v_season_end_month,   v_season_end_day
    from app_config where id = 1;

  v_year := extract(year from p_date)::int;
  v_season_start := make_date(
    case when extract(month from p_date)::int >= v_season_start_month then v_year else v_year - 1 end,
    v_season_start_month,
    v_season_start_day
  );
  v_season_end := make_date(
    extract(year from v_season_start)::int + 1,
    v_season_end_month,
    v_season_end_day
  );
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  declare v_verif text;
  begin
    select verification_status into v_verif from instructor_profiles where user_id = p_instructor;
    if v_verif is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  select
    case
      when v_student_count >= 4 then coalesce(nullif(price_4_plus_person, 0), base_price)
      when v_student_count = 3   then coalesce(nullif(price_3_person, 0),     base_price)
      when v_student_count = 2   then coalesce(nullif(price_2_person, 0),     base_price)
      else                            coalesce(nullif(price_1_person, 0),     base_price)
    end
    into v_base
    from instructor_profiles where user_id = p_instructor;
  if v_base is null then raise exception 'instructor not found'; end if;

  v_base_total := v_base * v_student_count * v_slot_count;
  v_vat := round(v_base_total * v_vat_rate)::int;
  v_total := v_base_total + v_vat;
  v_commission := round(v_total * v_commission_rate)::int;

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

  v_payment_status := case when v_test_mode then 'paid' else 'pending' end;
  v_deadline := case when v_test_mode then null else now() + interval '15 minutes' end;

  insert into bookings (customer_id, instructor_id, resort_id, slot_ids, student_count,
                        base_amount, vat_amount, commission_amount, total_price, lesson_date,
                        payment_status, is_test_booking, payment_deadline)
    values (v_customer, p_instructor, p_resort, v_slot_ids, v_student_count,
            v_base_total, v_vat, v_commission, v_total, p_date,
            v_payment_status, v_test_mode, v_deadline)
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

  return json_build_object(
    'booking_id', v_booking_id,
    'total', v_total,
    'vat', v_vat,
    'payment_status', v_payment_status,
    'is_test_booking', v_test_mode,
    'payment_deadline', v_deadline
  );
end;
$$;

------------------------------------------------------------
-- 4. confirm_payment: also clear payment_deadline
------------------------------------------------------------
-- Existing confirm_payment just flips payment_status to 'paid'. Now we
-- also null the deadline so the sweeper can never accidentally release
-- a paid booking after a clock skew.
create or replace function confirm_payment(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_booking bookings%rowtype;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select * into v_booking from bookings where id = p_booking and customer_id = v_customer for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.payment_status = 'paid' then
    return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
  end if;
  update bookings
     set payment_status = 'paid',
         payment_deadline = null
   where id = p_booking;
  return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
end;
$$;
grant execute on function confirm_payment(uuid) to authenticated;
