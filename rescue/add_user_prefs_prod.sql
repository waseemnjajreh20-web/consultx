-- Production rescue migration (idempotent)
-- Purpose: ensure preference columns exist on public.profiles so PostgREST
-- requests selecting them do not fail with 42703.
-- Safe to run immediately; contains only ALTER TABLE ... ADD COLUMN IF NOT EXISTS

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_memory_level text DEFAULT 'session' CHECK (ai_memory_level IN ('none','session','persistent'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'detailed' CHECK (output_format IN ('concise','detailed','report'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_standards text[] DEFAULT '{}';

-- NOTE: this rescue file intentionally does NOT perform any large UPDATE/backfill.
-- Backfill and aggressive writes are handled by tracked migration
-- supabase/migrations/20260419083000_add_user_preferences_if_missing.sql
-- which includes UPDATE statements; run those later in a maintenance window.
