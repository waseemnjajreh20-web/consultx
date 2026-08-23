-- ConsultX 2026-08-23 — job_locks: a TTL lease for single-flight cron jobs (H5)
--
-- WHY THIS EXISTS
--   `process-subscription-renewal` charges stored cards. Two overlapping
--   invocations -- the hourly pg_cron tick plus a manual invocation, or a slow
--   run overlapping the next tick -- can BOTH pass the per-subscription
--   idempotency checks in the window between the SELECT and the INSERT of the
--   `payment_transactions` anchor row, and both then charge the same card.
--
-- WHY NOT pg_try_advisory_lock
--   PostgREST only exposes functions in the `public` schema, so the edge
--   function cannot call `pg_try_advisory_lock` directly. Wrapping it in a
--   public function would not help either: PostgREST serves requests from a
--   CONNECTION POOL, so a SESSION-scoped advisory lock taken in one HTTP
--   round-trip is not reliably held for the next one, and it leaks onto a
--   pooled connection when the holder crashes.
--   A TTL lease has neither problem: it lives in a table, every connection sees
--   it, and a crashed holder's lease simply expires.
--
-- IDEMPOTENT. Safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, COMMENT ON, and REVOKE / GRANT are all no-ops when already applied.
--
-- OWNER APPLIES THIS BY HAND in the Supabase SQL Editor.
-- NEVER `supabase db push` (this repo has known migration drift).
-- Until it is applied, `process-subscription-renewal` logs a loud error naming
-- this file and runs WITHOUT the lease (fail soft). A bricked renewal job would
-- mean no trial ever converts and no subscription ever renews, which is worse
-- than the race the lease closes.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_locks (
  job          text        PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  locked_at    timestamptz NOT NULL DEFAULT now(),
  holder       text
);

COMMENT ON TABLE public.job_locks IS
  'TTL leases for single-flight background jobs. service_role only. A crashed holder''s lease expires on its own; there is no stuck-lock recovery to perform.';
COMMENT ON COLUMN public.job_locks.job IS
  'Job name. Exactly one row per job.';
COMMENT ON COLUMN public.job_locks.locked_until IS
  'Lease expiry. The lease is FREE when locked_until <= now().';
COMMENT ON COLUMN public.job_locks.locked_at IS
  'When the current lease was taken. Diagnostics only.';
COMMENT ON COLUMN public.job_locks.holder IS
  'Opaque id of the run holding the lease. Only that holder may release it, so a run that overran its TTL cannot release the lease a later run has since taken.';

-- RLS on, and deliberately NO policy: no client role can read or write this
-- table at all. service_role bypasses RLS and is the only intended caller.
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.job_locks FROM PUBLIC;
REVOKE ALL ON TABLE public.job_locks FROM anon;
REVOKE ALL ON TABLE public.job_locks FROM authenticated;
GRANT  ALL ON TABLE public.job_locks TO   service_role;

-- ── Acquire ──────────────────────────────────────────────────────────────────
-- Returns true only when the caller now holds the lease.
--
-- The INSERT ... ON CONFLICT DO UPDATE ... WHERE is what makes this atomic: the
-- conflicting row is locked by the ON CONFLICT path, so two concurrent callers
-- are serialised by Postgres and the second one re-evaluates the WHERE against
-- the first one's committed lease. When the WHERE fails no row is returned,
-- RETURNING assigns nothing, and the function reports false.

CREATE OR REPLACE FUNCTION public.try_acquire_job_lock(
  p_job         text,
  p_holder      text,
  p_ttl_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ttl      integer;
  v_acquired boolean;
BEGIN
  IF p_job IS NULL OR btrim(p_job) = '' THEN
    RETURN false;
  END IF;
  IF p_holder IS NULL OR btrim(p_holder) = '' THEN
    -- An anonymous holder could never be matched by release_job_lock, so the
    -- lease would always sit out its full TTL. Refuse instead.
    RETURN false;
  END IF;

  -- Clamp the TTL: 1 second floor, 6 hour ceiling. A longer lease is always a
  -- caller bug and would wedge the job for the rest of the day.
  v_ttl := least(greatest(coalesce(p_ttl_seconds, 900), 1), 21600);

  INSERT INTO public.job_locks AS jl (job, locked_until, locked_at, holder)
  VALUES (p_job, now() + make_interval(secs => v_ttl), now(), p_holder)
  ON CONFLICT (job) DO UPDATE
     SET locked_until = now() + make_interval(secs => v_ttl),
         locked_at    = now(),
         holder       = p_holder
   WHERE jl.locked_until <= now()
  RETURNING true INTO v_acquired;

  RETURN coalesce(v_acquired, false);
END;
$fn$;

COMMENT ON FUNCTION public.try_acquire_job_lock(text, text, integer) IS
  'Take a TTL lease on a job name. Returns true only if the caller now holds it. service_role only.';

-- ── Release ──────────────────────────────────────────────────────────────────
-- Expires the lease immediately, but ONLY for the holder that took it. A run
-- that overran its TTL therefore cannot release the lease a newer run has taken.

CREATE OR REPLACE FUNCTION public.release_job_lock(
  p_job    text,
  p_holder text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_released boolean;
BEGIN
  IF p_job IS NULL OR p_holder IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.job_locks
     SET locked_until = now() - interval '1 second'
   WHERE job    = p_job
     AND holder = p_holder
  RETURNING true INTO v_released;

  RETURN coalesce(v_released, false);
END;
$fn$;

COMMENT ON FUNCTION public.release_job_lock(text, text) IS
  'Release a TTL lease taken by this exact holder. Returns true when a lease was released. service_role only.';

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Supabase ships ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role, so a new function in `public` is born with
-- an anon grant. REVOKE ALL ... FROM PUBLIC does not remove an explicit role
-- grant, so both roles are revoked by name.

REVOKE ALL ON FUNCTION public.try_acquire_job_lock(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_acquire_job_lock(text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.try_acquire_job_lock(text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_job_lock(text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_job_lock(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_job_lock(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.release_job_lock(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_job_lock(text, text) TO service_role;

-- PostgREST caches the schema. Without this reload the RPCs stay invisible
-- (PGRST202) and the renewal job keeps running in its fail-soft unlocked mode.
NOTIFY pgrst, 'reload schema';
