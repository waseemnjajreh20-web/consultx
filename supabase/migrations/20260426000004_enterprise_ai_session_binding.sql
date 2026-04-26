-- ============================================================
-- Enterprise AI Session Binding (Phase E5)
--
-- Adds the AI output binding layer for ConsultX Enterprise cases:
--   1. case_ai_sessions      -- links a chat conversation to a case
--   2. ai_report_versions    -- frozen, immutable AI output snapshots
--   3. case_review_ai_reports -- join table: accepted AI reports linked to
--                               engineer reviews (typed FK integrity)
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify enterprise_cases, case_documents,
--     case_status_history, case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch fire-safety-chat or fire-safety-chat-v2
--   * does NOT touch billing or auth
--   * does NOT touch the Analytical Mode pipeline
--
-- E5 RESOLVES the E3 TODO in transition_case_status:
--   The ai_review_attached -> engineer_review_completed transition now
--   requires at least one ai_report_versions row on the case with
--   engineer_decision IN ('accepted', 'accepted_with_notes').
--   transition_case_status is replaced via CREATE OR REPLACE FUNCTION
--   with identical signature; all other transition behavior is preserved.
--
-- Key design decisions:
--   * AI output is advisory only. AI never moves case status autonomously.
--     All transitions require a human actor.
--   * engineer_decision must be recorded before an AI report can be used
--     as evidence in a case review. Only 'accepted' or 'accepted_with_notes'
--     reports are eligible for case_review_ai_reports.
--   * ai_report_versions AI content columns (response_content, sources,
--     model_name, etc.) are immutable after insert. The engineer_decision
--     fields are the only mutable portion, set exactly once via
--     decide_ai_report_version() RPC.
--   * case_review_ai_reports rows are append-only: no UPDATE or DELETE
--     policies. Cascade from case_reviews handles review deletion.
--   * conversation_id: nullable UUID reference to the conversations table.
--     No FK in E5 -- conversations is a non-enterprise system table whose
--     lifecycle is not governed by this migration. A FK may be added in a
--     later migration once cross-system lifecycle rules are defined.
--   * PDF report rendering and report branding are DEFERRED.
--   * Frontend display of AI sessions and reports is DEFERRED to E7.
--   * Client portal access to AI sessions and reports is DEFERRED to E9.
--   * finance_officer is excluded from ALL AI session/report access via
--     is_active_case_member() -- same exclusion pattern as E3/E4.
--
-- Migration tracking note:
--   CLI tracking is divergent (31 local-only, 57+ remote-only, 0 matched).
--   Apply manually via controlled temporary node-pg direct transaction.
--   Do NOT use supabase db push.
--
-- Operating model: docs/enterprise/enterprise-operating-model-v1.md
-- ============================================================


-- ============================================================
-- A. case_ai_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_ai_sessions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id         UUID        NOT NULL
                    REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id          UUID        NOT NULL
                    REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id),
  session_mode    TEXT        NOT NULL
    CHECK (session_mode IN ('advisory', 'analytical')),
  status          TEXT        NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'failed')),
  title           TEXT,
  conversation_id UUID,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT case_ai_sessions_completed_at_status CHECK (
    completed_at IS NULL
    OR status IN ('completed', 'failed')
  )
);

COMMENT ON TABLE public.case_ai_sessions IS
  'Links a chat conversation (Advisory or Analytical mode) to a specific '
  'enterprise case. One session may produce multiple ai_report_versions. '
  'session_mode identifies whether Advisory or Analytical AI was used. '
  'conversation_id optionally references the conversations table but carries '
  'no FK in E5 (cross-system lifecycle not yet governed). '
  'finance_officer is excluded from all access via is_active_case_member(). '
  'Raw transcript storage (full message history) is DEFERRED. '
  'Frontend display is DEFERRED to E7. Client portal access is DEFERRED to E9. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md section 9.';


-- ============================================================
-- B. ai_report_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_report_versions (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id            UUID        NOT NULL
                          REFERENCES public.case_ai_sessions(id) ON DELETE CASCADE,
  case_id               UUID        NOT NULL
                          REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  org_id                UUID        NOT NULL
                          REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by            UUID        NOT NULL REFERENCES auth.users(id),
  report_mode           TEXT        NOT NULL
    CHECK (report_mode IN ('advisory', 'analytical')),
  version_number        INTEGER     NOT NULL DEFAULT 1
    CHECK (version_number > 0),
  title                 TEXT        NOT NULL,
  prompt_snapshot       TEXT,
  response_content      TEXT        NOT NULL,
  output_language       TEXT        NOT NULL DEFAULT 'en'
    CHECK (output_language IN ('en', 'ar')),
  model_provider        TEXT        NOT NULL DEFAULT 'google',
  model_name            TEXT        NOT NULL,
  sources               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  citations             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  evidence_json         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  confidence_note       TEXT,
  engineer_decision     TEXT        NOT NULL DEFAULT 'pending'
    CHECK (engineer_decision IN (
      'pending', 'accepted', 'rejected', 'accepted_with_notes', 'needs_revision'
    )),
  engineer_decision_note TEXT,
  decided_by            UUID        REFERENCES auth.users(id),
  decided_at            TIMESTAMPTZ,
  document_id           UUID        REFERENCES public.case_documents(id)
                          ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_report_versions_session_version_unique
    UNIQUE (session_id, version_number),
  CONSTRAINT ai_report_versions_title_not_blank
    CHECK (length(trim(title)) > 0),
  CONSTRAINT ai_report_versions_response_not_blank
    CHECK (length(trim(response_content)) > 0),
  CONSTRAINT ai_report_versions_note_required CHECK (
    engineer_decision NOT IN ('accepted_with_notes', 'needs_revision')
    OR (engineer_decision_note IS NOT NULL
        AND length(trim(engineer_decision_note)) > 0)
  ),
  CONSTRAINT ai_report_versions_decision_fields_consistent CHECK (
    (engineer_decision = 'pending'
     AND decided_by IS NULL
     AND decided_at IS NULL)
    OR
    (engineer_decision != 'pending'
     AND decided_by IS NOT NULL
     AND decided_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.ai_report_versions IS
  'Frozen, immutable snapshots of AI Advisory or Analytical outputs attached '
  'to enterprise cases as evidence. AI content columns (response_content, '
  'sources, model_name, model_provider, etc.) are set on creation and never '
  'updated. The engineer_decision fields are the only mutable portion, set '
  'exactly once via decide_ai_report_version(). '
  'Only accepted or accepted_with_notes versions may be linked to a case_review '
  'via the case_review_ai_reports join table. '
  'AI output is advisory only -- AI never moves case status autonomously. '
  'sources stores structured [{type, code, page, snippet, retrieval_score}] for '
  'SBC clause auditability. evidence_json stores analytical payload. '
  'PDF rendering and report branding are DEFERRED. '
  'finance_officer excluded via is_active_case_member(). '
  'Client portal access is DEFERRED to E9. '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md section 9.';

-- ============================================================
-- C. case_review_ai_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_review_ai_reports (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id         UUID        NOT NULL
                      REFERENCES public.case_reviews(id) ON DELETE CASCADE,
  report_version_id UUID        NOT NULL
                      REFERENCES public.ai_report_versions(id) ON DELETE RESTRICT,
  org_id            UUID        NOT NULL
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_by         UUID        NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Intentionally no updated_at: link records are never modified.
  -- Cascade from case_reviews handles cleanup when a review is deleted.
  CONSTRAINT case_review_ai_reports_unique
    UNIQUE (review_id, report_version_id)
);

COMMENT ON TABLE public.case_review_ai_reports IS
  'Join table linking accepted AI report versions to engineer case reviews. '
  'Provides FK integrity for AI evidence cited in a review: '
  'ON DELETE RESTRICT on ai_report_versions prevents deletion of a report '
  'that has been cited in a review. ON DELETE CASCADE from case_reviews '
  'removes links when a review is deleted. '
  'Only accepted or accepted_with_notes ai_report_versions may be linked '
  '(enforced by link_ai_report_to_review() RPC). '
  'All writes are via link_ai_report_to_review() SECURITY DEFINER RPC only. '
  'Rows are append-only: no UPDATE or DELETE policies. '
  'finance_officer excluded via is_active_case_member(). '
  'Operating model: docs/enterprise/enterprise-operating-model-v1.md section 9.';


-- ============================================================
-- D. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_case_ai_sessions_case_id
  ON public.case_ai_sessions (case_id);

CREATE INDEX IF NOT EXISTS idx_case_ai_sessions_org_id
  ON public.case_ai_sessions (org_id);

CREATE INDEX IF NOT EXISTS idx_case_ai_sessions_created_by
  ON public.case_ai_sessions (created_by);

CREATE INDEX IF NOT EXISTS idx_case_ai_sessions_status
  ON public.case_ai_sessions (status);

CREATE INDEX IF NOT EXISTS idx_case_ai_sessions_case_mode
  ON public.case_ai_sessions (case_id, session_mode);


CREATE INDEX IF NOT EXISTS idx_ai_report_versions_session_id
  ON public.ai_report_versions (session_id);

CREATE INDEX IF NOT EXISTS idx_ai_report_versions_case_id
  ON public.ai_report_versions (case_id);

CREATE INDEX IF NOT EXISTS idx_ai_report_versions_org_id
  ON public.ai_report_versions (org_id);

CREATE INDEX IF NOT EXISTS idx_ai_report_versions_created_by
  ON public.ai_report_versions (created_by);

CREATE INDEX IF NOT EXISTS idx_ai_report_versions_engineer_decision
  ON public.ai_report_versions (engineer_decision);

-- Composite: used by the E5 gate in transition_case_status
CREATE INDEX IF NOT EXISTS idx_ai_report_versions_case_decision
  ON public.ai_report_versions (case_id, engineer_decision);


CREATE INDEX IF NOT EXISTS idx_case_review_ai_reports_review_id
  ON public.case_review_ai_reports (review_id);

CREATE INDEX IF NOT EXISTS idx_case_review_ai_reports_report_version_id
  ON public.case_review_ai_reports (report_version_id);

CREATE INDEX IF NOT EXISTS idx_case_review_ai_reports_org_id
  ON public.case_review_ai_reports (org_id);


-- ============================================================
-- E. updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS update_case_ai_sessions_updated_at
  ON public.case_ai_sessions;
CREATE TRIGGER update_case_ai_sessions_updated_at
  BEFORE UPDATE ON public.case_ai_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_report_versions_updated_at
  ON public.ai_report_versions;
CREATE TRIGGER update_ai_report_versions_updated_at
  BEFORE UPDATE ON public.ai_report_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- No updated_at trigger on case_review_ai_reports: rows are immutable.


-- ============================================================
-- F. RLS
-- ============================================================
ALTER TABLE public.case_ai_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_report_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_review_ai_reports ENABLE ROW LEVEL SECURITY;

-- case_ai_sessions policies
CREATE POLICY "case_ai_sessions_select"
  ON public.case_ai_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

CREATE POLICY "case_ai_sessions_insert"
  ON public.case_ai_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_case_member(org_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "case_ai_sessions_update"
  ON public.case_ai_sessions
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_org_member_role(org_id, auth.uid())
         IN ('owner', 'admin', 'head_of_department')
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.get_org_member_role(org_id, auth.uid())
         IN ('owner', 'admin', 'head_of_department')
  );

-- No DELETE policy: sessions are audit records.

-- ai_report_versions policies
CREATE POLICY "ai_report_versions_select"
  ON public.ai_report_versions
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No direct INSERT policy: all inserts via attach_ai_report_version() RPC.

CREATE POLICY "ai_report_versions_update"
  ON public.ai_report_versions
  FOR UPDATE
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()))
  WITH CHECK (public.is_active_case_member(org_id, auth.uid()));

-- No DELETE policy: AI report versions are permanent evidence.

-- case_review_ai_reports policies
CREATE POLICY "case_review_ai_reports_select"
  ON public.case_review_ai_reports
  FOR SELECT
  TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- No direct INSERT policy: all inserts via link_ai_report_to_review() RPC.
-- No UPDATE policy: link records are immutable.
-- No DELETE policy: cascade from case_reviews handles cleanup.

-- ============================================================
-- G. RPC: create_case_ai_session
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_case_ai_session(
  p_case_id         UUID,
  p_session_mode    TEXT,
  p_title           TEXT DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id    UUID := auth.uid();
  v_case       RECORD;
  v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_session_mode NOT IN ('advisory', 'analytical') THEN
    RAISE EXCEPTION 'Invalid session_mode: must be advisory or analytical';
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

  IF v_case.status IN ('closed', 'cancelled', 'delivered_to_client') THEN
    RAISE EXCEPTION
      'Cannot create AI session: case is in a terminal or delivered status (current: %)',
      v_case.status;
  END IF;

  INSERT INTO public.case_ai_sessions (
    case_id, org_id, created_by,
    session_mode, status, title, conversation_id
  ) VALUES (
    p_case_id,
    v_case.org_id,
    v_user_id,
    p_session_mode,
    'started',
    p_title,
    p_conversation_id
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$func$;

COMMENT ON FUNCTION public.create_case_ai_session(UUID, TEXT, TEXT, UUID) IS
  'Creates a new AI session linked to a case. '
  'session_mode must be advisory or analytical. '
  'Rejects creation on terminal (closed, cancelled, delivered_to_client) cases. '
  'Does NOT automatically transition case status. '
  'finance_officer excluded by is_active_case_member(). '
  'Returns the new case_ai_sessions UUID.';

REVOKE ALL    ON FUNCTION public.create_case_ai_session(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_case_ai_session(UUID, TEXT, TEXT, UUID) TO authenticated;


-- ============================================================
-- H. RPC: attach_ai_report_version
-- ============================================================
CREATE OR REPLACE FUNCTION public.attach_ai_report_version(
  p_session_id       UUID,
  p_title            TEXT,
  p_response_content TEXT,
  p_report_mode      TEXT,
  p_model_name       TEXT,
  p_sources          JSONB   DEFAULT '[]'::jsonb,
  p_citations        JSONB   DEFAULT '[]'::jsonb,
  p_evidence_json    JSONB   DEFAULT '{}'::jsonb,
  p_output_language  TEXT    DEFAULT 'en',
  p_confidence_note  TEXT    DEFAULT NULL,
  p_prompt_snapshot  TEXT    DEFAULT NULL,
  p_model_provider   TEXT    DEFAULT 'google',
  p_document_id      UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id   UUID    := auth.uid();
  v_session   RECORD;
  v_version   INTEGER;
  v_report_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_session
  FROM public.case_ai_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI session not found';
  END IF;

  IF NOT public.is_active_case_member(v_session.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Report title is required';
  END IF;

  IF p_response_content IS NULL OR length(trim(p_response_content)) = 0 THEN
    RAISE EXCEPTION 'Report response_content is required';
  END IF;

  IF p_report_mode NOT IN ('advisory', 'analytical') THEN
    RAISE EXCEPTION 'Invalid report_mode: must be advisory or analytical';
  END IF;

  IF p_report_mode != v_session.session_mode THEN
    RAISE EXCEPTION
      'report_mode (%) must match session session_mode (%)',
      p_report_mode, v_session.session_mode;
  END IF;

  IF p_output_language NOT IN ('en', 'ar') THEN
    RAISE EXCEPTION 'Invalid output_language: must be en or ar';
  END IF;

  IF p_document_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.case_documents
      WHERE id      = p_document_id
        AND case_id = v_session.case_id
        AND org_id  = v_session.org_id
    ) THEN
      RAISE EXCEPTION
        'document_id does not belong to the same case and organization as this session';
    END IF;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version
  FROM public.ai_report_versions
  WHERE session_id = p_session_id;

  INSERT INTO public.ai_report_versions (
    session_id, case_id, org_id, created_by,
    report_mode, version_number,
    title, prompt_snapshot, response_content,
    output_language, model_provider, model_name,
    sources, citations, evidence_json,
    confidence_note, document_id,
    engineer_decision
  ) VALUES (
    p_session_id,
    v_session.case_id,
    v_session.org_id,
    v_user_id,
    p_report_mode,
    v_version,
    trim(p_title),
    p_prompt_snapshot,
    p_response_content,
    p_output_language,
    p_model_provider,
    p_model_name,
    COALESCE(p_sources,       '[]'::jsonb),
    COALESCE(p_citations,     '[]'::jsonb),
    COALESCE(p_evidence_json, '{}'::jsonb),
    p_confidence_note,
    p_document_id,
    'pending'
  )
  RETURNING id INTO v_report_id;

  UPDATE public.case_ai_sessions
  SET status       = 'completed',
      completed_at = now(),
      updated_at   = now()
  WHERE id = p_session_id;

  RETURN v_report_id;
END;
$func$;

COMMENT ON FUNCTION public.attach_ai_report_version(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Freezes an AI output as an immutable ai_report_versions record. '
  'Assigns version_number = max(existing for this session) + 1. '
  'Validates report_mode matches parent session session_mode. '
  'Validates document_id belongs to same case/org if provided. '
  'Sets engineer_decision = pending. Marks parent session as completed. '
  'Engineer decisions are made via decide_ai_report_version(). '
  'finance_officer excluded by is_active_case_member(). '
  'Returns the new ai_report_versions UUID.';

REVOKE ALL    ON FUNCTION public.attach_ai_report_version(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_ai_report_version(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ============================================================
-- I. RPC: decide_ai_report_version
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_ai_report_version(
  p_report_version_id UUID,
  p_decision          TEXT,
  p_decision_note     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID   := auth.uid();
  v_report  RECORD;
  v_case    RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_report
  FROM public.ai_report_versions
  WHERE id = p_report_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI report version not found';
  END IF;

  IF NOT public.is_active_case_member(v_report.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected', 'accepted_with_notes', 'needs_revision') THEN
    RAISE EXCEPTION
      'Invalid decision: must be accepted, rejected, accepted_with_notes, or needs_revision';
  END IF;

  IF p_decision IN ('accepted_with_notes', 'needs_revision')
     AND (p_decision_note IS NULL OR length(trim(p_decision_note)) = 0) THEN
    RAISE EXCEPTION
      'A decision_note is required when decision is %', p_decision;
  END IF;

  IF v_report.engineer_decision != 'pending' THEN
    RAISE EXCEPTION
      'AI report version has already been decided (current decision: %); '
      'decisions are immutable once recorded',
      v_report.engineer_decision;
  END IF;

  SELECT * INTO v_case
  FROM public.enterprise_cases
  WHERE id = v_report.case_id;

  IF v_case.status IN ('closed', 'cancelled', 'delivered_to_client') THEN
    RAISE EXCEPTION
      'Cannot record decision: case is in a terminal or delivered status (current: %)',
      v_case.status;
  END IF;

  UPDATE public.ai_report_versions
  SET engineer_decision      = p_decision,
      engineer_decision_note = p_decision_note,
      decided_by             = v_user_id,
      decided_at             = now(),
      updated_at             = now()
  WHERE id = p_report_version_id;

  RETURN p_report_version_id;
END;
$func$;

COMMENT ON FUNCTION public.decide_ai_report_version(UUID, TEXT, TEXT) IS
  'Records the engineer decision on an AI report version. '
  'Decision is immutable: only pending reports can be decided. '
  'accepted_with_notes and needs_revision require a non-empty decision_note. '
  'accepted and accepted_with_notes reports become eligible for '
  'case_review_ai_reports via link_ai_report_to_review(). '
  'rejected and needs_revision reports cannot be linked to case reviews. '
  'Rejects decisions on terminal (closed, cancelled, delivered_to_client) cases. '
  'finance_officer excluded by is_active_case_member(). '
  'Returns the ai_report_versions UUID.';

REVOKE ALL    ON FUNCTION public.decide_ai_report_version(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_ai_report_version(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- J. RPC: link_ai_report_to_review
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_ai_report_to_review(
  p_review_id         UUID,
  p_report_version_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID   := auth.uid();
  v_review  RECORD;
  v_report  RECORD;
  v_link_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_review
  FROM public.case_reviews
  WHERE id = p_review_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case review not found';
  END IF;

  SELECT * INTO v_report
  FROM public.ai_report_versions
  WHERE id = p_report_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI report version not found';
  END IF;

  IF v_review.case_id != v_report.case_id
     OR v_review.org_id != v_report.org_id THEN
    RAISE EXCEPTION
      'Review and AI report version must belong to the same case and organization';
  END IF;

  IF NOT public.is_active_case_member(v_review.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: user is not an active case member of this organization';
  END IF;

  IF v_report.engineer_decision NOT IN ('accepted', 'accepted_with_notes') THEN
    RAISE EXCEPTION
      'Only accepted or accepted_with_notes AI report versions can be linked to '
      'a case review (current decision: %)',
      v_report.engineer_decision;
  END IF;

  INSERT INTO public.case_review_ai_reports (
    review_id, report_version_id, org_id, linked_by
  ) VALUES (
    p_review_id, p_report_version_id, v_review.org_id, v_user_id
  )
  ON CONFLICT (review_id, report_version_id) DO NOTHING
  RETURNING id INTO v_link_id;

  IF v_link_id IS NULL THEN
    SELECT id INTO v_link_id
    FROM public.case_review_ai_reports
    WHERE review_id         = p_review_id
      AND report_version_id = p_report_version_id;
  END IF;

  RETURN v_link_id;
END;
$func$;

COMMENT ON FUNCTION public.link_ai_report_to_review(UUID, UUID) IS
  'Links an accepted AI report version to an engineer case review as evidence. '
  'Only accepted or accepted_with_notes ai_report_versions may be linked. '
  'Review and report must belong to the same case and organization. '
  'Idempotent: if the link already exists, returns the existing link id. '
  'finance_officer excluded by is_active_case_member(). '
  'Returns the case_review_ai_reports UUID.';

REVOKE ALL    ON FUNCTION public.link_ai_report_to_review(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_ai_report_to_review(UUID, UUID) TO authenticated;

-- ============================================================
-- K. transition_case_status REPLACEMENT (E5 gate)
--
-- Replaces the E3 function via CREATE OR REPLACE FUNCTION.
-- Identical signature. The ONLY behavioral change: the E3 TODO
-- in the ai_review_attached WHEN block is replaced with a live
-- enforcement gate requiring at least one ai_report_versions row
-- with engineer_decision IN ('accepted', 'accepted_with_notes').
-- All other transition logic is byte-for-byte identical to E3.
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
      -- E5 gate (resolves E3 TODO): require at least one ai_report_version
      -- with engineer_decision IN ('accepted', 'accepted_with_notes').
      -- Enforces that AI output has been human-reviewed and accepted before
      -- it is used as supporting evidence for the head of department.
      IF p_to_status = 'engineer_review_completed'
         AND (v_role IN ('owner', 'admin', 'head_of_department')
              OR public.is_case_assignee(p_case_id, v_user_id)) THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.ai_report_versions
          WHERE case_id           = p_case_id
            AND engineer_decision IN ('accepted', 'accepted_with_notes')
        ) THEN
          RAISE EXCEPTION
            'Cannot transition to engineer_review_completed: at least one AI '
            'report version must be accepted (accepted or accepted_with_notes) '
            'before the engineer review can be completed';
        END IF;
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
  'E5 gate (resolves E3 TODO): ai_review_attached -> engineer_review_completed '
  'now requires at least one ai_report_versions row for the case with '
  'engineer_decision IN (''accepted'', ''accepted_with_notes'').';

REVOKE ALL    ON FUNCTION public.transition_case_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_case_status(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- End of E5 migration.
-- E5 establishes the AI output binding layer and the engineer
-- decision audit trail. transition_case_status E5 gate enforced.
-- Next phases:
--   E6 -- enterprise-aware check-subscription extension
--   E7 -- enterprise UI foundation
--   E8 -- enterprise billing (organization_subscriptions)
--   E9 -- client portal (AI report visibility deferred)
-- ============================================================