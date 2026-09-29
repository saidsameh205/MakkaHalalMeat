-- ============================================================
-- Update to make Deals actually apply a discount at checkout.
-- Safe to run more than once. (Also included in supabase-schema.sql.)
-- ============================================================
alter table public.discounts add column if not exists discount_type text;      -- 'percent' or 'amount'
alter table public.discounts add column if not exists discount_value numeric(10,2);
alter table public.discounts add column if not exists image text default '';
alter table public.orders add column if not exists discount_code text;
alter table public.orders add column if not exists discount_amount numeric(10,2);
