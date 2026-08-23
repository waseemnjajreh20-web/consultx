-- ============================================================================
-- ConsultX corpus data repair — 2026-08-23
-- Sub-agent: B5 (knowledge lane). Verified against production by direct SELECT
-- before every write below (see docs/audits/corpus-repair-20260823.md for the
-- full verification trail and the exact count each SELECT returned).
--
-- HOW TO RUN
--   1. Run ONE SECTION AT A TIME, in order.
--   2. Before every UPDATE/DELETE there is a SELECT with an "-- EXPECTED: N"
--      comment. Run it FIRST. If the number you get does NOT match, STOP —
--      do not run the UPDATE — production has drifted since this file was
--      written and the WHERE clause needs to be re-verified.
--   3. Each section opens its own BEGIN and closes its own COMMIT. After the
--      UPDATE runs, a verification SELECT runs again inside the same
--      transaction — read its output before typing COMMIT. If anything looks
--      wrong, run ROLLBACK instead.
--   4. Every section is idempotent: running it a second time is a no-op
--      (the WHERE clause only matches rows that still need the fix).
--   5. Every section backs up the exact rows it touches into a
--      *_backup_20260823_* table first, and states the exact rollback
--      statement in a comment. Nothing here is a hard delete of live data.
--
-- SCOPE: this file touches only public.sbc_documents and public.source_registry.
-- public.document_tables is NOT modified — see Section 5, which is a
-- recommendation (no DELETE), not an executed repair.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — sbc_documents.code_type: SBC 801 content mislabeled as SBC201
--
-- VERIFIED METHODOLOGY: the in-text running header printed inside the chunk
-- ("SBC 801-CC-2024"), per the task's own instruction to trust the header
-- over the filename. Direct regex sweep of the whole table found:
--   - 308 rows: code_type='SBC201' but content contains a "SBC 801...CC...2024"
--     style header  -> CONFIRMED wrong, fixed below.
--   - 0 rows the other direction (SBC801 rows with a 201 header) -> nothing
--     to fix there.
--   - A further 112 rows have file_name = 'SBC 801 ...' but NO in-text header
--     match at all (chunk boundary just doesn't include a header line). Per
--     the task's explicit instruction ("use the in-text header, not the
--     filename, not a guess") these 112 are NOT touched here — filename alone
--     is not the instructed ground truth, and 20 of those 112 rows actually
--     mention "SBC 201" in body text as a cross-reference, which is exactly
--     the kind of ambiguity a filename-only rule would get wrong. See report
--     for the full breakdown; this is a scoping decision, flagged for the
--     owner / B1 to close with a chunk-level review if they want full
--     coverage.
-- ============================================================================

-- --- Backup (idempotent: created once, kept forever as the pre-change snapshot) ---
CREATE TABLE IF NOT EXISTS sbc_documents_backup_20260823_codetype AS
SELECT id, code_type
FROM sbc_documents
WHERE code_type = 'SBC201'
  AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';

-- --- Verify before update ---
-- EXPECTED: 308  (0 if this section has already been applied)
SELECT count(*) AS rows_to_fix
FROM sbc_documents
WHERE code_type = 'SBC201'
  AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';

-- --- Apply ---
BEGIN;

UPDATE sbc_documents
SET code_type = 'SBC801'
WHERE code_type = 'SBC201'
  AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';

-- Verify inside the transaction before committing.
-- EXPECTED: rows_still_wrong = 0
SELECT count(*) AS rows_still_wrong
FROM sbc_documents
WHERE code_type = 'SBC201'
  AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';

-- OWNER: check rows_still_wrong = 0 above, then COMMIT. Otherwise ROLLBACK.
COMMIT;

-- --- Rollback (only if needed, run instead of / after the above) ---
-- UPDATE sbc_documents s
-- SET code_type = b.code_type
-- FROM sbc_documents_backup_20260823_codetype b
-- WHERE s.id = b.id;


-- ============================================================================
-- SECTION 2 — sbc_documents.language: entire table wrongly marked 'AR'
--
-- VERIFIED METHODOLOGY: regex sweep for the Arabic Unicode blocks (Arabic,
-- Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms A/B) across
-- ALL 4,630 rows, not a sample.
--
-- RESULT DISAGREES WITH THE AUDIT: the audit's 240-row sample found 0 Arabic
-- rows and concluded "prove zero". The full sweep found this is NOT zero:
-- 8 rows contain genuine Arabic text (two English cover pages carrying an
-- embedded Arabic honorific for the Crown Prince, and four/five rows that are
-- genuinely bilingual EN/AR city-name climate-zone tables, 19-25% Arabic
-- characters by count). This is exactly the case the task instructions
-- anticipated: "If you find even one genuinely Arabic row, say so and scope
-- the UPDATE around it." Scoped below: 4,622 rows flip to 'EN'; the 8
-- confirmed-Arabic rows are left as 'AR' and flagged in metadata for manual
-- review instead of being silently reclassified either way.
-- ============================================================================

-- --- Backup (idempotent: full pre-change snapshot of every AR-labeled row) ---
CREATE TABLE IF NOT EXISTS sbc_documents_backup_20260823_language AS
SELECT id, language, metadata
FROM sbc_documents
WHERE language = 'AR';

-- --- Verify before update ---
-- EXPECTED: total_ar=4630 (or less if already partially run), to_flip_to_en=4622,
-- genuinely_arabic=8
SELECT
  count(*) FILTER (WHERE language = 'AR') AS total_ar,
  count(*) FILTER (
    WHERE language = 'AR'
      AND content !~ '[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]'
  ) AS to_flip_to_en,
  count(*) FILTER (
    WHERE language = 'AR'
      AND content ~ '[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]'
  ) AS genuinely_arabic_leave_alone
FROM sbc_documents;

-- --- Apply ---
BEGIN;

-- 2a. Flip the 4,622 genuinely-English rows to 'EN'.
UPDATE sbc_documents
SET language = 'EN'
WHERE language = 'AR'
  AND content !~ '[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]';

-- 2b. Flag (do NOT reclassify) the 8 rows with genuine Arabic content so a
-- human can decide whether they need a 'MIXED' language value or a manual
-- split. This is additive metadata only; language stays 'AR' on these 8.
UPDATE sbc_documents
SET metadata = metadata || jsonb_build_object(
      'language_review_needed', true,
      'language_review_reason', 'contains_genuine_arabic_text_in_predominantly_english_chunk',
      'language_review_flagged_at', '2026-08-23'
    )
WHERE language = 'AR'
  AND content ~ '[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]'
  AND (metadata->>'language_review_needed') IS DISTINCT FROM 'true';

-- Verify inside the transaction before committing.
-- EXPECTED: remaining_ar = 8, flagged = 8
SELECT
  count(*) FILTER (WHERE language = 'AR') AS remaining_ar,
  count(*) FILTER (WHERE (metadata->>'language_review_needed') = 'true') AS flagged
FROM sbc_documents;

-- OWNER: check remaining_ar = 8 and flagged = 8 above, then COMMIT. Otherwise ROLLBACK.
COMMIT;

-- --- Rollback (only if needed) ---
-- UPDATE sbc_documents s
-- SET language = b.language, metadata = b.metadata
-- FROM sbc_documents_backup_20260823_language b
-- WHERE s.id = b.id;


-- ============================================================================
-- SECTION 3 — sbc_documents.metadata: flag TOC/index dot-leader junk chunks
--
-- VERIFIED METHODOLOGY: a run of 4+ dots (contiguous, or single-space-spaced,
-- to catch ". . . . 45"-style leaders) OR the single Unicode ellipsis
-- character "…", immediately followed by a page number. This combined
-- pattern returns exactly 71 rows, matching the audit's number. Sampled
-- rows confirm they are real "TABLE OF CONTENTS" pages.
--
-- NOTE FOR THE OWNER: several of these 71 rows are chunks that mix TOC lines
-- with the start of real chapter body text in the same chunk (a chunking
-- boundary artifact — metadata.content_type is already 'mixed' on these
-- rows). Flagging is additive metadata, not a delete, so retrieval logic can
-- choose to deprioritize rather than hard-exclude a flagged-but-mixed chunk.
--
-- Per instructions these are NOT deleted, only flagged.
-- ============================================================================

-- --- Backup (idempotent: pre-flag snapshot of metadata on the 71 rows) ---
CREATE TABLE IF NOT EXISTS sbc_documents_backup_20260823_toc_metadata AS
SELECT id, metadata
FROM sbc_documents
WHERE content ~ '\.{4,}\s*\d+'
   OR content ~ '(\.\s){4,}\d+'
   OR content ~ '…\s*\d+';

-- --- Verify before update ---
-- EXPECTED: 71
SELECT count(*) AS toc_dot_leader_rows
FROM sbc_documents
WHERE content ~ '\.{4,}\s*\d+'
   OR content ~ '(\.\s){4,}\d+'
   OR content ~ '…\s*\d+';

-- --- Apply ---
BEGIN;

UPDATE sbc_documents
SET metadata = metadata || jsonb_build_object(
      'retrieval_flag', 'toc_dot_leader',
      'retrieval_flag_reason', 'dot_leader_index_or_toc_pattern_detected',
      'retrieval_flagged_at', '2026-08-23'
    )
WHERE (content ~ '\.{4,}\s*\d+'
       OR content ~ '(\.\s){4,}\d+'
       OR content ~ '…\s*\d+')
  AND (metadata->>'retrieval_flag') IS DISTINCT FROM 'toc_dot_leader';

-- Verify inside the transaction before committing.
-- EXPECTED: flagged = 71
SELECT count(*) AS flagged
FROM sbc_documents
WHERE (metadata->>'retrieval_flag') = 'toc_dot_leader';

-- OWNER: check flagged = 71 above, then COMMIT. Otherwise ROLLBACK.
COMMIT;

-- --- Rollback (only if needed) ---
-- UPDATE sbc_documents s
-- SET metadata = b.metadata
-- FROM sbc_documents_backup_20260823_toc_metadata b
-- WHERE s.id = b.id;


-- ============================================================================
-- SECTION 4 — source_registry: reconcile SBC201 / SBC801 to edition 2024 and
-- vector_indexed = true. NFPA / SFPE / IBC / IFC are NOT touched (they stay
-- 'absent', which is correct and was verified unchanged).
--
-- DISAGREES WITH THE AUDIT ON ONE POINT: the audit claimed production shows
-- edition 2018. Direct SELECT on production right now shows edition_year is
-- ALREADY 2024 for both SBC201 and SBC801, matching src/data/sourceRegistry.json.
-- That part of the finding appears to already be fixed or the audit's number
-- was stale — the UPDATE below is a no-op on edition_year as a result, but is
-- left in for safety/idempotency in case production reverts.
--
-- vector_indexed = false is CONFIRMED wrong: 2,739/2,775 SBC201 rows (98.7%)
-- and 1,855/1,855 SBC801 rows (100%) already carry a real embedding vector.
-- 36 SBC201 rows still lack an embedding — noted, not blocking, flagged for
-- follow-up below.
-- ============================================================================

-- --- Backup (idempotent: created once) ---
CREATE TABLE IF NOT EXISTS source_registry_backup_20260823 AS
SELECT *
FROM source_registry
WHERE source_id IN ('SBC201', 'SBC801');

-- --- Verify before update ---
-- EXPECTED: SBC201 edition_year=2024 (already correct, no-op), vector_indexed=false (to fix)
--           SBC801 edition_year=2024 (already correct, no-op), vector_indexed=false (to fix)
SELECT source_id, edition_year, vector_indexed
FROM source_registry
WHERE source_id IN ('SBC201', 'SBC801')
ORDER BY source_id;

-- Residual embedding gap, for the record (not fixed by this section):
-- EXPECTED: SBC201 missing_embeddings=36, SBC801 missing_embeddings=0
SELECT code_type,
       count(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings
FROM sbc_documents
WHERE code_type IN ('SBC201', 'SBC801')
GROUP BY code_type
ORDER BY code_type;

-- --- Apply ---
BEGIN;

UPDATE source_registry
SET vector_indexed = true,
    edition_year = 2024,
    updated_at = now()
WHERE source_id IN ('SBC201', 'SBC801')
  AND (vector_indexed IS DISTINCT FROM true OR edition_year IS DISTINCT FROM 2024);

-- Verify inside the transaction before committing.
-- EXPECTED: both rows show edition_year=2024, vector_indexed=true
SELECT source_id, edition_year, vector_indexed
FROM source_registry
WHERE source_id IN ('SBC201', 'SBC801')
ORDER BY source_id;

-- Confirm the 8 sources that must never be claimed available (NFPA101, NFPA13,
-- NFPA2, NFPA30, NFPA72, SFPE, IBC, IFC) are still 'absent' with NULL edition.
-- Listed explicitly by source_id, not "NOT IN (SBC201, SBC801)", so this check
-- cannot silently swallow a row it wasn't meant to assert about (see SBC801_COMM
-- below, which is exactly the row a NOT-IN check hid on the first pass of this file).
-- EXPECTED: 8 rows, all ingestion_status='absent', edition_year IS NULL, vector_indexed=false
SELECT source_id, ingestion_status, edition_year, vector_indexed
FROM source_registry
WHERE source_id IN ('IBC', 'IFC', 'NFPA101', 'NFPA13', 'NFPA2', 'NFPA30', 'NFPA72', 'SFPE')
ORDER BY source_id;

-- SBC801_COMM is a separate, pre-existing source: the SBC 801 commentary text,
-- not yet ingested and not touched by this repair. Called out on its own,
-- with its own expectation, instead of being lumped into the "absent" check
-- above (it is neither absent nor NULL-edition, so it does not belong there).
-- EXPECTED: 1 row: ingestion_status='pending', edition_year=2024, authority_level='commentary'
SELECT source_id, ingestion_status, edition_year, authority_level, vector_indexed
FROM source_registry
WHERE source_id = 'SBC801_COMM';

-- OWNER: check both SELECTs above match expectations, then COMMIT. Otherwise ROLLBACK.
COMMIT;

-- --- Rollback (only if needed) ---
-- UPDATE source_registry s
-- SET vector_indexed = b.vector_indexed,
--     edition_year = b.edition_year,
--     updated_at = b.updated_at
-- FROM source_registry_backup_20260823 b
-- WHERE s.source_id = b.source_id;


-- ============================================================================
-- SECTION 5 — document_tables: RECOMMENDATION ONLY. No DELETE is executed
-- by this file.
--
-- VERIFIED COUNT DISAGREES WITH THE AUDIT'S "4 empty shells out of 7":
--   - 5 of the 7 rows have zero rows in their `rows` jsonb array, not 4.
--   - Of those 5, only 3 (Table 504.3, Table 504.4, Table 506.2 — footnotes
--     status='pending') are genuine empty shells awaiting transcription.
--   - The other 2 (Table 503, Table 1004.1.2 — footnotes status='legacy_only')
--     are DELIBERATELY empty: they are redirect stubs whose footnotes.redirect_to
--     points at the table number that superseded them in SBC 201-CC-2024
--     (Table 503 -> Table 504.3 / 504.4 / 506.2; Table 1004.1.2 -> Table 1004.5,
--     which itself already has 3 verified rows). Deleting them would drop a
--     citation-correctness feature (redirecting a legacy/older table-number
--     lookup to the current one), not clean up a bug.
--
-- CODEBASE CHECK: grepped the repo for "document_tables". No Supabase Edge
-- Function references it (in particular, supabase/functions/fire-safety-chat
-- has zero references — this table is NOT wired into the live retrieval/prompt
-- pipeline the way sbc_code_tables is). The only real reference is
-- tools/generate_insert_statements.py, a batch-insert generator that reads
-- normalized_tables_payloads.json and writes document_tables_inserts.sql —
-- i.e. this table is the staging/authoring surface for the code-table rebuild
-- work (sub-agent B1's lane), not a runtime dependency.
--
-- RECOMMENDATION (owner decision, not executed here): leave all 7 rows as-is.
--   - The 3 'pending' rows (504.3, 504.4, 506.2) are exactly B1's rebuild
--     targets; deleting them loses the caption/section_id/page scaffolding
--     already prepared and breaks the redirect_to chain documented in
--     Table 503's footnotes.
--   - The 2 'legacy_only' rows are working as designed (redirect stubs) and
--     should not be deleted either.
--   - If the owner still wants the 3 pending shells removed pending B1's
--     rebuild, the exact scoped statement is provided below, commented out,
--     for reference only — it is NOT part of the recommended action.
-- ============================================================================

-- --- Informational only (read, do not need to act) ---
SELECT id, table_id, table_number,
       jsonb_array_length(coalesce(rows, '[]'::jsonb)) AS row_count,
       footnotes->>'status' AS status
FROM document_tables
ORDER BY id;

-- Backup provided for completeness / in case the owner overrides the
-- recommendation above. Not required if no DELETE is run.
CREATE TABLE IF NOT EXISTS document_tables_backup_20260823 AS
SELECT * FROM document_tables;

-- NOT RECOMMENDED — provided only if the owner explicitly overrides the
-- analysis above and wants the 3 genuinely-pending empty shells removed
-- ahead of B1's rebuild. Left commented out; this file does not delete
-- document_tables rows.
-- BEGIN;
-- DELETE FROM document_tables
-- WHERE footnotes->>'status' = 'pending'
--   AND jsonb_array_length(coalesce(rows, '[]'::jsonb)) = 0;
-- -- Rollback: re-insert from document_tables_backup_20260823 by id.
-- COMMIT;
