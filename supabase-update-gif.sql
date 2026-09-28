-- ============================================================
-- Quick update for the GIF staff app — safe to run more than once.
-- (Same changes are also included in supabase-schema.sql.)
-- ============================================================

-- Stock can now be fractional (by-the-pound items).
alter table public.products alter column stock type numeric(10,2);

-- New order fields used by checkout, GIF and admin.html.
alter table public.orders add column if not exists requested_pickup timestamptz;
alter table public.orders add column if not exists substitution_pref text default 'call';
alter table public.orders add column if not exists adjusted_subtotal numeric(10,2);
alter table public.orders add column if not exists adjusted_total numeric(10,2);
alter table public.orders add column if not exists payment_status text;

-- Make sure the Netlify functions can use the new columns.
grant all privileges on all tables in schema public to service_role;
