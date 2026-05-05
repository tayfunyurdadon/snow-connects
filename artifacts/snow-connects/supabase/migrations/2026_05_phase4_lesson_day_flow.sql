-- Phase 4: lesson day flow (start / in-progress / end).
--
-- The instructor marks the lesson started when the customer arrives,
-- and ended when it's done. Ending a lesson auto-completes the booking
-- so payouts can include it. Both transitions are guarded so they only
-- happen on the actual lesson day, by the assigned instructor, and on a
-- booking that's been paid for.
--
-- Idempotent: safe to run repeatedly.

------------------------------------------------------------
-- 1. Extend lesson_status to allow 'in_progress'.
------------------------------------------------------------
alter table bookings
  drop constraint if exists bookings_lesson_status_check;
alter table bookings
  add constraint bookings_lesson_status_check
  check (lesson_status in ('upcoming','in_progress','completed','cancelled'));

------------------------------------------------------------
-- 2. Audit timestamps.
------------------------------------------------------------
alter table bookings
  add column if not exists lesson_started_at timestamptz,
  add column if not exists lesson_ended_at timestamptz;

------------------------------------------------------------
-- 3. RPC: instructor_start_lesson
------------------------------------------------------------
create or replace function instructor_start_lesson(p_booking uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_booking bookings%rowtype;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;

  select * into v_booking from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.instructor_id <> v_caller then
    raise exception 'not your lesson';
  end if;
  if v_booking.payment_status <> 'paid' then
    raise exception 'lesson not paid yet';
  end if;
  if v_booking.lesson_status = 'in_progress' then
    return json_build_object('booking_id', p_booking, 'already_started', true);
  end if;
  if v_booking.lesson_status <> 'upcoming' then
    raise exception 'cannot start lesson in status %', v_booking.lesson_status;
  end if;
  -- Allow starting on the lesson day only. Compared in UTC since
  -- lesson_date is a date and now() in this region is close enough
  -- (no slots span midnight). Tolerate +/- 1 day so timezone drift
  -- doesn't lock the instructor out.
  if abs(v_booking.lesson_date - (now() at time zone 'Europe/Istanbul')::date) > 1 then
    raise exception 'lesson is not today';
  end if;

  update bookings
     set lesson_status = 'in_progress',
         lesson_started_at = now()
   where id = p_booking;

  return json_build_object('booking_id', p_booking, 'lesson_status', 'in_progress');
end;
$$;
grant execute on function instructor_start_lesson(uuid) to authenticated;

------------------------------------------------------------
-- 4. RPC: instructor_end_lesson
------------------------------------------------------------
create or replace function instructor_end_lesson(p_booking uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_booking bookings%rowtype;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;

  select * into v_booking from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.instructor_id <> v_caller then
    raise exception 'not your lesson';
  end if;
  if v_booking.lesson_status = 'completed' then
    return json_build_object('booking_id', p_booking, 'already_completed', true);
  end if;
  if v_booking.lesson_status <> 'in_progress' then
    raise exception 'lesson not started';
  end if;

  update bookings
     set lesson_status = 'completed',
         lesson_ended_at = now()
   where id = p_booking;

  return json_build_object('booking_id', p_booking, 'lesson_status', 'completed');
end;
$$;
grant execute on function instructor_end_lesson(uuid) to authenticated;
