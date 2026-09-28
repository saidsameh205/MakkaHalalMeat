-- ============================================================
-- Update for personal staff PINs + the order activity log.
-- Safe to run more than once. (Also included in supabase-schema.sql.)
-- ============================================================
alter table public.orders add column if not exists events jsonb not null default '[]'::jsonb;

create table if not exists public.staff (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null,
  pin_hash text not null,
  active boolean not null default true,
  can_approve boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  sessions_valid_after timestamptz,
  created_at timestamptz not null default now()
);
alter table public.staff add column if not exists sessions_valid_after timestamptz;
create unique index if not exists idx_staff_name_key on public.staff (name_key);
alter table public.staff enable row level security;
grant all privileges on public.staff to service_role;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
