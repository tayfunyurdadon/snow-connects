-- Phase 17: keep schools' manual-booking payouts out of the super-admin
-- "Okul Ödemeleri" view (and out of the Pano "Bekleyen Ödeme" tile).
--
-- Background: Phase 9b inserts a `payouts` row for every paid manual
-- booking so the school's own Gelirler tab can show real numbers. But
-- the platform never collects money for manual bookings — they're a
-- school-side bookkeeping artefact — so they must not appear in the
-- super-admin's Okul Ödemeleri totals or inflate the platform's
-- pending-payouts tile.
--
-- Fix: filter `admin_school_payouts()` and `admin_stats()` to payouts
-- whose underlying booking is `source = 'online'`. Manual rows stay
-- in the database (school side keeps using them) but stop surfacing
-- on the super-admin side. Reads only — no schema change.

-- 1) admin_school_payouts: exclude manual-booking payouts.
create or replace function public.admin_school_payouts()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_result json;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;

  with school_payouts as (
    select s.id            as school_id,
           s.name          as school_name,
           s.iban          as iban,
           s.iban_holder_name as iban_holder_name,
           p.id            as payout_id,
           p.status        as status,
           p.net_amount    as net_amount,
           p.instructor_id as instructor_id
      from public.ski_schools s
      left join public.payouts p
        on p.recipient_type = 'school'
       and p.recipient_id = s.id
       and p.status in ('pending', 'released')
       -- Only platform-collected (online) payouts. Manual bookings
       -- belong to the school's internal books.
       and exists (
             select 1 from public.bookings b
              where b.id = p.booking_id and b.source = 'online'
           )
  ),
  per_instructor as (
    select sp.school_id,
           sp.instructor_id,
           u.name as instructor_name,
           coalesce(sum(sp.net_amount) filter (where sp.status='pending'), 0)::bigint  as pending_kurus,
           coalesce(sum(sp.net_amount) filter (where sp.status='released'), 0)::bigint as released_kurus,
           coalesce(sum(sp.net_amount), 0)::bigint                                     as total_kurus,
           count(sp.payout_id)                                                         as payout_count
      from school_payouts sp
      join public.users u on u.id = sp.instructor_id
     where sp.payout_id is not null
     group by sp.school_id, sp.instructor_id, u.name
  ),
  per_school as (
    select sp.school_id,
           min(sp.school_name)                                                          as school_name,
           min(sp.iban)                                                                 as iban,
           min(sp.iban_holder_name)                                                     as iban_holder_name,
           coalesce(sum(sp.net_amount) filter (where sp.status='pending'), 0)::bigint   as pending_kurus,
           coalesce(sum(sp.net_amount) filter (where sp.status='released'), 0)::bigint  as released_kurus,
           coalesce(sum(sp.net_amount), 0)::bigint                                      as total_kurus,
           count(sp.payout_id)                                                          as payout_count
      from school_payouts sp
     group by sp.school_id
  )
  select json_agg(json_build_object(
           'school_id',         ps.school_id,
           'school_name',       ps.school_name,
           'iban',              ps.iban,
           'iban_holder_name',  ps.iban_holder_name,
           'pending_kurus',     ps.pending_kurus,
           'released_kurus',    ps.released_kurus,
           'total_kurus',       ps.total_kurus,
           'payout_count',      ps.payout_count,
           'instructors',       coalesce((
             select json_agg(json_build_object(
               'instructor_id',   pi.instructor_id,
               'instructor_name', pi.instructor_name,
               'pending_kurus',   pi.pending_kurus,
               'released_kurus',  pi.released_kurus,
               'total_kurus',     pi.total_kurus,
               'payout_count',    pi.payout_count
             ) order by pi.total_kurus desc)
             from per_instructor pi where pi.school_id = ps.school_id
           ), '[]'::json)
         ) order by ps.pending_kurus desc, ps.school_name)
    into v_result
    from per_school ps;

  return coalesce(v_result, '[]'::json);
end;
$$;

grant execute on function public.admin_school_payouts() to authenticated;

-- 2) admin_stats: exclude manual-booking payouts from the pending tile.
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
  -- excluded from platform totals (Phase 16).
  select count(*) into v_total_bookings
    from public.bookings where source = 'online';
  select count(*) into v_paid_bookings
    from public.bookings where source = 'online' and payment_status = 'paid';
  select coalesce(sum(total_price),0) into v_revenue_kurus
    from public.bookings where source = 'online' and payment_status = 'paid';

  -- Pending payouts: only platform-collected (online) bookings count
  -- toward what the platform actually owes (Phase 17).
  select coalesce(sum(p.net_amount),0) into v_pending_payouts
    from public.payouts p
    join public.bookings b on b.id = p.booking_id
   where p.status = 'pending' and b.source = 'online';

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
