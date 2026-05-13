-- Phase 4: enable Supabase Realtime broadcasts on the bookings table
-- so customers (and instructors) see live status updates without
-- manually pulling-to-refresh. RLS still restricts which rows each
-- client receives.
--
-- Idempotent: safe to run repeatedly.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table bookings;
  end if;
end$$;

-- Realtime needs full row data on UPDATE to compute the change set.
alter table bookings replica identity full;
