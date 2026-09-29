-- ============================================================
-- Fixes the deal-editing error, adds deal photos, and adds a
-- "Featured" flag products can be pinned to the home slideshow with.
-- Safe to run more than once. (Also included in supabase-schema.sql.)
-- ============================================================
alter table public.discounts add column if not exists image text default '';
alter table public.products add column if not exists featured boolean not null default false;
