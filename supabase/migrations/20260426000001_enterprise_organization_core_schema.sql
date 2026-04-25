-- ============================================================
-- Enterprise Organization Core Schema (Phase E2)
--
-- Adds the three foundational tables for ConsultX Enterprise:
--   1. organizations     -- the consultancy office (billing entity)
--   2. org_members       -- internal staff with role and seat status
--   3. org_invitations   -- pending email invitations with token
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch billing
--
-- The operating model is defined in:
--   docs/enterprise/enterprise-operating-model-v1.md
--
-- Subsequent phases:
--   E3 -- case + document core schema
--   E4 -- reviews + approvals schema
--   E5 -- AI session binding
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation
--   E8 -- enterprise billing (organization_subscriptions + Moyasar branch)
-- ============================================================

-- -------------------------------------------------------------
-- A. organizations
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT         NOT NULL,
  owner_user_id   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT         NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  trial_start     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  trial_end       TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS
  'Enterprise organization (consultancy office). One row per organization. The owner is the founding user and the billing-responsible party. Operating model: docs/enterprise/enterprise-operating-model-v1.md.';

CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id
  ON public.organizations (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON public.organizations (status);

-- -------------------------------------------------------------
-- B. org_members
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_members (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id      UUID         NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  role         TEXT         NOT NULL
    CHECK (role IN ('owner', 'admin', 'head_of_department', 'engineer', 'finance_officer')),
  status       TEXT         NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by   UUID         REFERENCES auth.users(id),
  invited_at   TIMESTAMPTZ,
  joined_at    TIMESTAMPTZ,
  removed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT org_members_org_user_unique UNIQUE (org_id, user_id)
);

COMMENT ON TABLE public.org_members IS
  'Membership row joining a user to an organization with a role and status. A user may belong to at most one organization in V1 (enforced at the application/RPC layer, not the schema). Billing seat = a row whose status is active. Pending invitations live in org_invitations, not here.';

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON public.org_members (org_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.org_members (user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_status
  ON public.org_members (status);

CREATE INDEX IF NOT EXISTS idx_org_members_role
  ON public.org_members (role);

-- -------------------------------------------------------------
-- C. org_invitations
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email        TEXT         NOT NULL,
  role         TEXT         NOT NULL DEFAULT 'engineer'
    CHECK (role IN ('admin', 'head_of_department', 'engineer', 'finance_officer')),
  token        TEXT         NOT NULL UNIQUE,
  status       TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at   TIMESTAMPTZ  NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_by   UUID         NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_invitations IS
  'Pending email-based invitation to join an organization. The owner role is intentionally not invitable -- ownership is established at organization creation only. Token validation and acceptance will be handled by a SECURITY DEFINER RPC in a later phase to keep RLS conservative.';

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id
  ON public.org_invitations (org_id);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON public.org_invitations (email);

-- Token already has UNIQUE which provides an implicit B-tree index.
-- The explicit named index below is redundant for lookup performance but
-- kept to match the phase-specified index list and project naming convention.
CREATE INDEX IF NOT EXISTS idx_org_invitations_token
  ON public.org_invitations (token);

CREATE INDEX IF NOT EXISTS idx_org_invitations_status
  ON public.org_invitations (status);

-- -------------------------------------------------------------
-- updated_at triggers
-- Reuses public.update_updated_at_column() defined in
-- 20260210180359_a6915db1-2f7d-4635-8a7a-f8d0cb896029.sql
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS update_organizations_updated_at  ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_org_members_updated_at    ON public.org_members;
CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_org_invitations_updated_at ON public.org_invitations;
CREATE TRIGGER update_org_invitations_updated_at
  BEFORE UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER, minimal, auditable)
--
-- These exist solely to keep RLS policies non-recursive and readable.
-- A direct subquery EXISTS (SELECT 1 FROM org_members ...) inside an
-- org_members policy would re-trigger RLS on org_members itself,
-- producing a recursive evaluation. Wrapping the membership check in
-- a SECURITY DEFINER function bypasses RLS on the inner SELECT.
--
-- Each helper does ONE thing, takes (org_id, user_id), returns BOOLEAN,
-- and is granted to authenticated users only.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = p_org_id
      AND owner_user_id = p_user_id
  );
$func$;

COMMENT ON FUNCTION public.is_org_owner(UUID, UUID) IS
  'Returns true if the user is the founding owner of the organization. Used by RLS policies to avoid recursive evaluation.';

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$func$;

COMMENT ON FUNCTION public.is_active_org_member(UUID, UUID) IS
  'Returns true if the user has an active membership row in the organization. SECURITY DEFINER bypasses RLS on org_members so this function can be safely called from inside org_members RLS policies without recursion.';

CREATE OR REPLACE FUNCTION public.is_org_owner_or_admin(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT
    public.is_org_owner(p_org_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.org_members
      WHERE org_id = p_org_id
        AND user_id = p_user_id
        AND status = 'active'
        AND role = 'admin'
    );
$func$;

COMMENT ON FUNCTION public.is_org_owner_or_admin(UUID, UUID) IS
  'Returns true if the user is the org owner OR an active admin member. Used by management policies on org_members and org_invitations.';

-- Grant execute on helpers to authenticated users only.
-- (anon users have no business calling these.)
REVOKE ALL ON FUNCTION public.is_org_owner(UUID, UUID)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_org_member(UUID, UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_owner_or_admin(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_org_owner(UUID, UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(UUID, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner_or_admin(UUID, UUID) TO authenticated;

-- -------------------------------------------------------------
-- Owner-bootstrap RPC
--
-- Atomically creates an organization AND inserts the founding owner
-- membership row in a single transaction. Without this RPC, RLS would
-- need to permit a chicken-and-egg insert into org_members for a user
-- who is not yet a member of any org -- which is hard to express
-- safely.
--
-- This RPC runs as SECURITY DEFINER so it can write to both tables
-- regardless of the policies, but it always uses auth.uid() as the
-- owner -- it cannot be tricked into creating an org owned by someone
-- else.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  -- V1 invariant: a user may belong to at most one organization.
  -- Enforced here at the bootstrap layer because RLS does not have a
  -- natural place to express it.
  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = v_user_id
      AND status IN ('active', 'invited', 'suspended')
  ) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, owner_user_id)
  VALUES (trim(p_name), v_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.org_members (
    org_id, user_id, role, status, joined_at
  ) VALUES (
    v_org_id, v_user_id, 'owner', 'active', now()
  );

  RETURN v_org_id;
END;
$func$;

COMMENT ON FUNCTION public.create_organization_with_owner(TEXT) IS
  'Atomically creates an organization and the founding owner membership row. Always uses auth.uid() as the owner -- cannot create orgs for other users. Enforces the V1 one-org-per-user invariant.';

REVOKE ALL    ON FUNCTION public.create_organization_with_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT) TO authenticated;

-- -------------------------------------------------------------
-- RLS -- organizations
-- -------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Direct INSERT from a client is permitted but only as oneself-as-owner.
-- The recommended path is the create_organization_with_owner() RPC, which
-- ALSO creates the owner membership row atomically. Direct INSERT exists
-- as an escape hatch and for service-role administrative scripts.
CREATE POLICY "organizations_insert_self_owner"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Owner can always see their own organization.
-- Active members can also see the organization they belong to.
CREATE POLICY "organizations_select_owner_or_member"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_active_org_member(id, auth.uid())
  );

-- Only the owner can update organization settings (name, etc.).
-- Status transitions (trial -> active, etc.) are written by service-role
-- billing functions in later phases and bypass RLS.
CREATE POLICY "organizations_update_owner"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- No DELETE policy in E2. Organizations are not user-deletable; cancellation
-- is a status transition handled by future billing functions.

-- -------------------------------------------------------------
-- RLS -- org_members
-- -------------------------------------------------------------
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- A user can always see their own membership row(s).
-- An active member can also see the other members of their organization
-- (necessary for the team-list UI in E7).
CREATE POLICY "org_members_select_self_or_co_member"
  ON public.org_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_active_org_member(org_id, auth.uid())
  );

-- Direct INSERT permitted only for owner/admin of the target organization.
-- The owner-bootstrap insert (founding owner row) goes through the
-- create_organization_with_owner() RPC, which is SECURITY DEFINER and
-- bypasses this policy. Invitation acceptance will be handled by a
-- SECURITY DEFINER RPC in E3/E4.
CREATE POLICY "org_members_insert_owner_or_admin"
  ON public.org_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

-- Owner/admin can update member rows (role changes, status changes).
-- Members cannot update their own row directly -- promotions and status
-- changes are management actions.
CREATE POLICY "org_members_update_owner_or_admin"
  ON public.org_members
  FOR UPDATE
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

-- Owner/admin can hard-delete member rows. The preferred soft-delete
-- pattern is status=removed with removed_at=now(); hard delete is
-- reserved for cleanup operations.
CREATE POLICY "org_members_delete_owner_or_admin"
  ON public.org_members
  FOR DELETE
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));

-- -------------------------------------------------------------
-- RLS -- org_invitations
-- -------------------------------------------------------------
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Owner/admin can read invitations for their own organization.
-- Token-based public lookup (for the accept-invitation flow) is
-- intentionally NOT a policy -- it will be handled by a SECURITY DEFINER
-- RPC in a later phase. This avoids exposing a query path where any
-- authenticated user could enumerate invitations by guessing tokens.
CREATE POLICY "org_invitations_select_owner_or_admin"
  ON public.org_invitations
  FOR SELECT
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));

-- Owner/admin can create invitations; created_by must be the caller.
CREATE POLICY "org_invitations_insert_owner_or_admin"
  ON public.org_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_owner_or_admin(org_id, auth.uid())
    AND created_by = auth.uid()
  );

-- Owner/admin can update invitation status (revoke, etc.).
CREATE POLICY "org_invitations_update_owner_or_admin"
  ON public.org_invitations
  FOR UPDATE
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()))
  WITH CHECK (public.is_org_owner_or_admin(org_id, auth.uid()));

-- Owner/admin can hard-delete invitations.
CREATE POLICY "org_invitations_delete_owner_or_admin"
  ON public.org_invitations
  FOR DELETE
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));

-- ============================================================
-- End of E2 migration.
-- Next phases must NOT modify these tables; they should add new
-- tables (cases, documents, reviews, organization_subscriptions)
-- and reference these by foreign key.
-- ============================================================