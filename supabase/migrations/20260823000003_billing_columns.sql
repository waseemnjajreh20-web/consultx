-- ConsultX billing 2026-08-23 — amount split + card verification stamp
-- Source: docs/launch/billing-contract-20260823.md, Section 8.
-- Idempotent. Safe to re-run (all statements are IF NOT EXISTS / COMMENT ON,
-- both of which are no-ops when already applied).
-- OWNER applies this in the Supabase SQL Editor (never via `supabase db push`
-- — this repo has known migration drift against production).
-- Verified against src/integrations/supabase/types.ts on 2026-08-23: all
-- three columns below are currently MISSING from production.
--
-- NOTE: `amount_vat` is the exact column name from the billing contract.
-- This is a database identifier, not user-facing copy, so it is kept as-is.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS card_verified_at timestamptz;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS amount_base integer;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS amount_vat integer;

COMMENT ON COLUMN public.user_subscriptions.card_verified_at IS
  'Timestamp of the successful 1.00 SAR card-verification charge. Presence means the 100-halala credit is owed against the first real invoice.';
COMMENT ON COLUMN public.payment_transactions.amount_base IS
  'Tax-exclusive base in halalas. The seller is NOT VAT-registered, so base = amount and no tax is charged. Becomes round(amount / 1.15) only if/when the seller registers for VAT.';
COMMENT ON COLUMN public.payment_transactions.amount_vat IS
  'Tax component in halalas. Always 0 while the seller is not VAT-registered.';
