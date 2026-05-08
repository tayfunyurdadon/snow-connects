-- Phase 8: Ski schools (kayak okulları)
--
-- Adds optional school affiliation for instructors. School-affiliated
-- instructors are approved by their school admin (instead of platform admin)
-- and their payouts go to the school's IBAN. Pricing math is unchanged.
--
-- Idempotent: safe to re-run.

------------------------------------------------------------
-- 1. Role: allow 'school_admin'
------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('customer','instructor','admin','school_admin'));

------------------------------------------------------------
-- 2. ski_schools table
------------------------------------------------------------
create table if not exists public.ski_schools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  logo text default '',
  description text default '',
  iban text default '',
  iban_holder_name text default '',
  admin_user_id uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now()
);
create index if not exists ski_schools_admin_user_idx on public.ski_schools(admin_user_id);
create index if not exists ski_schools_status_idx on public.ski_schools(status);

------------------------------------------------------------
-- 3. instructor_profiles: add school_id + school approval state
------------------------------------------------------------
alter table public.instructor_profiles
  add column if not exists school_id uuid references public.ski_schools(id) on delete set null,
  add column if not exists school_approval_status text not null default 'approved'
    check (school_approval_status in ('pending','approved','rejected'));
create index if not exists instructor_profiles_school_idx on public.instructor_profiles(school_id);

-- Existing rows (no school_id) should stay 'approved' so we don't break flow.

------------------------------------------------------------
-- 4. payouts: add recipient_type + recipient_id
------------------------------------------------------------
alter table public.payouts
  add column if not exists recipient_type text not null default 'instructor'
    check (recipient_type in ('instructor','school')),
  add column if not exists recipient_id uuid;

-- Backfill recipient_id from instructor_id for existing rows
update public.payouts
   set recipient_id = instructor_id,
       recipient_type = 'instructor'
 where recipient_id is null;

create index if not exists payouts_recipient_idx on public.payouts(recipient_type, recipient_id);

------------------------------------------------------------
-- 5. Helpers
------------------------------------------------------------
create or replace function public.is_school_admin(p_school uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.users u
      where u.id = auth.uid()
        and u.role = 'school_admin'
        and (p_school is null or exists(
          select 1 from public.ski_schools s
            where s.id = p_school and s.admin_user_id = u.id
        ))
  );
$$;

create or replace function public.school_for_user(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from public.ski_schools s where s.admin_user_id = p_user limit 1;
$$;

-- SECURITY DEFINER helper: is the given user an instructor of the
-- school administered by the current auth.uid()? Used by the users
-- RLS policy to avoid recursive policy evaluation between users and
-- instructor_profiles.
create or replace function public.is_my_school_instructor(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.instructor_profiles ip
      join public.ski_schools s on s.id = ip.school_id
      where ip.user_id = p_user
        and s.admin_user_id = auth.uid()
  );
$$;

------------------------------------------------------------
-- 6. RLS for ski_schools
------------------------------------------------------------
alter table public.ski_schools enable row level security;

drop policy if exists "ski_schools_public_read" on public.ski_schools;
create policy "ski_schools_public_read" on public.ski_schools
  for select using (status = 'active');

drop policy if exists "ski_schools_admin_all" on public.ski_schools;
create policy "ski_schools_admin_all" on public.ski_schools
  for all using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "ski_schools_school_admin_self_read" on public.ski_schools;
create policy "ski_schools_school_admin_self_read" on public.ski_schools
  for select using ( admin_user_id = auth.uid() );

drop policy if exists "ski_schools_school_admin_self_update" on public.ski_schools;
create policy "ski_schools_school_admin_self_update" on public.ski_schools
  for update using ( admin_user_id = auth.uid() ) with check ( admin_user_id = auth.uid() );

------------------------------------------------------------
-- 7. RLS additions for school admins on existing tables
------------------------------------------------------------
-- School admins can read users that belong to their school (instructors)
drop policy if exists "users_school_admin_read" on public.users;
create policy "users_school_admin_read" on public.users
  for select using ( public.is_my_school_instructor(public.users.id) );

-- School admins can read instructor profiles for their school (including non-approved)
drop policy if exists "instructor_profiles_school_admin_read" on public.instructor_profiles;
create policy "instructor_profiles_school_admin_read" on public.instructor_profiles
  for select using (
    exists(select 1 from public.ski_schools s
      where s.id = instructor_profiles.school_id and s.admin_user_id = auth.uid())
  );

-- School admins read bookings for their instructors
drop policy if exists "bookings_school_admin_read" on public.bookings;
create policy "bookings_school_admin_read" on public.bookings
  for select using (
    exists(select 1 from public.instructor_profiles ip
      join public.ski_schools s on s.id = ip.school_id
      where ip.user_id = bookings.instructor_id
        and s.admin_user_id = auth.uid())
  );

-- School admins read payouts where they are the recipient
drop policy if exists "payouts_school_admin_read" on public.payouts;
create policy "payouts_school_admin_read" on public.payouts
  for select using (
    recipient_type = 'school'
    and exists(select 1 from public.ski_schools s
      where s.id = payouts.recipient_id and s.admin_user_id = auth.uid())
  );

-- School admins read verification rows for their pending instructors (for credentials)
drop policy if exists "instructor_verification_school_admin_read" on public.instructor_verification;
create policy "instructor_verification_school_admin_read" on public.instructor_verification
  for select using (
    exists(select 1 from public.instructor_profiles ip
      join public.ski_schools s on s.id = ip.school_id
      where ip.user_id = instructor_verification.user_id
        and s.admin_user_id = auth.uid())
  );

------------------------------------------------------------
-- 8. Visibility rule: instructors are visible to customers only when
--    BOTH platform verification is approved AND (no school OR school
--    approval is approved). The existing app code filters
--    verification_status='approved' on instructor_profiles. We mirror the
--    school-approval gate by setting verification_status='pending_review'
--    when a school admin has not yet approved the instructor. This keeps
--    the existing client-side filter working without code changes.
--
--    For independent instructors nothing changes.
------------------------------------------------------------

------------------------------------------------------------
-- 9. School-admin RPCs
------------------------------------------------------------

-- List instructors of caller's school, optionally filtered by status
create or replace function public.school_list_instructors(p_status text default null)
returns table(
  user_id uuid,
  name text,
  email text,
  bio text,
  experience_years integer,
  certifications text[],
  rating numeric,
  resort_ids uuid[],
  verification_status text,
  school_approval_status text,
  cert_type text,
  cert_number text,
  iban text
)
language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
begin
  v_school := public.school_for_user(auth.uid());
  if v_school is null then raise exception 'not a school admin'; end if;

  return query
    select ip.user_id, u.name, u.email, ip.bio, ip.experience_years, ip.certifications,
           ip.rating, ip.resort_ids, ip.verification_status, ip.school_approval_status,
           iv.cert_type, iv.cert_number, iv.iban
      from public.instructor_profiles ip
      join public.users u on u.id = ip.user_id
      left join public.instructor_verification iv on iv.user_id = ip.user_id
     where ip.school_id = v_school
       and (p_status is null or ip.school_approval_status = p_status)
     order by case ip.school_approval_status when 'pending' then 0 when 'approved' then 1 else 2 end,
              u.name;
end;
$$;
grant execute on function public.school_list_instructors(text) to authenticated;

-- Approve / reject an instructor at the school level. Side effect: also
-- flips instructor_profiles.verification_status so customer-side queries
-- filtering by verification_status work without changes.
create or replace function public.school_set_instructor_status(
  p_instructor uuid,
  p_status text,
  p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_their uuid;
begin
  v_school := public.school_for_user(auth.uid());
  if v_school is null then raise exception 'not a school admin'; end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'invalid status'; end if;

  select school_id into v_their from public.instructor_profiles where user_id = p_instructor;
  if v_their is null or v_their <> v_school then raise exception 'instructor not in your school'; end if;

  update public.instructor_profiles
     set school_approval_status = p_status,
         verification_status = case
           when p_status = 'approved' then 'approved'
           when p_status = 'rejected' then 'rejected'
           else 'pending_review'
         end
   where user_id = p_instructor;
end;
$$;
grant execute on function public.school_set_instructor_status(uuid, text, text) to authenticated;

-- School payout summary
create or replace function public.school_payouts_summary()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_school uuid;
  v_pending bigint;
  v_released bigint;
  v_count_pending int;
  v_count_released int;
begin
  v_school := public.school_for_user(auth.uid());
  if v_school is null then raise exception 'not a school admin'; end if;

  select coalesce(sum(net_amount),0), count(*)
    into v_pending, v_count_pending
    from public.payouts
   where recipient_type = 'school' and recipient_id = v_school and status = 'pending';

  select coalesce(sum(net_amount),0), count(*)
    into v_released, v_count_released
    from public.payouts
   where recipient_type = 'school' and recipient_id = v_school and status = 'released';

  return json_build_object(
    'pendingKurus', v_pending,
    'releasedKurus', v_released,
    'pendingCount', v_count_pending,
    'releasedCount', v_count_released
  );
end;
$$;
grant execute on function public.school_payouts_summary() to authenticated;

-- Update school profile (school admin only, own school)
create or replace function public.school_update_profile(
  p_name text,
  p_description text,
  p_logo text,
  p_iban text,
  p_iban_holder_name text
) returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  v_school := public.school_for_user(auth.uid());
  if v_school is null then raise exception 'not a school admin'; end if;

  update public.ski_schools
     set name = coalesce(nullif(trim(p_name), ''), name),
         description = coalesce(p_description, description),
         logo = coalesce(p_logo, logo),
         iban = coalesce(p_iban, iban),
         iban_holder_name = coalesce(p_iban_holder_name, iban_holder_name)
   where id = v_school;
end;
$$;
grant execute on function public.school_update_profile(text, text, text, text, text) to authenticated;

------------------------------------------------------------
-- 10. Platform-admin school CRUD
------------------------------------------------------------
create or replace function public.admin_upsert_school(
  p_id uuid,
  p_name text,
  p_description text,
  p_iban text,
  p_iban_holder_name text,
  p_admin_user_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_old_admin uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'name required'; end if;

  if p_id is null then
    insert into public.ski_schools (name, description, iban, iban_holder_name, admin_user_id)
      values (trim(p_name), coalesce(p_description, ''), coalesce(p_iban, ''),
              coalesce(p_iban_holder_name, ''), p_admin_user_id)
      returning id into v_id;
  else
    select admin_user_id into v_old_admin from public.ski_schools where id = p_id;
    update public.ski_schools
       set name = trim(p_name),
           description = coalesce(p_description, description),
           iban = coalesce(p_iban, iban),
           iban_holder_name = coalesce(p_iban_holder_name, iban_holder_name),
           admin_user_id = p_admin_user_id
     where id = p_id;
    v_id := p_id;

    -- If the previous admin is no longer admin of any school, demote back to customer
    if v_old_admin is not null and v_old_admin is distinct from p_admin_user_id then
      if not exists(select 1 from public.ski_schools where admin_user_id = v_old_admin) then
        update public.users set role = 'customer'
          where id = v_old_admin and role = 'school_admin';
      end if;
    end if;
  end if;

  -- Promote the new admin's role
  if p_admin_user_id is not null then
    update public.users set role = 'school_admin'
      where id = p_admin_user_id and role <> 'admin';
  end if;

  return v_id;
end;
$$;
grant execute on function public.admin_upsert_school(uuid, text, text, text, text, uuid) to authenticated;

create or replace function public.admin_delete_school(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select admin_user_id into v_admin from public.ski_schools where id = p_id;
  delete from public.ski_schools where id = p_id;
  if v_admin is not null then
    if not exists(select 1 from public.ski_schools where admin_user_id = v_admin) then
      update public.users set role = 'customer'
        where id = v_admin and role = 'school_admin';
    end if;
  end if;
end;
$$;
grant execute on function public.admin_delete_school(uuid) to authenticated;

create or replace function public.admin_set_school_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_status not in ('active','blocked') then raise exception 'invalid status'; end if;
  update public.ski_schools set status = p_status where id = p_id;
end;
$$;
grant execute on function public.admin_set_school_status(uuid, text) to authenticated;

-- Helper: list users a platform admin can attach as school admin
create or replace function public.admin_search_users(p_query text default null)
returns table(id uuid, name text, email text, role text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select u.id, u.name, u.email, u.role
      from public.users u
     where p_query is null or p_query = ''
        or u.email ilike '%' || p_query || '%'
        or u.name  ilike '%' || p_query || '%'
     order by u.created_at desc
     limit 50;
end;
$$;
grant execute on function public.admin_search_users(text) to authenticated;

------------------------------------------------------------
-- 11. Booking RPCs: route payout to school when applicable
------------------------------------------------------------
create or replace function create_booking(
  p_instructor uuid,
  p_resort uuid,
  p_date date,
  p_slot_times text[],
  p_students json
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_base integer;
  v_base_total integer;
  v_vat_rate numeric;
  v_bank_rate numeric;
  v_fee integer;
  v_test_mode boolean;
  v_vat integer;
  v_lesson integer;
  v_bank integer;
  v_total integer;
  v_platform integer;
  v_slot_ids uuid[];
  v_booking_id uuid;
  v_student json;
  v_slot_count integer := array_length(p_slot_times, 1);
  v_student_count integer := json_array_length(p_students);
  v_year integer;
  v_season_start date;
  v_season_end date;
  v_season_start_month smallint;
  v_season_start_day smallint;
  v_season_end_month smallint;
  v_season_end_day smallint;
  v_status text;
  v_existing time_slots%rowtype;
  v_slot_id uuid;
  v_payment_status text;
  v_deadline timestamptz;
  v_release date;
  v_added integer;
  v_d date;
  v_school uuid;
  v_recipient_type text;
  v_recipient_id uuid;
  i integer;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select status into v_status from users where id = v_customer;
  if v_status = 'blocked' then raise exception 'account blocked'; end if;
  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;

  perform release_expired_pending_bookings();

  select vat_rate, bank_commission_rate, transaction_fee_kurus, test_mode,
         season_start_month, season_start_day,
         season_end_month,   season_end_day
    into v_vat_rate, v_bank_rate, v_fee, v_test_mode,
         v_season_start_month, v_season_start_day,
         v_season_end_month,   v_season_end_day
    from app_config where id = 1;

  v_year := extract(year from p_date)::int;
  v_season_start := make_date(
    case when extract(month from p_date)::int >= v_season_start_month then v_year else v_year - 1 end,
    v_season_start_month, v_season_start_day
  );
  v_season_end := make_date(
    extract(year from v_season_start)::int + 1,
    v_season_end_month, v_season_end_day
  );
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  declare v_verif text;
  begin
    select verification_status, school_id into v_verif, v_school
      from instructor_profiles where user_id = p_instructor;
    if v_verif is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  select case
      when v_student_count >= 4 then coalesce(nullif(price_4_plus_person, 0), base_price)
      when v_student_count = 3   then coalesce(nullif(price_3_person, 0),     base_price)
      when v_student_count = 2   then coalesce(nullif(price_2_person, 0),     base_price)
      else                            coalesce(nullif(price_1_person, 0),     base_price)
    end
    into v_base
    from instructor_profiles where user_id = p_instructor;
  if v_base is null then raise exception 'instructor not found'; end if;

  v_base_total := v_base * v_student_count * v_slot_count;
  v_vat        := round(v_base_total * v_vat_rate)::int;
  v_lesson     := v_base_total + v_vat;
  v_bank       := round(v_lesson * v_bank_rate)::int;
  v_total      := v_lesson + v_fee;
  v_platform   := v_bank + v_fee;

  if v_school is not null then
    v_recipient_type := 'school';
    v_recipient_id   := v_school;
  else
    v_recipient_type := 'instructor';
    v_recipient_id   := p_instructor;
  end if;

  v_slot_ids := array[]::uuid[];
  for i in 1..v_slot_count loop
    select * into v_existing from time_slots
      where instructor_id = p_instructor and date = p_date and slot_time = p_slot_times[i] for update;
    if found then
      if v_existing.status <> 'available' then
        raise exception 'slot taken: %', p_slot_times[i];
      end if;
      update time_slots set status = 'booked' where id = v_existing.id returning id into v_slot_id;
    else
      insert into time_slots (instructor_id, date, slot_time, status)
        values (p_instructor, p_date, p_slot_times[i], 'booked') returning id into v_slot_id;
    end if;
    v_slot_ids := array_append(v_slot_ids, v_slot_id);
  end loop;

  v_payment_status := case when v_test_mode then 'paid' else 'pending' end;
  v_deadline := case when v_test_mode then null else now() + interval '15 minutes' end;

  insert into bookings (customer_id, instructor_id, resort_id, slot_ids, student_count,
                        base_amount, vat_amount, commission_amount, total_price, lesson_date,
                        payment_status, is_test_booking, payment_deadline,
                        transaction_fee, bank_commission)
    values (v_customer, p_instructor, p_resort, v_slot_ids, v_student_count,
            v_base_total, v_vat, v_platform, v_total, p_date,
            v_payment_status, v_test_mode, v_deadline,
            v_fee, v_bank)
    returning id into v_booking_id;

  update time_slots set booking_id = v_booking_id where id = any(v_slot_ids);

  for v_student in select * from json_array_elements(p_students) loop
    insert into students (booking_id, first_name, last_name, age, experience_level)
      values (v_booking_id,
              v_student->>'firstName',
              v_student->>'lastName',
              (v_student->>'age')::int,
              v_student->>'experienceLevel');
  end loop;

  if v_test_mode then
    v_d := p_date;
    v_added := 0;
    while v_added < 21 loop
      v_d := v_d + 1;
      if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
    end loop;
    v_release := v_d;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status, recipient_type, recipient_id)
      values (p_instructor, v_booking_id, v_lesson, v_bank, v_lesson - v_bank,
              p_date, v_release, 'pending', v_recipient_type, v_recipient_id);
  end if;

  return json_build_object(
    'booking_id', v_booking_id,
    'total', v_total,
    'lesson_amount', v_lesson,
    'vat', v_vat,
    'bank_commission', v_bank,
    'transaction_fee', v_fee,
    'payment_status', v_payment_status,
    'is_test_booking', v_test_mode,
    'payment_deadline', v_deadline
  );
end;
$$;
grant execute on function create_booking(uuid, uuid, date, text[], json) to authenticated;

create or replace function confirm_payment(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid := auth.uid();
  v_booking bookings%rowtype;
  v_release date;
  v_added integer := 0;
  v_d date;
  v_lesson integer;
  v_school uuid;
  v_recipient_type text;
  v_recipient_id uuid;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select * into v_booking from bookings where id = p_booking and customer_id = v_customer for update;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.payment_status = 'paid' then
    return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
  end if;
  update bookings set payment_status = 'paid', payment_deadline = null where id = p_booking;

  if not exists (select 1 from payouts where booking_id = p_booking) then
    select school_id into v_school from instructor_profiles where user_id = v_booking.instructor_id;
    if v_school is not null then
      v_recipient_type := 'school'; v_recipient_id := v_school;
    else
      v_recipient_type := 'instructor'; v_recipient_id := v_booking.instructor_id;
    end if;

    v_d := v_booking.lesson_date;
    while v_added < 21 loop
      v_d := v_d + 1;
      if extract(dow from v_d) not in (0, 6) then v_added := v_added + 1; end if;
    end loop;
    v_release := v_d;
    v_lesson := v_booking.base_amount + v_booking.vat_amount;
    insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount,
                         lesson_date, release_date, status, recipient_type, recipient_id)
      values (v_booking.instructor_id, p_booking, v_lesson, v_booking.bank_commission,
              v_lesson - v_booking.bank_commission, v_booking.lesson_date, v_release, 'pending',
              v_recipient_type, v_recipient_id);
  end if;

  return json_build_object('booking_id', p_booking, 'payment_status', 'paid');
end;
$$;
grant execute on function confirm_payment(uuid) to authenticated;

------------------------------------------------------------
-- 12. handle_new_user trigger: persist optional school_id from signup
--     metadata. Customer/instructor unchanged otherwise.
------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_school uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
  if v_role not in ('customer','instructor') then v_role := 'customer'; end if;
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    v_role
  )
  on conflict (id) do nothing;

  if v_role = 'instructor' then
    v_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
    insert into public.instructor_profiles (
      user_id, school_id,
      school_approval_status,
      verification_status
    ) values (
      new.id, v_school,
      case when v_school is null then 'approved' else 'pending' end,
      'pending_documents'
    )
    on conflict (user_id) do update set
      school_id = excluded.school_id,
      school_approval_status = excluded.school_approval_status;
  end if;

  return new;
end;
$$;
