-- SBC Structured Tables — schema + RLS
-- Provides a DB-backed structured table path so that fire-safety-chat can
-- return exact, verbatim SBC table data for known table IDs instead of
-- relying on storage-file chunk retrieval (which can miss or truncate tables).
--
-- Applied 2026-04-10.

CREATE TABLE IF NOT EXISTS public.sbc_code_tables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        text NOT NULL,           -- e.g. "1004.5", "1006.3.3"
  table_title     text NOT NULL,           -- human-readable title
  source_code     text NOT NULL,           -- "SBC 201" | "SBC 801"
  edition         text NOT NULL DEFAULT '2024',
  chapter         integer,                 -- chapter number for quick filtering
  section         text,                    -- parent section (e.g. "1004")
  content_md      text NOT NULL,           -- full table as Markdown (verbatim)
  keywords        text[] NOT NULL DEFAULT '{}',  -- match keywords (lower-case)
  notes           text,                    -- footnotes / section notes
  supersedes      text[] DEFAULT '{}',     -- old table IDs this replaces
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique per (table_id, source_code, edition)
CREATE UNIQUE INDEX IF NOT EXISTS sbc_code_tables_key
  ON public.sbc_code_tables (table_id, source_code, edition);

-- Fast keyword search
CREATE INDEX IF NOT EXISTS sbc_code_tables_keywords_idx
  ON public.sbc_code_tables USING GIN (keywords);

-- Fast chapter lookup
CREATE INDEX IF NOT EXISTS sbc_code_tables_chapter_idx
  ON public.sbc_code_tables (chapter);

ALTER TABLE public.sbc_code_tables ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read structured tables; no writes from client
CREATE POLICY "authenticated_read_sbc_tables"
  ON public.sbc_code_tables
  FOR SELECT
  TO authenticated
  USING (true);
