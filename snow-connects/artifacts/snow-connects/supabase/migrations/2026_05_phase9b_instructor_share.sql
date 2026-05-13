-- Phase 9b: Revenue split between instructor and school.
-- Default 35% instructor / 65% school. Adjustable per-school by the
-- school admin from the Profil tab.

------------------------------------------------------------
-- 1. Schema: add share rate to ski_schools.
------------------------------------------------------------
alter table public.ski_schools
  add column if not exists instructor_share_rate numeric not null default 0.35
    check (instructor_share_rate >= 0 and instructor_share_rate <= 1);

------------------------------------------------------------
-- 2. Make manual bookings produce a payout row too, so they appear
--    in the Gelirler view and feed the per-instructor split. The
--    school already collected the cash, so the row is created as
--    status='released' with release_date = lesson_date.
--    We replace school_create_manual_booking in-place; signature
--    unchanged.
------------------------------------------------------------
create or replace function public.school_create_manual_booking(
  p_instructor       uuid,
  p_date             date,
  p_slot_times       text[],
  p_students         json,
  p_customer_name    text,
  p_customer_phone   text,
  p_notes            text default null,
  p_price_kurus      integer default 0
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
  i integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

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

  -- Lock & reserve each slot (same pattern as create_booking).
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
      'paid', p_date, 'manual',
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

  -- Record the manual booking as a school payout in 'released' state,
  -- so it appears in the Gelirler split and instructor breakdown.
  -- Skipped if no price was entered (price=0), since splitting nothing
  -- is meaningless.
  if v_price > 0 then
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

------------------------------------------------------------
-- 3. school_delete_manual_booking already deletes the booking +
--    frees slots; the payouts row cascades cleanly because we
--    delete the booking row (no FK from payouts.booking_id; we
--    must clean it explicitly).
------------------------------------------------------------
create or replace function public.school_delete_manual_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_school_id uuid;
  v_booking bookings%rowtype;
  v_instr_school uuid;
begin
  select id into v_school_id from public.ski_schools where admin_user_id = auth.uid();
  if v_school_id is null then raise exception 'not a school admin'; end if;

  select * into v_booking from public.bookings where id = p_id;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.source <> 'manual' then raise exception 'not a manual booking'; end if;

  select school_id into v_instr_school from public.instructor_profiles
    where user_id = v_booking.instructor_id;
  if v_instr_school is distinct from v_school_id then
    raise exception 'forbidden';
  end if;

  delete from public.payouts where booking_id = p_id;
  delete from public.time_slots where booking_id = p_id;
  delete from public.bookings where id = p_id;
end;
$$;

------------------------------------------------------------
-- 4. Updated school_payouts_summary returns instructor / school
--    splits as well as totals.
------------------------------------------------------------
create or replace function public.school_payouts_summary()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school   uuid;
  v_rate     numeric;
  v_pending_total  bigint := 0;
  v_released_total bigint := 0;
  v_pending_count  integer := 0;
  v_released_count integer := 0;
begin
  select id, instructor_share_rate into v_school, v_rate
    from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  select coalesce(sum(net_amount), 0), count(*)
    into v_pending_total, v_pending_count
    from public.payouts
   where recipient_type = 'school' and recipient_id = v_school and status = 'pending';

  select coalesce(sum(net_amount), 0), count(*)
    into v_released_total, v_released_count
    from public.payouts
   where recipient_type = 'school' and recipient_id = v_school and status = 'released';

  return json_build_object(
    'instructorShareRate', v_rate,
    'pendingKurus',  v_pending_total,
    'releasedKurus', v_released_total,
    'pendingCount',  v_pending_count,
    'releasedCount', v_released_count,
    'pendingInstructorKurus',  round(v_pending_total  * v_rate)::bigint,
    'pendingSchoolKurus',      v_pending_total  - round(v_pending_total  * v_rate)::bigint,
    'releasedInstructorKurus', round(v_released_total * v_rate)::bigint,
    'releasedSchoolKurus',     v_released_total - round(v_released_total * v_rate)::bigint
  );
end;
$$;

grant execute on function public.school_payouts_summary() to authenticated;

------------------------------------------------------------
-- 5. Per-instructor breakdown for the Gelirler view.
------------------------------------------------------------
create or replace function public.school_instructor_breakdown()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_rate   numeric;
  v_result json;
begin
  select id, instructor_share_rate into v_school, v_rate
    from public.ski_schools where admin_user_id = auth.uid();
  if v_school is null then raise exception 'not a school admin'; end if;

  with agg as (
    select p.instructor_id,
           u.name as instructor_name,
           sum(case when p.status = 'pending'  then p.net_amount else 0 end)  as pending_kurus,
           sum(case when p.status = 'released' then p.net_amount else 0 end)  as released_kurus,
           count(*) as lesson_count
      from public.payouts p
      left join public.users u on u.id = p.instructor_id
     where p.recipient_type = 'school' and p.recipient_id = v_school
     group by p.instructor_id, u.name
  )
  select coalesce(json_agg(json_build_object(
    'instructor_id', instructor_id,
    'instructor_name', coalesce(instructor_name, 'Eğitmen'),
    'lesson_count',  lesson_count,
    'pending_kurus', pending_kurus,
    'released_kurus', released_kurus,
    'total_kurus',   pending_kurus + released_kurus,
    'instructor_share_kurus', round((pending_kurus + released_kurus) * v_rate)::bigint,
    'school_share_kurus',     (pending_kurus + released_kurus) - round((pending_kurus + released_kurus) * v_rate)::bigint
  ) order by (pending_kurus + released_kurus) desc), '[]'::json)
  into v_result
  from agg;

  return v_result;
end;
$$;

grant execute on function public.school_instructor_breakdown() to authenticated;

------------------------------------------------------------
-- 6. RPC for the Profil tab: update the share rate (0..1).
------------------------------------------------------------
create or replace function public.school_update_share_rate(p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_rate is null or p_rate < 0 or p_rate > 1 then
    raise exception 'rate must be between 0 and 1';
  end if;
  update public.ski_schools
     set instructor_share_rate = p_rate
   where admin_user_id = auth.uid();
  if not found then raise exception 'not a school admin'; end if;
end;
$$;

grant execute on function public.school_update_share_rate(numeric) to authenticated;
