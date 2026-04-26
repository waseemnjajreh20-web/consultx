-- ============================================================
-- Enterprise Reviews + Approvals Schema (Phase E4)
--
-- Adds the review and approval workflow tables:
--   1. case_reviews             -- engineer review records per case
--   2. case_review_comments     -- internal feedback comments on reviews
--   3. case_approvals           -- head/owner approval decisions (immutable)
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
--   * AI binding (case_ai_sessions, ai_report_versions, engineer_decision
--     on ai_report_versions) is DEFERRED to Phase E5.
--     case_reviews.findings is free-form JSONB in E4.
--   * Client portal access to reviews/approvals is DEFERRED to Phase E9.
--   * Report branding and customization are DEFERRED.
--   * case_approvals rows are IMMUTABLE (append-only). No UPDATE or DELETE
--     policies. New decisions create new rows.
--   * decision='rejected' is recorded in case_approvals but maps to
--     returned_for_revision at the enterprise_cases status level in V1.
--     A terminal 'rejected' case status is DEFERRED pending operating
--     model amendment (12-status graph has no rejected terminal state).
--   * admin role CANNOT approve/return/reject per the operating model
--     permission matrix (only owner and head_of_department may decide).
--   * submit_case_review advances case to engineer_review_completed only
--     when case is in ai_review_attached status (transition graph requires
--     under_engineering_review -> ai_review_attached -> engineer_review_completed).
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
  summary          TEXT,
  findings         JSONB        NOT NULL DEFAULT '[]',
  recommendation   TEXT,
  submitted_at     TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  returned_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_reviews IS
  'Engineer review records for enterprise cases. A case may have multiple '
  'reviews across revision cycles (returned_for_revision loops). Each review '
  'is submitted to the head of department for approval via submit_case_review(). '
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

CREATE INDEX IF NOT EXISTS idx_case_reviews_case_status
  ON public.case_reviews (case_id, status);

DROP TRIGGER IF EXISTS update_case_reviews_updated_at ON public.case_reviews;
CREATE TRIGGER update_case_reviews_updated_at
  BEFORE UPDATE ON public.case_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- B. case_review_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_review_comments (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id    UUID         NOT NULL
                 REFERENCES public.case_reviews(id) ON DELETE CASCADE,
  case_id      UUID         NOT NULL
                 REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id       UUID         NOT NULL
                 REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id    UUID         NOT NULL REFERENCES auth.users(id),
  body         TEXT         NOT NULL,
  comment_type TEXT         NOT NULL DEFAULT 'internal'
    CHECK (comment_type IN ('internal', 'revision_request', 'approval_note')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_review_comments_body_not_blank CHECK (length(trim(body)) > 0)
);

COMMENT ON TABLE public.case_review_comments IS
  'Comments attached to a specific case review. Covers internal discussion, '
  'revision request rationale (comment_type=revision_request), and notes '
  'accompanying approval decisions (comment_type=approval_note). '
  'org_id is denormalized from enterprise_cases for RLS efficiency. '
  'finance_officer is excluded from all access via is_active_case_member(). '
  'Client portal visibility for comments is DEFERRED to Phase E9. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md';

CREATE INDEX IF NOT EXISTS idx_case_review_comments_review_id
  ON public.case_review_comments (review_id);

CREATE INDEX IF NOT EXISTS idx_case_review_comments_case_id
  ON public.case_review_comments (case_id);

CREATE INDEX IF NOT EXISTS idx_case_review_comments_org_id
  ON public.case_review_comments (org_id);

CREATE INDEX IF NOT EXISTS idx_case_review_comments_author_id
  ON public.case_review_comments (author_id);

DROP TRIGGER IF EXISTS update_case_review_comments_updated_at
  ON public.case_review_comments;
CREATE TRIGGER update_case_review_comments_updated_at
  BEFORE UPDATE ON public.case_review_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- C. case_approvals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_approvals (
  id          UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id     UUID         NOT NULL
                REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id      UUID         NOT NULL
                REFERENCES public.organizations(id) ON DELETE CASCADE,
  review_id   UUID
                REFERENCES public.case_reviews(id) ON DELETE SET NULL,
  decided_by  UUID         NOT NULL REFERENCES auth.users(id),
  decision    TEXT         NOT NULL
    CHECK (decision IN ('approved', 'returned_for_revision', 'rejected')),
  note        TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
  -- Intentionally no updated_at: approval rows are NEVER modified after insert.
);

COMMENT ON TABLE public.case_approvals IS
  'Immutable approval/return/rejection decisions by head_of_department or owner. '
  'Rows are NEVER updated or deleted -- each decision is an append-only audit record. '
  'Only decide_case_approval() RPC writes to this table. '
  'decision=rejected records a rejection but maps to returned_for_revision at the '
  'enterprise_cases status level in V1 (no terminal rejected status exists in the '
  '12-status lifecycle graph). A terminal rejected case status requires an operating '
  'model amendment before it can be added. '
  'admin role cannot create approval records per the operating model permission matrix. '
  'finance_officer is excluded from all access via is_active_case_member(). '
  'AI binding is DEFERRED to Phase E5. '
  'Client portal access is DEFERRED to Phase E9. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md';

CREATE INDEX IF NOT EXISTS idx_case_approvals_case_id
  ON public.case_approvals (case_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_org_id
  ON public.case_approvals (org_id);

CREATE INDEX IF NOT EXISTS idx_case_approvals_decided_by
  ON public.case_approvals (decided_by);

CREATE INDEX IF NOT EXISTS idx_case_approvals_decision
  ON public.case_approvals (decision);

-- No updated_at trigger: case_approvals rows are immutable.


-- ============================================================
-- D. submit_case_review RPC
--
-- Creates or updates a draft review and marks it submitted.
-- If an existing draft by the same reviewer exists for the case,
-- it is updated to submitted. Otherwise a new submitted row is inserted.
-- Optionally advances case to engineer_review_completed if the case
-- is currently in ai_review_attached status.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_case_review(
  p_case_id        UUID,
  p_summary        TEXT,
  p_findings       JSONB DEFAULT '[]',
  p_recommendation TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id           UUID   := auth.uid();
  v_case              RECORD;
  v_role              TEXT;
  v_review_id         UUID;
  v_existing_draft_id UUID;
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

  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  -- Locate an existing draft review by this reviewer for this case.
  -- If one exists, update it; otherwise insert a new submitted row.
  SELECT id INTO v_existing_draft_id
  FROM public.case_reviews
  WHERE case_id          = p_case_id
    AND reviewer_user_id = v_user_id
    AND status           = 'draft'
  LIMIT 1;

  IF v_existing_draft_id IS NOT NULL THEN
    UPDATE public.case_reviews
    SET
      summary        = trim(p_summary),
      findings       = COALESCE(p_findings, '[]'::jsonb),
      recommendation = p_recommendation,
      status         = 'submitted',
      submitted_at   = now(),
      updated_at     = now()
    WHERE id = v_existing_draft_id;
    v_review_id := v_existing_draft_id;
  ELSE
    INSERT INTO public.case_reviews (
      case_id, org_id, reviewer_user_id,
      summary, findings, recommendation,
      status, submitted_at
    ) VALUES (
      p_case_id,
      v_case.org_id,
      v_user_id,
      trim(p_summary),
      COALESCE(p_findings, '[]'::jsonb),
      p_recommendation,
      'submitted',
      now()
    )
    RETURNING id INTO v_review_id;
  END IF;

  -- Optionally advance case to engineer_review_completed.
  -- Only valid when case is in ai_review_attached: the E3 transition graph
  -- requires under_engineering_review -> ai_review_attached -> engineer_review_completed.
  -- A case in under_engineering_review cannot jump directly to engineer_review_completed.
  -- transition_case_status uses auth.uid() internally; SECURITY DEFINER does not
  -- change the JWT claims session setting, so auth.uid() resolves to the same
  -- calling user within the nested call.
  IF v_case.status = 'ai_review_attached'
     AND (v_role IN ('owner', 'admin', 'head_of_department')
          OR public.is_case_assignee(p_case_id, v_user_id)) THEN
    PERFORM public.transition_case_status(p_case_id, 'engineer_review_completed', NULL);
  END IF;

  RETURN v_review_id;
END;
$func$;

COMMENT ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) IS
  'Creates or updates a draft engineer review and marks it submitted. '
  'If an existing draft review by the same reviewer exists for the case it '
  'is updated to submitted; otherwise a new submitted row is inserted. '
  'Optionally advances case to engineer_review_completed via '
  'transition_case_status when case is in ai_review_attached status. '
  'Cases in under_engineering_review are not advanced automatically -- '
  'the engineer must attach AI evidence first (E5 binding gate). '
  'finance_officer is excluded by is_active_case_member(). '
  'Returns the case_reviews UUID.';

REVOKE ALL    ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_case_review(UUID, TEXT, JSONB, TEXT) TO authenticated;


-- ============================================================
-- E. decide_case_approval RPC
--
-- Records an immutable approval/return/rejection decision.
-- Inserts a case_approvals row, updates the linked case_reviews
-- status, and calls transition_case_status to advance the case
-- and write case_status_history.
-- Only owner and head_of_department may call this function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_case_approval(
  p_case_id   UUID,
  p_decision  TEXT,
  p_note      TEXT  DEFAULT NULL,
  p_review_id UUID  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id           UUID   := auth.uid();
  v_case              RECORD;
  v_role              TEXT;
  v_approval_id       UUID;
  v_review_id         UUID   := p_review_id;
  v_case_target_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_decision NOT IN ('approved', 'returned_for_revision', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: must be approved, returned_for_revision, or rejected';
  END IF;

  -- returned_for_revision and rejected both require a mandatory note.
  IF p_decision IN ('returned_for_revision', 'rejected')
     AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RAISE EXCEPTION 'A note is required when decision is %', p_decision;
  END IF;

  SELECT * INTO v_case
  FROM public.enterprise_cases
  WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  v_role := public.get_org_member_role(v_case.org_id, v_user_id);

  -- Only owner and head_of_department may make approval decisions.
  -- admin is explicitly excluded per the operating model permission matrix.
  -- See: docs/enterprise/enterprise-operating-model-v1.md, Role Matrix table,
  -- "Approve / return case" row.
  IF v_role NOT IN ('owner', 'head_of_department') THEN
    RAISE EXCEPTION
      'Access denied: only owner and head_of_department can make approval decisions (role: %)',
      COALESCE(v_role, 'unknown');
  END IF;

  -- Case must be in submitted_to_head to accept an approval decision.
  IF v_case.status != 'submitted_to_head' THEN
    RAISE EXCEPTION
      'Case must be in submitted_to_head status to receive an approval decision (current: %)',
      v_case.status;
  END IF;

  -- If no review_id provided, auto-resolve the most recent submitted review.
  IF v_review_id IS NULL THEN
    SELECT id INTO v_review_id
    FROM public.case_reviews
    WHERE case_id = p_case_id
      AND status  = 'submitted'
    ORDER BY submitted_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
    -- v_review_id may remain NULL if no submitted review exists.
    -- The approval is still recorded; review_id is nullable in case_approvals.
  END IF;

  -- Insert the immutable approval record.
  INSERT INTO public.case_approvals (
    case_id, org_id, review_id, decided_by, decision, note
  ) VALUES (
    p_case_id, v_case.org_id, v_review_id, v_user_id, p_decision, p_note
  )
  RETURNING id INTO v_approval_id;

  -- Update the linked review's status and timestamp if one was resolved.
  IF v_review_id IS NOT NULL THEN
    UPDATE public.case_reviews
    SET
      status      = CASE
                      WHEN p_decision = 'approved' THEN 'accepted'
                      ELSE 'returned'
                    END,
      accepted_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
      returned_at = CASE WHEN p_decision IN ('returned_for_revision', 'rejected')
                         THEN now() ELSE NULL END,
      updated_at  = now()
    WHERE id = v_review_id;
  END IF;

  -- Map the approval decision to the enterprise_cases status transition.
  -- decision=rejected maps to returned_for_revision at the case level in V1:
  -- the 12-status lifecycle graph has no terminal 'rejected' status.
  -- A rejected decision is auditable via case_approvals.decision; the case
  -- is returned to the engineer for resolution. A future operating model
  -- amendment may introduce a terminal rejected case status.
  v_case_target_status := CASE
    WHEN p_decision = 'approved'                              THEN 'approved_internal'
    WHEN p_decision IN ('returned_for_revision', 'rejected')  THEN 'returned_for_revision'
  END;

  -- Call transition_case_status which validates the transition, updates
  -- enterprise_cases.status, and writes an immutable case_status_history row.
  -- SECURITY DEFINER does not alter the JWT claims session setting;
  -- auth.uid() resolves to the same calling user inside the nested call.
  -- The role check inside transition_case_status (owner/head_of_department
  -- for submitted_to_head transitions) matches the check already performed above.
  PERFORM public.transition_case_status(p_case_id, v_case_target_status, p_note);

  RETURN v_approval_id;
END;
$func$;

COMMENT ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT, UUID) IS
  'Records an immutable approval decision by head_of_department or owner. '
  'Inserts a case_approvals row, updates the linked case_reviews status, '
  'and calls transition_case_status to advance enterprise_cases.status and '
  'write an immutable case_status_history row. '
  'decision=approved: transitions case to approved_internal, review to accepted. '
  'decision=returned_for_revision: transitions case to returned_for_revision, '
  'review to returned. '
  'decision=rejected: records rejection in case_approvals, maps to '
  'returned_for_revision at the case status level in V1 (no terminal rejected '
  'case status in the 12-status lifecycle graph). '
  'admin role is explicitly excluded per the operating model permission matrix. '
  'Both returned_for_revision and rejected require a non-empty note. '
  'auth.uid() context is preserved inside the nested transition_case_status call. '
  'Returns the new case_approvals UUID.';

REVOKE ALL    ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_case_approval(UUID, TEXT, TEXT, UUID) TO authenticated;


-- ============================================================
-- RLS -- case_reviews
-- ============================================================
ALTER TABLE public.case_reviews ENABLE ROW LEVEL SECURITY;

-- All active case members (excl. finance_officer) can read all reviews.
CREATE POLICY "reviews_select_case_member"
  ON public.case_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- Any active case member can insert their own review (reviewer_user_id = self).
-- The recommended path is submit_case_review() RPC; direct INSERT exists for
-- owner/admin flexibility (e.g. creating a draft before submitting).
CREATE POLICY "reviews_insert_case_member"
  ON public.case_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND reviewer_user_id = auth.uid()
  );

-- Reviewer can update their own review; owner and head_of_department can manage.
CREATE POLICY "reviews_update_reviewer_or_manager"
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

-- No DELETE policy in E4: reviews are permanent audit records.


-- ============================================================
-- RLS -- case_review_comments
-- ============================================================
ALTER TABLE public.case_review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_comments_select_case_member"
  ON public.case_review_comments
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

CREATE POLICY "review_comments_insert_case_member"
  ON public.case_review_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND author_id = auth.uid()
  );

-- Author can update their own comment body.
CREATE POLICY "review_comments_update_author"
  ON public.case_review_comments
  FOR UPDATE
  TO authenticated
  USING  (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Author or manager (owner/head_of_department) can delete a comment.
CREATE POLICY "review_comments_delete_author_or_manager"
  ON public.case_review_comments
  FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.get_org_member_role(org_id, auth.uid()) IN ('owner', 'head_of_department')
  );


-- ============================================================
-- RLS -- case_approvals
-- ============================================================
ALTER TABLE public.case_approvals ENABLE ROW LEVEL SECURITY;

-- All active case members (excl. finance_officer) can read approval records.
CREATE POLICY "approvals_select_case_member"
  ON public.case_approvals
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No INSERT policy: all writes via decide_case_approval() SECURITY DEFINER RPC.
-- No UPDATE policy: approval records are immutable.
-- No DELETE policy: approval records are immutable.


-- ============================================================
-- End of E4 migration.
-- Next phases reference case_reviews / case_approvals:
--   E5 -- case_ai_sessions, ai_report_versions, engineer_decision binding
--         (will add FK from ai_report_versions to case_reviews if needed)
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation (case review workflow UI)
--   E8 -- enterprise billing (organization_subscriptions)
-- ============================================================