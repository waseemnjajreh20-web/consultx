-- Add user preference columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_memory_level text DEFAULT 'session' CHECK (ai_memory_level IN ('none', 'session', 'persistent'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS output_format text DEFAULT 'detailed' CHECK (output_format IN ('concise', 'detailed', 'report'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_standards text[] DEFAULT '{}';
