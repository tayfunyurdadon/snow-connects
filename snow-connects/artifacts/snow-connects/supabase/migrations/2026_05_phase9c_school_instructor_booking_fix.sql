-- Phase 9c hotfix: customers couldn't book a school-affiliated instructor
-- registered through the app, because handle_new_user() set the new
-- instructor's verification_status='pending_documents' regardless of
-- whether the school had pre-approved them. create_booking() then bailed
-- with 'instructor not verified'.
--
-- This migration:
--   1) Updates handle_new_user() so a school-affiliated instructor lands
--      with verification_status='approved' + school_approval_status='approved'.
--      (Seed-script behaviour was already correct; only UI signup was broken.)
--   2) Loosens create_booking()'s gate to accept EITHER an approved
--      platform verification OR an approved school affiliation. This is
--      defence in depth in case any rows still have mismatched statuses.
--   3) Backfills mismatched rows: any instructor whose school approves
--      them gets verification_status='approved' so existing bookings
--      attempts succeed immediately.

------------------------------------------------------------
-- 1. Backfill: align verification_status with school_approval_status.
------------------------------------------------------------
update public.instructor_profiles
   set verification_status = 'approved'
 where school_id is not null
   and school_approval_status = 'approved'
   and verification_status is distinct from 'approved';

------------------------------------------------------------
-- 2. handle_new_user(): school-affiliated instructors are auto-approved.
------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_school uuid;
  v_school_status text;
  v_verif_status text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
  if v_role not in ('customer','instructor') then v_role := 'customer'; end if;
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    v_role
  )
  on conflict (id) do nothing;

  if v_role = 'instructor' then
    v_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
    -- School-affiliated instructors skip platform verification; their
    -- school admin reviews them. Independent instructors still go
    -- through document review.
    if v_school is null then
      v_school_status := 'approved';        -- not used (no school)
      v_verif_status  := 'pending_documents';
    else
      v_school_status := 'approved';
      v_verif_status  := 'approved';
    end if;
    insert into public.instructor_profiles (
      user_id, school_id,
      school_approval_status,
      verification_status
    ) values (
      new.id, v_school,
      v_school_status,
      v_verif_status
    )
    on conflict (user_id) do update set
      school_id = excluded.school_id,
      school_approval_status = excluded.school_approval_status,
      verification_status    = excluded.verification_status;
  end if;

  return new;
end;
$$;

------------------------------------------------------------
-- 3. create_booking(): allow school-approved instructors even if
--    verification_status hasn't caught up. Same signature.
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
  v_school uuid;
  v_recipient_type text;
  v_recipient_id uuid;
  v_verif text;
  v_school_status text;
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

  select verification_status, school_id, school_approval_status
    into v_verif, v_school, v_school_status
    from instructor_profiles where user_id = p_instructor;
  if v_verif is null then raise exception 'instructor not found'; end if;
  -- Accept platform-verified OR school-approved instructors.
  if v_verif <> 'approved'
     and not (v_school is not null and v_school_status = 'approved') then
    raise exception 'instructor not verified';
  end if;

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

  if v_school is not null then
    v_recipient_type := 'school';
    v_recipient_id   := v_school;
  else
    v_recipient_type := 'instructor';
    v_recipient_id   := p_instructor;
  end if;

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

  if v_test_mode then
    v_d := p_date;
    v_added := 0;
    while v_added < 21 loop
      v_d := v_d + 1;
      if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
    end loop;
    v_release := v_d;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status, recipient_type, recipient_id)
      values (p_instructor, v_booking_id, v_lesson, v_bank, v_lesson - v_bank,
              p_date, v_release, 'pending', v_recipient_type, v_recipient_id);
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
