-- Create enterprises table (Phase 2, Ticket P2-SCHEMA-001)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.enterprises (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  billing_profile_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
