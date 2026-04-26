-- ============================================================
-- Enterprise Case + Document Core Schema (Phase E3)
--
-- Adds the foundational tables for ConsultX Enterprise case
-- management and document tracking:
--   1. enterprise_case_counters  -- per-org atomic case number sequence
--   2. enterprise_cases          -- the core case entity (معاملة)
--   3. case_documents            -- file attachments with category/visibility
--   4. case_status_history       -- append-only lifecycle audit trail
--   5. case_notes                -- internal team comments
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch billing, auth, or Analytical Mode
--
-- Key design decisions recorded here:
--   * finance_officer is EXCLUDED from all case/document/note access.
--     This is a deliberate separation of duties per the operating model.
--     Enforced via is_active_case_member() — NOT is_active_org_member()
--     from E2, which returns true for all roles including finance_officer.
--   * V1 engineers can see ALL organization cases, not just assigned ones.
--   * Client portal (client_visible, final_deliverable visibility values)
--     is DEFERRED to Phase E9. Values exist in schema; no client RLS in E3.
--   * AI session binding (case_ai_sessions, ai_report_versions) is
--     DEFERRED to Phase E5. ai_review_attached status exists but no AI
--     tables are created here.
--   * Storage bucket creation and signed URL edge function are DEFERRED
--     to Phase E6/E7. storage_path is stored as a plain string in E3.
--   * Report branding and customization are DEFERRED to a later phase.
--
-- Migration tracking note:
--   CLI tracking is divergent (31 local-only, 57 remote-only, 0 matched).
--   Apply manually via Supabase Dashboard SQL Editor.
--   Do NOT use supabase db push.
--
-- Operating model: docs/enterprise/enterprise-operating-model-v1.md
--
-- Subsequent phases:
--   E4 -- case_reviews, case_approvals
--   E5 -- case_ai_sessions, ai_report_versions
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation
--   E8 -- enterprise billing (organization_subscriptions)
-- ============================================================


-- ============================================================
-- A. enterprise_case_counters
-- ============================================================
CREATE TABLE IF NOT EXISTS public.enterprise_case_counters (
  org_id      UUID         NOT NULL PRIMARY KEY
                             REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_number INTEGER      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.enterprise_case_counters IS
  'Per-organization atomic case number counter. Exactly one row per organization. '
  'Accessed exclusively by create_enterprise_case() SECURITY DEFINER RPC via '
  'INSERT ... ON CONFLICT DO UPDATE to guarantee sequential, collision-free case '
  'numbers under concurrent inserts. Direct client access is blocked: RLS enabled '
  'with no client-facing policies.';

DROP TRIGGER IF EXISTS update_enterprise_case_counters_updated_at
  ON public.enterprise_case_counters;
CREATE TRIGGER update_enterprise_case_counters_updated_at
  BEFORE UPDATE ON public.enterprise_case_counters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- B. enterprise_cases
-- ============================================================
CREATE TABLE IF NOT EXISTS public.enterprise_cases (
  id                   UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id               UUID         NOT NULL
                         REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_number          TEXT         NOT NULL,
  title                TEXT         NOT NULL,
  description          TEXT,
  client_ref           TEXT,
  client_name          TEXT,
  status               TEXT         NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'submitted',
      'assigned',
      'under_engineering_review',
      'ai_review_attached',
      'engineer_review_completed',
      'submitted_to_head',
      'returned_for_revision',
      'approved_internal',
      'delivered_to_client',
      'closed',
      'cancelled'
    )),
  assigned_engineer_id UUID         REFERENCES auth.users(id),
  head_reviewer_id     UUID         REFERENCES auth.users(id),
  created_by           UUID         NOT NULL REFERENCES auth.users(id),
  submitted_at         TIMESTAMPTZ,
  assigned_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_cases_org_case_number_unique UNIQUE (org_id, case_number),
  CONSTRAINT enterprise_cases_title_not_blank CHECK (length(trim(title)) > 0)
);

COMMENT ON TABLE public.enterprise_cases IS
  'Core case (معاملة) entity for ConsultX Enterprise. One row per fire/life-safety '
  'review engagement. Owned by exactly one organization. case_number is per-org '
  'sequential (C-000001, C-000002 ...) generated atomically by '
  'create_enterprise_case(). All status transitions must go through '
  'transition_case_status() which writes to case_status_history. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md';

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_org_id
  ON public.enterprise_cases (org_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_status
  ON public.enterprise_cases (status);

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_assigned_engineer_id
  ON public.enterprise_cases (assigned_engineer_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_created_by
  ON public.enterprise_cases (created_by);

CREATE INDEX IF NOT EXISTS idx_enterprise_cases_org_status
  ON public.enterprise_cases (org_id, status);

DROP TRIGGER IF EXISTS update_enterprise_cases_updated_at ON public.enterprise_cases;
CREATE TRIGGER update_enterprise_cases_updated_at
  BEFORE UPDATE ON public.enterprise_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- C. case_documents
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_documents (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id         UUID         NOT NULL
                    REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id          UUID         NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by     UUID         NOT NULL REFERENCES auth.users(id),
  category        TEXT         NOT NULL
    CHECK (category IN (
      'architectural_drawings',
      'life_safety_drawings',
      'fire_alarm_drawings',
      'fire_fighting_drawings',
      'pump_tank_details',
      'calculations',
      'technical_reports',
      'client_documents',
      'internal_notes',
      'final_deliverables'
    )),
  visibility      TEXT         NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN (
      'internal_only',
      'client_visible',
      'approval_required',
      'final_deliverable'
    )),
  title           TEXT         NOT NULL,
  description     TEXT,
  storage_path    TEXT         NOT NULL,
  file_name       TEXT         NOT NULL,
  file_size_bytes BIGINT,
  mime_type       TEXT,
  version_number  INTEGER      NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_documents_title_not_blank        CHECK (length(trim(title)) > 0),
  CONSTRAINT case_documents_storage_path_not_blank CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT case_documents_version_positive       CHECK (version_number >= 1)
);

COMMENT ON TABLE public.case_documents IS
  'File attachments associated with an enterprise case. category and visibility '
  'control routing and display. org_id is denormalized from enterprise_cases for '
  'RLS efficiency — avoids a per-row JOIN when evaluating membership on every '
  'document access. storage_path stores the Supabase Storage path string only; '
  'bucket creation and signed URL edge function are DEFERRED to E6/E7. '
  'client_visible and final_deliverable visibility values are reserved for the '
  'E9 client portal; no client-facing RLS access paths exist in E3.';

CREATE INDEX IF NOT EXISTS idx_case_documents_case_id
  ON public.case_documents (case_id);

CREATE INDEX IF NOT EXISTS idx_case_documents_org_id
  ON public.case_documents (org_id);

CREATE INDEX IF NOT EXISTS idx_case_documents_category
  ON public.case_documents (category);

CREATE INDEX IF NOT EXISTS idx_case_documents_visibility
  ON public.case_documents (visibility);

CREATE INDEX IF NOT EXISTS idx_case_documents_uploaded_by
  ON public.case_documents (uploaded_by);

DROP TRIGGER IF EXISTS update_case_documents_updated_at ON public.case_documents;
CREATE TRIGGER update_case_documents_updated_at
  BEFORE UPDATE ON public.case_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- D. case_status_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_status_history (
  id            UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id       UUID         NOT NULL
                  REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id        UUID         NOT NULL
                  REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT         NOT NULL,
  actor_user_id UUID         NOT NULL REFERENCES auth.users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
  -- Intentionally no updated_at: rows are NEVER modified after insert.
);

COMMENT ON TABLE public.case_status_history IS
  'Append-only audit log of every status transition on an enterprise case. '
  'Rows are NEVER updated or deleted, not even by administrators. '
  'Only create_enterprise_case() (initial null->draft entry) and '
  'transition_case_status() write to this table. '
  'org_id is denormalized from enterprise_cases for RLS efficiency. '
  'from_status is NULL for the initial creation event (null -> draft).';

CREATE INDEX IF NOT EXISTS idx_case_status_history_case_id
  ON public.case_status_history (case_id);

CREATE INDEX IF NOT EXISTS idx_case_status_history_org_id
  ON public.case_status_history (org_id);

CREATE INDEX IF NOT EXISTS idx_case_status_history_created_at
  ON public.case_status_history (created_at);


-- ============================================================
-- E. case_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_notes (
  id          UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     UUID         NOT NULL
                REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id      UUID         NOT NULL
                REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id   UUID         NOT NULL REFERENCES auth.users(id),
  body        TEXT         NOT NULL,
  visibility  TEXT         NOT NULL DEFAULT 'internal_only'
    CHECK (visibility IN ('internal_only')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_notes_body_not_blank CHECK (length(trim(body)) > 0)
);

COMMENT ON TABLE public.case_notes IS
  'Internal text comments attached to an enterprise case. Distinct from '
  'case_documents (file uploads). Only internal_only visibility is permitted '
  'in E3. Client-visible note sharing is DEFERRED to E9. The visibility CHECK '
  'constraint may be widened in E9 to add client_visible.';

CREATE INDEX IF NOT EXISTS idx_case_notes_case_id
  ON public.case_notes (case_id);

CREATE INDEX IF NOT EXISTS idx_case_notes_org_id
  ON public.case_notes (org_id);

CREATE INDEX IF NOT EXISTS idx_case_notes_author_id
  ON public.case_notes (author_id);

DROP TRIGGER IF EXISTS update_case_notes_updated_at ON public.case_notes;
CREATE TRIGGER update_case_notes_updated_at
  BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- RLS helper functions
-- Pattern: SECURITY DEFINER, STABLE, SET search_path = public.
-- SECURITY DEFINER is required so that calls from inside RLS policies
-- on one table can query org_members without recursive RLS evaluation.
-- ============================================================

-- is_active_case_member
-- CRITICAL: finance_officer is explicitly excluded by role filter.
-- Do NOT substitute is_active_org_member() from E2 here — that function
-- returns true for finance_officer. Using the wrong helper would be a
-- security defect: finance officers would gain unintended case visibility.
CREATE OR REPLACE FUNCTION public.is_active_case_member(
  p_org_id  UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id  = p_org_id
      AND user_id = p_user_id
      AND status  = 'active'
      AND role IN ('owner', 'admin', 'head_of_department', 'engineer')
  );
$func$;

COMMENT ON FUNCTION public.is_active_case_member(UUID, UUID) IS
  'Returns true if the user is an active org member with case access: '
  'owner, admin, head_of_department, or engineer. finance_officer is '
  'deliberately excluded — per the operating model, finance officers have '
  'no case visibility (separation of duties). SECURITY DEFINER bypasses RLS '
  'on org_members to prevent recursive policy evaluation. '
  'WARNING: do NOT replace with is_active_org_member() from E2.';

-- is_case_assignee
-- Used by transition_case_status() to permit engineer-driven workflow steps.
CREATE OR REPLACE FUNCTION public.is_case_assignee(
  p_case_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.enterprise_cases
    WHERE id                   = p_case_id
      AND assigned_engineer_id = p_user_id
  );
$func$;

COMMENT ON FUNCTION public.is_case_assignee(UUID, UUID) IS
  'Returns true if the user is the currently assigned engineer on the case. '
  'Used by transition_case_status() to validate engineer-driven workflow '
  'transitions (e.g. assigned -> under_engineering_review).';

-- get_org_member_role
-- Returns the active role for role-based authorization in RPCs.
-- Returns NULL if the user has no active membership in the org.
CREATE OR REPLACE FUNCTION public.get_org_member_role(
  p_org_id  UUID,
  p_user_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT role
  FROM public.org_members
  WHERE org_id  = p_org_id
    AND user_id = p_user_id
    AND status  = 'active'
  LIMIT 1;
$func$;

COMMENT ON FUNCTION public.get_org_member_role(UUID, UUID) IS
  'Returns the active role of a user in an organization, or NULL if no active '
  'membership exists. Used by transition_case_status() and '
  'create_enterprise_case() for role-based authorization checks.';

REVOKE ALL ON FUNCTION public.is_active_case_member(UUID, UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_case_assignee(UUID, UUID)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_member_role(UUID, UUID)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_active_case_member(UUID, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_case_assignee(UUID, UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_member_role(UUID, UUID)    TO authenticated;


-- ============================================================
-- Bootstrap RPC: create_enterprise_case
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_enterprise_case(
  p_org_id      UUID,
  p_title       TEXT,
  p_client_name TEXT    DEFAULT NULL,
  p_client_ref  TEXT    DEFAULT NULL,
  p_description TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id     UUID    := auth.uid();
  v_case_id     UUID;
  v_last_number INTEGER;
  v_case_number TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Case title is required';
  END IF;

  IF NOT public.is_active_case_member(p_org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  -- Atomically increment case counter.
  -- INSERT ... ON CONFLICT DO UPDATE acquires a row-level lock before
  -- incrementing, preventing concurrent duplicate case numbers.
  INSERT INTO public.enterprise_case_counters (org_id, last_number)
  VALUES (p_org_id, 1)
  ON CONFLICT (org_id) DO UPDATE
    SET last_number = enterprise_case_counters.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO v_last_number;

  v_case_number := 'C-' || lpad(v_last_number::text, 6, '0');

  INSERT INTO public.enterprise_cases (
    org_id, case_number, title, description,
    client_name, client_ref, status, created_by
  ) VALUES (
    p_org_id,
    v_case_number,
    trim(p_title),
    p_description,
    p_client_name,
    p_client_ref,
    'draft',
    v_user_id
  )
  RETURNING id INTO v_case_id;

  -- Write initial status history entry (null -> draft)
  INSERT INTO public.case_status_history (
    case_id, org_id, from_status, to_status, actor_user_id
  ) VALUES (
    v_case_id, p_org_id, NULL, 'draft', v_user_id
  );

  RETURN v_case_id;
END;
$func$;

COMMENT ON FUNCTION public.create_enterprise_case(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Atomically creates an enterprise case and its initial status history entry '
  '(null -> draft). Generates a per-organization sequential case number '
  '(C-000001 format) via INSERT ... ON CONFLICT DO UPDATE on '
  'enterprise_case_counters, preventing concurrent duplicate numbers. '
  'finance_officer is rejected by is_active_case_member(). '
  'Always uses auth.uid() as created_by.';

REVOKE ALL    ON FUNCTION public.create_enterprise_case(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_enterprise_case(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


-- ============================================================
-- Status transition RPC: transition_case_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_case_status(
  p_case_id   UUID,
  p_to_status TEXT,
  p_note      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id     UUID    := auth.uid();
  v_case        RECORD;
  v_role        TEXT;
  v_from_status TEXT;
  v_allowed     BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_case
  FROM public.enterprise_cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_from_status := v_case.status;

  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: not an active case member of this organization';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  IF p_to_status = 'returned_for_revision'
     AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RAISE EXCEPTION 'A note is required when returning a case for revision';
  END IF;

  CASE v_from_status

    WHEN 'draft' THEN
      IF p_to_status IN ('submitted', 'cancelled')
         AND v_role IN ('owner', 'admin', 'head_of_department', 'engineer') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'submitted' THEN
      IF p_to_status IN ('assigned', 'cancelled')
         AND v_role IN ('owner', 'admin', 'head_of_department') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'assigned' THEN
      IF p_to_status = 'under_engineering_review'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        v_allowed := TRUE;
      ELSIF p_to_status = 'cancelled'
         AND v_role IN ('owner', 'admin') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'under_engineering_review' THEN
      IF p_to_status = 'ai_review_attached'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        v_allowed := TRUE;
      ELSIF p_to_status = 'cancelled'
         AND v_role IN ('owner', 'admin') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'ai_review_attached' THEN
      -- E5 TODO: enforce >= 1 accepted ai_report_version before this transition.
      -- In E3 V1, the gate is intentionally not enforced at the schema layer.
      IF p_to_status = 'engineer_review_completed'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'engineer_review_completed' THEN
      IF p_to_status = 'submitted_to_head'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        IF v_case.head_reviewer_id IS NULL THEN
          RAISE EXCEPTION
            'head_reviewer_id must be set on the case before submitting to head of department';
        END IF;
        v_allowed := TRUE;
      END IF;

    WHEN 'submitted_to_head' THEN
      IF p_to_status IN ('approved_internal', 'returned_for_revision')
         AND v_role IN ('owner', 'head_of_department') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'returned_for_revision' THEN
      IF p_to_status = 'under_engineering_review'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'approved_internal' THEN
      IF p_to_status = 'delivered_to_client'
         AND v_role IN ('owner', 'admin', 'head_of_department') THEN
        v_allowed := TRUE;
      ELSIF p_to_status = 'cancelled'
         AND v_role IN ('owner', 'admin') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'delivered_to_client' THEN
      IF p_to_status = 'closed'
         AND v_role IN ('owner', 'admin') THEN
        v_allowed := TRUE;
      END IF;

    WHEN 'closed' THEN
      RAISE EXCEPTION 'Case is closed and cannot be transitioned further';

    WHEN 'cancelled' THEN
      RAISE EXCEPTION 'Case is cancelled and cannot be transitioned further';

    ELSE
      RAISE EXCEPTION 'Unknown current case status: %', v_from_status;

  END CASE;

  IF NOT v_allowed THEN
    RAISE EXCEPTION
      'Transition from % to % is not permitted for role %',
      v_from_status, p_to_status, COALESCE(v_role, 'unknown');
  END IF;

  UPDATE public.enterprise_cases
  SET
    status       = p_to_status,
    submitted_at = CASE WHEN p_to_status = 'submitted'
                        THEN now() ELSE submitted_at END,
    assigned_at  = CASE WHEN p_to_status = 'assigned'
                        THEN now() ELSE assigned_at END,
    completed_at = CASE WHEN p_to_status = 'engineer_review_completed'
                        THEN now() ELSE completed_at END,
    delivered_at = CASE WHEN p_to_status = 'delivered_to_client'
                        THEN now() ELSE delivered_at END,
    closed_at    = CASE WHEN p_to_status = 'closed'
                        THEN now() ELSE closed_at END,
    cancelled_at = CASE WHEN p_to_status = 'cancelled'
                        THEN now() ELSE cancelled_at END,
    updated_at   = now()
  WHERE id = p_case_id;

  INSERT INTO public.case_status_history (
    case_id, org_id, from_status, to_status, actor_user_id, note
  ) VALUES (
    p_case_id, v_case.org_id, v_from_status, p_to_status, v_user_id, p_note
  );

END;
$func$;

COMMENT ON FUNCTION public.transition_case_status(UUID, TEXT, TEXT) IS
  'Validates and executes a case status transition. Enforces the allowed '
  'transition graph and role permissions from the operating model. Atomically '
  'updates enterprise_cases.status, sets the relevant timestamp column, and '
  'appends an immutable row to case_status_history. Terminal states (closed, '
  'cancelled) raise immediately. returned_for_revision requires a non-empty note. '
  'E5 TODO: add ai_report_version gate on ai_review_attached -> engineer_review_completed.';

REVOKE ALL    ON FUNCTION public.transition_case_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_case_status(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- RLS -- enterprise_case_counters
-- ============================================================
ALTER TABLE public.enterprise_case_counters ENABLE ROW LEVEL SECURITY;
-- No client-facing policies. All access via SECURITY DEFINER RPCs only.


-- ============================================================
-- RLS -- enterprise_cases
-- ============================================================
ALTER TABLE public.enterprise_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_select_case_member"
  ON public.enterprise_cases
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

CREATE POLICY "cases_insert_case_member"
  ON public.enterprise_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "cases_update_case_member"
  ON public.enterprise_cases
  FOR UPDATE
  TO authenticated
  USING  (public.is_active_case_member(org_id, auth.uid()))
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

-- No DELETE policy: cases are never hard-deleted in V1.


-- ============================================================
-- RLS -- case_documents
-- ============================================================
ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs_select_case_member"
  ON public.case_documents
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

CREATE POLICY "docs_insert_case_member"
  ON public.case_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "docs_update_uploader_or_manager"
  ON public.case_documents
  FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.is_org_owner_or_admin(org_id, auth.uid())
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR public.is_org_owner_or_admin(org_id, auth.uid())
  );

CREATE POLICY "docs_delete_manager"
  ON public.case_documents
  FOR DELETE
  TO authenticated
  USING (public.is_org_owner_or_admin(org_id, auth.uid()));


-- ============================================================
-- RLS -- case_status_history
-- ============================================================
ALTER TABLE public.case_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_select_case_member"
  ON public.case_status_history
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No INSERT/UPDATE/DELETE policies: immutable, RPC-only writes.


-- ============================================================
-- RLS -- case_notes
-- ============================================================
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_case_member"
  ON public.case_notes
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

CREATE POLICY "notes_insert_case_member"
  ON public.case_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND author_id = auth.uid()
  );

CREATE POLICY "notes_update_author"
  ON public.case_notes
  FOR UPDATE
  TO authenticated
  USING  (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "notes_delete_author_or_manager"
  ON public.case_notes
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_org_owner_or_admin(org_id, auth.uid())
  );


-- ============================================================
-- End of E3 migration.
-- Next phases reference enterprise_cases by FK:
--   E4 -- case_reviews, case_approvals
--   E5 -- case_ai_sessions, ai_report_versions
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation
--   E8 -- enterprise billing (organization_subscriptions)
-- ============================================================