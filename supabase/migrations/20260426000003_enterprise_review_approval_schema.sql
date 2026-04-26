-- ============================================================
-- Enterprise Review + Approval Schema (Phase E4)
--
-- Adds the review and approval workflow tables:
--   1. case_reviews   -- engineer review records linked to enterprise_cases
--   2. case_approvals -- head/owner approval decisions (immutable, append-only)
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify enterprise_cases, case_documents,
--     case_status_history, case_notes, enterprise_case_counters (E3)
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch billing, auth, or Analytical Mode
--
-- Key design decisions:
--   * finance_officer is excluded from ALL review/approval access via
--     is_active_case_member() -- same exclusion pattern as E3.
--   * admin role CANNOT make approval decisions per the operating model
--     permission matrix (only owner and head_of_department may decide).
--     See: docs/enterprise/enterprise-operating-model-v1.md, Role Matrix.
--   * case_approvals rows are IMMUTABLE (append-only). No UPDATE or DELETE
--     policies. No updated_at column. New decisions create new rows.
--   * V1 decisions: approved and returned_for_revision only.
--     Permanent case termination uses cancelled via transition_case_status.
--   * AI binding (case_ai_sessions, ai_report_versions, engineer_decision)
--     is DEFERRED to Phase E5. case_reviews.findings is free-form JSONB.
--   * Client portal access to reviews/approvals is DEFERRED to Phase E9.
--   * Report branding and customization are DEFERRED.
--   * submit_case_review advances case to submitted_to_head only when case
--     is in engineer_review_completed (direct path). When case is in
--     returned_for_revision the review is created but no auto-transition
--     occurs -- the engineer must re-enter the workflow via
--     transition_case_status(returned_for_revision -> under_engineering_review)
--     then advance through the normal review cycle.
--
-- Migration tracking note:
--   CLI tracking is divergent (31 local-only, 57+ remote-only, 0 matched).
--   Apply manually via Supabase Dashboard SQL Editor.
--   Do NOT use supabase db push.
--
-- Operating model: docs/enterprise/enterprise-operating-model-v1.md
--
-- Subsequent phases:
--   E5 -- case_ai_sessions, ai_report_versions, engineer_decision binding
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation
--   E8 -- enterprise billing (organization_subscriptions)
-- ============================================================


-- ============================================================
-- A. case_reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_reviews (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id          UUID         NOT NULL
                     REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id           UUID         NOT NULL
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  reviewer_user_id UUID         NOT NULL REFERENCES auth.users(id),
  status           TEXT         NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'returned', 'accepted')),
  revision_number  INTEGER      NOT NULL DEFAULT 1,
  summary          TEXT         NOT NULL,
  findings         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  recommendation   TEXT,
  submitted_at     TIMESTAMPTZ,
  returned_at      TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_reviews_summary_not_blank   CHECK (length(trim(summary)) > 0),
  CONSTRAINT case_reviews_revision_positive   CHECK (revision_number > 0),
  CONSTRAINT case_reviews_case_revision_unique UNIQUE (case_id, revision_number)
);

COMMENT ON TABLE public.case_reviews IS
  'Engineer review records for enterprise cases. A case may have multiple '
  'reviews across revision cycles (returned_for_revision loops), each tracked '
  'by revision_number. Submitted reviews are evaluated by the head of department '
  'via decide_case_approval(). '
  'findings is free-form JSONB in E4; structured AI evidence links are DEFERRED '
  'to Phase E5 (case_ai_sessions, ai_report_versions). '
  'finance_officer is excluded from all access via is_active_case_member(). '
  'Client portal access is DEFERRED to Phase E9. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md';

CREATE INDEX IF NOT EXISTS idx_case_reviews_case_id
  ON public.case_reviews (case_id);

CREATE INDEX IF NOT EXISTS idx_case_reviews_org_id
  ON public.case_reviews (org_id);

CREATE INDEX IF NOT EXISTS idx_case_reviews_reviewer_user_id
  ON public.case_reviews (reviewer_user_id);

CREATE INDEX IF NOT EXISTS idx_case_reviews_status
  ON public.case_reviews (status);

CREATE INDEX IF NOT EXISTS idx_case_reviews_case_revision
  ON public.case_reviews (case_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_case_reviews_case_status
  ON public.case_reviews (case_id, status);

DROP TRIGGER IF EXISTS update_case_reviews_updated_at ON public.case_reviews;
CREATE TRIGGER update_case_reviews_updated_at
  BEFORE UPDATE ON public.case_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- B. case_approvals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_approvals (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id          UUID         NOT NULL
                     REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  review_id        UUID         NOT NULL
                     REFERENCES public.case_reviews(id) ON DELETE CASCADE,
  org_id           UUID         NOT NULL
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  approver_user_id UUID         NOT NULL REFERENCES auth.users(id),
  decision         TEXT         NOT NULL
    CHECK (decision IN ('approved', 'returned_for_revision')),
  decision_note    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Intentionally no updated_at: approval rows are NEVER modified after insert.
  CONSTRAINT case_approvals_note_required_when_returned CHECK (
    decision != 'returned_for_revision'
    OR (decision_note IS NOT NULL AND length(trim(decision_note)) > 0)
  )
);

COMMENT ON TABLE public.case_approvals IS
  'Immutable approval/return decisions by head_of_department or owner. '
  'Rows are NEVER updated or deleted -- each decision is an append-only '
  'audit record. Only decide_case_approval() RPC writes to this table. '
  'decision=returned_for_revision requires a non-empty decision_note '
  '(enforced by CHECK constraint and RPC). '
  'V1 decisions: approved and returned_for_revision only. '
  'Permanent case termination uses cancelled via transition_case_status. '
  'admin role cannot create approval records per the operating model. '
  'finance_officer is excluded from all access via is_active_case_member(). '
  'AI binding is DEFERRED to Phase E5. '
  'Client portal access is DEFERRED to Phase E9. '
  'Report branding and customization are DEFERRED. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md';

CREATE INDEX IF NOT EXISTS idx_case_approvals_case_id
  ON public.case_approvals (case_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_review_id
  ON public.case_approvals (review_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_org_id
  ON public.case_approvals (org_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_approver_user_id
  ON public.case_approvals (approver_user_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_decision
  ON public.case_approvals (decision);

-- No updated_at trigger: case_approvals rows are immutable.


-- ============================================================
-- C. submit_case_review RPC
--
-- Creates a new engineer review for a case and optionally advances
-- the case to submitted_to_head when case status allows.
-- Always inserts a new revision (revision_number = max + 1) rather
-- than updating an existing row, preserving the full revision history.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_case_review(
  p_case_id        UUID,
  p_summary        TEXT,
  p_findings       JSONB DEFAULT '[]'::jsonb,
  p_recommendation TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id        UUID    := auth.uid();
  v_case           RECORD;
  v_role           TEXT;
  v_revision       INTEGER;
  v_review_id      UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_summary IS NULL OR length(trim(p_summary)) = 0 THEN
    RAISE EXCEPTION 'Review summary is required';
  END IF;

  SELECT * INTO v_case
  FROM public.enterprise_cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  -- is_active_case_member excludes finance_officer by design.
  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  -- Permitted case statuses for submitting a review.
  -- engineer_review_completed: primary path -- review is ready for head.
  -- returned_for_revision: engineer creates revised review after return;
  --   no auto-transition in this case (case must re-enter workflow manually).
  -- ai_review_attached is intentionally excluded: the engineer should
  --   complete the review step (engineer_review_completed) before submitting.
  IF v_case.status NOT IN ('engineer_review_completed', 'returned_for_revision') THEN
    RAISE EXCEPTION
      'Cannot submit review: case must be in engineer_review_completed or '
      'returned_for_revision (current: %)', v_case.status;
  END IF;

  -- Determine the next revision number for this case.
  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_revision
  FROM public.case_reviews
  WHERE case_id = p_case_id;

  -- Insert a new submitted review row.
  INSERT INTO public.case_reviews (
    case_id, org_id, reviewer_user_id,
    revision_number, summary, findings, recommendation,
    status, submitted_at
  ) VALUES (
    p_case_id,
    v_case.org_id,
    v_user_id,
    v_revision,
    trim(p_summary),
    COALESCE(p_findings, '[]'::jsonb),
    p_recommendation,
    'submitted',
    now()
  )
  RETURNING id INTO v_review_id;

  -- Advance case to submitted_to_head when status is engineer_review_completed.
  -- transition_case_status validates the transition, sets the timestamp, and
  -- writes an immutable case_status_history row. It uses auth.uid() internally;
  -- SECURITY DEFINER does not alter the JWT claims session setting, so
  -- auth.uid() resolves to the same calling user inside the nested call.
  -- transition_case_status will raise if head_reviewer_id is not set on the case.
  IF v_case.status = 'engineer_review_completed' THEN
    PERFORM public.transition_case_status(p_case_id, 'submitted_to_head', NULL);
  END IF;

  -- For returned_for_revision: review is created but case status is NOT
  -- automatically advanced. The engineer must call transition_case_status(
  -- case_id, 'under_engineering_review') to formally re-enter the workflow,
  -- then progress through the normal cycle before the next submission
  -- triggers the submitted_to_head transition above.

  RETURN v_review_id;
END;
$func$;

COMMENT ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) IS
  'Creates a new engineer review (new revision) for a case and marks it submitted. '
  'Always inserts a new row with revision_number = max(existing) + 1 to preserve '
  'the full revision history. '
  'If case is in engineer_review_completed, calls transition_case_status to '
  'advance case to submitted_to_head (requires head_reviewer_id set on case). '
  'If case is in returned_for_revision, review is created without auto-transition; '
  'engineer must re-enter workflow via transition_case_status first. '
  'finance_officer is excluded by is_active_case_member(). '
  'Returns the new case_reviews UUID.';

REVOKE ALL    ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) TO authenticated;


-- ============================================================
-- D. decide_case_approval RPC
--
-- Records an immutable approval/return decision by head_of_department
-- or owner. Inserts a case_approvals row, updates the linked review
-- status, and calls transition_case_status to advance the case and
-- write case_status_history.
-- admin role is explicitly NOT permitted per operating model.
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_case_approval(
  p_case_id      UUID,
  p_decision     TEXT,
  p_decision_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id         UUID   := auth.uid();
  v_case            RECORD;
  v_role            TEXT;
  v_review_id       UUID;
  v_approval_id     UUID;
  v_target_status   TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_decision NOT IN ('approved', 'returned_for_revision') THEN
    RAISE EXCEPTION 'Invalid decision: must be approved or returned_for_revision';
  END IF;

  IF p_decision = 'returned_for_revision'
     AND (p_decision_note IS NULL OR length(trim(p_decision_note)) = 0) THEN
    RAISE EXCEPTION 'A decision_note is required when decision is returned_for_revision';
  END IF;

  SELECT * INTO v_case
  FROM public.enterprise_cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  -- is_active_case_member excludes finance_officer by design.
  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  -- Only owner and head_of_department may make approval decisions.
  -- admin is explicitly excluded per the operating model permission matrix:
  -- "Approve / return case: owner=YES, admin=NO, head_of_department=YES"
  IF v_role NOT IN ('owner', 'head_of_department') THEN
    RAISE EXCEPTION
      'Access denied: only owner and head_of_department can approve or return cases (role: %)',
      COALESCE(v_role, 'unknown');
  END IF;

  IF v_case.status != 'submitted_to_head' THEN
    RAISE EXCEPTION
      'Case must be in submitted_to_head status for an approval decision (current: %)',
      v_case.status;
  END IF;

  -- Find the most recent submitted review for this case.
  SELECT id INTO v_review_id
  FROM public.case_reviews
  WHERE case_id = p_case_id
    AND status  = 'submitted'
  ORDER BY revision_number DESC, submitted_at DESC NULLS LAST
  LIMIT 1;

  IF v_review_id IS NULL THEN
    RAISE EXCEPTION 'No submitted review found for case: a review must be submitted before approval';
  END IF;

  -- Insert the immutable approval record.
  INSERT INTO public.case_approvals (
    case_id, review_id, org_id, approver_user_id, decision, decision_note
  ) VALUES (
    p_case_id, v_review_id, v_case.org_id, v_user_id, p_decision, p_decision_note
  )
  RETURNING id INTO v_approval_id;

  -- Update the linked review status.
  IF p_decision = 'approved' THEN
    UPDATE public.case_reviews
    SET status      = 'accepted',
        accepted_at = now(),
        updated_at  = now()
    WHERE id = v_review_id;
  ELSE
    UPDATE public.case_reviews
    SET status     = 'returned',
        returned_at = now(),
        updated_at  = now()
    WHERE id = v_review_id;
  END IF;

  -- Map decision to case status and call transition_case_status.
  -- transition_case_status validates role (owner/head_of_department for
  -- submitted_to_head transitions), updates enterprise_cases.status, and
  -- writes an immutable case_status_history row.
  -- SECURITY DEFINER does not alter the JWT claims session setting;
  -- auth.uid() resolves to the same calling user inside the nested call.
  v_target_status := CASE
    WHEN p_decision = 'approved'             THEN 'approved_internal'
    WHEN p_decision = 'returned_for_revision' THEN 'returned_for_revision'
  END;

  PERFORM public.transition_case_status(p_case_id, v_target_status, p_decision_note);

  RETURN v_approval_id;
END;
$func$;

COMMENT ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT) IS
  'Records an immutable approval/return decision by head_of_department or owner. '
  'Inserts a case_approvals row, updates the linked case_reviews status, '
  'and calls transition_case_status to advance enterprise_cases.status and '
  'write an immutable case_status_history row. '
  'decision=approved: review->accepted, case->approved_internal. '
  'decision=returned_for_revision: review->returned, case->returned_for_revision; '
  'requires non-empty decision_note (enforced by RPC and CHECK constraint). '
  'admin role is explicitly excluded per the operating model permission matrix. '
  'finance_officer is excluded by is_active_case_member(). '
  'Returns the new case_approvals UUID.';

REVOKE ALL    ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- RLS -- case_reviews
-- ============================================================
ALTER TABLE public.case_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_reviews_select"
  ON public.case_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- Any active case member may insert their own review (self-assertion).
-- The recommended path is submit_case_review() RPC (which creates submitted
-- reviews directly). Direct INSERT allows draft creation from the UI.
CREATE POLICY "case_reviews_insert"
  ON public.case_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND reviewer_user_id = auth.uid()
  );

-- Reviewer may update their own review; owner and head_of_department may manage.
CREATE POLICY "case_reviews_update"
  ON public.case_reviews
  FOR UPDATE
  TO authenticated
  USING (
    reviewer_user_id = auth.uid()
    OR public.get_org_member_role(org_id, auth.uid()) IN ('owner', 'head_of_department')
  )
  WITH CHECK (
    reviewer_user_id = auth.uid()
    OR public.get_org_member_role(org_id, auth.uid()) IN ('owner', 'head_of_department')
  );

-- No DELETE policy: reviews are permanent audit records.


-- ============================================================
-- RLS -- case_approvals
-- ============================================================
ALTER TABLE public.case_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_approvals_select"
  ON public.case_approvals
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No INSERT policy: all writes via decide_case_approval() SECURITY DEFINER RPC.
-- No UPDATE policy: approval records are immutable.
-- No DELETE policy: approval records are immutable.


-- ============================================================
-- End of E4 migration.
-- E4 establishes the review/approval audit trail.
-- Next phases:
--   E5 -- case_ai_sessions, ai_report_versions, engineer_decision binding
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation (case review/approval workflow)
--   E8 -- enterprise billing (organization_subscriptions)
-- ============================================================