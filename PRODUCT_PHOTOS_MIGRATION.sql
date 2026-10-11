-- Run once in Supabase SQL Editor. Existing main photos and products are untouched.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
