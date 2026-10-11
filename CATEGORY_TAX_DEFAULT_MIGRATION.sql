-- Run AFTER TAXONOMY_MIGRATION.sql in Supabase SQL Editor.
-- Stores an optional category tax default. Existing products and their tax choices remain unchanged.
alter table public.store_taxonomy add column if not exists tax_is_food boolean;

create or replace function public.set_category_tax_default(p_id bigint, p_is_food boolean)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.store_taxonomy set tax_is_food=p_is_food
  where id=p_id and kind='category';
  if not found then raise exception 'Category not found'; end if;
end $$;
revoke all on function public.set_category_tax_default(bigint,boolean) from public,anon,authenticated;
grant execute on function public.set_category_tax_default(bigint,boolean) to service_role;
