-- ============================================================
-- Adds simple, cookieless visitor tracking for the admin's
-- live-visitor count. Safe to run more than once. (Also
-- included in supabase-schema.sql.)
-- ============================================================
create table if not exists public.visits (
  session_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.visits enable row level security;
grant all privileges on public.visits to service_role;
