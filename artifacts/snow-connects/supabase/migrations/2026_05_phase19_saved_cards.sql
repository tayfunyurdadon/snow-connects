-- Phase 19 — Saved customer payment methods.
--
-- Customers can optionally save a card to their profile so future booking
-- requests skip the card-capture modal. Stub-token only (real Param.com
-- vault integration deferred). PAN is never stored — only the opaque
-- gateway token + last4 + holder + brand for display.
--
-- Idempotent. Apply via Supabase SQL editor.

alter table public.users
  add column if not exists saved_card_token   text,
  add column if not exists saved_card_last4   text,
  add column if not exists saved_card_holder  text,
  add column if not exists saved_card_brand   text,
  add column if not exists saved_card_added_at timestamptz;

-- Self-update policy already exists (users_self_update); the new
-- columns inherit it. We still expose RPCs so the client can save /
-- remove without leaking column names and so we can validate input
-- shape (last4 must be 4 digits, etc.).

create or replace function public.customer_save_card(
  p_token  text,
  p_last4  text,
  p_holder text,
  p_brand  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select role into v_role from public.users where id = v_uid;
  if v_role is distinct from 'customer' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'invalid_token';
  end if;
  if p_last4 is null or p_last4 !~ '^[0-9]{4}$' then
    raise exception 'invalid_last4';
  end if;
  if p_holder is null or length(trim(p_holder)) = 0 then
    raise exception 'invalid_holder';
  end if;

  update public.users
     set saved_card_token    = p_token,
         saved_card_last4    = p_last4,
         saved_card_holder   = trim(p_holder),
         saved_card_brand    = nullif(trim(coalesce(p_brand, '')), ''),
         saved_card_added_at = now()
   where id = v_uid;
end;
$$;

grant execute on function public.customer_save_card(text, text, text, text) to authenticated;

create or replace function public.customer_remove_card()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select role into v_role from public.users where id = v_uid;
  if v_role is distinct from 'customer' then
    raise exception 'forbidden_role' using errcode = '42501';
  end if;
  update public.users
     set saved_card_token    = null,
         saved_card_last4    = null,
         saved_card_holder   = null,
         saved_card_brand    = null,
         saved_card_added_at = null
   where id = v_uid;
end;
$$;

grant execute on function public.customer_remove_card() to authenticated;
