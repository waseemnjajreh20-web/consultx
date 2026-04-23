-- ============================================================
-- Moyasar billing columns
--
-- Adds the three columns the Moyasar billing pipeline writes to
-- and reads from. Without these, every payment webhook callback
-- and every renewal charge attempt fails with a column-not-found
-- error from PostgREST.
--
-- moyasar-webhook (v11) writes:
--   user_subscriptions.moyasar_card_token  — stored card token for MIT
--   user_subscriptions.moyasar_payment_id  — last payment ID for the sub
--   payment_transactions.moyasar_payment_id — payment ID for idempotency
--
-- process-subscription-renewal (v11) reads:
--   user_subscriptions.moyasar_card_token  — passed as token source
-- and inserts:
--   payment_transactions.moyasar_payment_id — pre-charge idempotency anchor
-- ============================================================

-- ── user_subscriptions ───────────────────────────────────────

-- Stored Moyasar card token (from payload.source.token on paid event).
-- Used by process-subscription-renewal for MIT (Merchant Initiated) charges.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS moyasar_card_token TEXT;

-- Moyasar payment ID of the most recent payment for this subscription.
-- Written by moyasar-webhook on paid events.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS moyasar_payment_id TEXT;

-- ── payment_transactions ─────────────────────────────────────

-- Moyasar payment ID — canonical reference for idempotency lookups.
-- Replaces tap_charge_id for all new Moyasar transactions.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS moyasar_payment_id TEXT;

-- Partial unique index: enforces one transaction row per Moyasar payment.
-- Mirrors the existing payment_transactions_tap_charge_id_key pattern.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_moyasar_payment_id_key
  ON public.payment_transactions (moyasar_payment_id)
  WHERE moyasar_payment_id IS NOT NULL;