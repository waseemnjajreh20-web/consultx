-- ============================================================
-- Security fix: enable RLS on webhook_dead_letters
--
-- Root cause: the original migration (20260401000003_webhook_idempotency.sql)
-- omitted RLS under the comment "No RLS needed; access is service-role only."
-- This reasoning is incorrect. Without RLS enabled, Supabase PostgREST exposes
-- any public-schema table to anon and authenticated roles regardless of how
-- the application accesses it. The table appeared in Supabase security lint.
--
-- Correct pattern for service-role-only tables:
--   ENABLE ROW LEVEL SECURITY + zero policies
--   → service_role bypasses RLS entirely (unaffected)
--   → anon / authenticated see zero rows and cannot write (no permissive policy)
--
-- Both callers (tap-webhook, admin-stats Edge Functions) use the service role
-- key and are completely unaffected by this change.
-- ============================================================

ALTER TABLE public.webhook_dead_letters ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke grants from public-facing roles.
-- Belt-and-suspenders: RLS with no policies already blocks them,
-- but explicit revocation ensures PostgREST cannot reach this table
-- even if a misconfigured GRANT is added later.
REVOKE ALL ON public.webhook_dead_letters FROM anon, authenticated;
