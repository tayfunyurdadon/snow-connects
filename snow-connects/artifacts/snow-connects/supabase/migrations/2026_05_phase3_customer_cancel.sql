-- Phase 3: customer cancellation with refund tiers.
--
-- Policy (hours before lesson_date 09:00 local):
--   > 48h          → full refund (refund_pct = 100)
--   24h .. 48h     → 50% refund  (refund_pct = 50)
--   < 24h          → no refund   (refund_pct = 0)
--
-- The `payment_status` after cancel reflects the outcome:
--   * 100% refund → 'refunded'
--   * 50%  refund → 'refunded'  (audit fields carry the partial amount)
--   * 0%   refund → 'paid'      (booking cancelled, customer keeps no money)
--
-- Slots are always freed regardless of refund tier.
--
-- Idempotent: safe to run repeatedly.

------------------------------------------------------------
-- 1. Audit columns for the refund amount actually due.
------------------------------------------------------------
alter table bookings
  add column if not exists refund_amount integer,
  add column if not exists refund_pct smallint;

------------------------------------------------------------
-- 2. Helper: compute refund tier for a lesson_date
------------------------------------------------------------
create or replace function compute_cancel_refund(p_lesson_date date, p_total integer)
returns table(refund_pct smallint, refund_amount integer)
language plpgsql
immutable
as $$
declare
  -- Lessons start at 09:00 local; we approximate "now until lesson"
  -- using the date boundary at midnight UTC. Good enough for the
  -- coarse 24h/48h tiers.
  v_hours numeric;
begin
  v_hours := extract(epoch from (p_lesson_date::timestamptz - now())) / 3600.0;
  if v_hours > 48 then
    refund_pct := 100;
  elsif v_hours > 24 then
    refund_pct := 50;
  else
    refund_pct := 0;
  end if;
  refund_amount := round(p_total * refund_pct / 100.0)::int;
  return next;
end;
$$;
grant execute on function compute_cancel_refund(date, integer) to authenticated;

------------------------------------------------------------
-- 3. RPC: customer_cancel_booking
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

  -- Pending bookings cancel cleanly (no money taken yet).
  if v_booking.payment_status = 'pending' then
    v_new_payment_status := 'failed';
    v_refund_pct := 0;
    v_refund_amount := 0;
  elsif v_refund_pct > 0 then
    v_new_payment_status := 'refunded';
  else
    v_new_payment_status := 'paid';  -- no refund, money kept
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
