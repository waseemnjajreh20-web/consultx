-- ============================================================
-- Billing Lifecycle Columns
-- Adds the minimum required fields for recurring billing
-- groundwork. The renewal function and scheduler are NOT
-- built yet; this migration only prepares the schema.
-- ============================================================

-- ── user_subscriptions ───────────────────────────────────────

-- Soft-cancel flag: access continues until current_period_end,
-- then stops. Set to true when user requests cancellation but
-- wants to keep access until the paid period ends.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

-- Timestamp of when cancellation was requested.
-- NULL means not cancelled.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ NULL;

-- When the next renewal charge should be attempted.
-- Set to current_period_end on every activation/renewal.
-- The renewal job queries this column as its trigger anchor.
-- NULL for trialing subscriptions with no paid period yet.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ NULL;

-- Filled when a renewal charge fails; cleared on successful renewal.
-- Used by the renewal job for grace-period and retry decisions.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ NULL;

-- ── payment_transactions ──────────────────────────────────────

-- Tracks when a transaction record was last modified (status
-- change, failure info write, retry increment, etc.).
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Tap's machine-readable error code on failed charges
-- (e.g. "INSUFFICIENT_FUNDS", "INVALID_CARD").
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS failure_code TEXT NULL;

-- Human-readable failure description for support/display.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS failure_message TEXT NULL;

-- Number of renewal retry attempts for this transaction.
-- Incremented by the renewal job on each retry.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- ── Trigger: auto-maintain payment_transactions.updated_at ───

-- update_updated_at_column() is defined in migration
-- 20260210180359 and is already used by user_subscriptions and
-- profiles. Reuse it here for consistency.
CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Backfill: set next_billing_date for active subscriptions ──

-- Active subscriptions that already have a current_period_end
-- get next_billing_date = current_period_end so the renewal job
-- can pick them up immediately when it is deployed.
-- Trialing, expired, and cancelled rows are intentionally left
-- NULL — they are not eligible for automatic renewal.
UPDATE public.user_subscriptions
  SET next_billing_date = current_period_end
  WHERE status = 'active'
    AND current_period_end IS NOT NULL
    AND next_billing_date IS NULL;
