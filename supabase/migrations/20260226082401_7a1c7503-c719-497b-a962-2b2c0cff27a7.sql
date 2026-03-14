ALTER TABLE public.graph_indexing_status 
ADD COLUMN IF NOT EXISTS last_processed_chunk INTEGER DEFAULT 0;