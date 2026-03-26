-- Fix get_indexed_chunk_count: sum last_processed_chunk from graph_indexing_status
-- graph_nodes has no chunk_id column — the old COUNT(DISTINCT chunk_id) always returned 0.
-- graph_indexing_status.last_processed_chunk is updated on every processFile() call and
-- accurately reflects how many chunks have been processed per file.
CREATE OR REPLACE FUNCTION get_indexed_chunk_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(last_processed_chunk), 0)::integer
  FROM graph_indexing_status
  WHERE last_processed_chunk IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_indexed_chunk_count() TO anon;
GRANT EXECUTE ON FUNCTION get_indexed_chunk_count() TO authenticated;
