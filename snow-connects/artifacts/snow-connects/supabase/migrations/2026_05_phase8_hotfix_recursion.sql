-- Hotfix: the original phase8 users_school_admin_read policy queried
-- instructor_profiles, which itself has RLS that touches users → infinite
-- recursion. Replace it with a SECURITY DEFINER helper that bypasses RLS.

create or replace function public.is_my_school_instructor(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.instructor_profiles ip
      join public.ski_schools s on s.id = ip.school_id
      where ip.user_id = p_user
        and s.admin_user_id = auth.uid()
  );
$$;

drop policy if exists "users_school_admin_read" on public.users;
create policy "users_school_admin_read" on public.users
  for select using ( public.is_my_school_instructor(public.users.id) );
