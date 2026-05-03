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
declare
  v_role text;
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
  -- Pre-create the instructor profile row in 'pending_documents' so the
  -- verification flow has a row to read/update from the moment they sign up.
  if v_role = 'instructor' then
    insert into public.instructor_profiles (user_id, verification_status)
      values (new.id, 'pending_documents')
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

------------------------------------------------------------
-- ensure_my_user RPC: self-heal a missing public.users row.
-- Older accounts created before the trigger existed (or before
-- the trigger fired correctly) can be missing their row in
-- public.users, which causes FK violations on every downstream
-- write (instructor_profiles, bookings, ...). Any authenticated
-- client may call this to make sure their row exists.
------------------------------------------------------------
create or replace function ensure_my_user(
  p_name text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
  v_role text;
  v_name text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Role is NEVER taken from the client. We re-read it from the trusted
  -- auth.users.raw_user_meta_data the same way handle_new_user does, so a
  -- caller cannot self-promote to 'instructor' by passing a forged arg.
  select email, raw_user_meta_data into v_email, v_meta from auth.users where id = v_uid;
  v_role := coalesce(v_meta->>'role', 'customer');
  if v_role not in ('customer','instructor') then v_role := 'customer'; end if;
  v_name := coalesce(nullif(p_name, ''), v_meta->>'name', '');
  insert into public.users (id, email, name, role)
    values (v_uid, v_email, v_name, v_role)
    on conflict (id) do nothing;
  if v_role = 'instructor' then
    insert into public.instructor_profiles (user_id, verification_status)
      values (v_uid, 'pending_documents')
      on conflict (user_id) do nothing;
  end if;
end;
$$;

grant execute on function ensure_my_user(text) to authenticated;

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
  base_price integer not null default 0, -- legacy per-slot kuruş, fallback only
  price_1_person integer not null default 0,     -- kuruş per person, 1-student lesson
  price_2_person integer not null default 0,     -- kuruş per person, 2-student lesson
  price_3_person integer not null default 0,     -- kuruş per person, 3-student lesson
  price_4_plus_person integer not null default 0, -- kuruş per person, 4+ student lesson
  rating numeric(3,2) default 5.00,
  resort_ids uuid[] not null default '{}',
  -- Verification gate. Customers can only see and book 'approved' instructors.
  -- pending_documents → just signed up, hasn't uploaded yet
  -- pending_review    → docs uploaded, waiting for admin
  -- approved          → verified, can receive bookings
  -- rejected          → admin rejected, must re-submit
  -- suspended         → temporarily disabled by admin
  verification_status text not null default 'pending_documents'
    check (verification_status in ('pending_documents','pending_review','approved','rejected','suspended'))
);

-- Backfill columns when re-running on an older schema.
alter table instructor_profiles add column if not exists price_1_person integer not null default 0;
alter table instructor_profiles add column if not exists price_2_person integer not null default 0;
alter table instructor_profiles add column if not exists price_3_person integer not null default 0;
alter table instructor_profiles add column if not exists price_4_plus_person integer not null default 0;
alter table instructor_profiles add column if not exists verification_status text not null default 'pending_documents'
  check (verification_status in ('pending_documents','pending_review','approved','rejected','suspended'));

-- Existing rows from before the verification system existed: grandfather them
-- as approved so currently-active instructors are not unintentionally hidden.
update instructor_profiles
  set verification_status = 'approved'
  where verification_status = 'pending_documents'
    and (bio <> '' or base_price > 0 or price_1_person > 0 or array_length(resort_ids, 1) > 0);

------------------------------------------------------------
-- Instructor verification (sensitive PII; separate table so we can
-- enforce strict RLS that never exposes TC Kimlik / IBAN to the public).
------------------------------------------------------------
create table if not exists instructor_verification (
  user_id uuid primary key references users(id) on delete cascade,
  -- Certificate
  cert_type text,                -- ISIA Level 1/2/3, TKF, Diğer
  cert_number text,
  cert_issued_at date,
  cert_expires_at date,
  cert_doc_path text,            -- storage key in 'instructor-docs' bucket
  -- ID
  id_front_path text,
  id_back_path text,
  tc_kimlik_no text,
  -- Banking
  iban text,
  iban_holder_name text,
  -- Review trail
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  rejection_reason text
);

------------------------------------------------------------
-- Notification outbox (consumed by an external worker / Edge Function
-- that delivers transactional email; we just enqueue the events here).
------------------------------------------------------------
create table if not exists notification_outbox (
  id uuid primary key default uuid_generate_v4(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text
);
create index if not exists idx_outbox_pending on notification_outbox(status, created_at) where status = 'pending';

------------------------------------------------------------
-- Storage bucket for instructor verification documents (private).
------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('instructor-docs', 'instructor-docs', false)
  on conflict (id) do nothing;

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
  -- Season window: Dec 1 – Apr 15 (must stay in sync with lib/season.ts).
  v_season_start := make_date(case when extract(month from p_date)::int >= 12 then v_year else v_year - 1 end, 12, 1);
  v_season_end   := make_date(extract(year from v_season_start)::int + 1, 4, 15);
  if p_date < v_season_start or p_date > v_season_end then
    raise exception 'season closed';
  end if;

  -- Verification gate: only approved instructors can receive bookings.
  -- We block at the RPC layer in addition to the RLS-based listing filter
  -- so a stale/forged client cannot attempt to book an unverified instructor.
  declare v_verif text;
  begin
    select verification_status into v_verif from instructor_profiles where user_id = p_instructor;
    if v_verif is distinct from 'approved' then
      raise exception 'instructor not verified';
    end if;
  end;

  -- Pick per-person rate for the lesson tier. Falls back to the legacy
  -- flat base_price when a tier column is not yet set, so older profiles
  -- continue to price correctly until edited.
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

  select vat_rate, commission_rate into v_vat_rate, v_commission_rate from app_config where id = 1;

  -- Per-person × students × slots, then VAT on top.
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

-- Public can only see approved instructor profiles. Owner reads/writes their
-- own row via the owner policy below. Admin sees all via the admin policy.
drop policy if exists "ip_read" on instructor_profiles;
drop policy if exists "ip_read_approved" on instructor_profiles;
create policy "ip_read_approved" on instructor_profiles for select using (
  verification_status = 'approved'
);
drop policy if exists "ip_owner_write" on instructor_profiles;
create policy "ip_owner_write" on instructor_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "ip_admin_all" on instructor_profiles;
create policy "ip_admin_all" on instructor_profiles for all using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);

------------------------------------------------------------
-- RLS for verification + notification + storage
------------------------------------------------------------
alter table instructor_verification enable row level security;
drop policy if exists "iv_owner_read" on instructor_verification;
create policy "iv_owner_read" on instructor_verification for select using (auth.uid() = user_id);
drop policy if exists "iv_admin_read" on instructor_verification;
create policy "iv_admin_read" on instructor_verification for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);
-- All writes go through SECURITY DEFINER RPCs (submit / approve / reject).
drop policy if exists "iv_no_direct_write" on instructor_verification;
create policy "iv_no_direct_write" on instructor_verification for insert with check (false);
drop policy if exists "iv_no_direct_update" on instructor_verification;
create policy "iv_no_direct_update" on instructor_verification for update using (false);

alter table notification_outbox enable row level security;
drop policy if exists "outbox_admin_read" on notification_outbox;
create policy "outbox_admin_read" on notification_outbox for select using (
  exists (select 1 from public.users where id = auth.uid() and role = 'admin')
);
drop policy if exists "outbox_no_direct_write" on notification_outbox;
create policy "outbox_no_direct_write" on notification_outbox for insert with check (false);

-- Storage object policies: each instructor's docs live under '<user_id>/...'
-- in the 'instructor-docs' bucket. Only that user and admins can read/write.
drop policy if exists "instructor_docs_owner_read" on storage.objects;
create policy "instructor_docs_owner_read" on storage.objects for select to authenticated using (
  bucket_id = 'instructor-docs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  )
);
drop policy if exists "instructor_docs_owner_write" on storage.objects;
create policy "instructor_docs_owner_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'instructor-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "instructor_docs_owner_update" on storage.objects;
create policy "instructor_docs_owner_update" on storage.objects for update to authenticated using (
  bucket_id = 'instructor-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "instructor_docs_owner_delete" on storage.objects;
create policy "instructor_docs_owner_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'instructor-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

------------------------------------------------------------
-- Verification RPCs
------------------------------------------------------------
-- Instructor submits their verification packet. Client uploads documents
-- to the 'instructor-docs' storage bucket FIRST (so the storage paths exist
-- and are owned by them per RLS), then calls this RPC with the metadata.
create or replace function submit_instructor_verification(
  p_cert_type text,
  p_cert_number text,
  p_cert_issued date,
  p_cert_expires date,
  p_cert_doc_path text,
  p_id_front_path text,
  p_id_back_path text,
  p_tc_kimlik text,
  p_photo_path text,
  p_iban text,
  p_iban_holder text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select role into v_role from public.users where id = v_uid;
  if v_role is distinct from 'instructor' then raise exception 'instructors only'; end if;

  -- Light validation; UI does richer checks but we double-check at the boundary.
  if coalesce(trim(p_cert_type), '') = '' then raise exception 'cert_type required'; end if;
  if coalesce(trim(p_cert_number), '') = '' then raise exception 'cert_number required'; end if;
  if p_cert_issued is null then raise exception 'cert_issued required'; end if;
  if coalesce(trim(p_cert_doc_path), '') = '' then raise exception 'cert document required'; end if;
  if coalesce(trim(p_id_front_path), '') = '' then raise exception 'id front required'; end if;
  if coalesce(trim(p_id_back_path), '') = '' then raise exception 'id back required'; end if;
  if coalesce(trim(p_photo_path), '') = '' then raise exception 'profile photo required'; end if;
  -- Defense-in-depth: storage RLS already prevents an instructor from
  -- writing to anyone else's folder, but this RPC is SECURITY DEFINER, so
  -- the caller could otherwise pass a spoofed path to a victim's document.
  -- Enforce that every submitted path begins with the caller's user_id.
  if p_cert_doc_path  not like (v_uid::text || '/%')
     or p_id_front_path not like (v_uid::text || '/%')
     or p_id_back_path  not like (v_uid::text || '/%')
     or p_photo_path    not like (v_uid::text || '/%') then
    raise exception 'document path ownership mismatch';
  end if;
  if regexp_replace(coalesce(p_tc_kimlik, ''), '\D', '', 'g') !~ '^\d{11}$' then
    raise exception 'invalid tc_kimlik';
  end if;
  if upper(replace(coalesce(p_iban, ''), ' ', '')) !~ '^TR\d{24}$' then
    raise exception 'invalid iban';
  end if;
  if coalesce(trim(p_iban_holder), '') = '' then raise exception 'iban_holder required'; end if;

  -- Make sure the profile + verification rows exist (handle_new_user normally
  -- creates the profile row, but ensure for safety).
  insert into public.instructor_profiles (user_id, verification_status)
    values (v_uid, 'pending_documents') on conflict (user_id) do nothing;
  insert into public.instructor_verification (user_id) values (v_uid)
    on conflict (user_id) do nothing;

  update public.instructor_verification set
    cert_type = p_cert_type,
    cert_number = p_cert_number,
    cert_issued_at = p_cert_issued,
    cert_expires_at = p_cert_expires,
    cert_doc_path = p_cert_doc_path,
    id_front_path = p_id_front_path,
    id_back_path = p_id_back_path,
    tc_kimlik_no = regexp_replace(p_tc_kimlik, '\D', '', 'g'),
    iban = upper(replace(p_iban, ' ', '')),
    iban_holder_name = p_iban_holder,
    submitted_at = now(),
    rejection_reason = null
  where user_id = v_uid;

  update public.instructor_profiles set
    verification_status = 'pending_review',
    photo = p_photo_path
  where user_id = v_uid;

  insert into public.notification_outbox (recipient_user_id, kind, payload)
    values (v_uid, 'verification_submitted', '{}'::jsonb);
end;
$$;
grant execute on function submit_instructor_verification(text,text,date,date,text,text,text,text,text,text,text) to authenticated;

create or replace function admin_approve_instructor(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_current text;
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not exists(select 1 from public.users where id = v_admin and role = 'admin') then
    raise exception 'admins only';
  end if;
  -- Only allow approving from a state where review has actually happened.
  -- Avoids accidental approval of a profile that hasn't uploaded anything yet.
  select verification_status into v_current from public.instructor_profiles where user_id = p_user;
  if v_current is null then raise exception 'instructor not found'; end if;
  if v_current not in ('pending_review','rejected','suspended') then
    raise exception 'cannot approve from status %', v_current;
  end if;
  update public.instructor_profiles
     set verification_status = 'approved'
   where user_id = p_user;
  update public.instructor_verification
     set reviewed_at = now(), reviewed_by = v_admin, rejection_reason = null
   where user_id = p_user;
  insert into public.notification_outbox (recipient_user_id, kind, payload)
    values (p_user, 'verification_approved', '{}'::jsonb);
end;
$$;
grant execute on function admin_approve_instructor(uuid) to authenticated;

create or replace function admin_reject_instructor(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_current text;
begin
  if v_admin is null then raise exception 'not authenticated'; end if;
  if not exists(select 1 from public.users where id = v_admin and role = 'admin') then
    raise exception 'admins only';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select verification_status into v_current from public.instructor_profiles where user_id = p_user;
  if v_current is null then raise exception 'instructor not found'; end if;
  if v_current not in ('pending_review','approved') then
    raise exception 'cannot reject from status %', v_current;
  end if;
  update public.instructor_profiles
     set verification_status = 'rejected'
   where user_id = p_user;
  update public.instructor_verification
     set reviewed_at = now(), reviewed_by = v_admin, rejection_reason = p_reason
   where user_id = p_user;
  insert into public.notification_outbox (recipient_user_id, kind, payload)
    values (p_user, 'verification_rejected', jsonb_build_object('reason', p_reason));
end;
$$;
grant execute on function admin_reject_instructor(uuid, text) to authenticated;

-- Returns a list of verification applications visible to the current admin,
-- with the joined user info. Avoids client-side multi-table joins.
create or replace function admin_list_verifications(p_status text)
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  resort_ids uuid[],
  verification_status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text,
  cert_type text,
  cert_doc_path text,
  id_front_path text,
  id_back_path text,
  photo text
) language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admins only';
  end if;
  return query
    select u.id, u.name, u.email, u.phone, p.resort_ids, p.verification_status,
           v.submitted_at, v.reviewed_at, v.rejection_reason,
           v.cert_type, v.cert_doc_path, v.id_front_path, v.id_back_path, p.photo
      from public.instructor_profiles p
      join public.users u on u.id = p.user_id
      left join public.instructor_verification v on v.user_id = p.user_id
     where (p_status is null or p_status = '' or p.verification_status = p_status)
     order by coalesce(v.submitted_at, u.created_at) desc;
end;
$$;
grant execute on function admin_list_verifications(text) to authenticated;

------------------------------------------------------------
-- Admin platform configuration (extension to app_config)
-- Adds editable season window. VAT/commission already exist.
------------------------------------------------------------
alter table app_config add column if not exists season_start_month smallint not null default 12;
alter table app_config add column if not exists season_start_day   smallint not null default 1;
alter table app_config add column if not exists season_end_month   smallint not null default 4;
alter table app_config add column if not exists season_end_day     smallint not null default 15;

------------------------------------------------------------
-- Admin check helper. MUST be SECURITY DEFINER so it can read public.users
-- without being subject to RLS — otherwise an admin policy ON public.users
-- that references public.users causes 42P17 "infinite recursion detected
-- in policy".
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

------------------------------------------------------------
-- Admin RLS: read-all on user-scoped tables, write on resorts/config.
-- Each policy is additive ("OR admin") so it does not weaken existing
-- per-user policies for non-admin callers. All checks go through
-- public.is_admin() to avoid RLS recursion on the users table.
------------------------------------------------------------
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

------------------------------------------------------------
-- Phase 1: Test Mode (admin-toggleable, skips real payment)
------------------------------------------------------------
alter table app_config add column if not exists test_mode boolean not null default false;
alter table bookings   add column if not exists is_test_booking boolean not null default false;

create or replace function admin_set_test_mode(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.app_config set test_mode = p_on where id = 1;
end;
$$;
grant execute on function admin_set_test_mode(boolean) to authenticated;

-- create_booking is replaced again in supabase/migrations/2026_05_phase1_test_mode.sql
-- to (a) read test_mode and (b) include payment_status + is_test_booking in the
-- returned JSON so the client can skip /payment when test mode is on.
