-- ============================================================
-- Update for cancellation & refund requests — safe to run more than once.
-- (The same changes are also included in supabase-schema.sql.)
-- ============================================================
alter table public.orders add column if not exists placed_at timestamptz;
alter table public.orders add column if not exists cancel_request_status text;
alter table public.orders add column if not exists cancel_requested_at timestamptz;
alter table public.orders add column if not exists cancel_request_reason text;
alter table public.orders add column if not exists cancel_decided_at timestamptz;
alter table public.orders add column if not exists cancel_decision_note text;
alter table public.orders add column if not exists refund_request_status text;
alter table public.orders add column if not exists refund_requested_at timestamptz;
alter table public.orders add column if not exists refund_request_reason text;
alter table public.orders add column if not exists refund_decided_at timestamptz;
alter table public.orders add column if not exists refund_decision_note text;
alter table public.orders add column if not exists refund_approved_amount numeric(10,2);
alter table public.orders add column if not exists refunded_amount numeric(10,2);

grant all privileges on all tables in schema public to service_role;
