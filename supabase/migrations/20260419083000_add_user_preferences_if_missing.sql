-- Ensure user preference columns exist on profiles (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_memory_level text DEFAULT 'session' CHECK (ai_memory_level IN ('none', 'session', 'persistent'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'detailed' CHECK (output_format IN ('concise', 'detailed', 'report'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_standards text[] DEFAULT '{}';

-- Backfill existing NULLs (if any) to defaults
UPDATE public.profiles SET ai_memory_level = 'session' WHERE ai_memory_level IS NULL;
UPDATE public.profiles SET output_format = 'detailed' WHERE output_format IS NULL;
UPDATE public.profiles SET preferred_standards = '{}' WHERE preferred_standards IS NULL;
