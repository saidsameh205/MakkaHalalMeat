-- ============================================================
-- Adds optional customer accounts (email + password login).
-- Guest checkout keeps working exactly as before — accounts
-- are never required to order.
-- Safe to run more than once. (Also included in supabase-schema.sql.)
-- ============================================================
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  email text not null,
  email_key text not null,
  password_hash text not null,
  name text default '',
  phone text default '',
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  reset_token_hash text,
  reset_token_expires timestamptz,
  sessions_valid_after timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_customers_email_key on public.customers (email_key);
alter table public.customers enable row level security;
grant all privileges on public.customers to service_role;

alter table public.orders add column if not exists customer_id bigint references public.customers(id);
