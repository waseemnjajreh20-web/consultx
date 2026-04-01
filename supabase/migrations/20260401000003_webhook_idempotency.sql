-- ============================================================
-- Webhook Idempotency + Dead-Letter Logging
--
-- Two additive, zero-downtime changes:
--   1. Partial unique index on payment_transactions.tap_charge_id
--   2. webhook_dead_letters table for verified but unprocessable events
-- ============================================================

-- ── 1. Partial unique index on payment_transactions.tap_charge_id ─────────────
--
-- Enforces DB-level uniqueness once a charge ID is assigned.
-- Partial (WHERE NOT NULL) because process-subscription-renewal inserts a
-- transaction row with tap_charge_id = NULL before calling Tap, and fills it in
-- after the Tap API responds. Multiple null rows must be allowed during that
-- pre-charge window; uniqueness is only required once the ID is known.
--
-- Without this index, a bug could produce two rows with the same charge ID.
-- The webhook lookup uses .maybeSingle(), which silently errors when multiple
-- rows match — causing the event to fall through as "not found" with no
-- indication of the underlying duplicate. This index prevents that class of bug
-- at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_tap_charge_id_key
  ON public.payment_transactions (tap_charge_id)
  WHERE tap_charge_id IS NOT NULL;

COMMENT ON INDEX public.payment_transactions_tap_charge_id_key IS
  'Prevents duplicate transaction rows per Tap charge ID. '
  'Partial (WHERE NOT NULL) to allow the pre-charge null rows that '
  'process-subscription-renewal inserts before calling the Tap API.';

-- ── 2. webhook_dead_letters ───────────────────────────────────────────────────
--
-- Append-only log of verified Tap webhook events that could not be processed:
--   • transaction not found (race or unknown charge)
--   • DB lookup error (transient failure)
--   • subscription not found on CAPTURED path
--   • impossible or suspicious status transitions
--
-- IMPORTANT: only events that have already passed HMAC-SHA256 verification are
-- stored here. Unverified payloads (signature mismatch) are rejected at 401
-- and never reach this table.
--
-- No foreign keys — the point of dead-letter storage is to capture events that
-- could not be linked to existing rows. No RLS needed; access is service-role
-- only. No triggers. Minimal indexes (charge_id, reason) for admin queries.
CREATE TABLE IF NOT EXISTS public.webhook_dead_letters (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id  TEXT,          -- Tap charge ID from payload; NULL if payload was malformed
  tap_status TEXT,          -- Raw status field from Tap payload (e.g. "CAPTURED", "FAILED")
  reason     TEXT        NOT NULL, -- Machine-readable cause: see tap-webhook/index.ts constants
  payload    JSONB       NOT NULL, -- Full verified Tap payload — stored only after HMAC passes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_dead_letters IS
  'Verified Tap webhook events that could not be processed. '
  'All rows passed HMAC-SHA256 verification before insertion. '
  'Used for operational investigation and manual event replay.';

COMMENT ON COLUMN public.webhook_dead_letters.reason IS
  'Machine-readable cause. Known values: '
  'transaction_not_found | lookup_error | subscription_not_found | '
  'impossible_transition_failed_after_captured | '
  'suspicious_transition_captured_after_failed';

-- Indexes for the most common admin queries: by charge ID and by reason.
CREATE INDEX IF NOT EXISTS webhook_dead_letters_charge_id_idx
  ON public.webhook_dead_letters (charge_id)
  WHERE charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_dead_letters_reason_idx
  ON public.webhook_dead_letters (reason);

-- No RLS: accessed only by the Supabase service role from Edge Functions.
-- Do NOT enable RLS or add policies — authenticated users must not be able
-- to read or write dead-letter records via the public client.
