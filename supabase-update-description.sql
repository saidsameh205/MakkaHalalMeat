-- ============================================================
-- Adds an optional product description shown on the customer's
-- item page. Safe to run more than once. (Also included in
-- supabase-schema.sql.)
-- ============================================================
alter table public.products add column if not exists description text default '';
