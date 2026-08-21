-- Phase 1 truth-layer remediation (docs/audits/phase1-truth-layer-remediation.md)
--
-- IMPORTANT: This file documents changes that were already applied directly to
-- production via the Supabase Management API (apply_a_migration), NOT via
-- `supabase db push`. Local migration history and production
-- `supabase_migrations.schema_migrations` are known to have diverged (43 local
-- vs 57+ in production, zero shared versions as of the Phase 1 audit) — see
-- docs/audits/truth-layer-baseline.md (T2). Do NOT run `supabase db push`
-- against this project; it would not reconcile that drift and could conflict
-- with schema created directly in production. This file exists purely so the
-- three changes below have a source-of-truth record, and is written to be
-- idempotent / safe to re-run.
--
-- 1) Storage bucket "ssss": close accidental public exposure.
--    Evidence: migration 20260119153131 comment says "Allow authenticated
--    users and service role to read", but the policy it created granted
--    SELECT to the `public` role (i.e. unauthenticated) — a mismatch between
--    stated intent and implementation. Zero frontend consumers of this
--    bucket's public URL were found in src/ (only two backend service-role
--    reads in fire-safety-chat and sbc-graph-indexer, which bypass RLS and
--    are unaffected by this change). Bucket also holds ConsultX's own
--    brain_full_v1 sidecars (proprietary reasoning data), not just SBC text.
--    Fix restores the originally-stated intent: authenticated-only read.
DROP POLICY IF EXISTS "Allow public read access to SBC bucket" ON storage.objects;
CREATE POLICY IF NOT EXISTS "Allow authenticated read access to SBC bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ssss');

UPDATE storage.buckets SET public = false WHERE id = 'ssss' AND public = true;

-- 2) Trial reconciliation: expire stale `user_subscriptions.status='trialing'`
--    rows whose trial_end has already passed. This mirrors the self-heal
--    branch that check-subscription/index.ts already performs per-user on
--    every live call (trialing + trial_end < now() -> expired); this is a
--    one-time bulk catch-up for users who never triggered that self-heal by
--    returning to the app. Does NOT touch profiles.plan_type: verified that
--    for every affected user, profiles already held the correct current
--    entitlement (either 'free', or a real paid plan_type such as
--    'engineer'/'enterprise' granted through a separate path) — only the
--    orphaned subscription row was stale.
UPDATE user_subscriptions
SET status = 'expired'
WHERE status = 'trialing'
  AND trial_end IS NOT NULL
  AND trial_end < now();

-- 3) Duplicate-subscription guard (partial, not a full UNIQUE(user_id)):
--    at most one "live" row (active/trialing/past_due) per user. Historical
--    expired/cancelled rows are intentionally NOT restricted, since
--    legitimate re-subscription history requires multiple rows over time.
--    KNOWN BLOCKER as of this migration: user_id 577e2326-acf2-4feb-b2e1-
--    3dca82ccd1f2 has TWO rows with status='active' (same plan_id, created
--    ~24ms apart) that were deliberately NOT modified here per the guardrail
--    "do not change paid status or billing history" — this requires manual
--    review against Moyasar's transaction/idempotency records before either
--    row can be safely superseded. This CREATE UNIQUE INDEX will fail again
--    until that review resolves the duplicate; that is intentional/expected.
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_live_row_per_user
ON user_subscriptions (user_id)
WHERE status IN ('active', 'trialing', 'past_due');
