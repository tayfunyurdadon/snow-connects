-- Phase 5 — Reviews & ratings
--
-- Adds a `lesson_reviews` table (one row per completed booking),
-- aggregates the per-instructor rating + review count, and exposes
-- a `submit_review` RPC that customers call after their lesson is
-- marked completed. Idempotent — safe to re-run.

------------------------------------------------------------
-- Table
------------------------------------------------------------
create table if not exists lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  customer_id uuid not null references users(id) on delete cascade,
  instructor_id uuid not null references users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists lesson_reviews_instructor_idx
  on lesson_reviews(instructor_id);
create index if not exists lesson_reviews_customer_idx
  on lesson_reviews(customer_id);

alter table instructor_profiles
  add column if not exists review_count integer not null default 0;

------------------------------------------------------------
-- RLS
------------------------------------------------------------
alter table lesson_reviews enable row level security;

drop policy if exists reviews_public_read on lesson_reviews;
create policy reviews_public_read on lesson_reviews
  for select using (true);

-- Writes go exclusively through submit_review() (security definer);
-- block direct table writes from clients.
drop policy if exists reviews_no_direct_insert on lesson_reviews;
drop policy if exists reviews_no_direct_update on lesson_reviews;
drop policy if exists reviews_no_direct_delete on lesson_reviews;

------------------------------------------------------------
-- Aggregate refresh
------------------------------------------------------------
create or replace function recompute_instructor_rating(p_instructor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric(3,2);
  v_cnt integer;
begin
  select coalesce(round(avg(rating)::numeric, 2), 5.00),
         count(*)
    into v_avg, v_cnt
    from lesson_reviews
   where instructor_id = p_instructor;

  update instructor_profiles
     set rating = v_avg,
         review_count = v_cnt
   where user_id = p_instructor;
end;
$$;

create or replace function trg_lesson_reviews_recompute()
returns trigger
language plpgsql
as $$
begin
  perform recompute_instructor_rating(coalesce(new.instructor_id, old.instructor_id));
  return null;
end;
$$;

drop trigger if exists lesson_reviews_recompute on lesson_reviews;
create trigger lesson_reviews_recompute
  after insert or update or delete on lesson_reviews
  for each row execute function trg_lesson_reviews_recompute();

------------------------------------------------------------
-- RPC: submit_review
--
-- Caller must be the customer on the booking, the lesson must be
-- completed, and there must be no existing review for that booking.
-- Comment is optional (default empty); rating is required 1..5.
------------------------------------------------------------
create or replace function submit_review(
  p_booking uuid,
  p_rating smallint,
  p_comment text default ''
)
returns lesson_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking bookings%rowtype;
  v_review lesson_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_booking from bookings where id = p_booking;
  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if v_booking.customer_id <> v_uid then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_booking.lesson_status <> 'completed' then
    raise exception 'lesson not completed yet' using errcode = '22023';
  end if;

  insert into lesson_reviews(booking_id, customer_id, instructor_id, rating, comment)
  values (p_booking, v_uid, v_booking.instructor_id, p_rating, coalesce(p_comment, ''))
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function submit_review(uuid, smallint, text) from public;
grant execute on function submit_review(uuid, smallint, text) to authenticated;

-- Backfill aggregates for any pre-existing reviews (no-op on first run).
do $$
declare
  r record;
begin
  for r in select distinct instructor_id from lesson_reviews loop
    perform recompute_instructor_rating(r.instructor_id);
  end loop;
end$$;
