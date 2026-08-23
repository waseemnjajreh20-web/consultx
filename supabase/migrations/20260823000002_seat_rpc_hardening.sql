-- ConsultX — R3-C1: close the seat RPC bypass
-- Date: 2026-08-23
-- Branch: recovery/stabilization-2026-08-23
-- Idempotent. Safe to re-run. The OWNER applies this by hand (never `supabase db push`).
--
-- WHAT WAS BROKEN
-- ---------------
-- `public.update_subscription_seat_count` (introduced by
-- 20260430000002_enterprise_seat_enforcement.sql lines 377-451) is a
-- SECURITY DEFINER function granted to `authenticated`. It wrote
-- `user_subscriptions.seat_count` directly with:
--   * NO upper bound  -> any authenticated owner could store seat_count = 5000;
--   * NO status check -> the write landed on `trialing` / `past_due` rows too.
-- The whole C1 protection (billing contract Section 12.1: a plan or seat
-- escalation may land on a live subscription ONLY when a payment for it is
-- captured, and only via moyasar-webhook) was bypassable through this one RPC.
-- Seat ENFORCEMENT (`get_org_seat_usage`, `accept_org_invitation`) reads the
-- raw stored value, so seats leaked immediately; BILLING clamps at 100 only in
-- TypeScript (`effectiveSeats` / `MAX_BILLABLE_SEATS`), so the stored value also
-- armed the next unattended charge.
--
-- WHAT THIS MIGRATION CHANGES
-- ---------------------------
--  1. Hard cap at 100 seats, raised as an explicit exception naming the limit.
--  2. The RPC now only accepts rows with status = 'active'. Every other status
--     (trialing / past_due / pending_activation / expired / cancelled) is
--     refused with a message telling the customer to change seats through
--     checkout, which is the path that produces a captured payment.
--  3. Every pre-existing check is preserved verbatim: authentication,
--     positive integer, row exists, caller owns the row, plan is a per-seat
--     plan, plan.min_seats floor, linked-org active-member floor.
--
-- `CREATE OR REPLACE FUNCTION` is used deliberately instead of DROP + CREATE.
-- PostgreSQL documentation (CREATE FUNCTION): "When CREATE OR REPLACE FUNCTION
-- is used to replace an existing function, the ownership and permissions of the
-- function do not change." The signature, parameter names and return type here
-- are identical to the existing function, which is the precondition for that
-- guarantee. The REVOKE/GRANT pair at the bottom is repeated anyway, so this
-- file is still correct if it is ever the first statement that creates the
-- function on a fresh database.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_subscription_seat_count(
  p_subscription_id UUID,
  p_seat_count      INTEGER
)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  -- COUPLING — DO NOT DRIFT.
  -- This constant MUST equal `MAX_BILLABLE_SEATS` in
  -- supabase/functions/_shared/billing.ts (currently 100) and `SEAT_CAP` in
  -- supabase/functions/moyasar-create-subscription/index.ts. Billing clamps at
  -- MAX_BILLABLE_SEATS while seat ENFORCEMENT reads the raw column, so a value
  -- stored above the TypeScript cap grants seats that are never billed.
  -- Raising the limit means raising ALL of these together.
  c_max_billable_seats CONSTANT INTEGER := 100;

  v_caller_id UUID := auth.uid();
  v_sub       RECORD;
  v_plan      RECORD;
  v_org       RECORD;
  v_active    INTEGER;
  v_updated   public.user_subscriptions;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_seat_count IS NULL OR p_seat_count < 1 THEN
    RAISE EXCEPTION 'seat_count must be a positive integer';
  END IF;

  -- R3-C1 (1/2): hard upper bound. Pure input validation, so it runs before the
  -- row is read: an over-cap request is refused whatever the row looks like.
  IF p_seat_count > c_max_billable_seats THEN
    RAISE EXCEPTION 'SEAT_CAP_EXCEEDED: seat_count may not exceed % seats. Contact support for a larger deployment.',
      c_max_billable_seats;
  END IF;

  SELECT * INTO v_sub
  FROM public.user_subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF v_sub.user_id <> v_caller_id THEN
    RAISE EXCEPTION 'Only the subscription owner may adjust its seat count';
  END IF;

  -- R3-C1 (2/2): status restriction. Checked AFTER ownership so a stranger can
  -- never probe the status of someone else's subscription.
  --
  -- Only `active` rows may be adjusted here. On an active row the change is
  -- priced by the NEXT renewal, at the published per-seat price, on the normal
  -- renewal date, from an authenticated owner action (billing contract
  -- Section 12.6). Every other status is refused:
  --   * trialing           - a stored card is waiting for an unattended
  --                          post-trial charge. Raising seats here is exactly
  --                          the C1 escalation: money would move for seats no
  --                          payment ever consented to.
  --   * past_due           - a charge is already failing; the retry pass would
  --                          re-price against the new seat count.
  --   * pending_activation - the row's plan/seats are decided by the payment in
  --                          flight; the webhook promotes them on capture.
  --   * expired/cancelled  - nothing to adjust; the next checkout sets seats.
  -- The correct path for all of them is checkout, which writes plan_id and
  -- seat_count into the Moyasar payment metadata and lets moyasar-webhook
  -- promote them only once the payment is captured.
  IF v_sub.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'SEAT_CHANGE_REQUIRES_CHECKOUT: seat count can only be changed on an active subscription (this one is "%"). Change your seats through checkout so the new seat count is paid for before it takes effect.',
      COALESCE(v_sub.status, 'unknown');
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
  IF v_plan.price_per_seat IS NULL THEN
    RAISE EXCEPTION 'Plan % is not a per-seat plan; seat_count cannot be adjusted', v_plan.slug;
  END IF;

  IF p_seat_count < COALESCE(v_plan.min_seats, 1) THEN
    RAISE EXCEPTION 'seat_count must be at least % for plan %', v_plan.min_seats, v_plan.slug;
  END IF;

  -- If the subscription is linked to an org, ensure the new seat_count
  -- still covers the current active member count.
  SELECT * INTO v_org FROM public.organizations WHERE subscription_id = p_subscription_id;
  IF FOUND THEN
    SELECT COUNT(*)::int INTO v_active
    FROM public.org_members
    WHERE org_id = v_org.id AND status = 'active';

    IF p_seat_count < v_active THEN
      RAISE EXCEPTION 'Cannot decrease seat_count to %: organization currently has % active members. Remove members first.',
        p_seat_count, v_active;
    END IF;
  END IF;

  UPDATE public.user_subscriptions
  SET seat_count = p_seat_count, updated_at = now()
  WHERE id = p_subscription_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$func$;

COMMENT ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) IS
  'Adjusts seat_count on an enterprise_team / enterprise_office subscription. Owner-only. R3-C1 hardening (2026-08-23): seat_count is capped at 100 (must equal MAX_BILLABLE_SEATS in _shared/billing.ts) and the RPC only accepts rows whose status is active; any other status must go through checkout so the change is promoted by moyasar-webhook against a captured payment (billing contract Section 12.1). Still validates plan.min_seats and the linked org active member count. The new seat_count is charged by the next renewal; this RPC never charges immediately.';

REVOKE ALL    ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) FROM PUBLIC;

-- R3-C1 follow-up. An EXPLICIT role grant is NOT removed by REVOKE ... FROM
-- PUBLIC. Verified against production read-only on 2026-08-23: this function
-- holds  postgres=X | anon=X | authenticated=X | service_role=X , because
-- Supabase ships ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT EXECUTE
-- ON FUNCTIONS TO anon, authenticated, service_role, so every function in
-- public is born with an anon grant that the REVOKE above never touched.
-- anon must not hold EXECUTE on a SECURITY DEFINER function that writes
-- user_subscriptions, even though the 'Not authenticated' guard already
-- refuses such a call today (auth.uid() reads only the JWT sub claim, and an
-- anon request carries none). Defence in depth, and idempotent.
REVOKE ALL    ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) TO authenticated;

COMMIT;
