-- Run once in Supabase SQL Editor before deploying the new Netlify functions.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'employee';
UPDATE public.staff SET role='employee' WHERE role IS NULL OR role NOT IN ('employee','butcher');
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE public.staff ADD CONSTRAINT staff_role_check CHECK (role IN ('employee','butcher'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meat_ready_at timestamptz;
UPDATE public.staff SET can_approve=false WHERE role='butcher';
