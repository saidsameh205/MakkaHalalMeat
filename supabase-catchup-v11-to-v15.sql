-- ============================================================
-- CATCH-UP SCRIPT: everything from v11 through v15 in one shot.
-- Every line below is safe to run any number of times, in any
-- order, whether or not you've already run some of the smaller
-- update files from earlier — nothing here will error or
-- duplicate data. Run this once and you're fully caught up.
-- ============================================================

-- Deals: real discounts (percent/amount) + a photo per deal
alter table public.discounts add column if not exists discount_type text;
alter table public.discounts add column if not exists discount_value numeric(10,2);
alter table public.discounts add column if not exists image text default '';
alter table public.orders add column if not exists discount_code text;
alter table public.orders add column if not exists discount_amount numeric(10,2);

-- Products: "Featured today" slideshow pin + optional description
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists description text default '';

-- Sales tax: food (3%) vs non-food (8%)
alter table public.products add column if not exists is_food boolean not null default true;
-- ONE-TIME default, only meaningful the first time you run this: sets
-- household/beauty/baby/clothing items to non-food. If you've already
-- reviewed and adjusted individual items in admin.html since then, running
-- this again will reset those items back to non-food — skip this one
-- "update" line (everything else in this file is safe to re-run anytime).
update public.products set is_food = false where department in ('household','beauty','baby','clothing');

-- Live visitor tracking
create table if not exists public.visits (
  session_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.visits enable row level security;
grant all privileges on public.visits to service_role;

-- Customer accounts (email + password login) — optional, guest checkout unaffected
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
alter table public.customers add column if not exists favorites jsonb not null default '[]'::jsonb;

-- Re-grant, since new tables sometimes need this repeated
grant all privileges on all tables in schema public to service_role;
