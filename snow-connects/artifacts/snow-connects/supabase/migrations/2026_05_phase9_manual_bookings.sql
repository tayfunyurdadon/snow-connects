-- Phase 9: Manual bookings entered by school admins.
-- Extend `bookings` so the same table holds both online and manual records,
-- so the existing calendar / payouts / slot-locking machinery just works.

------------------------------------------------------------
-- 1. Schema additions on bookings
------------------------------------------------------------
alter table public.bookings
  add column if not exists source text not null default 'online'
    check (source in ('online','manual')),
  add column if not exists manual_customer_name  text,
  add column if not exists manual_customer_phone text,
  add column if not exists manual_notes          text;

-- Manual bookings have no app user as customer.
alter table public.bookings alter column customer_id drop not null;

create index if not exists idx_bookings_date_instructor
  on public.bookings(lesson_date, instructor_id);

------------------------------------------------------------
-- 2. RLS additions
------------------------------------------------------------
-- School admin reads students of their school's bookings.
drop policy if exists "students_school_admin_read" on public.students;
create policy "students_school_admin_read" on public.students
  for select using (
    exists(select 1
      from public.bookings b
      join public.instructor_profiles ip on ip.user_id = b.instructor_id
      join public.ski_schools s on s.id = ip.school_id
      where b.id = students.booking_id
        and s.admin_user_id = auth.uid())
  );

------------------------------------------------------------
-- 3. school_create_manual_booking RPC
--    Locks slots like create_booking, marks them booked, inserts a
--    bookings row with source='manual' and payment_status='paid' (the
--    money is collected at the school, no payout is generated).
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
      coalesce(p_price_kurus, 0), 0, 0, coalesce(p_price_kurus, 0),
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

  return json_build_object('booking_id', v_booking_id);
end;
$$;

------------------------------------------------------------
-- 4. school_delete_manual_booking RPC
--    School admins can remove only manual bookings of their own
--    school's instructors. Frees the slots.
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

  -- Free the slots: delete the time_slots rows tied to this booking.
  delete from public.time_slots where booking_id = p_id;
  delete from public.bookings where id = p_id;
end;
$$;

------------------------------------------------------------
-- 5. school_day_calendar RPC
--    Returns one row per (instructor, slot_time) for the given date,
--    with booking + student info merged in.
------------------------------------------------------------
create or replace function public.school_day_calendar(p_date date)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school_id uuid;
  v_result json;
begin
  select id into v_school_id from public.ski_schools where admin_user_id = auth.uid();
  if v_school_id is null then raise exception 'not a school admin'; end if;

  with instr as (
    select u.id as instructor_id,
           u.name as instructor_name,
           ip.resort_ids
      from public.users u
      join public.instructor_profiles ip on ip.user_id = u.id
      where ip.school_id = v_school_id
        and u.status = 'active'
  ),
  slots as (
    select i.instructor_id, i.instructor_name, t.slot_time
      from instr i
      cross join (values
        ('09:00'),('10:00'),('11:00'),('12:00'),
        ('13:00'),('14:00'),('15:00'),('16:00')
      ) as t(slot_time)
  ),
  ts as (
    select instructor_id, slot_time, status, booking_id
      from public.time_slots where date = p_date
  ),
  bk as (
    select b.id, b.instructor_id, b.source, b.payment_status, b.lesson_status,
           b.manual_customer_name, b.manual_customer_phone, b.manual_notes,
           b.total_price, b.student_count,
           cu.name as customer_name,
           (select coalesce(json_agg(json_build_object(
                'first_name', s.first_name,
                'last_name',  s.last_name,
                'age',        s.age,
                'experience_level', s.experience_level)
              ), '[]'::json)
              from public.students s where s.booking_id = b.id) as students,
           (select array_agg(ts2.slot_time order by ts2.slot_time)
              from public.time_slots ts2 where ts2.booking_id = b.id) as slot_times
      from public.bookings b
      left join public.users cu on cu.id = b.customer_id
      where b.lesson_date = p_date
  )
  select json_build_object(
    'date', p_date,
    'instructors',
      coalesce((
        select json_agg(json_build_object(
          'instructor_id', x.instructor_id,
          'instructor_name', x.instructor_name,
          'slots', x.slots
        ) order by x.instructor_name)
        from (
          select s.instructor_id, s.instructor_name,
            json_agg(json_build_object(
              'slot_time', s.slot_time,
              'status', coalesce(ts.status, 'available'),
              'booking_id', ts.booking_id,
              'source', bk.source,
              'payment_status', bk.payment_status,
              'lesson_status', bk.lesson_status,
              'customer_name', coalesce(bk.manual_customer_name, bk.customer_name),
              'customer_phone', bk.manual_customer_phone,
              'student_count', bk.student_count,
              'students', bk.students,
              'notes', bk.manual_notes,
              'total_price', bk.total_price,
              'is_first_slot', (
                bk.slot_times is null or bk.slot_times[1] = s.slot_time
              )
            ) order by s.slot_time) as slots
          from slots s
          left join ts on ts.instructor_id = s.instructor_id and ts.slot_time = s.slot_time
          left join bk on bk.id = ts.booking_id
          group by s.instructor_id, s.instructor_name
        ) x
      ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.school_create_manual_booking(uuid, date, text[], json, text, text, text, integer) to authenticated;
grant execute on function public.school_delete_manual_booking(uuid) to authenticated;
grant execute on function public.school_day_calendar(date) to authenticated;
