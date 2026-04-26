-- ============================================================
-- Enterprise Collaboration & Presence (Phase E7.7)
--
-- Adds:
--   1. org_member_presence  -- online-presence heartbeat per member
--   2. org_messages         -- org-wide message board
--
-- RPCs:
--   touch_org_presence(p_org_id)           -- upsert presence row
--   send_org_message(p_org_id, p_body)     -- insert message
--   edit_org_message(p_message_id, p_body) -- author-only edit
--   soft_delete_org_message(p_message_id)  -- author or admin soft-delete
--
-- ADDITIVE ONLY. This migration:
--   * does NOT modify organizations, org_members, org_invitations (E2)
--   * does NOT modify enterprise_cases, case_documents,
--     case_status_history, case_notes, enterprise_case_counters (E3)
--   * does NOT modify case_reviews, case_approvals (E4)
--   * does NOT modify case_ai_sessions, ai_report_versions,
--     case_review_ai_reports (E5)
--   * does NOT modify organization_branding_settings,
--     accept_org_invitation, revoke_org_invitation,
--     update_org_member_role, update_org_member_status,
--     upsert_organization_branding (E7.6)
--   * does NOT modify user_subscriptions, payment_transactions,
--     profiles, or subscription_plans
--   * does NOT alter any existing edge function behavior
--   * does NOT touch fire-safety-chat or fire-safety-chat-v2
--   * does NOT touch billing or auth
--   * does NOT touch the Analytical Mode pipeline
-- ============================================================


-- ============================================================
-- A. org_member_presence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_member_presence (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

COMMENT ON TABLE public.org_member_presence IS
  'Lightweight presence heartbeat. Each row records the last time a user '
  'was active inside the enterprise workspace for a given organization. '
  'Upserted (not inserted) via touch_org_presence() every ~60 s from the UI. '
  'Considered "online" when last_seen_at > now() - interval ''5 minutes''.';


-- ============================================================
-- B. org_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_messages (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID        NOT NULL
               REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id),
  body       TEXT        NOT NULL
               CHECK (length(trim(body)) > 0 AND length(body) <= 4000),
  is_deleted BOOLEAN     NOT NULL DEFAULT false,
  edited_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_messages IS
  'Org-wide message board. All active members (including finance_officer) '
  'can post and read messages. Deletes are soft (is_deleted=true). '
  'Edit history is not stored; edited_at records that an edit occurred. '
  'All writes are via SECURITY DEFINER RPCs.';


-- ============================================================
-- C. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_org_member_presence_org_id
  ON public.org_member_presence (org_id);

CREATE INDEX IF NOT EXISTS idx_org_messages_org_created
  ON public.org_messages (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_messages_author_id
  ON public.org_messages (author_id);


-- ============================================================
-- D. updated_at trigger (org_messages only; presence has no updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS update_org_messages_updated_at ON public.org_messages;
CREATE TRIGGER update_org_messages_updated_at
  BEFORE UPDATE ON public.org_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- E. RLS
-- ============================================================
ALTER TABLE public.org_member_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_messages         ENABLE ROW LEVEL SECURITY;

-- org_member_presence: any active org member can read presence for their org
CREATE POLICY "org_member_presence_select"
  ON public.org_member_presence
  FOR SELECT
  TO authenticated
  USING (public.is_active_org_member(org_id, auth.uid()));

-- No direct INSERT/UPDATE on org_member_presence: always via touch_org_presence().

-- org_messages: any active org member can read non-deleted messages
CREATE POLICY "org_messages_select"
  ON public.org_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_active_org_member(org_id, auth.uid())
    AND NOT is_deleted
  );

-- No direct INSERT/UPDATE/DELETE on org_messages: always via RPCs.


-- ============================================================
-- F. RPC: touch_org_presence
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_org_presence(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_active_org_member(p_org_id, v_user_id) THEN
    RAISE EXCEPTION 'Not an active member of this organization';
  END IF;

  INSERT INTO public.org_member_presence (user_id, org_id, last_seen_at)
  VALUES (v_user_id, p_org_id, now())
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET last_seen_at = now();
END;
$func$;

COMMENT ON FUNCTION public.touch_org_presence(UUID) IS
  'Upserts the caller''s presence row for the given org. '
  'Called from the frontend every ~60 seconds while the workspace is open. '
  'Silently updates last_seen_at without returning a value. '
  'Requires the caller to be an active org member.';

REVOKE ALL    ON FUNCTION public.touch_org_presence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_org_presence(UUID) TO authenticated;


-- ============================================================
-- G. RPC: send_org_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_org_message(p_org_id UUID, p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_msg_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_active_org_member(p_org_id, v_user_id) THEN
    RAISE EXCEPTION 'Not an active member of this organization';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;

  IF length(p_body) > 4000 THEN
    RAISE EXCEPTION 'Message body exceeds 4000 characters';
  END IF;

  INSERT INTO public.org_messages (org_id, author_id, body)
  VALUES (p_org_id, v_user_id, trim(p_body))
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$func$;

COMMENT ON FUNCTION public.send_org_message(UUID, TEXT) IS
  'Inserts a new org-wide message. '
  'Requires the caller to be an active org member. '
  'Body is trimmed and must be 1–4000 characters. '
  'Returns the new org_messages UUID.';

REVOKE ALL    ON FUNCTION public.send_org_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_org_message(UUID, TEXT) TO authenticated;


-- ============================================================
-- H. RPC: edit_org_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.edit_org_message(
  p_message_id UUID,
  p_new_body   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_msg     RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_msg
  FROM public.org_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_msg.author_id != v_user_id THEN
    RAISE EXCEPTION 'Only the author can edit this message';
  END IF;

  IF v_msg.is_deleted THEN
    RAISE EXCEPTION 'Cannot edit a deleted message';
  END IF;

  IF p_new_body IS NULL OR length(trim(p_new_body)) = 0 THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;

  IF length(p_new_body) > 4000 THEN
    RAISE EXCEPTION 'Message body exceeds 4000 characters';
  END IF;

  UPDATE public.org_messages
  SET body       = trim(p_new_body),
      edited_at  = now(),
      updated_at = now()
  WHERE id = p_message_id;
END;
$func$;

COMMENT ON FUNCTION public.edit_org_message(UUID, TEXT) IS
  'Edits an existing org message body. Author-only. '
  'Sets edited_at to record that an edit occurred (no full edit history). '
  'Cannot edit a soft-deleted message.';

REVOKE ALL    ON FUNCTION public.edit_org_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_org_message(UUID, TEXT) TO authenticated;


-- ============================================================
-- I. RPC: soft_delete_org_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_org_message(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID := auth.uid();
  v_msg     RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_msg
  FROM public.org_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  -- Idempotent: already deleted is a no-op
  IF v_msg.is_deleted THEN
    RETURN;
  END IF;

  -- Author OR org owner/admin can delete
  IF v_msg.author_id != v_user_id
     AND NOT public.is_org_owner_or_admin(v_msg.org_id, v_user_id) THEN
    RAISE EXCEPTION 'Only the author or an org admin can delete this message';
  END IF;

  UPDATE public.org_messages
  SET is_deleted = true,
      updated_at = now()
  WHERE id = p_message_id;
END;
$func$;

COMMENT ON FUNCTION public.soft_delete_org_message(UUID) IS
  'Soft-deletes an org message (sets is_deleted=true). '
  'Author or org owner/admin can delete. '
  'Idempotent: deleting an already-deleted message is a no-op. '
  'Deleted messages are hidden from org_messages_select RLS policy.';

REVOKE ALL    ON FUNCTION public.soft_delete_org_message(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_org_message(UUID) TO authenticated;


-- ============================================================
-- End of E7.7 migration.
-- Adds org-wide presence + messaging layer.
-- Next phases:
--   E8 -- enterprise billing (organization_subscriptions)
--   E9 -- client portal
-- ============================================================
