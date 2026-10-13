-- Run once in Supabase SQL Editor BEFORE deploying updated functions.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'employee'
  CHECK (role IN ('employee','butcher'));
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS meat_ready_at timestamptz;

-- Assign an existing individual staff account to the butcher role:
-- UPDATE public.staff SET role = 'butcher' WHERE name_key = 'replace-with-butcher-name-key';
-- Never assign the shared STAFF_TOKEN to a butcher; it has general staff permissions.
-- Do not grant direct browser access to the service-role key.
