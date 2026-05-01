-- Create project_versions table (Phase 2, Ticket P2-SCHEMA-006)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.project_versions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  version_number integer NOT NULL,
  status text NOT NULL,
  client_visible boolean NOT NULL DEFAULT false,
  internal_notes jsonb,
  delivered_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_status ON public.project_versions(status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_project_versions_project_version ON public.project_versions(project_id, version_number);
