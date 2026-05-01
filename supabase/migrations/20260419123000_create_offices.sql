-- Create offices table (Phase 2, Ticket P2-SCHEMA-002)
-- Note: local migration file only. Do NOT apply to production until approved.

CREATE TABLE IF NOT EXISTS public.offices (
  id uuid PRIMARY KEY,
  enterprise_id uuid NOT NULL REFERENCES public.enterprises(id),
  name text NOT NULL,
  location text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
