-- ============================================================
-- Splits sales tax into food (3%) and non-food (8%) rates.
-- Safe to run more than once. (Also included in supabase-schema.sql.)
-- ============================================================
alter table public.products add column if not exists is_food boolean not null default true;

-- One-time default: household/beauty/baby/clothing start as non-food (8%);
-- meat/grocery stay food (3%). Review and adjust per item afterward in
-- admin.html — a "grocery" item like paper towels or foil is really
-- non-food, and a "baby" item like formula or baby food is really food.
update public.products set is_food = false where department in ('household','beauty','baby','clothing');
