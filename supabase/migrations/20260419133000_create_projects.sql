-- Create projects table (Phase 2, Ticket P2-SCHEMA-005)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY,
  enterprise_id uuid NOT NULL REFERENCES public.enterprises(id),
  office_id uuid NOT NULL REFERENCES public.offices(id),
  name text NOT NULL,
  description text,
  status text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_enterprise_id ON public.projects(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_projects_office_id ON public.projects(office_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
