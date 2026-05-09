-- Phase 12: Payment-status tracking for manual bookings.
-- The school admin can mark a manual booking as Ödendi (paid) or
-- Bekliyor (pending) at creation time and toggle later from the day
-- calendar's slot detail. Pending bookings do NOT generate a payout
-- row yet — the payout is created when the booking is marked paid, so
-- the Gelirler view always reflects only collected revenue.

------------------------------------------------------------
-- 1. school_create_manual_booking now accepts p_payment_status
--    ('paid' | 'pending'). Default 'paid' to keep older clients
--    working unchanged.
------------------------------------------------------------
create or replace function public.school_create_manual_booking(
  p_instructor       uuid,
  p_date             date,
  p_slot_times       text[],
  p_students         json,
  p_customer_name    text,
  p_customer_phone   text,
  p_notes            text default null,
  p_price_kurus      integer default 0,
  p_payment_status   text default 'paid'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_school_id uuid;
  v_instr_school uuid;
  v_resort uuid;
  v_slot_count integer := array_length(p_slot_times, 1);
  v_student_count integer := json_array_length(p_students);
  v_existing time_slots%rowtype;
  v_slot_id uuid;
  v_slot_ids uuid[] := array[]::uuid[];
  v_booking_id uuid;
  v_student json;
  v_price integer := coalesce(p_price_kurus, 0);
  v_pay text := coalesce(nullif(trim(lower(p_payment_status)), ''), 'paid');
  i integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_pay not in ('paid', 'pending') then
    raise exception 'payment_status must be paid or pending';
  end if;

  select id into v_school_id from public.ski_schools
    where admin_user_id = auth.uid();
  if v_school_id is null then raise exception 'not a school admin'; end if;

  select school_id, resort_ids[1]
    into v_instr_school, v_resort
    from public.instructor_profiles where user_id = p_instructor;
  if v_instr_school is distinct from v_school_id then
    raise exception 'instructor not in your school';
  end if;
  if v_resort is null then raise exception 'instructor has no resort'; end if;

  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;
  if coalesce(trim(p_customer_name), '') = '' then raise exception 'customer name required'; end if;
  if v_price < 0 then raise exception 'price cannot be negative'; end if;

  for i in 1..v_slot_count loop
    select * into v_existing from public.time_slots
      where instructor_id = p_instructor and date = p_date and slot_time = p_slot_times[i]
      for update;
    if found then
      if v_existing.status <> 'available' then
        raise exception 'slot taken: %', p_slot_times[i];
      end if;
      update public.time_slots set status = 'booked'
        where id = v_existing.id returning id into v_slot_id;
    else
      insert into public.time_slots (instructor_id, date, slot_time, status)
        values (p_instructor, p_date, p_slot_times[i], 'booked')
        returning id into v_slot_id;
    end if;
    v_slot_ids := array_append(v_slot_ids, v_slot_id);
  end loop;

  insert into public.bookings (
      customer_id, instructor_id, resort_id, slot_ids, student_count,
      base_amount, vat_amount, commission_amount, total_price,
      payment_status, lesson_date, source,
      manual_customer_name, manual_customer_phone, manual_notes
    ) values (
      null, p_instructor, v_resort, v_slot_ids, v_student_count,
      v_price, 0, 0, v_price,
      v_pay, p_date, 'manual',
      p_customer_name, nullif(trim(coalesce(p_customer_phone, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning id into v_booking_id;

  update public.time_slots set booking_id = v_booking_id where id = any(v_slot_ids);

  for v_student in select * from json_array_elements(p_students) loop
    insert into public.students (booking_id, first_name, last_name, age, experience_level)
      values (v_booking_id,
              coalesce(v_student->>'firstName',''),
              coalesce(v_student->>'lastName',''),
              coalesce((v_student->>'age')::int, 0),
              coalesce(v_student->>'experienceLevel','beginner'));
  end loop;

  -- Only create a payout row if the booking is paid AND has a price.
  -- Pending bookings get a payout when later marked paid via
  -- school_set_manual_payment_status.
  if v_pay = 'paid' and v_price > 0 then
    insert into public.payouts (
        instructor_id, booking_id, gross_amount, commission, net_amount,
        lesson_date, release_date, status, recipient_type, recipient_id)
      values (
        p_instructor, v_booking_id, v_price, 0, v_price,
        p_date, p_date, 'released', 'school', v_school_id);
  end if;

  return json_build_object('booking_id', v_booking_id);
end;
$$;

grant execute on function public.school_create_manual_booking(
  uuid, date, text[], json, text, text, text, integer, text
) to authenticated;

------------------------------------------------------------
-- 2. RPC to toggle a manual booking's payment status.
--    paid → pending: drops the payout (revenue not yet collected).
--    pending → paid: creates a released payout for the school.
------------------------------------------------------------
create or replace function public.school_set_manual_payment_status(
  p_booking_id uuid,
  p_status     text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_school_id uuid;
  v_booking   bookings%rowtype;
  v_instr_school uuid;
  v_new text := lower(coalesce(trim(p_status), ''));
begin
  if v_new not in ('paid', 'pending') then
    raise exception 'status must be paid or pending';
  end if;

  select id into v_school_id from public.ski_schools where admin_user_id = auth.uid();
  if v_school_id is null then raise exception 'not a school admin'; end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.source <> 'manual' then raise exception 'not a manual booking'; end if;

  select school_id into v_instr_school from public.instructor_profiles
    where user_id = v_booking.instructor_id;
  if v_instr_school is distinct from v_school_id then
    raise exception 'forbidden';
  end if;

  if v_booking.payment_status = v_new then
    return; -- no-op
  end if;

  update public.bookings set payment_status = v_new where id = p_booking_id;

  if v_new = 'paid' then
    -- Create payout if missing and price > 0.
    if v_booking.total_price > 0
       and not exists (select 1 from public.payouts where booking_id = p_booking_id)
    then
      insert into public.payouts (
          instructor_id, booking_id, gross_amount, commission, net_amount,
          lesson_date, release_date, status, recipient_type, recipient_id)
        values (
          v_booking.instructor_id, p_booking_id,
          v_booking.total_price, 0, v_booking.total_price,
          v_booking.lesson_date, v_booking.lesson_date,
          'released', 'school', v_school_id);
    end if;
  else
    -- pending: drop any existing payout for this booking.
    delete from public.payouts where booking_id = p_booking_id;
  end if;
end;
$$;

grant execute on function public.school_set_manual_payment_status(uuid, text) to authenticated;
