-- Create roles table (Phase 2, Ticket P2-SCHEMA-003)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
