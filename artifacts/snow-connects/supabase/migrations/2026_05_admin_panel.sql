-- Admin platform configuration (extension to app_config)
-- Adds editable season window. VAT/commission already exist.
------------------------------------------------------------
alter table app_config add column if not exists season_start_month smallint not null default 12;
alter table app_config add column if not exists season_start_day   smallint not null default 1;
alter table app_config add column if not exists season_end_month   smallint not null default 4;
alter table app_config add column if not exists season_end_day     smallint not null default 15;

------------------------------------------------------------
-- Admin RLS: read-all on user-scoped tables, write on resorts/config.
-- Each policy is additive ("OR admin") so it does not weaken existing
-- per-user policies for non-admin callers.
------------------------------------------------------------
drop policy if exists "users_admin_read"   on users;
create policy "users_admin_read"   on users for select using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
drop policy if exists "users_admin_update" on users;
create policy "users_admin_update" on users for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
) with check (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists "bookings_admin_read" on bookings;
create policy "bookings_admin_read" on bookings for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

drop policy if exists "payouts_admin_read"  on payouts;
create policy "payouts_admin_read"  on payouts for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);
drop policy if exists "payouts_admin_update" on payouts;
create policy "payouts_admin_update" on payouts for update using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

drop policy if exists "messages_admin_read" on messages;
create policy "messages_admin_read" on messages for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);
drop policy if exists "messages_admin_update" on messages;
create policy "messages_admin_update" on messages for update using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

drop policy if exists "students_admin_read" on students;
create policy "students_admin_read" on students for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

drop policy if exists "resorts_admin_write" on resorts;
create policy "resorts_admin_write" on resorts for all using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

drop policy if exists "config_admin_write" on app_config;
create policy "config_admin_write" on app_config for update using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

------------------------------------------------------------
-- Admin RPCs
------------------------------------------------------------
-- Aggregate stats for the dashboard tile row. All counts are computed
-- in a single round-trip to avoid N small queries from the client.
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
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;

  select count(*) into v_total_users     from public.users;
  select count(*) into v_total_customers from public.users where role = 'customer';
  select count(*) into v_total_instructors from public.users where role = 'instructor';
  select count(*) into v_pending_verifications from public.instructor_profiles where verification_status = 'pending_review';
  select count(*) into v_total_bookings from public.bookings;
  select count(*) into v_paid_bookings  from public.bookings where payment_status = 'paid';
  select coalesce(sum(total_price),0) into v_revenue_kurus from public.bookings where payment_status = 'paid';
  select coalesce(sum(net_amount),0)  into v_pending_payouts from public.payouts where status = 'pending';
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

create or replace function admin_set_user_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  if p_status not in ('active','blocked','pending') then
    raise exception 'invalid status';
  end if;
  update public.users
     set status = p_status,
         strike_count = case when p_status = 'active' then 0 else strike_count end
   where id = p_user;
end;
$$;
grant execute on function admin_set_user_status(uuid, text) to authenticated;

create or replace function admin_release_payout(p_payout uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  update public.payouts
     set status = 'released', release_date = now()::date
   where id = p_payout and status = 'pending';
end;
$$;
grant execute on function admin_release_payout(uuid) to authenticated;

create or replace function admin_resolve_flag(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  update public.messages
     set flagged = false, flag_reason = null
   where id = p_message;
end;
$$;
grant execute on function admin_resolve_flag(uuid) to authenticated;

create or replace function admin_upsert_resort(p_id uuid, p_name text, p_region text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_region),'') = '' then
    raise exception 'name and region required';
  end if;
  if p_id is null then
    insert into public.resorts (name, region) values (trim(p_name), trim(p_region))
      returning id into v_id;
  else
    update public.resorts set name = trim(p_name), region = trim(p_region) where id = p_id;
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
grant execute on function admin_upsert_resort(uuid, text, text) to authenticated;

create or replace function admin_delete_resort(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  delete from public.resorts where id = p_id;
end;
$$;
grant execute on function admin_delete_resort(uuid) to authenticated;

create or replace function admin_update_config(
  p_vat_rate numeric,
  p_commission_rate numeric,
  p_season_start_month smallint,
  p_season_start_day smallint,
  p_season_end_month smallint,
  p_season_end_day smallint
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  if p_vat_rate < 0 or p_vat_rate > 1 then raise exception 'vat_rate out of range'; end if;
  if p_commission_rate < 0 or p_commission_rate > 1 then raise exception 'commission_rate out of range'; end if;
  if p_season_start_month not between 1 and 12 or p_season_end_month not between 1 and 12 then
    raise exception 'invalid month';
  end if;
  if p_season_start_day not between 1 and 31 or p_season_end_day not between 1 and 31 then
    raise exception 'invalid day';
  end if;
  update public.app_config
     set vat_rate = p_vat_rate,
         commission_rate = p_commission_rate,
         season_start_month = p_season_start_month,
         season_start_day   = p_season_start_day,
         season_end_month   = p_season_end_month,
         season_end_day     = p_season_end_day
   where id = 1;
end;
$$;
grant execute on function admin_update_config(numeric, numeric, smallint, smallint, smallint, smallint) to authenticated;

------------------------------------------------------------

------------------------------------------------------------
-- Patch: create_booking now reads season window from app_config
-- (admin-editable). Signature is preserved so it REPLACES the existing
-- function rather than creating a second overload.
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
  v_commission_rate numeric;
  v_vat integer;
  v_commission integer;
  v_total integer;
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
  i integer;
begin
  if v_customer is null then raise exception 'not authenticated'; end if;
  select status into v_status from users where id = v_customer;
  if v_status = 'blocked' then raise exception 'account blocked'; end if;
  if v_slot_count is null or v_slot_count < 1 then raise exception 'no slots'; end if;
  if v_student_count is null or v_student_count < 1 then raise exception 'no students'; end if;

  -- Pull season window AND tax/commission from app_config in one shot so the
  -- admin-editable values control booking eligibility and pricing in real time.
  select vat_rate, commission_rate,
         season_start_month, season_start_day,
         season_end_month,   season_end_day
    into v_vat_rate, v_commission_rate,
         v_season_start_month, v_season_start_day,
         v_season_end_month,   v_season_end_day
    from app_config where id = 1;

  v_year := extract(year from p_date)::int;
  v_season_start := make_date(
    case when extract(month from p_date)::int >= v_season_start_month then v_year else v_year - 1 end,
    v_season_start_month,
    v_season_start_day
  );
  v_season_end := make_date(
    extract(year from v_season_start)::int + 1,
    v_season_end_month,
    v_season_end_day
  );
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  declare v_verif text;
  begin
    select verification_status into v_verif from instructor_profiles where user_id = p_instructor;
    if v_verif is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  select
    case
      when v_student_count >= 4 then coalesce(nullif(price_4_plus_person, 0), base_price)
      when v_student_count = 3   then coalesce(nullif(price_3_person, 0),     base_price)
      when v_student_count = 2   then coalesce(nullif(price_2_person, 0),     base_price)
      else                            coalesce(nullif(price_1_person, 0),     base_price)
    end
    into v_base
    from instructor_profiles where user_id = p_instructor;
  if v_base is null then raise exception 'instructor not found'; end if;

  v_base_total := v_base * v_student_count * v_slot_count;
  v_vat := round(v_base_total * v_vat_rate)::int;
  v_total := v_base_total + v_vat;
  v_commission := round(v_total * v_commission_rate)::int;

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

  insert into bookings (customer_id, instructor_id, resort_id, slot_ids, student_count,
                        base_amount, vat_amount, commission_amount, total_price, lesson_date)
    values (v_customer, p_instructor, p_resort, v_slot_ids, v_student_count,
            v_base_total, v_vat, v_commission, v_total, p_date)
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

  return json_build_object('booking_id', v_booking_id, 'total', v_total, 'vat', v_vat);
end;
$$;
