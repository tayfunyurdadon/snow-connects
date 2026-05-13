-- Phase 11: Online vs Manuel revenue split for the school Gelirler view.
-- Existing school_payouts_summary lumps all payouts together. The school
-- admin needs to see how much of their revenue came from app (online)
-- bookings vs manual (walk-in / phone) bookings.

create or replace function public.school_payouts_summary()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school   uuid;
  v_rate     numeric;
  v_pending_total  bigint := 0;
  v_released_total bigint := 0;
  v_pending_count  integer := 0;
  v_released_count integer := 0;
  v_pending_online  bigint := 0;
  v_pending_manual  bigint := 0;
  v_released_online bigint := 0;
  v_released_manual bigint := 0;
  v_online_count    integer := 0;
  v_manual_count    integer := 0;
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

  -- Source-split totals (online vs manual) across all statuses.
  -- Joins payouts with bookings to read bookings.source.
  select
    coalesce(sum(case when p.status='pending'  and b.source='online' then p.net_amount else 0 end), 0),
    coalesce(sum(case when p.status='pending'  and b.source='manual' then p.net_amount else 0 end), 0),
    coalesce(sum(case when p.status='released' and b.source='online' then p.net_amount else 0 end), 0),
    coalesce(sum(case when p.status='released' and b.source='manual' then p.net_amount else 0 end), 0),
    coalesce(sum(case when b.source='online' then 1 else 0 end), 0),
    coalesce(sum(case when b.source='manual' then 1 else 0 end), 0)
    into v_pending_online, v_pending_manual,
         v_released_online, v_released_manual,
         v_online_count, v_manual_count
    from public.payouts p
    join public.bookings b on b.id = p.booking_id
   where p.recipient_type='school' and p.recipient_id=v_school;

  return json_build_object(
    'instructorShareRate', v_rate,
    'pendingKurus',  v_pending_total,
    'releasedKurus', v_released_total,
    'pendingCount',  v_pending_count,
    'releasedCount', v_released_count,
    'pendingInstructorKurus',  round(v_pending_total  * v_rate)::bigint,
    'pendingSchoolKurus',      v_pending_total  - round(v_pending_total  * v_rate)::bigint,
    'releasedInstructorKurus', round(v_released_total * v_rate)::bigint,
    'releasedSchoolKurus',     v_released_total - round(v_released_total * v_rate)::bigint,
    'pendingOnlineKurus',  v_pending_online,
    'pendingManualKurus',  v_pending_manual,
    'releasedOnlineKurus', v_released_online,
    'releasedManualKurus', v_released_manual,
    'totalOnlineKurus',    v_pending_online  + v_released_online,
    'totalManualKurus',    v_pending_manual  + v_released_manual,
    'onlineCount',         v_online_count,
    'manualCount',         v_manual_count
  );
end;
$$;

grant execute on function public.school_payouts_summary() to authenticated;
