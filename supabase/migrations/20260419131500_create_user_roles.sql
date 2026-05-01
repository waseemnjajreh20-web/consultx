-- Create user_roles table (Phase 2, Ticket P2-SCHEMA-004)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  scope text NOT NULL,
  scope_id uuid,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_scope_scope_id ON public.user_roles(scope, scope_id);
