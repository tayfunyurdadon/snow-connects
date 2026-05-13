-- Phase 16: keep schools' internal manual bookings out of the
-- super-admin dashboard.
--
-- Manual bookings (`bookings.source = 'manual'`) are walk-in / phone
-- reservations a school records for its own bookkeeping. The platform
-- never collects that money, so they should not inflate admin totals
-- or platform revenue. The Operasyon → Rezervasyonlar list is also
-- filtered on the client; this migration brings the stats RPC in line.

create or replace function admin_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_total_users         int;
  v_total_customers     int;
  v_total_instructors   int;
  v_pending_verifications int;
  v_total_bookings      int;
  v_paid_bookings       int;
  v_revenue_kurus       bigint;
  v_pending_payouts     bigint;
  v_flagged_messages    int;
  v_total_resorts       int;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;

  select count(*) into v_total_users     from public.users;
  select count(*) into v_total_customers from public.users where role = 'customer';
  select count(*) into v_total_instructors from public.users where role = 'instructor';
  select count(*) into v_pending_verifications from public.instructor_profiles where verification_status = 'pending_review';

  -- Online bookings only — schools' internal manual bookings are
  -- excluded from platform totals.
  select count(*) into v_total_bookings
    from public.bookings where source = 'online';
  select count(*) into v_paid_bookings
    from public.bookings where source = 'online' and payment_status = 'paid';
  select coalesce(sum(total_price),0) into v_revenue_kurus
    from public.bookings where source = 'online' and payment_status = 'paid';

  select coalesce(sum(net_amount),0) into v_pending_payouts
    from public.payouts where status = 'pending';
  select count(*) into v_flagged_messages from public.messages where flagged = true;
  select count(*) into v_total_resorts from public.resorts;

  return json_build_object(
    'totalUsers', v_total_users,
    'totalCustomers', v_total_customers,
    'totalInstructors', v_total_instructors,
    'pendingVerifications', v_pending_verifications,
    'totalBookings', v_total_bookings,
    'paidBookings', v_paid_bookings,
    'revenueKurus', v_revenue_kurus,
    'pendingPayoutsKurus', v_pending_payouts,
    'flaggedMessages', v_flagged_messages,
    'totalResorts', v_total_resorts
  );
end;
$$;
grant execute on function admin_stats() to authenticated;
