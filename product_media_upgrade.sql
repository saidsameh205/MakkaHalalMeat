-- Run once in Supabase SQL Editor
alter table public.products
  add column if not exists media jsonb not null default '[]'::jsonb;

-- Backfill the current single product image into the new gallery.
update public.products
set media = jsonb_build_array(jsonb_build_object('url', image, 'type', 'image', 'cover', true))
where coalesce(image, '') <> ''
  and (media is null or media = '[]'::jsonb);
