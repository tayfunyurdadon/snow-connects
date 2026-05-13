-- HOTFIX: the previous admin migration created RLS policies on public.users
-- that referenced public.users in their USING clause, causing
-- "42P17 infinite recursion detected in policy for relation users" on every
-- read. This blocks AuthContext.fetchProfile, so admin login appears to
-- succeed but then the app cannot read the user row and bounces back.
--
-- Fix: route every admin policy through a SECURITY DEFINER helper that
-- bypasses RLS when checking the caller's role.
--
-- Safe to run multiple times. Paste this whole file into the Supabase SQL
-- editor and execute.
------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;
grant execute on function public.is_admin() to authenticated, anon;

-- Recreate every admin-additive policy with the helper.
drop policy if exists "users_admin_read"     on users;
create policy "users_admin_read"     on users     for select using ( public.is_admin() );

drop policy if exists "users_admin_update"   on users;
create policy "users_admin_update"   on users     for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "bookings_admin_read"  on bookings;
create policy "bookings_admin_read"  on bookings  for select using ( public.is_admin() );

drop policy if exists "payouts_admin_read"   on payouts;
create policy "payouts_admin_read"   on payouts   for select using ( public.is_admin() );

drop policy if exists "payouts_admin_update" on payouts;
create policy "payouts_admin_update" on payouts   for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "messages_admin_read"  on messages;
create policy "messages_admin_read"  on messages  for select using ( public.is_admin() );

drop policy if exists "messages_admin_update" on messages;
create policy "messages_admin_update" on messages for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "students_admin_read"  on students;
create policy "students_admin_read"  on students  for select using ( public.is_admin() );

drop policy if exists "resorts_admin_write"  on resorts;
create policy "resorts_admin_write"  on resorts  for all    using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "config_admin_write"   on app_config;
create policy "config_admin_write"   on app_config for update using ( public.is_admin() ) with check ( public.is_admin() );
