-- Vector Semantic Search Setup for SBC RAG
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create sbc_documents table for storing chunks with embeddings
CREATE TABLE IF NOT EXISTS public.sbc_documents (
  id bigserial PRIMARY KEY,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding vector(768),
  code_type text,
  section_number text,
  chapter_number text,
  page_start integer,
  page_end integer,
  file_name text,
  chunk_index integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for fast vector search
CREATE INDEX IF NOT EXISTS idx_sbc_documents_embedding ON public.sbc_documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_sbc_documents_code_type ON public.sbc_documents(code_type);
CREATE INDEX IF NOT EXISTS idx_sbc_documents_section ON public.sbc_documents(section_number);

-- Create vector search function
CREATE OR REPLACE FUNCTION match_sbc_documents(
  query_embedding vector(768),
  match_count int DEFAULT 20,
  filter_code text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  code_type text,
  section_number text,
  chapter_number text,
  page_start integer,
  page_end integer,
  file_name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.content, d.metadata, d.code_type,
    d.section_number, d.chapter_number,
    d.page_start, d.page_end, d.file_name,
    1 - (d.embedding <=> query_embedding) as similarity
  FROM public.sbc_documents d
  WHERE (filter_code IS NULL OR d.code_type = filter_code)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Row Level Security
ALTER TABLE public.sbc_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sbc_documents' AND policyname = 'Allow public read') THEN
    CREATE POLICY "Allow public read" ON public.sbc_documents FOR SELECT TO public USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sbc_documents' AND policyname = 'Allow service role all') THEN
    CREATE POLICY "Allow service role all" ON public.sbc_documents FOR ALL TO service_role USING (true);
  END IF;
END $$;
