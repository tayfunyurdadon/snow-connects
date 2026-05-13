-- Phase 7 follow-up: cancel pending payouts when a booking is cancelled.
--
-- Bug: customer_cancel_booking / instructor_cancel_booking freed slots
-- and refunded the customer, but left the corresponding row in
-- `payouts` with status='pending'. admin_stats() sums net_amount where
-- status='pending' to compute "Bekleyen Ödeme — Eğitmenlere", so
-- cancelled bookings inflated that figure (could exceed actual paid
-- customer revenue).
--
-- Fix:
--   1. Both cancel RPCs now flip the booking's pending payout to
--      'cancelled' (mirrors admin_resolve_dispute behavior).
--   2. Backfill: any payout whose booking is cancelled or refunded but
--      whose payout status is still pending → cancelled.
--
-- Idempotent: safe to re-run.

------------------------------------------------------------
-- 1. Backfill stale pending payouts
------------------------------------------------------------
update payouts p
   set status = 'cancelled'
  from bookings b
 where p.booking_id = b.id
   and p.status = 'pending'
   and (b.lesson_status = 'cancelled'
        or b.payment_status in ('refunded', 'failed'));

------------------------------------------------------------
-- 2. customer_cancel_booking — cancel pending payout
------------------------------------------------------------
create or replace function customer_cancel_booking(
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
  v_refund_pct smallint;
  v_refund_amount integer;
  v_new_payment_status text;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'reason required';
  end if;

  select * into v_booking from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.customer_id <> v_caller then
    raise exception 'not your booking';
  end if;
  if v_booking.lesson_status = 'cancelled' then
    return json_build_object('booking_id', p_booking, 'already_cancelled', true);
  end if;
  if v_booking.lesson_status = 'completed' then
    raise exception 'lesson already completed';
  end if;
  if v_booking.payment_status not in ('paid', 'pending') then
    raise exception 'cannot cancel booking in status %', v_booking.payment_status;
  end if;

  select cr.refund_pct, cr.refund_amount
    into v_refund_pct, v_refund_amount
    from compute_cancel_refund(v_booking.lesson_date, v_booking.total_price) cr;

  if v_booking.payment_status = 'pending' then
    v_new_payment_status := 'failed';
    v_refund_pct := 0;
    v_refund_amount := 0;
  elsif v_refund_pct > 0 then
    v_new_payment_status := 'refunded';
  else
    v_new_payment_status := 'paid';
  end if;

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
         payment_deadline = null,
         refund_pct = v_refund_pct,
         refund_amount = v_refund_amount
   where id = p_booking;

  -- NEW: cancel any pending payout so it doesn't keep showing under
  -- "Bekleyen Ödeme — Eğitmenlere".
  update payouts
     set status = 'cancelled'
   where booking_id = p_booking
     and status = 'pending';

  return json_build_object(
    'booking_id', p_booking,
    'lesson_status', 'cancelled',
    'payment_status', v_new_payment_status,
    'refund_pct', v_refund_pct,
    'refund_amount', v_refund_amount
  );
end;
$$;
grant execute on function customer_cancel_booking(uuid, text) to authenticated;

------------------------------------------------------------
-- 3. instructor_cancel_booking — cancel pending payout
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

  -- NEW: cancel any pending payout so the instructor isn't credited
  -- for a cancelled lesson.
  update payouts
     set status = 'cancelled'
   where booking_id = p_booking
     and status = 'pending';

  return json_build_object(
    'booking_id', p_booking,
    'lesson_status', 'cancelled',
    'payment_status', v_new_payment_status
  );
end;
$$;
grant execute on function instructor_cancel_booking(uuid, text) to authenticated;
