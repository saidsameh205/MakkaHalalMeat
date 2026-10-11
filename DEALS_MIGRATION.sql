-- Run in Supabase SQL Editor; safe to rerun.
alter table public.discounts add column if not exists min_order numeric(10,2);
create table if not exists public.category_discounts (
 id bigint generated always as identity primary key,
 department text, category text,
 percent_off numeric(5,2) not null check(percent_off > 0 and percent_off <= 100),
 label text, expires_at timestamptz, active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.category_discounts add column if not exists image text default '';
alter table public.category_discounts enable row level security;
drop policy if exists "public can read active category discounts" on public.category_discounts;
create policy "public can read active category discounts" on public.category_discounts for select to anon,authenticated using(active=true and (expires_at is null or expires_at>now()));
grant select on public.category_discounts to anon,authenticated;
grant all privileges on public.category_discounts to service_role;
grant usage,select on all sequences in schema public to service_role;
notify pgrst,'reload schema';
