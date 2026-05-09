-- Phase 10: Per-school lesson pricing tiers.
-- Each school sets its own per-student / per-50-min price for groups of
-- 1, 2, 3, and 4+ students. The school's manual booking modal auto-fills
-- the total based on these tiers; the school admin can still override.

------------------------------------------------------------
-- 1. Schema: 4 price columns on ski_schools (kuruş, integer).
------------------------------------------------------------
alter table public.ski_schools
  add column if not exists price_1_kurus      integer not null default 0
    check (price_1_kurus >= 0),
  add column if not exists price_2_kurus      integer not null default 0
    check (price_2_kurus >= 0),
  add column if not exists price_3_kurus      integer not null default 0
    check (price_3_kurus >= 0),
  add column if not exists price_4plus_kurus  integer not null default 0
    check (price_4plus_kurus >= 0);

------------------------------------------------------------
-- 2. RPC for the Profil tab to update pricing in one call.
------------------------------------------------------------
create or replace function public.school_update_pricing(
  p_price_1      integer,
  p_price_2      integer,
  p_price_3      integer,
  p_price_4plus  integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(p_price_1, 0)     < 0 or
     coalesce(p_price_2, 0)     < 0 or
     coalesce(p_price_3, 0)     < 0 or
     coalesce(p_price_4plus, 0) < 0 then
    raise exception 'price cannot be negative';
  end if;
  update public.ski_schools
     set price_1_kurus     = coalesce(p_price_1, 0),
         price_2_kurus     = coalesce(p_price_2, 0),
         price_3_kurus     = coalesce(p_price_3, 0),
         price_4plus_kurus = coalesce(p_price_4plus, 0)
   where admin_user_id = auth.uid();
  if not found then raise exception 'not a school admin'; end if;
end;
$$;

grant execute on function public.school_update_pricing(integer, integer, integer, integer)
  to authenticated;
