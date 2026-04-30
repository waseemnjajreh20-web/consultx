-- ============================================================
-- Enterprise seat enforcement
--
-- Closes the gap that lets an enterprise_team / enterprise_office
-- subscriber invite unlimited org members despite paying for a
-- finite seat_count.
--
-- Adds:
--   1. organizations.subscription_id (uuid, nullable, FK to user_subscriptions)
--   2. unique partial index: one organization per linked subscription
--   3. SECURITY DEFINER RPCs:
--        - get_org_seat_usage(p_org_id)
--        - create_org_invitation_enforced(p_org_id, p_email, p_role)
--        - update_subscription_seat_count(p_subscription_id, p_seat_count)
--      and REPLACES the existing accept_org_invitation(p_token) with a
--      seat-aware version that keeps the same signature.
--   4. Hardens RLS: drops the direct-INSERT policies on
--      org_invitations and org_members so all writes flow through
--      the enforced RPCs (existing SELECT/UPDATE/DELETE policies stay).
--
-- Behaviour rules:
--   - Orgs WITHOUT a subscription_id (legacy / unlinked trial orgs)
--     are NOT seat-enforced. Existing 2 trial orgs in production are
--     unaffected.
--   - Orgs WITH a subscription_id linked to enterprise_team or
--     enterprise_office are enforced:
--       active_members + pending_invitations < subscription.seat_count
--   - Legacy slug='enterprise' is NOT linked by the webhook (per spec)
--     and therefore not seat-enforced through this layer.
--
-- ADDITIVE / SURGICAL. This migration:
--   * does NOT delete any existing organization, member, invitation, or
--     subscription row
--   * does NOT change subscription_plans
--   * does NOT touch fire-safety-chat, Analytical Mode, corpus, or
--     case-document tables/RPCs
--   * does NOT modify the Moyasar payment flow at the SQL level
--
-- Idempotent. Safe to re-apply.
-- Apply via controlled execution against project hrnltxmwoaphgejckutk.
-- Do NOT use supabase db push.
--
-- Rollback notes (review before running):
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS subscription_id;
--   DROP INDEX IF EXISTS public.organizations_subscription_id_unique_idx;
--   DROP FUNCTION IF EXISTS public.get_org_seat_usage(uuid);
--   DROP FUNCTION IF EXISTS public.create_org_invitation_enforced(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.update_subscription_seat_count(uuid, integer);
--   -- accept_org_invitation: restore from migration 20260426000005 if needed.
--   -- RLS policies on org_invitations / org_members can be re-created from migration 20260426000001.
-- ============================================================

BEGIN;

-- ── 1. organizations.subscription_id -----------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_id UUID
    REFERENCES public.user_subscriptions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.subscription_id IS
  'Optional link to the user_subscription that funds this organization. Set when an enterprise_team / enterprise_office subscription is paid (moyasar-webhook). Triggers seat enforcement when present.';

-- ── 2. Unique partial index: one org per subscription ------------------
CREATE UNIQUE INDEX IF NOT EXISTS organizations_subscription_id_unique_idx
  ON public.organizations (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- ── 3. Helper: get_org_seat_usage --------------------------------------
-- Returns a single-row table with seat metadata for an organization.
-- Anyone with read access to the org may call (RLS-respecting via subqueries
-- that read public.org_members / org_invitations using current auth role).
DROP FUNCTION IF EXISTS public.get_org_seat_usage(uuid);
CREATE FUNCTION public.get_org_seat_usage(p_org_id UUID)
RETURNS TABLE (
  org_id                    UUID,
  subscription_id           UUID,
  plan_slug                 TEXT,
  seat_count                INTEGER,
  min_seats                 INTEGER,
  active_members_count      INTEGER,
  pending_invitations_count INTEGER,
  available_seats           INTEGER,
  is_enforced               BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_org     RECORD;
  v_sub     RECORD;
  v_active  INTEGER;
  v_pending INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be active member of the org (or its owner).
  IF NOT (
    EXISTS (SELECT 1 FROM public.organizations o
            WHERE o.id = p_org_id AND o.owner_user_id = v_user_id)
    OR public.is_active_org_member(p_org_id, v_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  SELECT us.id, us.seat_count, sp.slug, sp.min_seats, sp.price_per_seat, us.status
    INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.id = v_org.subscription_id;

  SELECT COUNT(*)::int INTO v_active
  FROM public.org_members om
  WHERE om.org_id = p_org_id AND om.status = 'active';

  SELECT COUNT(*)::int INTO v_pending
  FROM public.org_invitations oi
  WHERE oi.org_id = p_org_id AND oi.status = 'pending';

  org_id                     := p_org_id;
  subscription_id            := v_org.subscription_id;
  plan_slug                  := COALESCE(v_sub.slug, NULL);
  seat_count                 := COALESCE(v_sub.seat_count, NULL);
  min_seats                  := COALESCE(v_sub.min_seats, NULL);
  active_members_count       := v_active;
  pending_invitations_count  := v_pending;
  -- is_enforced: seat limits apply only when org is linked to a per-seat plan
  -- (price_per_seat IS NOT NULL on the linked subscription_plans row).
  is_enforced                := v_org.subscription_id IS NOT NULL
                                AND v_sub.price_per_seat IS NOT NULL;
  IF is_enforced THEN
    available_seats := GREATEST(0, COALESCE(v_sub.seat_count, 0) - v_active - v_pending);
  ELSE
    available_seats := NULL;  -- not enforced => no numeric remaining
  END IF;

  RETURN NEXT;
  RETURN;
END;
$func$;

COMMENT ON FUNCTION public.get_org_seat_usage(UUID) IS
  'Returns seat usage metadata for an organization. Available to active members and the owner. is_enforced=true when the org is linked to a per-seat subscription (price_per_seat IS NOT NULL).';

REVOKE ALL ON FUNCTION public.get_org_seat_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_seat_usage(UUID) TO authenticated;

-- ── 4. create_org_invitation_enforced ----------------------------------
-- Owner/admin-only. Enforces seat limit when the org is linked to a
-- per-seat subscription. Returns the inserted org_invitations row.
DROP FUNCTION IF EXISTS public.create_org_invitation_enforced(uuid, text, text);
CREATE FUNCTION public.create_org_invitation_enforced(
  p_org_id UUID,
  p_email  TEXT,
  p_role   TEXT
)
RETURNS public.org_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller_id UUID := auth.uid();
  v_org       RECORD;
  v_sub       RECORD;
  v_active    INTEGER;
  v_pending   INTEGER;
  v_email     TEXT;
  v_token     TEXT;
  v_expires   TIMESTAMPTZ;
  v_inv       public.org_invitations;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_role NOT IN ('admin', 'head_of_department', 'engineer', 'finance_officer') THEN
    RAISE EXCEPTION 'Invalid role: %. Valid roles: admin, head_of_department, engineer, finance_officer', p_role;
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  -- Caller must be owner/admin of the org.
  IF NOT public.is_org_owner_or_admin(p_org_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the organization owner or admin may invite members';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Reject duplicate pending invitations for the same email/org.
  IF EXISTS (
    SELECT 1 FROM public.org_invitations oi
    WHERE oi.org_id = p_org_id
      AND lower(oi.email) = v_email
      AND oi.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for this email';
  END IF;

  -- Reject if the email belongs to an existing active member.
  IF EXISTS (
    SELECT 1 FROM public.org_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.org_id = p_org_id
      AND om.status = 'active'
      AND lower(u.email) = v_email
  ) THEN
    RAISE EXCEPTION 'A member with this email is already active in the organization';
  END IF;

  -- Seat enforcement: only when org is linked to a per-seat subscription.
  IF v_org.subscription_id IS NOT NULL THEN
    SELECT us.seat_count, sp.slug, sp.price_per_seat
      INTO v_sub
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE us.id = v_org.subscription_id;

    IF v_sub.price_per_seat IS NOT NULL THEN
      SELECT COUNT(*)::int INTO v_active
      FROM public.org_members om WHERE om.org_id = p_org_id AND om.status = 'active';
      SELECT COUNT(*)::int INTO v_pending
      FROM public.org_invitations oi WHERE oi.org_id = p_org_id AND oi.status = 'pending';

      IF (v_active + v_pending) >= v_sub.seat_count THEN
        RAISE EXCEPTION 'SEAT_LIMIT_REACHED: % seats are already in use (active=% pending=%). Increase seat_count before inviting another member.',
          v_sub.seat_count, v_active, v_pending;
      END IF;
    END IF;
  END IF;

  v_token   := replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + INTERVAL '7 days';

  INSERT INTO public.org_invitations
    (org_id, email, role, token, status, expires_at, created_by)
  VALUES
    (p_org_id, v_email, p_role, v_token, 'pending', v_expires, v_caller_id)
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$func$;

COMMENT ON FUNCTION public.create_org_invitation_enforced(UUID, TEXT, TEXT) IS
  'Creates a pending invitation. Owner/admin only. Enforces seat_count when the org is linked to a per-seat subscription (price_per_seat IS NOT NULL). Returns the inserted org_invitations row.';

REVOKE ALL ON FUNCTION public.create_org_invitation_enforced(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_invitation_enforced(UUID, TEXT, TEXT) TO authenticated;

-- ── 5. accept_org_invitation (REPLACE with seat-aware version) ---------
-- Same signature so the frontend keeps calling supabase.rpc("accept_org_invitation", { p_token })
-- but adds a seat-limit check before the membership row is inserted.
CREATE OR REPLACE FUNCTION public.accept_org_invitation(
  p_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id    UUID := auth.uid();
  v_user_email TEXT;
  v_inv        RECORD;
  v_org        RECORD;
  v_sub        RECORD;
  v_active     INTEGER;
  v_org_id     UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_inv
  FROM public.org_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or token is invalid';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is % and can no longer be accepted', v_inv.status;
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE public.org_invitations
    SET status = 'expired', updated_at = now()
    WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  IF lower(v_user_email) <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'Your account email (%) does not match the invitation email (%)',
      v_user_email, v_inv.email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = v_user_id
      AND status IN ('active', 'invited', 'suspended')
  ) THEN
    RAISE EXCEPTION 'You already belong to an organization and cannot accept another invitation';
  END IF;

  -- Seat-limit check: only when the org is linked to a per-seat subscription.
  SELECT * INTO v_org FROM public.organizations WHERE id = v_inv.org_id;
  IF v_org.subscription_id IS NOT NULL THEN
    SELECT us.seat_count, sp.price_per_seat
      INTO v_sub
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE us.id = v_org.subscription_id;

    IF v_sub.price_per_seat IS NOT NULL THEN
      SELECT COUNT(*)::int INTO v_active
      FROM public.org_members
      WHERE org_id = v_inv.org_id AND status = 'active';

      -- After accepting, active count becomes v_active + 1. Reject if that would exceed seats.
      IF (v_active + 1) > v_sub.seat_count THEN
        RAISE EXCEPTION 'SEAT_LIMIT_REACHED: organization is at its seat limit (% seats). The owner must increase seat_count before this invitation can be accepted.',
          v_sub.seat_count;
      END IF;
    END IF;
  END IF;

  v_org_id := v_inv.org_id;

  INSERT INTO public.org_members (
    org_id, user_id, role, status,
    invited_by, invited_at, joined_at
  ) VALUES (
    v_org_id, v_user_id, v_inv.role, 'active',
    v_inv.created_by, v_inv.created_at, now()
  );

  UPDATE public.org_invitations
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = v_inv.id;

  RETURN v_org_id;
END;
$func$;

COMMENT ON FUNCTION public.accept_org_invitation(TEXT) IS
  'Accepts a pending invitation token. Same signature as the previous version with an added seat-limit check: when the org is linked to a per-seat subscription, the new member count must not exceed seat_count. Raises SEAT_LIMIT_REACHED if the limit is reached.';

REVOKE ALL    ON FUNCTION public.accept_org_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_org_invitation(TEXT) TO authenticated;

-- ── 6. update_subscription_seat_count ----------------------------------
-- Owner-only seat adjustment. Validates against min_seats and the org's
-- current active member count. Does NOT trigger an immediate Moyasar
-- charge; the next renewal cycle (process-subscription-renewal) picks up
-- the new seat_count automatically.
DROP FUNCTION IF EXISTS public.update_subscription_seat_count(uuid, integer);
CREATE FUNCTION public.update_subscription_seat_count(
  p_subscription_id UUID,
  p_seat_count      INTEGER
)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
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
  'Adjusts seat_count on an enterprise_team / enterprise_office subscription. Owner-only. Validates against plan.min_seats and current active member count of the linked org. The new seat_count takes effect at the next renewal cycle; this RPC does not charge immediately.';

REVOKE ALL ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_subscription_seat_count(UUID, INTEGER) TO authenticated;

-- ── 7. RLS hardening: drop direct-INSERT policies that bypass RPCs -----
-- All invitation creation must now flow through create_org_invitation_enforced.
-- All membership creation must flow through create_organization_with_owner
-- (owner bootstrap) or accept_org_invitation (invite acceptance). Both are
-- SECURITY DEFINER and bypass RLS.
DROP POLICY IF EXISTS org_invitations_insert_owner_or_admin ON public.org_invitations;
DROP POLICY IF EXISTS org_members_insert_owner_or_admin   ON public.org_members;

COMMIT;
