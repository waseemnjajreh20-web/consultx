-- Add image_urls array column to messages (backward compatible)
-- image_url (single TEXT) remains unchanged for all existing queries
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.messages.image_urls IS
  'Array of public storage URLs for all uploaded images/PDF pages in this message. Supersedes image_url when present.';
