-- Phase 7: New payment model.
--
-- Customer pays   = lesson_amount (base + VAT) + flat transaction fee (100 TL).
-- Bank commission = 4% of lesson_amount, deducted from instructor.
-- Instructor net  = lesson_amount × 96%.
-- Snow Connects revenue per booking = bank_commission + transaction_fee.
--
-- Schema changes:
--   bookings.transaction_fee  (NEW, kuruş, default 0) -- flat fee on top of lesson
--   bookings.bank_commission  (NEW, kuruş, default 0) -- bank cut from instructor
--   bookings.commission_amount is REPURPOSED: now = bank_commission + transaction_fee
--                                             (= total platform revenue per booking).
--   bookings.total_price = base_amount + vat_amount + transaction_fee
--                          (= what the customer actually pays).
--   payouts.gross_amount  = lesson amount (base + vat)
--   payouts.commission    = bank_commission
--   payouts.net_amount    = lesson_amount - bank_commission
--   app_config.bank_commission_rate  (NEW, numeric, default 0.04)
--   app_config.transaction_fee_kurus (NEW, integer, default 10000)
--   commission_rate is kept on app_config for backward-compat but is no
--   longer used in pricing.
--
-- Idempotent: safe to re-run.

------------------------------------------------------------
-- 1. Schema additions
------------------------------------------------------------
alter table bookings
  add column if not exists transaction_fee integer not null default 0,
  add column if not exists bank_commission integer not null default 0;

alter table app_config
  add column if not exists bank_commission_rate  numeric not null default 0.04,
  add column if not exists transaction_fee_kurus integer not null default 10000;

------------------------------------------------------------
-- 2. Backfill existing bookings
------------------------------------------------------------
-- Legacy bookings were priced as: total_price = base + vat,
-- commission_amount = 3% of total. We treat that historical commission
-- as the bank commission so the instructor numbers don't move
-- retroactively. transaction_fee stays 0 for legacy rows.
update bookings
   set bank_commission = commission_amount
 where bank_commission = 0
   and commission_amount > 0;

-- Rewrite payouts to mirror the new column meanings (gross = lesson,
-- commission = bank_commission, net = lesson - bank_commission). For
-- legacy rows the lesson amount equals total_price (no fee was charged).
update payouts p
   set gross_amount = (b.base_amount + b.vat_amount),
       commission   = b.bank_commission,
       net_amount   = (b.base_amount + b.vat_amount) - b.bank_commission
  from bookings b
 where p.booking_id = b.id;

------------------------------------------------------------
-- 3. create_booking: apply new pricing model
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
  v_deadline timestamptz;
  v_release date;
  v_added integer;
  v_d date;
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

  declare v_verif text;
  begin
    select verification_status into v_verif from instructor_profiles where user_id = p_instructor;
    if v_verif is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  select case
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
                        payment_status, is_test_booking, payment_deadline,
                        transaction_fee, bank_commission)
    values (v_customer, p_instructor, p_resort, v_slot_ids, v_student_count,
            v_base_total, v_vat, v_platform, v_total, p_date,
            v_payment_status, v_test_mode, v_deadline,
            v_fee, v_bank)
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

  -- Test-mode auto-pay: insert payout inline (matches confirm_payment).
  if v_test_mode then
    v_d := p_date;
    v_added := 0;
    while v_added < 21 loop
      v_d := v_d + 1;
      if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
    end loop;
    v_release := v_d;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status)
      values (p_instructor, v_booking_id, v_lesson, v_bank, v_lesson - v_bank,
              p_date, v_release, 'pending');
  end if;

  return json_build_object(
    'booking_id', v_booking_id,
    'total', v_total,
    'lesson_amount', v_lesson,
    'vat', v_vat,
    'bank_commission', v_bank,
    'transaction_fee', v_fee,
    'payment_status', v_payment_status,
    'is_test_booking', v_test_mode,
    'payment_deadline', v_deadline
  );
end;
$$;
grant execute on function create_booking(uuid, uuid, date, text[], json) to authenticated;

------------------------------------------------------------
-- 4. confirm_payment: payout uses lesson amount + bank_commission
------------------------------------------------------------
create or replace function confirm_payment(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_booking bookings%rowtype;
  v_release date;
  v_added integer := 0;
  v_d date;
  v_lesson integer;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select * into v_booking from bookings where id = p_booking and customer_id = v_customer for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.payment_status = 'paid' then
    return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
  end if;
  update bookings set payment_status = 'paid', payment_deadline = null where id = p_booking;

  if not exists (select 1 from payouts where booking_id = p_booking) then
    v_d := v_booking.lesson_date;
    while v_added < 21 loop
      v_d := v_d + 1;
      if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
    end loop;
    v_release := v_d;
    v_lesson := v_booking.base_amount + v_booking.vat_amount;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status)
      values (v_booking.instructor_id, p_booking, v_lesson, v_booking.bank_commission,
              v_lesson - v_booking.bank_commission, v_booking.lesson_date, v_release, 'pending');
  end if;

  return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
end;
$$;
grant execute on function confirm_payment(uuid) to authenticated;

------------------------------------------------------------
-- 5. admin_stats: split revenue numbers
------------------------------------------------------------
create or replace function admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_total_users         int;
  v_total_customers     int;
  v_total_instructors   int;
  v_pending_verifications int;
  v_total_bookings      int;
  v_paid_bookings       int;
  v_customer_paid       bigint;
  v_revenue             bigint;
  v_bank                bigint;
  v_fees                bigint;
  v_pending_payouts     bigint;
  v_flagged_messages    int;
  v_total_resorts       int;
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;

  select count(*) into v_total_users     from public.users;
  select count(*) into v_total_customers from public.users where role = 'customer';
  select count(*) into v_total_instructors from public.users where role = 'instructor';
  select count(*) into v_pending_verifications from public.instructor_profiles where verification_status = 'pending_review';
  select count(*) into v_total_bookings from public.bookings;
  select count(*) into v_paid_bookings  from public.bookings where payment_status = 'paid';
  select coalesce(sum(total_price),0)       into v_customer_paid
    from public.bookings where payment_status = 'paid';
  select coalesce(sum(commission_amount),0) into v_revenue
    from public.bookings where payment_status = 'paid';
  select coalesce(sum(bank_commission),0)   into v_bank
    from public.bookings where payment_status = 'paid';
  select coalesce(sum(transaction_fee),0)   into v_fees
    from public.bookings where payment_status = 'paid';
  select coalesce(sum(net_amount),0) into v_pending_payouts
    from public.payouts where status = 'pending';
  select count(*) into v_flagged_messages from public.messages where flagged = true;
  select count(*) into v_total_resorts from public.resorts;

  return json_build_object(
    'totalUsers', v_total_users,
    'totalCustomers', v_total_customers,
    'totalInstructors', v_total_instructors,
    'pendingVerifications', v_pending_verifications,
    'totalBookings', v_total_bookings,
    'paidBookings', v_paid_bookings,
    'customerPaidKurus', v_customer_paid,
    'revenueKurus', v_revenue,
    'bankCommissionKurus', v_bank,
    'transactionFeesKurus', v_fees,
    'pendingPayoutsKurus', v_pending_payouts,
    'flaggedMessages', v_flagged_messages,
    'totalResorts', v_total_resorts
  );
end;
$$;
grant execute on function admin_stats() to authenticated;

------------------------------------------------------------
-- 6. admin_update_config: extend signature with bank rate + flat fee
------------------------------------------------------------
drop function if exists admin_update_config(numeric, numeric, smallint, smallint, smallint, smallint);

create or replace function admin_update_config(
  p_vat_rate numeric,
  p_commission_rate numeric,
  p_season_start_month smallint,
  p_season_start_day smallint,
  p_season_end_month smallint,
  p_season_end_day smallint,
  p_bank_commission_rate numeric,
  p_transaction_fee_kurus integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  if p_vat_rate < 0 or p_vat_rate > 1 then raise exception 'vat_rate out of range'; end if;
  if p_commission_rate < 0 or p_commission_rate > 1 then raise exception 'commission_rate out of range'; end if;
  if p_bank_commission_rate < 0 or p_bank_commission_rate > 1 then raise exception 'bank_commission_rate out of range'; end if;
  if p_transaction_fee_kurus < 0 then raise exception 'transaction_fee_kurus negative'; end if;
  if p_season_start_month not between 1 and 12 or p_season_end_month not between 1 and 12 then
    raise exception 'invalid month';
  end if;
  if p_season_start_day not between 1 and 31 or p_season_end_day not between 1 and 31 then
    raise exception 'invalid day';
  end if;
  update public.app_config
     set vat_rate = p_vat_rate,
         commission_rate = p_commission_rate,
         bank_commission_rate = p_bank_commission_rate,
         transaction_fee_kurus = p_transaction_fee_kurus,
         season_start_month = p_season_start_month,
         season_start_day   = p_season_start_day,
         season_end_month   = p_season_end_month,
         season_end_day     = p_season_end_day
   where id = 1;
end;
$$;
grant execute on function admin_update_config(numeric, numeric, smallint, smallint, smallint, smallint, numeric, integer) to authenticated;
