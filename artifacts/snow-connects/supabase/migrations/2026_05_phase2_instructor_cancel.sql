-- Phase 2: instructor cancellation.
--
-- Until now an instructor could not cancel a confirmed booking from
-- their calendar — the slot was locked. This migration:
--   1. Adds audit columns (who cancelled, when, why).
--   2. Exposes instructor_cancel_booking(p_booking, p_reason) RPC.
--      * Verifies caller owns the booking as instructor.
--      * Frees the slots.
--      * Marks lesson_status = 'cancelled'.
--      * For paid bookings: payment_status = 'refunded' (real money
--        movement happens later, this is the audit flag).
--      * For pending bookings: payment_status = 'failed'.
--
-- Idempotent: safe to run repeatedly.

------------------------------------------------------------
-- 1. Audit columns
------------------------------------------------------------
alter table bookings
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references users(id),
  add column if not exists cancelled_at timestamptz;

------------------------------------------------------------
-- 2. RPC
------------------------------------------------------------
create or replace function instructor_cancel_booking(
  p_booking uuid,
  p_reason text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_booking bookings%rowtype;
  v_new_payment_status text;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'reason required';
  end if;

  select * into v_booking
    from bookings
   where id = p_booking
   for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.instructor_id <> v_caller then
    raise exception 'not your booking';
  end if;
  if v_booking.lesson_status = 'cancelled' then
    -- Already cancelled; no-op return so the client UI is forgiving.
    return json_build_object('booking_id', p_booking, 'already_cancelled', true);
  end if;
  if v_booking.lesson_status = 'completed' then
    raise exception 'lesson already completed';
  end if;

  v_new_payment_status := case
    when v_booking.payment_status = 'paid' then 'refunded'
    when v_booking.payment_status = 'pending' then 'failed'
    else v_booking.payment_status
  end;

  -- Free slots first so the calendar reopens immediately.
  update time_slots
     set status = 'available',
         booking_id = null
   where booking_id = p_booking;

  update bookings
     set lesson_status = 'cancelled',
         payment_status = v_new_payment_status,
         cancellation_reason = trim(p_reason),
         cancelled_by = v_caller,
         cancelled_at = now(),
         payment_deadline = null
   where id = p_booking;

  return json_build_object(
    'booking_id', p_booking,
    'lesson_status', 'cancelled',
    'payment_status', v_new_payment_status
  );
end;
$$;

grant execute on function instructor_cancel_booking(uuid, text) to authenticated;
