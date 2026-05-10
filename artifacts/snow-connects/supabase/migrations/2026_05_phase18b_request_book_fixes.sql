-- ============================================================
-- Phase 18b — Request-to-Book hotfix
--
-- Phase 18's `request_booking` only checked `p_date < current_date + 1`,
-- which let through any lesson scheduled for tomorrow even when the
-- earliest slot started in just a few hours. The 24h SLA + 24h hard
-- guardrail are useless if a request can be created with < 24h until
-- the actual slot. This patch tightens the check to use the earliest
-- requested slot's wall-clock start time.
-- ============================================================

create or replace function request_booking(
  p_instructor uuid,
  p_resort     uuid,
  p_date       date,
  p_slot_times text[],
  p_students   json,
  p_payment_method_token text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer        uuid := auth.uid();
  v_status          text;
  v_test_mode       boolean;
  v_vat_rate        numeric;
  v_bank_rate       numeric;
  v_fee             integer;
  v_season_start_month int; v_season_start_day int;
  v_season_end_month   int; v_season_end_day   int;
  v_season_start    date;
  v_season_end      date;
  v_school_id       uuid;
  v_instant         boolean;
  v_school_price    integer;
  v_base            integer;
  v_slot_count      integer := array_length(p_slot_times, 1);
  v_student_count   integer := json_array_length(p_students);
  v_base_total      integer;
  v_vat             integer;
  v_lesson          integer;
  v_bank            integer;
  v_total           integer;
  v_platform        integer;
  v_slot_ids        uuid[];
  v_slot_id         uuid;
  v_existing        time_slots%rowtype;
  v_booking_id      uuid;
  v_student         json;
  v_release         date;
  v_recipient_type  text;
  v_recipient_id    uuid;
  v_payment_status  text;
  v_approval_status text;
  v_approval_deadline timestamptz;
  v_earliest_ts     timestamptz;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;

  -- Customer must be active.
  select status into v_status from users where id = v_customer;
  if v_status is distinct from 'active' then raise exception 'blocked'; end if;

  -- Config
  select coalesce((select value::boolean from app_config where key = 'test_mode'), false)
    into v_test_mode;
  select coalesce((select value::numeric from app_config where key = 'vat_rate'), 0.20),
         coalesce((select value::numeric from app_config where key = 'bank_commission_rate'), 0.04),
         coalesce((select value::int     from app_config where key = 'transaction_fee_kurus'), 10000)
    into v_vat_rate, v_bank_rate, v_fee;

  -- Season window
  select coalesce((select value::int from app_config where key = 'season_start_month'), 12),
         coalesce((select value::int from app_config where key = 'season_start_day'),   15),
         coalesce((select value::int from app_config where key = 'season_end_month'),    4),
         coalesce((select value::int from app_config where key = 'season_end_day'),     15)
    into v_season_start_month, v_season_start_day, v_season_end_month, v_season_end_day;
  v_season_start := make_date(
    case when extract(month from current_date)::int < v_season_start_month
         then extract(year from current_date)::int - 1
         else extract(year from current_date)::int end,
    v_season_start_month, v_season_start_day
  );
  v_season_end := make_date(
    extract(year from v_season_start)::int + 1,
    v_season_end_month, v_season_end_day
  );
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;

  -- Hard guardrail: earliest requested slot must start at least 24 hours
  -- from now. Phase 18a only compared dates and so let through bookings
  -- for tomorrow morning. Compare on the actual slot timestamp.
  v_earliest_ts := (
    p_date::timestamp
    + (select min(t::time) from unnest(p_slot_times) t)
  ) at time zone 'UTC';
  if v_earliest_ts < (now() + interval '24 hours') then
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

grant execute on function request_booking(uuid, uuid, date, text[], json, text)
  to authenticated;
