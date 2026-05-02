-- Snow Connects database schema
-- Paste this into the Supabase SQL Editor and run once.
-- Idempotent: safe to re-run.

create extension if not exists "uuid-ossp";

------------------------------------------------------------
-- App config (single row)
------------------------------------------------------------
create table if not exists app_config (
  id smallint primary key default 1,
  vat_rate numeric(5,4) not null default 0.20,
  commission_rate numeric(5,4) not null default 0.03,
  constraint single_row check (id = 1)
);
insert into app_config (id) values (1) on conflict do nothing;

------------------------------------------------------------
-- Users (extends auth.users)
------------------------------------------------------------
create table if not exists users (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  email text,
  phone text,
  role text not null default 'customer' check (role in ('customer','instructor','admin')),
  status text not null default 'active' check (status in ('active','blocked','pending')),
  strike_count integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

------------------------------------------------------------
-- Resorts
------------------------------------------------------------
create table if not exists resorts (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  region text not null
);

insert into resorts (name, region) values
  ('Sarıkamış','Kars'),
  ('Palandöken','Erzurum'),
  ('Uludağ','Bursa'),
  ('Kartalkaya','Bolu'),
  ('Erciyes','Kayseri'),
  ('Ilgaz','Kastamonu'),
  ('Ergan','Erzincan')
on conflict (name) do nothing;

------------------------------------------------------------
-- Instructor profiles
------------------------------------------------------------
create table if not exists instructor_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  bio text default '',
  photo text default '',
  certifications text[] default '{}',
  experience_years integer not null default 0,
  base_price integer not null default 0, -- kuruş per slot
  rating numeric(3,2) default 5.00,
  resort_ids uuid[] not null default '{}'
);

------------------------------------------------------------
-- Time slots
------------------------------------------------------------
create table if not exists time_slots (
  id uuid primary key default uuid_generate_v4(),
  instructor_id uuid not null references users(id) on delete cascade,
  date date not null,
  slot_time text not null,
  status text not null default 'available' check (status in ('available','booked','manual')),
  booking_id uuid,
  note text,
  unique (instructor_id, date, slot_time)
);
create index if not exists idx_slots_instructor on time_slots(instructor_id, date);

------------------------------------------------------------
-- Bookings
------------------------------------------------------------
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references users(id) on delete cascade,
  instructor_id uuid not null references users(id) on delete cascade,
  resort_id uuid not null references resorts(id),
  slot_ids uuid[] not null,
  student_count integer not null,
  base_amount integer not null,
  vat_amount integer not null,
  commission_amount integer not null,
  total_price integer not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  lesson_status text not null default 'upcoming' check (lesson_status in ('upcoming','completed','cancelled')),
  lesson_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_bookings_customer on bookings(customer_id);
create index if not exists idx_bookings_instructor on bookings(instructor_id);

------------------------------------------------------------
-- Students
------------------------------------------------------------
create table if not exists students (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  age integer not null,
  experience_level text not null
);

------------------------------------------------------------
-- Messages
------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid not null references users(id) on delete cascade,
  receiver_id uuid not null references users(id) on delete cascade,
  content text not null,
  flagged boolean not null default false,
  flag_reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_pair on messages(
  least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at desc
);

------------------------------------------------------------
-- Payouts
------------------------------------------------------------
create table if not exists payouts (
  id uuid primary key default uuid_generate_v4(),
  instructor_id uuid not null references users(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  gross_amount integer not null,
  commission integer not null,
  net_amount integer not null,
  lesson_date date not null,
  release_date date not null,
  status text not null default 'pending' check (status in ('pending','released'))
);

------------------------------------------------------------
-- Contact info detector
------------------------------------------------------------
create or replace function detect_contact_info(content text) returns text language plpgsql immutable as $$
declare
  cleaned text;
begin
  cleaned := lower(content);
  if cleaned ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    return 'email';
  end if;
  if cleaned ~ '(https?://|www\.|[a-z0-9-]+\.(com|net|org|tr|co|io|me|app))' then
    return 'url';
  end if;
  if cleaned ~ '(\+?9?0?[ \-]?\(?5\d{2}\)?[ \-]?\d{3}[ \-]?\d{2}[ \-]?\d{2})' then
    return 'phone';
  end if;
  if regexp_replace(cleaned, '[^0-9]', '', 'g') ~ '\d{10,}' then
    return 'phone';
  end if;
  return null;
end;
$$;

------------------------------------------------------------
-- send_message RPC with strike enforcement
------------------------------------------------------------
create or replace function send_message(p_receiver uuid, p_content text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid := auth.uid();
  v_role text;
  v_status text;
  v_strikes integer;
  v_flag text;
  v_msg messages%rowtype;
  v_warning text := null;
  v_blocked boolean := false;
begin
  if v_sender is null then raise exception 'not authenticated'; end if;
  select role, status, strike_count into v_role, v_status, v_strikes from users where id = v_sender;
  if v_status = 'blocked' then raise exception 'account blocked'; end if;

  v_flag := detect_contact_info(p_content);

  insert into messages (sender_id, receiver_id, content, flagged, flag_reason)
  values (v_sender, p_receiver, p_content, v_flag is not null, v_flag)
  returning * into v_msg;

  if v_flag is not null then
    update users set strike_count = strike_count + 1 where id = v_sender returning strike_count into v_strikes;
    if v_role = 'instructor' then
      v_warning := case v_strikes
        when 1 then 'İletişim bilgisi paylaşımı tespit edildi. 1. uyarı.'
        when 2 then 'İletişim bilgisi paylaşımı tespit edildi. 2. uyarı. Bir sonraki ihlalde hesabınız bloke edilecektir.'
        else 'İletişim bilgisi paylaşımı 3. defa tespit edildi. Hesabınız bloke edildi.'
      end;
      if v_strikes >= 3 then
        update users set status = 'blocked' where id = v_sender;
        v_blocked := true;
      end if;
    else
      v_warning := 'İletişim bilgisi paylaşımı tespit edildi. Bu mesaj inceleme için işaretlendi.';
    end if;
  end if;

  return json_build_object(
    'message', row_to_json(v_msg),
    'warning', v_warning,
    'blocked', v_blocked,
    'strike_count', v_strikes
  );
end;
$$;

------------------------------------------------------------
-- create_booking RPC: season check, pricing, slot lock
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

  v_year := extract(year from p_date)::int;
  v_season_start := make_date(case when extract(month from p_date)::int >= 12 then v_year else v_year - 1 end, 12, 15);
  v_season_end   := make_date(extract(year from v_season_start)::int + 1, 4, 15);
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  select base_price into v_base from instructor_profiles where user_id = p_instructor;
  if v_base is null then raise exception 'instructor not found'; end if;

  select vat_rate, commission_rate into v_vat_rate, v_commission_rate from app_config where id = 1;

  -- Price is per slot for the lesson (not per student). Group lessons share the rate.
  v_base_total := v_base * v_slot_count;
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

------------------------------------------------------------
-- confirm_payment RPC (stub Param.com integration)
------------------------------------------------------------
create or replace function confirm_payment(p_booking uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_booking bookings%rowtype;
  v_release date;
  v_business_days integer := 21;
  v_added integer := 0;
  v_d date;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_booking from bookings where id = p_booking;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.customer_id <> auth.uid()
     and not exists(select 1 from users where id = auth.uid() and role = 'admin') then
    raise exception 'forbidden';
  end if;
  if v_booking.payment_status = 'paid' then
    return json_build_object('already_paid', true);
  end if;

  update bookings set payment_status = 'paid' where id = p_booking;

  v_d := v_booking.lesson_date;
  while v_added < v_business_days loop
    v_d := v_d + 1;
    if extract(dow from v_d) not in (0, 6) then
      v_added := v_added + 1;
    end if;
  end loop;
  v_release := v_d;

  insert into payouts (instructor_id, booking_id, gross_amount, commission, net_amount, lesson_date, release_date)
    values (v_booking.instructor_id, v_booking.id, v_booking.total_price, v_booking.commission_amount,
            v_booking.total_price - v_booking.commission_amount, v_booking.lesson_date, v_release);

  return json_build_object('paid', true, 'release_date', v_release);
end;
$$;

------------------------------------------------------------
-- block_slot / unblock_slot
------------------------------------------------------------
create or replace function block_slot(p_date date, p_slot_time text, p_note text)
returns time_slots language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_slot time_slots%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select role into v_role from users where id = v_user;
  if v_role <> 'instructor' then raise exception 'instructors only'; end if;
  select * into v_slot from time_slots where instructor_id = v_user and date = p_date and slot_time = p_slot_time for update;
  if found then
    if v_slot.status = 'booked' then raise exception 'slot already booked'; end if;
    update time_slots set status = 'manual', note = p_note where id = v_slot.id returning * into v_slot;
  else
    insert into time_slots (instructor_id, date, slot_time, status, note)
      values (v_user, p_date, p_slot_time, 'manual', p_note) returning * into v_slot;
  end if;
  return v_slot;
end;
$$;

create or replace function unblock_slot(p_slot_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_slot time_slots%rowtype;
begin
  select * into v_slot from time_slots where id = p_slot_id;
  if not found then return false; end if;
  if v_slot.instructor_id <> v_user then raise exception 'forbidden'; end if;
  if v_slot.status <> 'manual' then raise exception 'cannot unblock booked slot'; end if;
  delete from time_slots where id = p_slot_id;
  return true;
end;
$$;

------------------------------------------------------------
-- Row level security
------------------------------------------------------------
alter table users enable row level security;
alter table resorts enable row level security;
alter table instructor_profiles enable row level security;
alter table time_slots enable row level security;
alter table bookings enable row level security;
alter table students enable row level security;
alter table messages enable row level security;
alter table payouts enable row level security;
alter table app_config enable row level security;

drop policy if exists "resorts_read" on resorts;
create policy "resorts_read" on resorts for select using (true);

drop policy if exists "config_read" on app_config;
create policy "config_read" on app_config for select using (true);

drop policy if exists "users_self_read" on users;
create policy "users_self_read" on users for select using (auth.uid() = id);
drop policy if exists "users_public_instructors" on users;
create policy "users_public_instructors" on users for select using (role = 'instructor');
drop policy if exists "users_self_update" on users;
create policy "users_self_update" on users for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "ip_read" on instructor_profiles;
create policy "ip_read" on instructor_profiles for select using (true);
drop policy if exists "ip_owner_write" on instructor_profiles;
create policy "ip_owner_write" on instructor_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "slots_read" on time_slots;
create policy "slots_read" on time_slots for select using (true);
drop policy if exists "slots_instructor_write" on time_slots;
create policy "slots_instructor_write" on time_slots for all using (auth.uid() = instructor_id) with check (auth.uid() = instructor_id);

drop policy if exists "bookings_read" on bookings;
create policy "bookings_read" on bookings for select using (
  auth.uid() = customer_id or auth.uid() = instructor_id
);
-- Direct inserts are blocked; clients must use create_booking RPC (SECURITY DEFINER).
drop policy if exists "bookings_no_direct_write" on bookings;
create policy "bookings_no_direct_write" on bookings for insert with check (false);

drop policy if exists "students_read" on students;
create policy "students_read" on students for select using (
  exists(select 1 from bookings b where b.id = students.booking_id and (
    b.customer_id = auth.uid() or b.instructor_id = auth.uid()
  ))
);

drop policy if exists "messages_read" on messages;
create policy "messages_read" on messages for select using (auth.uid() in (sender_id, receiver_id));
-- Direct inserts are blocked; clients must use send_message RPC (SECURITY DEFINER)
-- which enforces the contact-info filter and strike accounting.
drop policy if exists "messages_no_direct_write" on messages;
create policy "messages_no_direct_write" on messages for insert with check (false);

drop policy if exists "payouts_read" on payouts;
create policy "payouts_read" on payouts for select using (auth.uid() = instructor_id);

------------------------------------------------------------
-- Realtime publication for messages
------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
