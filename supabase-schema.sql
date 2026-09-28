-- ============================================================
-- Makka Halal Meat — Supabase schema
-- Run this FIRST in the Supabase SQL editor, then run seed_products.sql.
-- ============================================================

-- ---------- PRODUCTS ----------
-- This table is what makes pricing, names and images editable from the
-- admin panel with no new code deploy. The storefront reads it directly
-- (public, read-only). Only the admin-products function (using the
-- service-role key, never exposed to browsers) can write to it.
create table if not exists public.products (
  id bigint primary key,
  name text not null,
  department text not null,        -- meat | grocery | household | beauty | baby | clothing
  category text not null,          -- e.g. "Beef", "Pantry"
  subcategory text default '',
  price numeric(10,2),             -- null = "market price" / call for price
  unit text default 'each',        -- '/ lb', 'each', etc.
  image text default '',           -- path under /product-images, or a full https URL
  emoji text default '',           -- fallback glyph shown when there's no image
  brand text default '',
  active boolean not null default true,
  sort_order int not null default 0,
  stock numeric(10,2),             -- null = unlimited stock; otherwise auto-decreases as orders are placed (can be fractional for by-the-pound items)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_department on public.products (department, active);

-- Adds the stock column even if this table already existed from an earlier
-- run of this file (CREATE TABLE IF NOT EXISTS alone wouldn't add it).
alter table public.products add column if not exists stock numeric(10,2);
-- If stock was created earlier as a whole number, allow fractional pounds:
alter table public.products alter column stock type numeric(10,2);

-- ---------- APP SETTINGS ----------
-- Single-row config table for site-wide, remotely-editable content:
-- hero text, store hours/address, deal of the day, department order, etc.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values (
  'ui_config',
  '{
    "home_title": "Makka Halal Meat",
    "home_subtitle": "Fresh halal meat, groceries & more — order ahead for pickup.",
    "store_phone": "404-297-0008",
    "store_address": "431 N Indian Creek Dr, Clarkston, GA 30021",
    "store_hours": "Tuesday–Sunday 11:00 AM–6:30 PM (meat counter closes at 6:00 PM) · Closed Monday",
    "store_shopping": "In-store & online",
    "store_order_options": "Store pickup",
    "deal_title": "Deal of the Day",
    "deal_text": "",
    "deal_price_label": "",
    "deal_image": "hero-banner.png",
    "department_order": ["meat","grocery","household","beauty","baby","clothing"],
    "hidden_departments": []
  }'::jsonb
) on conflict (key) do nothing;

-- ---------- DISCOUNTS ----------
-- Customer-facing promotions shown on the Deals tab. Expired discounts
-- (expires_at in the past) are hidden on the storefront automatically —
-- no need to remember to deactivate them.
create table if not exists public.discounts (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  requirements text default '',   -- e.g. "Minimum $30 purchase", "Lamb & goat cuts only"
  code text default '',           -- optional promo code customers mention at pickup
  expires_at timestamptz,         -- null = no expiration
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- ORDERS ----------
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  order_code text not null,
  customer_name text default '',
  customer_phone text default '',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2),
  tax numeric(10,2),
  total numeric(10,2),
  stripe_session_id text,
  status text not null default 'New',   -- Awaiting Payment | New | Preparing | Ready for Pickup | Completed | Cancelled | Abandoned
  notes text default '',
  pickup_time timestamptz,          -- staff-confirmed pickup time
  staff_notes text default '',      -- internal notes staff add, not shown to the customer
  requested_pickup timestamptz,     -- pickup time the customer asked for (null = as soon as possible)
  substitution_pref text default 'call',   -- what the customer wants if an item is out: substitute | call | skip
  adjusted_subtotal numeric(10,2),  -- recalculated by GIF as items are picked / substituted / marked unavailable
  adjusted_total numeric(10,2),     -- adjusted_subtotal plus tax: the amount to capture after picking
  payment_status text,              -- unpaid | authorized | captured | cancelled | refunded | partially_refunded
  placed_at timestamptz,            -- when payment was confirmed; the customer's cancellation window starts here
  cancel_request_status text,       -- customer asked to cancel: pending | approved | denied
  cancel_requested_at timestamptz,
  cancel_request_reason text,
  cancel_decided_at timestamptz,
  cancel_decision_note text,        -- optional message from the store to the customer
  refund_request_status text,       -- customer asked for a refund after pickup: pending | approved | denied
  refund_requested_at timestamptz,
  refund_request_reason text,
  refund_decided_at timestamptz,
  refund_decision_note text,
  refund_approved_amount numeric(10,2),
  refunded_amount numeric(10,2),
  events jsonb not null default '[]'::jsonb,   -- activity log: who did what, and when
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on public.orders (status, created_at desc);
create index if not exists idx_orders_session on public.orders (stripe_session_id);
create index if not exists idx_orders_code on public.orders (order_code);

-- Adds these columns even if the orders table already existed from an
-- earlier run of this file.
alter table public.orders add column if not exists pickup_time timestamptz;
alter table public.orders add column if not exists staff_notes text default '';
alter table public.orders add column if not exists requested_pickup timestamptz;
alter table public.orders add column if not exists substitution_pref text default 'call';
alter table public.orders add column if not exists adjusted_subtotal numeric(10,2);
alter table public.orders add column if not exists adjusted_total numeric(10,2);
alter table public.orders add column if not exists payment_status text;
alter table public.orders add column if not exists placed_at timestamptz;
alter table public.orders add column if not exists cancel_request_status text;
alter table public.orders add column if not exists cancel_requested_at timestamptz;
alter table public.orders add column if not exists cancel_request_reason text;
alter table public.orders add column if not exists cancel_decided_at timestamptz;
alter table public.orders add column if not exists cancel_decision_note text;
alter table public.orders add column if not exists refund_request_status text;
alter table public.orders add column if not exists refund_requested_at timestamptz;
alter table public.orders add column if not exists refund_request_reason text;
alter table public.orders add column if not exists refund_decided_at timestamptz;
alter table public.orders add column if not exists refund_decision_note text;
alter table public.orders add column if not exists refund_approved_amount numeric(10,2);
alter table public.orders add column if not exists refunded_amount numeric(10,2);
alter table public.orders add column if not exists events jsonb not null default '[]'::jsonb;

-- ---------- TEAM (personal PINs for the GIF staff app) ----------
-- One row per associate. PINs are stored only as a salted hash, so nobody can
-- read them back — the admin can only reset one. Nothing here is readable by
-- the public storefront key.
create table if not exists public.staff (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null,                       -- lower-case name, used to find them at sign-in
  pin_hash text not null,
  active boolean not null default true,         -- turn off to lock someone out instantly
  can_approve boolean not null default false,   -- may approve/deny cancellations & refunds in GIF
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  sessions_valid_after timestamptz,             -- sessions issued before this are refused (set when someone is switched off or their PIN is reset)
  created_at timestamptz not null default now()
);
alter table public.staff add column if not exists sessions_valid_after timestamptz;
create unique index if not exists idx_staff_name_key on public.staff (name_key);
alter table public.staff enable row level security;   -- no policies: only the server can touch it
grant all privileges on public.staff to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------- PRODUCT PHOTO STORAGE ----------
-- A public bucket so admin.html can upload real photos instead of typing
-- image links. Uploads go through the admin-upload-photo function using
-- the service-role key; anyone can VIEW an uploaded photo (that's the
-- point — it needs to show on the public storefront), but only that
-- function can add one.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "public can view product photos" on storage.objects;
create policy "public can view product photos"
  on storage.objects for select
  using (bucket_id = 'product-photos');

-- ============================================================
-- ROW LEVEL SECURITY
-- The browser only ever holds the Supabase ANON key. RLS below makes sure
-- that key can only read products/settings — it can never write anything,
-- and it can never read the orders table (which contains customer info).
-- All writes go through Netlify functions using the service-role key,
-- which is never sent to the browser.
-- ============================================================
alter table public.products enable row level security;
alter table public.app_settings enable row level security;
alter table public.discounts enable row level security;
alter table public.orders enable row level security;

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
  on public.products for select
  using (active = true);

drop policy if exists "public can read settings" on public.app_settings;
create policy "public can read settings"
  on public.app_settings for select
  using (true);

drop policy if exists "public can read active discounts" on public.discounts;
create policy "public can read active discounts"
  on public.discounts for select
  using (active = true);

-- ============================================================
-- GRANTS
-- RLS above controls which ROWS a role can see, but Postgres also
-- requires a baseline table-level GRANT before a role can query a table
-- at all. Some Supabase projects grant this automatically for
-- dashboard-created tables but not for tables created via the SQL
-- editor, so we set it explicitly here rather than assume it exists.
-- orders is deliberately left ungranted for anon/authenticated — only
-- the service-role key (used by Netlify functions) can read or write it.
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select on public.discounts to anon, authenticated;

-- service_role is used by every Netlify function (checkout, admin panel,
-- order management). It's meant to bypass RLS entirely, but this project's
-- default privileges were never set up for it either — same root cause as
-- the anon grants above — so it needs the same explicit treatment.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Given this project's default privileges were missing for the public
-- schema too, grant storage access explicitly as well — needed for
-- admin-upload-photo to actually save uploaded files.
grant usage on schema storage to service_role, anon, authenticated;
grant all privileges on storage.objects to service_role;
grant select on storage.objects to anon, authenticated;
grant all privileges on storage.buckets to service_role;
grant select on storage.buckets to anon, authenticated;

-- No policy is created granting the anon key access to orders, so the
-- default (no access) applies: the storefront cannot read anyone's orders.
-- The admin-orders function bypasses RLS with the service-role key instead.

-- Example discount — edit or delete this from admin.html → Deals whenever you like.
insert into public.discounts (title, description, requirements, expires_at, active)
select
  'New customer welcome',
  '$5 off your first online pickup order.',
  'Minimum $25 purchase · First-time customers only',
  (now() + interval '30 days'),
  true
where not exists (select 1 from public.discounts where title = 'New customer welcome');

-- ============================================================
-- SECURITY NOTE
-- If you ever see your SUPABASE_SERVICE_ROLE_KEY appear in a browser
-- console, a client-side file, or a chat log, rotate it immediately from
-- Supabase → Project Settings → API → "Reset service_role secret", then
-- update the SUPABASE_SERVICE_ROLE_KEY environment variable in Netlify.
-- The service-role key bypasses every RLS policy above, so it must only
-- ever live in a server-side environment variable.
-- ============================================================
