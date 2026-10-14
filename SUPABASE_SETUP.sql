-- Run once in Supabase SQL Editor BEFORE deploying the new functions.
create table if not exists public.makka_pickup_settings (id int primary key default 1 check(id=1), orders_per_hour int not null default 5 check(orders_per_hour between 1 and 100), slot_minutes int not null default 60 check(slot_minutes in (30,60)), updated_at timestamptz not null default now());
insert into public.makka_pickup_settings(id) values (1) on conflict(id) do nothing;
create table if not exists public.makka_pickup_reservations (order_code text primary key, slot_start timestamptz not null, status text not null default 'reserved' check(status in ('reserved','confirmed','released')), expires_at timestamptz not null default(now()+interval '45 minutes'), created_at timestamptz not null default now());
create index if not exists makka_pickup_active_idx on public.makka_pickup_reservations(slot_start,status,expires_at);
create table if not exists public.makka_marketing_preferences(customer_id text primary key, email text not null, opted_in boolean not null default false, consented_at timestamptz, updated_at timestamptz not null default now());
alter table public.makka_pickup_settings enable row level security;
alter table public.makka_pickup_reservations enable row level security;
alter table public.makka_marketing_preferences enable row level security;
revoke all on public.makka_pickup_settings,public.makka_pickup_reservations,public.makka_marketing_preferences from anon,authenticated;
-- Server-only atomic booking, serialized across all checkout requests.
create or replace function public.makka_reserve_pickup(p_code text,p_start timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare lim int; slot int; already int; local_dt timestamp; hour_start timestamptz;
begin
  perform pg_advisory_xact_lock(7845221); -- one global scheduling lock; low traffic store
  select orders_per_hour,slot_minutes into lim,slot from public.makka_pickup_settings where id=1;
  if lim is null or p_code is null or length(p_code)>100 then return false; end if;
  local_dt := p_start at time zone 'America/New_York';
  if extract(isodow from local_dt)=1 or extract(hour from local_dt)<11 or extract(hour from local_dt)>17 or extract(minute from local_dt) <> 0 and (slot<>30 or extract(minute from local_dt)<>30) then return false; end if;
  if (extract(hour from local_dt)=17 and extract(minute from local_dt)=30) then return false; end if;
  if p_start < now()+interval '20 minutes' or p_start > now()+interval '8 days' then return false; end if;
  hour_start := date_trunc('hour',local_dt) at time zone 'America/New_York';
  select count(*) into already from public.makka_pickup_reservations where slot_start>=hour_start and slot_start<hour_start+interval '1 hour' and (status='confirmed' or (status='reserved' and expires_at>now()));
  if already>=lim then return false; end if;
  if slot=30 then
    select count(*) into already from public.makka_pickup_reservations where slot_start=p_start and (status='confirmed' or (status='reserved' and expires_at>now()));
    if already>=ceil(lim/2.0) then return false; end if;
  end if;
  insert into public.makka_pickup_reservations(order_code,slot_start) values (p_code,p_start);
  return true;
end $$;
revoke execute on function public.makka_reserve_pickup(text,timestamptz) from public,anon,authenticated;
-- These RPCs are called only with the Netlify service-role key.
create or replace function public.makka_pickup_release(p_code text)
returns void language sql security definer set search_path=public as $$ update public.makka_pickup_reservations set status='released' where order_code=p_code and status<>'released'; $$;
create or replace function public.makka_pickup_confirm(p_code text)
returns void language sql security definer set search_path=public as $$ update public.makka_pickup_reservations set status='confirmed' where order_code=p_code and status='reserved'; $$;
revoke execute on function public.makka_pickup_release(text),public.makka_pickup_confirm(text) from public,anon,authenticated;
-- Explicit permissions for the service-role-backed Netlify Functions.
grant select,insert,update,delete on public.makka_pickup_settings,public.makka_pickup_reservations,public.makka_marketing_preferences to service_role;
grant execute on function public.makka_reserve_pickup(text,timestamptz),public.makka_pickup_release(text),public.makka_pickup_confirm(text) to service_role;
