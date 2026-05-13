-- Phase 15: make school pricing actually take effect.
--
-- Phase 10 added per-school tier prices on `ski_schools.price_X_kurus`
-- and a `school_update_pricing()` RPC, but `create_booking` was never
-- updated to read them. As a result every booking was still priced
-- from `instructor_profiles.price_X_person`, which for school-affiliated
-- instructors stays 0 — meaning the customer-facing instructor profile
-- shows ₺0 and the booking total comes out wrong.
--
-- Fix: if the instructor belongs to a school AND the school has set the
-- relevant tier (> 0), use the school's price. Otherwise fall back to
-- the instructor's own tier, then to the legacy `base_price`.

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

  -- Effective tier price = school override (if school-affiliated and tier
  -- is set) → instructor's own tier → instructor's legacy base_price.
  select case
      when v_student_count >= 4 then
        coalesce(nullif(s.price_4plus_kurus, 0),
                 nullif(ip.price_4_plus_person, 0),
                 ip.base_price)
      when v_student_count = 3 then
        coalesce(nullif(s.price_3_kurus, 0),
                 nullif(ip.price_3_person, 0),
                 ip.base_price)
      when v_student_count = 2 then
        coalesce(nullif(s.price_2_kurus, 0),
                 nullif(ip.price_2_person, 0),
                 ip.base_price)
      else
        coalesce(nullif(s.price_1_kurus, 0),
                 nullif(ip.price_1_person, 0),
                 ip.base_price)
    end
    into v_base
    from instructor_profiles ip
    left join ski_schools s on s.id = ip.school_id
   where ip.user_id = p_instructor;
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
