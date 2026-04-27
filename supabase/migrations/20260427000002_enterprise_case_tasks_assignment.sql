-- ============================================================
-- E7.10C: Enterprise Case Tasks + Assignment Workflow
-- Migration: 20260427000002_enterprise_case_tasks_assignment
-- ============================================================
-- Unblocks the internal case workflow.
--
-- The current production blocker is structural:
--   * enterprise_cases.assigned_engineer_id and head_reviewer_id exist as
--     nullable FK columns since E3.
--   * transition_case_status hard-fails when going to submitted_to_head if
--     head_reviewer_id IS NULL.
--   * submit_case_review auto-calls that transition.
--   * The UI has no way to set either FK -- so the entire review/approval
--     surface is unreachable in real usage.
--
-- E7.10C adds:
--   1. case_tasks            -- granular work items per case (assign/track/handoff)
--   2. case_task_events      -- append-only status transitions for tasks
--
-- RPCs:
--   assign_enterprise_case        -- set assigned_engineer_id and/or head_reviewer_id
--                                    (owner/admin/head_of_department)
--   create_case_task              -- create a task on a case
--   update_case_task              -- edit task fields (assignment, priority, due, etc.)
--   transition_case_task          -- move a task between statuses (with state machine)
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify enterprise_cases, case_documents, case_status_history,
--     case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify case_ai_sessions, ai_report_versions, case_review_ai_reports (E5)
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify organization_branding_settings (E7.6)
--   * does NOT modify org_messages, org_member_presence (E7.7)
--   * does NOT modify user_public_profiles, org_member_profiles (E7.8)
--   * does NOT modify the enterprise-case-documents storage bucket (E7.9)
--   * does NOT modify case_client_contacts, case_public_tracking,
--     case_public_updates (E7.10A)
--   * does NOT modify subscription_plans, user_subscriptions, payment_transactions
--   * does NOT touch fire-safety-chat, fire-safety-chat-v2, Analytical pipeline
--   * does NOT alter any existing RPC -- the existing transition_case_status
--     and submit_case_review are reused as-is.
-- ============================================================


-- ============================================================
-- A. case_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_tasks (
  id           UUID         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID         NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  case_id      UUID         NOT NULL REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  title        TEXT         NOT NULL,
  description  TEXT,
  assigned_to  UUID         REFERENCES auth.users(id),
  created_by   UUID         NOT NULL REFERENCES auth.users(id),
  status       TEXT         NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'submitted', 'completed', 'cancelled')),
  priority     TEXT         NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at       TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT case_tasks_title_not_blank CHECK (length(trim(title)) > 0)
);

COMMENT ON TABLE public.case_tasks IS
  'Granular work items attached to an enterprise case. Drives the assignment '
  'and handoff layer that was missing before E7.10C. assigned_to is nullable '
  '(unassigned tasks are valid until a manager picks an owner). org_id is '
  'denormalized from enterprise_cases for RLS efficiency. Writes go through '
  'create_case_task / update_case_task / transition_case_task RPCs which '
  'enforce the role and state-machine rules.';

CREATE INDEX IF NOT EXISTS idx_case_tasks_org_id      ON public.case_tasks (org_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_case_id     ON public.case_tasks (case_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_assigned_to ON public.case_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_tasks_created_by  ON public.case_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_case_tasks_status      ON public.case_tasks (status);
CREATE INDEX IF NOT EXISTS idx_case_tasks_priority    ON public.case_tasks (priority);
CREATE INDEX IF NOT EXISTS idx_case_tasks_due_at      ON public.case_tasks (due_at);


-- ============================================================
-- B. case_task_events  (append-only status transitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_task_events (
  id            UUID         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID         NOT NULL REFERENCES public.case_tasks(id)       ON DELETE CASCADE,
  org_id        UUID         NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  case_id       UUID         NOT NULL REFERENCES public.enterprise_cases(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT         NOT NULL,
  actor_user_id UUID         NOT NULL REFERENCES auth.users(id),
  note          TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.case_task_events IS
  'Append-only audit trail for case task state transitions. Mirrors the '
  'case_status_history pattern. No UPDATE/DELETE policies; rows are written '
  'exclusively by the RPC layer (create_case_task and transition_case_task). '
  'from_status is NULL on the initial creation event.';

CREATE INDEX IF NOT EXISTS idx_case_task_events_task_id    ON public.case_task_events (task_id);
CREATE INDEX IF NOT EXISTS idx_case_task_events_case_id    ON public.case_task_events (case_id);
CREATE INDEX IF NOT EXISTS idx_case_task_events_org_id     ON public.case_task_events (org_id);
CREATE INDEX IF NOT EXISTS idx_case_task_events_created_at ON public.case_task_events (created_at DESC);


-- ============================================================
-- C. updated_at trigger on case_tasks
-- ============================================================
DROP TRIGGER IF EXISTS update_case_tasks_updated_at ON public.case_tasks;
CREATE TRIGGER update_case_tasks_updated_at
  BEFORE UPDATE ON public.case_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- D. RLS
-- ============================================================
ALTER TABLE public.case_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_task_events ENABLE ROW LEVEL SECURITY;

-- case_tasks: SELECT for all active case members. INSERT/UPDATE go through
-- RPCs (SECURITY DEFINER), so no client-side write policies are needed.
DROP POLICY IF EXISTS "case_tasks_select_members" ON public.case_tasks;
CREATE POLICY "case_tasks_select_members"
  ON public.case_tasks
  FOR SELECT TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));

-- case_task_events: SELECT-only for all active case members.
DROP POLICY IF EXISTS "case_task_events_select_members" ON public.case_task_events;
CREATE POLICY "case_task_events_select_members"
  ON public.case_task_events
  FOR SELECT TO authenticated
  USING (public.is_active_case_member(org_id, auth.uid()));


-- ============================================================
-- E. RPC: assign_enterprise_case
--    Sets enterprise_cases.assigned_engineer_id and/or head_reviewer_id.
--    Owner / admin / head_of_department only.
--    Optionally auto-transitions submitted -> assigned when an engineer is
--    set on a case currently in submitted status.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_enterprise_case(
  p_case_id              UUID,
  p_assigned_engineer_id UUID DEFAULT NULL,
  p_head_reviewer_id     UUID DEFAULT NULL,
  p_note                 TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id           UUID := auth.uid();
  v_case              RECORD;
  v_caller_role       TEXT;
  v_engineer_role     TEXT;
  v_head_role         TEXT;
  v_assigned_was_null BOOLEAN := FALSE;
  v_new_assigned      UUID;
  v_new_head          UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id, status, assigned_engineer_id, head_reviewer_id
    INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_caller_role := public.get_org_member_role(v_case.org_id, v_user_id);
  IF v_caller_role NOT IN ('owner', 'admin', 'head_of_department') THEN
    RAISE EXCEPTION
      'Only owner, admin, or head_of_department may assign cases (caller role: %)',
      COALESCE(v_caller_role, 'unknown');
  END IF;

  -- Validate the engineer assignee, if provided.
  IF p_assigned_engineer_id IS NOT NULL THEN
    v_engineer_role := public.get_org_member_role(v_case.org_id, p_assigned_engineer_id);
    IF v_engineer_role IS NULL THEN
      RAISE EXCEPTION 'Engineer assignee is not an active member of this organization';
    END IF;
    IF v_engineer_role = 'finance_officer' THEN
      RAISE EXCEPTION 'finance_officer cannot be assigned as case engineer';
    END IF;
    -- engineer / head_of_department / owner / admin are all acceptable.
  END IF;

  -- Validate the head reviewer assignee, if provided.
  IF p_head_reviewer_id IS NOT NULL THEN
    v_head_role := public.get_org_member_role(v_case.org_id, p_head_reviewer_id);
    IF v_head_role IS NULL THEN
      RAISE EXCEPTION 'Head reviewer assignee is not an active member of this organization';
    END IF;
    IF v_head_role NOT IN ('head_of_department', 'owner') THEN
      RAISE EXCEPTION
        'Head reviewer must be head_of_department or owner (got: %)', v_head_role;
    END IF;
  END IF;

  v_new_assigned := COALESCE(p_assigned_engineer_id, v_case.assigned_engineer_id);
  v_new_head     := COALESCE(p_head_reviewer_id,     v_case.head_reviewer_id);

  IF v_case.assigned_engineer_id IS NULL AND p_assigned_engineer_id IS NOT NULL THEN
    v_assigned_was_null := TRUE;
  END IF;

  UPDATE public.enterprise_cases
     SET assigned_engineer_id = v_new_assigned,
         head_reviewer_id     = v_new_head,
         assigned_at          = CASE
           WHEN v_assigned_was_null THEN now()
           ELSE assigned_at
         END,
         updated_at           = now()
   WHERE id = p_case_id;

  -- Optional auto-transition: if the case is currently in submitted and we
  -- just attached an engineer, advance it to assigned. transition_case_status
  -- will validate the transition and write case_status_history.
  IF v_case.status = 'submitted'
     AND p_assigned_engineer_id IS NOT NULL THEN
    PERFORM public.transition_case_status(p_case_id, 'assigned', p_note);
  END IF;
END;
$func$;

COMMENT ON FUNCTION public.assign_enterprise_case(UUID, UUID, UUID, TEXT) IS
  'Sets enterprise_cases.assigned_engineer_id and/or head_reviewer_id. '
  'Restricted to owner/admin/head_of_department. Engineer assignee may be '
  'any non-finance_officer active member; head reviewer must be '
  'head_of_department or owner. When the case is in submitted status and '
  'an engineer is being assigned, transition_case_status(submitted->assigned) '
  'is called automatically (which writes case_status_history).';

REVOKE ALL ON FUNCTION public.assign_enterprise_case(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_enterprise_case(UUID, UUID, UUID, TEXT) TO authenticated;


-- ============================================================
-- F. RPC: create_case_task
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_case_task(
  p_case_id     UUID,
  p_title       TEXT,
  p_description TEXT        DEFAULT NULL,
  p_assigned_to UUID        DEFAULT NULL,
  p_priority    TEXT        DEFAULT 'normal',
  p_due_at      TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id      UUID := auth.uid();
  v_case         RECORD;
  v_caller_role  TEXT;
  v_assignee_role TEXT;
  v_priority     TEXT := COALESCE(NULLIF(trim(p_priority), ''), 'normal');
  v_title        TEXT := NULLIF(trim(COALESCE(p_title, '')), '');
  v_task_id      UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Task title is required';
  END IF;

  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority: %', v_priority;
  END IF;

  SELECT id, org_id, assigned_engineer_id INTO v_case
    FROM public.enterprise_cases
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  -- is_active_case_member excludes finance_officer.
  IF NOT public.is_active_case_member(v_case.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Access denied: not an active case member of this organization';
  END IF;

  v_caller_role := public.get_org_member_role(v_case.org_id, v_user_id);

  -- Owner/admin/head can create on any case. Engineer can create only on
  -- a case they are assigned to (avoids creating tasks on cases they have
  -- no operational stake in).
  IF v_caller_role = 'engineer' THEN
    IF v_case.assigned_engineer_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION
        'Engineers may only create tasks on cases assigned to themselves';
    END IF;
  ELSIF v_caller_role NOT IN ('owner', 'admin', 'head_of_department') THEN
    RAISE EXCEPTION 'Not authorized to create tasks on this case';
  END IF;

  -- Validate the assignee, if provided. finance_officer is excluded.
  IF p_assigned_to IS NOT NULL THEN
    v_assignee_role := public.get_org_member_role(v_case.org_id, p_assigned_to);
    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Task assignee is not an active member of this organization';
    END IF;
    IF v_assignee_role = 'finance_officer' THEN
      RAISE EXCEPTION 'finance_officer cannot be assigned to case tasks';
    END IF;
  END IF;

  INSERT INTO public.case_tasks (
    org_id, case_id, title, description,
    assigned_to, created_by, status, priority, due_at
  )
  VALUES (
    v_case.org_id, p_case_id, v_title,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    p_assigned_to, v_user_id, 'open', v_priority, p_due_at
  )
  RETURNING id INTO v_task_id;

  -- Initial creation event: from_status NULL -> open.
  INSERT INTO public.case_task_events (
    task_id, org_id, case_id, from_status, to_status, actor_user_id, note
  )
  VALUES (
    v_task_id, v_case.org_id, p_case_id, NULL, 'open', v_user_id, NULL
  );

  RETURN v_task_id;
END;
$func$;

COMMENT ON FUNCTION public.create_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) IS
  'Creates a case_tasks row plus an initial creation event. Owner/admin/head '
  'can create tasks on any case in their org. Engineers can create tasks only '
  'on cases assigned to themselves. finance_officer cannot be the caller or '
  'the assignee.';

REVOKE ALL ON FUNCTION public.create_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- G. RPC: update_case_task
--    Owner/admin/head can update any field. The assignee can update their
--    own task's title/description/priority/due_at -- but cannot reassign
--    or change status (status changes go through transition_case_task).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_case_task(
  p_task_id     UUID,
  p_title       TEXT        DEFAULT NULL,
  p_description TEXT        DEFAULT NULL,
  p_assigned_to UUID        DEFAULT NULL,
  p_priority    TEXT        DEFAULT NULL,
  p_due_at      TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id        UUID := auth.uid();
  v_task           RECORD;
  v_caller_role    TEXT;
  v_assignee_role  TEXT;
  v_is_manager     BOOLEAN;
  v_is_self_owner  BOOLEAN;
  v_new_priority   TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.id, t.org_id, t.case_id, t.assigned_to, t.status
    INTO v_task
    FROM public.case_tasks t
   WHERE t.id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  v_caller_role   := public.get_org_member_role(v_task.org_id, v_user_id);
  v_is_manager    := v_caller_role IN ('owner', 'admin', 'head_of_department');
  v_is_self_owner := v_task.assigned_to IS NOT DISTINCT FROM v_user_id;

  IF NOT (v_is_manager OR v_is_self_owner) THEN
    RAISE EXCEPTION 'Not authorized to edit this task';
  END IF;

  -- Self-editor restrictions: cannot reassign the task to someone else.
  IF NOT v_is_manager AND p_assigned_to IS NOT NULL
     AND p_assigned_to IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only owner/admin/head_of_department may reassign a task';
  END IF;

  IF p_priority IS NOT NULL THEN
    v_new_priority := COALESCE(NULLIF(trim(p_priority), ''), 'normal');
    IF v_new_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
      RAISE EXCEPTION 'Invalid priority: %', v_new_priority;
    END IF;
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    v_assignee_role := public.get_org_member_role(v_task.org_id, p_assigned_to);
    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Task assignee is not an active member of this organization';
    END IF;
    IF v_assignee_role = 'finance_officer' THEN
      RAISE EXCEPTION 'finance_officer cannot be assigned to case tasks';
    END IF;
  END IF;

  UPDATE public.case_tasks
     SET
       title       = COALESCE(NULLIF(trim(COALESCE(p_title, '')),       ''), title),
       description = CASE
         WHEN p_description IS NULL THEN description
         ELSE NULLIF(trim(p_description), '')
       END,
       assigned_to = CASE
         WHEN v_is_manager AND p_assigned_to IS NOT NULL THEN p_assigned_to
         ELSE assigned_to
       END,
       priority    = COALESCE(v_new_priority, priority),
       due_at      = CASE
         WHEN p_due_at IS NULL THEN due_at
         ELSE p_due_at
       END,
       updated_at  = now()
   WHERE id = p_task_id;
END;
$func$;

COMMENT ON FUNCTION public.update_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) IS
  'Edits non-status fields on a case task. Owner/admin/head_of_department '
  'may edit any field (including reassignment). The current assignee may '
  'edit title/description/priority/due_at on their own task but may not '
  'reassign it. Status changes go through transition_case_task.';

REVOKE ALL ON FUNCTION public.update_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_case_task(UUID, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- H. RPC: transition_case_task
--    State machine:
--      open         -> in_progress | blocked | cancelled
--      in_progress  -> blocked | submitted | completed | cancelled
--      blocked      -> in_progress | cancelled
--      submitted    -> in_progress | completed | cancelled
--      completed    -> in_progress     (reopen, owner/admin/head only)
--      cancelled    -> [terminal]
-- ============================================================
CREATE OR REPLACE FUNCTION public.transition_case_task(
  p_task_id   UUID,
  p_to_status TEXT,
  p_note      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id     UUID := auth.uid();
  v_task        RECORD;
  v_caller_role TEXT;
  v_is_manager  BOOLEAN;
  v_is_assignee BOOLEAN;
  v_allowed     BOOLEAN := FALSE;
  v_completed_at_new TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_to_status NOT IN ('open', 'in_progress', 'blocked', 'submitted', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid task status: %', p_to_status;
  END IF;

  SELECT t.id, t.org_id, t.case_id, t.assigned_to, t.status, t.completed_at
    INTO v_task
    FROM public.case_tasks t
   WHERE t.id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status = p_to_status THEN
    -- No-op: avoids spurious task event spam if UI double-fires.
    RETURN;
  END IF;

  v_caller_role := public.get_org_member_role(v_task.org_id, v_user_id);
  v_is_manager  := v_caller_role IN ('owner', 'admin', 'head_of_department');
  v_is_assignee := v_task.assigned_to IS NOT DISTINCT FROM v_user_id;

  IF NOT (v_is_manager OR v_is_assignee) THEN
    RAISE EXCEPTION 'Not authorized to transition this task';
  END IF;

  -- Allowed transitions (from -> to).
  CASE v_task.status
    WHEN 'open' THEN
      v_allowed := p_to_status IN ('in_progress', 'blocked', 'cancelled');
    WHEN 'in_progress' THEN
      v_allowed := p_to_status IN ('blocked', 'submitted', 'completed', 'cancelled');
    WHEN 'blocked' THEN
      v_allowed := p_to_status IN ('in_progress', 'cancelled');
    WHEN 'submitted' THEN
      v_allowed := p_to_status IN ('in_progress', 'completed', 'cancelled');
    WHEN 'completed' THEN
      -- Reopen path: only managers may move a completed task back to in_progress.
      v_allowed := (v_is_manager AND p_to_status = 'in_progress');
    WHEN 'cancelled' THEN
      v_allowed := FALSE;
    ELSE
      v_allowed := FALSE;
  END CASE;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Disallowed task transition: % -> %', v_task.status, p_to_status;
  END IF;

  -- Assignee restrictions: an assignee who is not also a manager may only
  -- move their own task to in_progress / blocked / submitted (no completed,
  -- no cancelled). Managers and owners of completed tasks (the actor who
  -- finished them) can finalize.
  IF NOT v_is_manager THEN
    IF p_to_status NOT IN ('in_progress', 'blocked', 'submitted') THEN
      RAISE EXCEPTION
        'Only owner/admin/head_of_department may transition a task to %', p_to_status;
    END IF;
  END IF;

  -- completed_at bookkeeping: set when entering completed; clear on reopen.
  v_completed_at_new := CASE
    WHEN p_to_status = 'completed'  THEN now()
    WHEN p_to_status = 'in_progress' AND v_task.status = 'completed' THEN NULL
    ELSE v_task.completed_at
  END;

  UPDATE public.case_tasks
     SET status       = p_to_status,
         completed_at = v_completed_at_new,
         updated_at   = now()
   WHERE id = p_task_id;

  INSERT INTO public.case_task_events (
    task_id, org_id, case_id, from_status, to_status, actor_user_id, note
  )
  VALUES (
    p_task_id, v_task.org_id, v_task.case_id,
    v_task.status, p_to_status, v_user_id,
    NULLIF(trim(COALESCE(p_note, '')), '')
  );
END;
$func$;

COMMENT ON FUNCTION public.transition_case_task(UUID, TEXT, TEXT) IS
  'Moves a case task between statuses subject to a state machine. Assignees '
  'may move their own task through in_progress/blocked/submitted only. '
  'Owner/admin/head_of_department may make any allowed transition, including '
  'completed and the completed -> in_progress reopen path. Writes a row to '
  'case_task_events. Sets completed_at on completion; clears it on reopen.';

REVOKE ALL ON FUNCTION public.transition_case_task(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_case_task(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- End of E7.10C migration.
-- Adds the assignment + task workflow that unlocks the existing review and
-- approval surface (which already enforces head_reviewer_id at the DB layer).
-- No edge function or storage changes. No public/anon surface added here.
-- ============================================================