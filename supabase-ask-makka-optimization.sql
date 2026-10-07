-- Ask Makka search optimization (safe/additive).
-- The current backend reads a compact active catalog (~408 rows), ranks it server-side,
-- and sends only the best matches to the AI. These indexes prepare the catalog for
-- future direct fuzzy-search queries as inventory grows.
create extension if not exists pg_trgm;
create index if not exists idx_products_active on public.products (active) where active = true;
create index if not exists idx_products_name_trgm on public.products using gin (lower(name) gin_trgm_ops) where active = true;
create index if not exists idx_products_category_trgm on public.products using gin (lower(category) gin_trgm_ops) where active = true;
create index if not exists idx_products_department_trgm on public.products using gin (lower(department) gin_trgm_ops) where active = true;
-- Description index is intentionally omitted: descriptions are larger and change more often.
-- Add it later only if query profiling shows it is needed.
