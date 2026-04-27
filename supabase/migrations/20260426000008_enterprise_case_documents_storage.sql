-- ============================================================
-- E7.9: Enterprise Case Documents — Storage Bucket + Access Policies
-- Migration: 20260426000008_enterprise_case_documents_storage
-- ============================================================
-- Surface: Supabase Storage only. Creates the enterprise-case-documents
-- private bucket and a path-based access helper function used by storage RLS.
--
-- This migration is ADDITIVE ONLY. It does NOT alter or touch:
--   * case_documents table (schema is complete in E3 migration 00002)
--   * enterprise_cases / org_members / organizations / case_notes
--   * billing tables: user_subscriptions, payment_transactions, subscription_plans
--   * fire-safety-chat buckets: chat-images, ssss, source-pdfs
--   * Any edge functions
--   * Individual subscription pipeline
-- ============================================================

-- ── 1. Private bucket (idempotent) ────────────────────────────────────────
-- public=false: no URLs ever exposed without a signed token.
-- file_size_limit=52428800: 50 MB hard cap per file.
-- allowed_mime_types=NULL: client-side accept filter is the UX gate; server
--   enforces only size. DWG, PDF, images, xlsx all pass.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'enterprise-case-documents',
  'enterprise-case-documents',
  false,
  52428800,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Path-based access helper ───────────────────────────────────────────
-- Expected path format: {org_id}/{case_id}/{category}/{document_id}-{filename}
-- Segments after split('/'):
--   [1] = org_id   (UUID)
--   [2] = case_id  (UUID)
--   [3] = category (string)
--   [4] = {document_id}-{filename}
--
-- Returns TRUE only when ALL of the following hold:
--   a. path has at least 4 segments
--   b. segment [1] is a parseable UUID  (org_id)
--   c. segment [2] is a parseable UUID  (case_id)
--   d. enterprise_cases row with id=case_id AND org_id=org_id exists
--   e. is_active_case_member(org_id, p_user_id) is true
--      (that function explicitly excludes finance_officer)
--
-- SECURITY DEFINER: reads enterprise_cases without triggering its own RLS.
-- Do NOT replace is_active_case_member with is_active_org_member here —
-- that would inadvertently grant finance_officer storage access.
CREATE OR REPLACE FUNCTION public.can_access_enterprise_document_object(
  p_object_name TEXT,
  p_user_id     UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segments TEXT[];
  v_org_id   UUID;
  v_case_id  UUID;
BEGIN
  v_segments := string_to_array(p_object_name, '/');

  -- Must have at least 4 path segments
  IF array_length(v_segments, 1) < 4 THEN
    RETURN FALSE;
  END IF;

  -- Validate org_id is a UUID
  BEGIN
    v_org_id := v_segments[1]::UUID;
  EXCEPTION WHEN others THEN
    RETURN FALSE;
  END;

  -- Validate case_id is a UUID
  BEGIN
    v_case_id := v_segments[2]::UUID;
  EXCEPTION WHEN others THEN
    RETURN FALSE;
  END;

  -- Confirm the case belongs to the org
  IF NOT EXISTS (
    SELECT 1 FROM public.enterprise_cases
    WHERE id = v_case_id AND org_id = v_org_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Delegate to the case-member gate (excludes finance_officer)
  RETURN public.is_active_case_member(v_org_id, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.can_access_enterprise_document_object(TEXT, UUID) IS
  'Path-based storage access gate for the enterprise-case-documents bucket. '
  'Parses {org_id}/{case_id}/{category}/{rest}, validates both UUID segments, '
  'confirms the case row exists in enterprise_cases, then delegates to '
  'is_active_case_member (which excludes finance_officer by design). '
  'SECURITY DEFINER so it can read enterprise_cases without recursive RLS. '
  'WARNING: do NOT substitute is_active_org_member — that includes finance_officer.';

REVOKE ALL ON FUNCTION public.can_access_enterprise_document_object(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_access_enterprise_document_object(TEXT, UUID) TO authenticated;

-- ── 3. Storage object RLS policies ────────────────────────────────────────
-- INSERT: active case members (owner/admin/head/engineer) may upload.
--   finance_officer is rejected by can_access_enterprise_document_object.
CREATE POLICY "enterprise_docs_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'enterprise-case-documents'
    AND public.can_access_enterprise_document_object(name, auth.uid())
  );

-- SELECT: same gate for defense-in-depth.
--   The get-case-document-url edge function uses the service role key and
--   bypasses this policy when generating signed URLs. This policy prevents
--   any authenticated user from directly listing or reading objects they
--   have no case membership for.
CREATE POLICY "enterprise_docs_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'enterprise-case-documents'
    AND public.can_access_enterprise_document_object(name, auth.uid())
  );

-- No UPDATE policy: files are write-once. New versions create new objects
--   with a new document_id prefix, keeping old versions intact.
-- No client-side DELETE policy: the delete-case-document edge function
--   runs with the service role key (bypasses RLS) so no client policy needed.
