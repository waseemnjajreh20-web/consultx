-- ConsultX -- A7: restore the missing public.decrement_daily_usage RPC
-- Date: 2026-08-23
-- Branch: recovery/stabilization-2026-08-23
-- Idempotent. Safe to re-run. The OWNER applies this by hand (never `supabase db push`).
--
-- WHAT IS BROKEN
-- --------------
-- supabase/functions/fire-safety-chat/geminiResilience.ts:295 calls
--     adminClient.rpc("decrement_daily_usage", { p_user_id: userId })
-- to give a daily-quota unit back when the Gemini call fails. That function does
-- not exist: there is no CREATE for it anywhere in supabase/migrations/, and it
-- is absent from pg_proc in production (verified read-only, 2026-08-23).
-- PostgREST therefore errors, the catch at geminiResilience.ts:298 swallows the
-- error and logs "[Quota] Rollback failed", and execution continues as if the
-- rollback had happened.
--
-- CUSTOMER IMPACT
-- ---------------
-- The mode-scoped rollback (public.decrement_mode_daily_count) DOES exist, so
-- Advisory (`standard`) and Analytical (`analysis`) correctly return the unit.
-- The FLAT daily counter -- the one used by the Main (`primary`) mode and by
-- trialing users -- never rolls back. Every transient upstream failure silently
-- costs the user one message out of their daily allowance for an answer they
-- never received. It is a quiet failure: nothing surfaces to the user, and the
-- unit test at src/__tests__/geminiResilience.test.ts:252 asserts only that the
-- RPC is CALLED (against a mock), so it stays green while production does not.
--
-- WHY THIS IS A MIGRATION AND NOT A CODE CHANGE
-- ---------------------------------------------
-- The call site is already correct and already expresses the intended contract.
-- The only missing piece is the function it names. Creating it restores the
-- behaviour that the code, the test and the product all already assume. No edge
-- function is modified by this fix.
--
-- SHAPE -- mirrors the two functions it sits between
-- -------------------------------------------------
--   public.increment_daily_usage(uuid)
--     20260309102133_3a7de3d1-97ae-4724-a6b0-ba6d45f1443c.sql lines 30-45
--   public.decrement_mode_daily_count(uuid, text)
--     20260404000001_restore_mode_rpcs.sql lines 36-47
-- Target table: public.daily_message_usage (user_id, usage_date, message_count,
-- updated_at), UNIQUE (user_id, usage_date).
--
-- Two deliberate properties:
--   * GREATEST(0, message_count - 1) -- a double rollback is harmless and the
--     counter can never go negative. A negative counter would hand the user free
--     quota for the rest of the day.
--   * NO insert-if-absent. A rollback with no row to decrement means nothing was
--     ever incremented, so a no-op is the correct outcome; inserting a row there
--     would fabricate usage history that never happened.
--
-- NOTE ON search_path: `SET search_path = public, pg_temp`. R4-LOW-10 aligned
-- this with 20260823000004_job_locks.sql. Pinning pg_temp explicitly is the
-- hardening that matters on a SECURITY DEFINER function: without it a caller
-- who can create temp objects could shadow a referenced name. Equivalent in
-- meaning to the `SET search_path TO '...'` form Supabase introspection renders.

BEGIN;

CREATE OR REPLACE FUNCTION public.decrement_daily_usage(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
  UPDATE public.daily_message_usage
  SET message_count = GREATEST(0, message_count - 1),
      updated_at    = now()
  WHERE user_id    = p_user_id
    AND usage_date = CURRENT_DATE;
$func$;

COMMENT ON FUNCTION public.decrement_daily_usage(uuid) IS
  'Rolls back ONE unit of the flat daily message counter in public.daily_message_usage for today. Called by fire-safety-chat/geminiResilience.ts rollbackQuotaIfNeeded() when an AI provider call fails after the quota was already incremented, so the user is not charged a message they never received. Counterpart of public.increment_daily_usage. Clamped at 0 and a no-op when no row exists for today. service_role only.';

-- Supabase ships ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated, service_role, so a function created in
-- `public` is born holding an anon grant. REVOKE ... FROM PUBLIC does NOT remove
-- an explicit role grant, so anon and authenticated must be revoked by name.
-- This is a SECURITY DEFINER function that writes a quota table: if a client
-- role could execute it, any authenticated user could decrement their own
-- counter in a loop and grant themselves unlimited daily messages. Only the
-- service role (the edge functions) may call it.
REVOKE ALL    ON FUNCTION public.decrement_daily_usage(uuid) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.decrement_daily_usage(uuid) FROM anon;
REVOKE ALL    ON FUNCTION public.decrement_daily_usage(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_daily_usage(uuid) TO service_role;

COMMIT;

-- OPERATOR STEP -- REQUIRED, NOT OPTIONAL.
-- PostgREST caches the schema. Until its cache is reloaded it keeps returning
-- 404 / PGRST202 for this brand-new RPC, which looks exactly like the bug this
-- migration fixes. After applying the file, run:
--
--     NOTIFY pgrst, 'reload schema';
--
-- Then confirm from the Supabase SQL editor that the function exists and that
-- its ACL shows service_role only:
--
--     SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.proacl
--       FROM pg_proc p
--       JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'decrement_daily_usage';
