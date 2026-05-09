-- Phase 13: Super-admin "Okul Ödemeleri" view.
-- Returns one row per ski school with pending / released / total
-- amounts AND a per-instructor breakdown showing which instructors
-- generated each school's payouts.

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
       -- Only owed / transferred amounts. Cancelled payouts (e.g. from
       -- approved disputes) must NOT inflate the platform's debt totals.
       and p.status in ('pending', 'released')
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
  select coalesce(json_agg(json_build_object(
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
