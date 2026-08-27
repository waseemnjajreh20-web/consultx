-- ============================================================================
-- ConsultX xref-graph build -- 2026-08-25
-- Phase P3 of the Advisory Brain plan (Lane B / GraphRAG G0). Builds the
-- deterministic section cross-reference graph designed in
-- docs/audits/graphrag-design-20260823.md (Sections 2.2-2.5, 2.8), following
-- the corpus-repair-20260823.sql house pattern: numbered Sections, an
-- "EXPECTED: N" read-only probe before every write, per-Section
-- BEGIN/COMMIT, and idempotent re-runs (DELETE the extractor_ver='xref_v1'
-- rows a Section owns, then re-INSERT from scratch).
--
-- *** THIS SCRIPT REQUIRES docs/audits/corpus-repair-20260823.sql SECTION 1
-- (the SBC801-content-mislabeled-as-SBC201 code_type fix) TO HAVE BEEN
-- APPLIED AND COMMITTED FIRST. *** The defining-occurrence index in Section 2
-- and every edge resolved in Sections 3-5 are keyed on
-- sbc_documents.code_type. If that fix has not run, ~308 SBC801 chunks are
-- still mislabeled 'SBC201', which corrupts both the section-defs index
-- (wrong code_type on ~308 defining rows) and every edge resolved against
-- them. Section 1 below PROBES for this directly and gives an explicit
-- ABORT instruction. Do not skip it.
--
-- WHAT THIS BUILDS (four new tables, all locked to service_role only --
-- design doc Section 2.7 / the SECURITY note below):
--   sbc_section_defs   -- deterministic index of "which chunk defines which
--                         dotted section number", built from a
--                         title-position regex on content (design 2.4), NOT
--                         from the drifted sbc_documents.section_number.
--   sbc_xref_edges     -- chunk -> chunk citation edges (edge_kind
--                         'section_ref' | 'cross_code'), each carrying the
--                         cue phrase and a <=200-char evidence excerpt so a
--                         reviewer can judge the edge without re-running the
--                         extractor.
--   sbc_external_refs  -- census of citations to standards ConsultX does NOT
--                         hold (NFPA/ASTM/ICC/UL/ASME/ANSI/ISO/API/AWS),
--                         stripped out of the xref extraction in Section 3
--                         and recorded here instead, so no edge is ever
--                         created implying we possess NFPA/SFPE/IBC/IFC
--                         (CLAUDE.md hard rule: never claim sources the
--                         model does not have).
--   sbc_xref_indegree  -- per-doc in-degree over sbc_xref_edges, computed
--                         once at build time.
--
-- WHAT THIS DOES NOT DO: no reader is wired up anywhere. Zero changes to
-- supabase/functions/fire-safety-chat/index.ts, promptContract.ts,
-- retrievalPolicy.ts, chapterIndex.ts, or geminiResilience.ts, and zero
-- effect on any live answer. Building the graph (design doc's "G0") and
-- reading it at query time (design doc's "G1", behind
-- ADVISORY_GRAPH_EXPANSION_ENABLED, default OFF) are separate phases; this
-- script is G0 only.
--
-- HOW TO RUN
--   1. Run ONE SECTION AT A TIME, in order.
--   2. Before every INSERT/DELETE there is a SELECT with an "-- EXPECTED: N"
--      comment. Every estimate in this file carries a +/-5% tolerance --
--      this is the design's own G0 gate #1 (docs/audits/
--      graphrag-design-20260823.md, section "G0"), not a number this script
--      invents. Run the probe FIRST. If the result is well outside that
--      band, STOP -- do not run the write -- and compare the regex in that
--      Section against the cited design Section before continuing.
--   3. Each write Section opens its own BEGIN and closes its own COMMIT.
--      After the write runs, a verification SELECT runs again inside the
--      same transaction -- read its output before typing COMMIT. If
--      anything looks wrong, run ROLLBACK instead.
--   4. Idempotency: every write Section DELETEs only the rows IT owns
--      (extractor_ver='xref_v1', further scoped by edge_kind/cue where more
--      than one Section writes the same table -- see each Section's DELETE
--      comment) and re-INSERTs from scratch. Where two Sections can legally
--      produce the SAME unique key -- Sections 3 and 5 both write
--      edge_kind='section_ref' and `cue` is not part of that key -- the INSERT
--      also carries an explicit ON CONFLICT clause, so re-running one Section
--      after the other cannot abort on a unique violation and the final rows
--      do not depend on the order the two were run in (exact resolution always
--      wins over ancestor fallback). Running any Section twice in a row, or
--      the whole file twice, reproduces the same rows and the same counts.
--   5. Sections 2, 3, 6 and 7 CREATE a table with `IF NOT EXISTS`. Every
--      CREATE is followed immediately by ENABLE ROW LEVEL SECURITY, a
--      REVOKE ALL FROM PUBLIC, anon, authenticated, and an explicit GRANT to
--      service_role -- same reasoning as the SECURITY note in
--      corpus-repair-20260823.sql: public.pg_default_acl on this project
--      grants anon and authenticated ALL on a newly created public table, RLS
--      defaults OFF, and PostgREST exposes it immediately. A bare CREATE TABLE
--      here would publish a world-readable/writable table the moment it runs.
--      service_role bypasses RLS and is unaffected by the REVOKE. The two
--      tables with a `bigserial` key also revoke their SEQUENCE by name: a
--      sequence is a separate object with its own ACL and no RLS at all, so
--      revoking only the table would still leave anon able to call nextval()
--      on it.
--   6. Section 8 is the automated half of the G0 gate: run it last and keep
--      its output. The manual half -- >=90% accuracy on a 50-edge sample
--      checked against the printed SBC page -- is
--      scripts/sample-xref-edges.mjs, run separately after this file
--      completes. scripts/build-xref-graph-verify.mjs re-runs Section 8's
--      checks read-only, any time after, via the app's own credentials.
-- ============================================================================


-- ============================================================================
-- SECTION 1 -- Preflight: right table, right corpus, corpus-repair applied?
-- ============================================================================

-- --- Probe 1a: total row count (sanity check only -- corpus-repair changes
-- column values, never row counts, so this number is IDENTICAL before and
-- after corpus-repair-20260823.sql; it only confirms you are pointed at the
-- right table/environment) ---
-- EXPECTED: 4630
SELECT count(*) AS total_sbc_documents FROM sbc_documents;

-- --- Probe 1b: per-code_type breakdown (sanity check) ---
-- EXPECTED: SBC201 approx 2775, SBC801 approx 1855 (corpus-repair-20260823.md)
SELECT code_type, count(*) AS n
FROM sbc_documents
GROUP BY code_type
ORDER BY code_type;

-- --- Probe 1c: THE REAL GATE. Has corpus-repair-20260823.sql Section 1 run?
-- This is the identical WHERE clause from that Section's own verification
-- SELECT ("rows_still_wrong" there = "corpus_repair_section1_not_yet_applied"
-- here). ---
-- EXPECTED: 0
--
-- IF THIS IS NOT 0: STOP. Do not run any Section below. Go run
-- docs/audits/corpus-repair-20260823.sql SECTION 1, verify and COMMIT it,
-- then re-run this probe until it returns 0. Reason: Section 2 below builds
-- the section-defining index keyed on sbc_documents.code_type; every row
-- this counts is an SBC801 chunk still mislabeled 'SBC201', which would
-- poison the index with wrong-code defining rows and silently corrupt every
-- edge resolved against them in Sections 3-5.
SELECT count(*) AS corpus_repair_section1_not_yet_applied
FROM sbc_documents
WHERE code_type = 'SBC201'
  AND content ~ 'SBC\s*801\s*-?\s*CC\s*-?\s*\d{4}';


-- ============================================================================
-- SECTION 2 -- sbc_section_defs: the defining-occurrence index
--
-- Builds the index design 2.4 calls for: a section is DEFINED where its
-- number appears in TITLE POSITION -- start of a line (start of the string,
-- or right after a newline), optional leading spaces/tabs, the dotted
-- number, then a capital letter. Deliberately NOT sbc_documents.section_number
-- (measured 57.56%-73.11% drift by two independent methods, design 2.4 --
-- rejected as a join key).
--
-- REGEX DEVIATION FROM THE LITERAL TASK BRIEF -- DOCUMENTED, INTENTIONAL:
-- The brief for this Section quoted the pattern with a plain `[ \t]+`
-- between the number and the capital letter (no newline). Design 2.4
-- measured that EXACT variant directly and got only 43.4% coverage; the
-- `\s+` variant used below -- which tolerates a hard newline between the
-- number and its title, e.g. the real corpus example "909.20.4.3 \nSmoke
-- trap." -- measured 89% coverage. This script's own closing regex note
-- (in the task brief) calls the 43.4%-vs-89% gap "load-bearing", and the
-- EXPECTED counts below (~10,096 / ~8,284) are the design's numbers for the
-- 89%-coverage \s+ version, not the 43.4% one. \s+ is used below on
-- purpose; see the returned report for the full explanation.
--
-- SECOND FILTER, ADDED BEYOND THE LITERAL BRIEF -- DOCUMENTED, INTENTIONAL:
-- Design 2.4 defines its final defining index using the dotted-number
-- constraint "together with, not instead of" a "reasonable chapter head"
-- check: derive the chapter from the section's leading digits (903 -> 9,
-- 1006 -> 10, 5003 -> 50 -- i.e. floor(leading_number / 100)) and reject
-- anything outside that code's real chapter set. Design 2.4's own measured
-- numbers (8,284 distinct dotted sections) are AFTER this second filter;
-- the dotted-only count alone is 9,517 (design 2.4) -- a ~15% gap, outside
-- this file's own +/-5% band. The task brief for this Section named only
-- "dotted-numbers-only", but omitting the chapter-head check would produce
-- a defs table the design's own EXPECTED figures do not describe and would
-- very likely fail the +/-5% probe below on delivery. The chapter sets used
-- are read directly from supabase/functions/fire-safety-chat/chapterIndex.ts
-- (SBC201_INDEX / SBC801_INDEX, union of every `chapters` array -- read-only,
-- not modified by this script).
-- ============================================================================

-- --- Schema (idempotent) ---
create table if not exists sbc_section_defs (
  doc_id        bigint  not null references sbc_documents(id) on delete cascade,
  code_type     text    not null,
  section       text    not null,
  extractor_ver text    not null,
  primary key (doc_id, section)
);
create index if not exists idx_sbc_section_defs_lookup
  on sbc_section_defs (code_type, section);

alter table sbc_section_defs enable row level security;
revoke all on sbc_section_defs from public, anon, authenticated;
grant  all on sbc_section_defs to service_role;

-- --- Verify before insert ---
-- EXPECTED: definition_sites approx 10096 (band 9591-10601),
--           distinct_sections approx 8284 (band 7870-8698)  [+/-5%, design 2.5]
WITH def_matches AS (
  SELECT
    d.id AS doc_id,
    d.code_type,
    m[1] AS section
  FROM sbc_documents d
  CROSS JOIN LATERAL regexp_matches(
    d.content,
    '(?:^|\n)[ \t]*([0-9]{3,4}(?:\.[0-9]+)+)\s+[A-Z]',
    'g'
  ) AS m
  WHERE d.code_type IN ('SBC201', 'SBC801')
    AND (
      (d.code_type = 'SBC201'
        AND (split_part(m[1], '.', 1)::int / 100) = ANY (ARRAY[
          1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
          26,27,28,29,30,31,32,33,35
        ]))
      OR
      (d.code_type = 'SBC801'
        AND (split_part(m[1], '.', 1)::int / 100) = ANY (ARRAY[
          1,2,3,4,5,6,7,8,9,10,11,12,20,21,22,23,24,25,26,27,28,29,30,31,32,
          33,34,35,36,37,38,39,50,51,53,54,55,56,57,58,59,60,61,62,63,64,65,
          66,67,80
        ]))
    )
)
SELECT
  count(*) AS definition_sites,
  count(DISTINCT section) AS distinct_sections,
  count(DISTINCT (doc_id, section)) AS distinct_doc_section_pairs
FROM def_matches;

-- --- Apply ---
BEGIN;

DELETE FROM sbc_section_defs WHERE extractor_ver = 'xref_v1';

INSERT INTO sbc_section_defs (doc_id, code_type, section, extractor_ver)
SELECT DISTINCT
  d.id,
  d.code_type,
  m[1] AS section,
  'xref_v1'
FROM sbc_documents d
CROSS JOIN LATERAL regexp_matches(
  d.content,
  '(?:^|\n)[ \t]*([0-9]{3,4}(?:\.[0-9]+)+)\s+[A-Z]',
  'g'
) AS m
WHERE d.code_type IN ('SBC201', 'SBC801')
  AND (
    (d.code_type = 'SBC201'
      AND (split_part(m[1], '.', 1)::int / 100) = ANY (ARRAY[
        1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
        26,27,28,29,30,31,32,33,35
      ]))
    OR
    (d.code_type = 'SBC801'
      AND (split_part(m[1], '.', 1)::int / 100) = ANY (ARRAY[
        1,2,3,4,5,6,7,8,9,10,11,12,20,21,22,23,24,25,26,27,28,29,30,31,32,
        33,34,35,36,37,38,39,50,51,53,54,55,56,57,58,59,60,61,62,63,64,65,
        66,67,80
      ]))
  )
-- The primary key is (doc_id, section) with NO extractor_ver in it (design
-- 2.7). The DELETE above only clears THIS extractor_ver's rows, so a re-run
-- under a bumped extractor_ver would otherwise collide with the previous
-- version's surviving rows and abort the transaction. Overwriting is the
-- correct resolution: a (doc_id, section) pair is a fact about the text, and
-- the newest extractor is authoritative about it.
ON CONFLICT (doc_id, section) DO UPDATE
SET code_type     = EXCLUDED.code_type,
    extractor_ver = EXCLUDED.extractor_ver;

-- Verify inside the transaction before committing.
-- EXPECTED: row_count approx 10096, distinct_sections approx 8284 (same +/-5% band)
SELECT count(*) AS row_count, count(DISTINCT section) AS distinct_sections
FROM sbc_section_defs
WHERE extractor_ver = 'xref_v1';

-- OWNER: check the counts above are within +/-5% of 10096 / 8284, then COMMIT.
-- Otherwise ROLLBACK and diff the regex/chapter-filter against design doc
-- Section 2.4 before re-running.
COMMIT;


-- ============================================================================
-- SECTION 3 -- sbc_xref_edges: same-code section_ref edges
--
-- Two steps, in this order -- design 2.3 is explicit that order matters:
--   1. Strip external-standard citations ("Section 404.2.8 of ICC A117.1")
--      OUT of the content BEFORE extracting anything. Naive extraction
--      would create an edge from that text to SBC's OWN section 404.2.8 --
--      a completely unrelated section in a fire-safety code. Zero
--      tolerance (design 2.3): this is a safety trap, not noise.
--   2. Extract references using the five cue phrases the design measured
--      (2.2) PLUS bare "Section(s) <n>" with no cue phrase at all
--      (cue='bare'). The design's own conservative 9,296-edge estimate
--      (2.5) is explicitly built from "Section(s) <dotted number> ONLY" --
--      i.e. every occurrence, not only the five cued phrasings. The five
--      cues together cover 7,645 of the 15,799+2,756 raw "Section(s) <n>"
--      occurrences (design 2.2); cue-only extraction would land far short
--      of 9,296. The design's own edge_kind DDL comment (2.7) documents a
--      'bare' cue value for exactly this case.
--   \s+ is used between every token throughout, not a literal space: a hard
--   newline can and does appear mid-phrase in this corpus, e.g. "comply
--   with Section\n1010.1.3" (design 2.2's own worked example).
-- ============================================================================

-- --- Schema (idempotent) ---
create table if not exists sbc_xref_edges (
  id            bigserial primary key,
  src_doc_id    bigint not null references sbc_documents(id) on delete cascade,
  tgt_doc_id    bigint not null references sbc_documents(id) on delete cascade,
  tgt_code      text   not null,
  tgt_section   text   not null,
  edge_kind     text   not null
                check (edge_kind in ('section_ref','cross_code','table_ref','section_list')),
  cue           text   not null,
  occurrences   int    not null default 1,
  evidence      text   not null,
  extractor_ver text   not null,
  created_at    timestamptz not null default now(),
  unique (src_doc_id, tgt_doc_id, tgt_section, edge_kind)
);
create index if not exists idx_sbc_xref_src on sbc_xref_edges (src_doc_id);
create index if not exists idx_sbc_xref_tgt on sbc_xref_edges (tgt_doc_id);

alter table sbc_xref_edges enable row level security;
revoke all on sbc_xref_edges from public, anon, authenticated;
grant  all on sbc_xref_edges to service_role;
-- The bigserial column's sequence is a SEPARATE object with its OWN ACL and no
-- RLS of any kind. Supabase's public-schema default privileges grant anon and
-- authenticated ALL on it, so revoking the table alone still leaves a
-- client-held key able to call nextval()/currval() on it. Revoke it by name.
revoke all on sequence sbc_xref_edges_id_seq from public, anon, authenticated;
grant  all on sequence sbc_xref_edges_id_seq to service_role;

-- --- Verify before insert ---
-- EXPECTED: same_code_edges approx 9296 (band 8831-9761)  [+/-5%, design 2.5]
WITH cleaned AS (
  SELECT
    d.id AS doc_id,
    d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ',
      'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT
    c.doc_id AS src_doc_id,
    c.code_type AS src_code_type,
    m[2] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(\min\s+accordance\s+with\s+Sections?\s+|\msee\s+Sections?\s+|\mcompl(?:y|ies|ying)\s+with\s+Sections?\s+|\mrequired\s+(?:by|in)\s+Sections?\s+|\mspecified\s+in\s+Sections?\s+|\mSections?\s+)([0-9]{3,4}(?:\.[0-9]+)+)',
    'gi'
  ) AS m
),
resolved AS (
  SELECT r.src_doc_id, sd.doc_id AS tgt_doc_id, r.target_section
  FROM raw_refs r
  JOIN sbc_section_defs sd
    ON sd.code_type = r.src_code_type AND sd.section = r.target_section
  WHERE sd.doc_id <> r.src_doc_id
)
SELECT
  count(*) AS raw_resolved_occurrences,
  count(DISTINCT (src_doc_id, tgt_doc_id, target_section)) AS same_code_edges
FROM resolved;

-- --- Apply ---
BEGIN;

-- Scoped delete: this Section owns edge_kind='section_ref' rows whose cue
-- has NO ':prefix_fallback' suffix -- that suffix belongs to Section 5, so
-- re-running this Section alone leaves Section 5's rows untouched (and vice
-- versa -- see Section 5's own scoped delete).
DELETE FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1'
  AND edge_kind = 'section_ref'
  AND cue NOT LIKE '%:prefix_fallback';

WITH cleaned AS (
  SELECT
    d.id AS doc_id,
    d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ',
      'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT
    c.doc_id AS src_doc_id,
    c.code_type AS src_code_type,
    c.content AS src_content,
    m[1] AS cue_text,
    m[2] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(\min\s+accordance\s+with\s+Sections?\s+|\msee\s+Sections?\s+|\mcompl(?:y|ies|ying)\s+with\s+Sections?\s+|\mrequired\s+(?:by|in)\s+Sections?\s+|\mspecified\s+in\s+Sections?\s+|\mSections?\s+)([0-9]{3,4}(?:\.[0-9]+)+)',
    'gi'
  ) AS m
),
classified AS (
  SELECT
    r.src_doc_id,
    r.src_code_type,
    r.target_section,
    CASE
      WHEN r.cue_text ~* 'in\s+accordance\s+with'    THEN 'in_accordance_with'
      WHEN r.cue_text ~* '^see\s'                     THEN 'see'
      WHEN r.cue_text ~* 'compl(y|ies|ying)\s+with'    THEN 'comply_with'
      WHEN r.cue_text ~* 'required\s+(by|in)'          THEN 'required_by'
      WHEN r.cue_text ~* 'specified\s+in'              THEN 'specified_in'
      ELSE 'bare'
    END AS cue,
    -- <=200-char evidence excerpt: up to 80 chars of leading context, the
    -- matched cue+"Section(s) <n>" text, then whatever trails, capped at 200.
    left(
      substring(
        r.src_content
        from greatest(1, position(r.cue_text || r.target_section in r.src_content) - 80)
        for 300
      ),
      200
    ) AS evidence
  FROM raw_refs r
),
resolved AS (
  SELECT
    cl.src_doc_id,
    sd.doc_id AS tgt_doc_id,
    cl.src_code_type AS tgt_code,
    cl.target_section AS tgt_section,
    cl.cue,
    cl.evidence
  FROM classified cl
  JOIN sbc_section_defs sd
    ON sd.code_type = cl.src_code_type AND sd.section = cl.target_section
  WHERE sd.doc_id <> cl.src_doc_id
),
ranked AS (
  SELECT
    src_doc_id, tgt_doc_id, tgt_code, tgt_section, cue, evidence,
    count(*) OVER (PARTITION BY src_doc_id, tgt_doc_id, tgt_section) AS occurrences,
    row_number() OVER (
      PARTITION BY src_doc_id, tgt_doc_id, tgt_section
      ORDER BY CASE cue
                 WHEN 'in_accordance_with' THEN 1
                 WHEN 'comply_with'        THEN 2
                 WHEN 'required_by'        THEN 3
                 WHEN 'specified_in'       THEN 4
                 WHEN 'see'                THEN 5
                 ELSE 6
               END
    ) AS rn
  FROM resolved
)
INSERT INTO sbc_xref_edges
  (src_doc_id, tgt_doc_id, tgt_code, tgt_section, edge_kind, cue, occurrences, evidence, extractor_ver)
SELECT
  src_doc_id, tgt_doc_id, tgt_code, tgt_section, 'section_ref', cue, occurrences, evidence, 'xref_v1'
FROM ranked
WHERE rn = 1
-- IDEMPOTENCY ACROSS SECTIONS 3 AND 5. The unique key is (src_doc_id,
-- tgt_doc_id, tgt_section, edge_kind) -- `cue` is NOT part of it -- and
-- Section 5 writes edge_kind='section_ref' rows too. A chunk that cites BOTH
-- "909.21.11" (undefined -> Section 5 falls back to the ancestor "909.21")
-- AND "909.21" directly (resolved exactly here) produces the SAME key from
-- both Sections. Section 3's scoped DELETE deliberately does not touch
-- Section 5's rows, so re-running Section 3 after Section 5 would hit that
-- surviving row and abort the whole transaction with a unique violation --
-- i.e. the file's own "running any Section twice reproduces the same rows"
-- promise would be false. DO UPDATE (not DO NOTHING) is the right resolution
-- in that collision: an EXACT resolution must always win over an approximate
-- ancestor fallback, whichever order the two Sections were run in. `ranked`
-- is already unique on the conflict key (rn = 1), so this cannot try to
-- affect the same row twice within one statement.
ON CONFLICT (src_doc_id, tgt_doc_id, tgt_section, edge_kind) DO UPDATE
SET tgt_code      = EXCLUDED.tgt_code,
    cue           = EXCLUDED.cue,
    occurrences   = EXCLUDED.occurrences,
    evidence      = EXCLUDED.evidence,
    extractor_ver = EXCLUDED.extractor_ver;

-- Verify inside the transaction before committing.
-- EXPECTED: approx 9296 (band 8831-9761)
SELECT count(*) AS section_ref_edges
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1'
  AND edge_kind = 'section_ref'
  AND cue NOT LIKE '%:prefix_fallback';

-- OWNER: check the count above is within +/-5% of 9296, then COMMIT.
-- Otherwise ROLLBACK and compare the regex against design doc Section 2.2/2.5.
COMMIT;


-- ============================================================================
-- SECTION 4 -- sbc_xref_edges: cross_code edges
--
-- Explicit "SBC 201 Section N" / "SBC 801 Section N" mentions (design 2.2
-- census: 610 + 15 raw occurrences), resolved against the NAMED code's
-- defining index. Design 2.5 distinguishes two numbers, and this Section
-- reproduces that distinction instead of collapsing it:
--   - ~400 "resolved" = every mention that resolves to SOME defined section
--     in the named code, REGARDLESS of whether the citing chunk's own
--     code_type differs from the named code (an SBC201 chunk saying "...as
--     required by SBC 201 Section 903.2" resolves, but is NOT cross-code --
--     it is citing its own code by its full name).
--   - ~358 "genuinely cross-code" = the subset where the source chunk's
--     code_type actually DIFFERS from the named code. ONLY this subset is
--     inserted as edge_kind='cross_code' -- it is the real bridge between
--     the two documents (design 2.5: "the only bridge between the two
--     codes"). The 400-resolved figure is shown below as a probe only.
-- ============================================================================

-- --- Verify before insert ---
-- EXPECTED: resolved_pre_filter approx 400, genuinely_cross_code approx 358
-- (band 340-376)  [+/-5% on the 358 figure, design 2.5]
WITH cleaned AS (
  -- SAME strip-before-extraction step as Sections 3 and 5, applied here too.
  -- Design 2.3's tolerance for an external-standard reference becoming an
  -- internal edge is ZERO, and it is stated as a property of the extractor,
  -- not of one code path in it. "SBC 801 Section 404.2.8 of ICC A117.1" is
  -- rare phrasing, but it is the exact shape this Section's regex would
  -- otherwise turn into a cross_code edge pointing at SBC's own 404.2.8 -- a
  -- completely unrelated section in a fire-safety code. Running the strip
  -- unconditionally also keeps this Section's `evidence` excerpts drawn from
  -- the same cleaned text as Sections 3 and 5, so Section 8c's leak probe
  -- means the same thing for every edge_kind.
  SELECT
    d.id AS doc_id,
    d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ',
      'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT
    c.doc_id AS src_doc_id,
    c.code_type AS src_code_type,
    CASE m[2] WHEN '201' THEN 'SBC201' ELSE 'SBC801' END AS named_code,
    m[3] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(SBC\s*(201|801)\s+Sections?\s+([0-9]{3,4}(?:\.[0-9]+)+))',
    'gi'
  ) AS m
),
resolved AS (
  SELECT r.src_doc_id, r.src_code_type, sd.doc_id AS tgt_doc_id, r.named_code, r.target_section
  FROM raw_refs r
  JOIN sbc_section_defs sd
    ON sd.code_type = r.named_code AND sd.section = r.target_section
  WHERE sd.doc_id <> r.src_doc_id
)
SELECT
  count(*) AS resolved_pre_filter,
  count(*) FILTER (WHERE src_code_type <> named_code) AS genuinely_cross_code
FROM resolved;

-- --- Apply ---
BEGIN;

DELETE FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1' AND edge_kind = 'cross_code';

WITH cleaned AS (
  -- Strip external-standard citations BEFORE extraction -- see the probe's
  -- comment directly above for why this Section runs the strip too.
  SELECT
    d.id AS doc_id,
    d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ',
      'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT
    c.doc_id AS src_doc_id,
    c.code_type AS src_code_type,
    c.content AS src_content,
    m[1] AS full_match,
    CASE m[2] WHEN '201' THEN 'SBC201' ELSE 'SBC801' END AS named_code,
    m[3] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(SBC\s*(201|801)\s+Sections?\s+([0-9]{3,4}(?:\.[0-9]+)+))',
    'gi'
  ) AS m
),
resolved AS (
  SELECT
    r.src_doc_id, r.src_content,
    sd.doc_id AS tgt_doc_id, r.named_code AS tgt_code, r.target_section AS tgt_section,
    r.full_match
  FROM raw_refs r
  JOIN sbc_section_defs sd
    ON sd.code_type = r.named_code AND sd.section = r.target_section
  WHERE sd.doc_id <> r.src_doc_id
    AND r.src_code_type <> r.named_code   -- genuinely cross-code only
),
classified AS (
  SELECT
    src_doc_id, tgt_doc_id, tgt_code, tgt_section,
    left(
      substring(
        src_content
        from greatest(1, position(full_match in src_content) - 80)
        for 300
      ),
      200
    ) AS evidence
  FROM resolved
),
ranked AS (
  SELECT
    src_doc_id, tgt_doc_id, tgt_code, tgt_section, evidence,
    count(*) OVER (PARTITION BY src_doc_id, tgt_doc_id, tgt_section) AS occurrences,
    row_number() OVER (PARTITION BY src_doc_id, tgt_doc_id, tgt_section ORDER BY evidence) AS rn
  FROM classified
)
INSERT INTO sbc_xref_edges
  (src_doc_id, tgt_doc_id, tgt_code, tgt_section, edge_kind, cue, occurrences, evidence, extractor_ver)
SELECT
  src_doc_id, tgt_doc_id, tgt_code, tgt_section, 'cross_code', 'bare', occurrences, evidence, 'xref_v1'
FROM ranked
WHERE rn = 1;

-- Verify inside the transaction before committing.
-- EXPECTED: approx 358 (band 340-376)
SELECT count(*) AS cross_code_edges
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1' AND edge_kind = 'cross_code';

-- OWNER: check the count above is within +/-5% of 358, then COMMIT.
-- Otherwise ROLLBACK and compare the regex against design doc Section 2.2/2.5.
COMMIT;


-- ============================================================================
-- SECTION 5 -- sbc_xref_edges: longest-prefix fallback (design 2.8)
--
-- For a same-code target that failed to resolve exactly in Section 3 (e.g.
-- "909.21.11" is cited but never itself appears in title position --
-- design 2.8's "29.6% of chunks define no dotted section at all" finding),
-- try its nearest defined ANCESTOR by stripping the last dotted segment
-- repeatedly: "909.21.11" -> "909.21" -> "909" (stopping at the first
-- prefix that IS defined, or once no dot is left / depth 5). Design 2.8
-- measured this adds only ~168 pairs out of 14,701 candidates (1.1%) --
-- "almost free", and is explicitly NOT sold as a fix for the underlying
-- no-overlap-chunking problem (design 5.6 covers that separately, out of
-- scope here). Every edge this Section inserts has ':prefix_fallback'
-- appended to whatever cue the original occurrence had, so a reviewer can
-- immediately tell it is an approximate resolution, not an exact one.
-- ============================================================================

-- --- Verify before insert ---
-- EXPECTED: approx 168 (design 2.8 states this as a direct measurement, not
-- an estimate with a stated tolerance; treat +/-5% as the same band used
-- everywhere else in this file for consistency)
WITH RECURSIVE cleaned AS (
  SELECT
    d.id AS doc_id, d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ', 'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT DISTINCT
    c.doc_id AS src_doc_id, c.code_type AS src_code_type, m[2] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(\min\s+accordance\s+with\s+Sections?\s+|\msee\s+Sections?\s+|\mcompl(?:y|ies|ying)\s+with\s+Sections?\s+|\mrequired\s+(?:by|in)\s+Sections?\s+|\mspecified\s+in\s+Sections?\s+|\mSections?\s+)([0-9]{3,4}(?:\.[0-9]+)+)',
    'gi'
  ) AS m
),
unresolved AS (
  SELECT r.src_doc_id, r.src_code_type, r.target_section
  FROM raw_refs r
  WHERE r.target_section ~ '\.'
    AND NOT EXISTS (
      SELECT 1 FROM sbc_section_defs sd
      WHERE sd.code_type = r.src_code_type AND sd.section = r.target_section
    )
),
prefixes AS (
  SELECT src_doc_id, src_code_type, target_section AS original_section,
         regexp_replace(target_section, '\.[0-9]+$', '') AS candidate, 1 AS depth
  FROM unresolved
  UNION ALL
  SELECT p.src_doc_id, p.src_code_type, p.original_section,
         regexp_replace(p.candidate, '\.[0-9]+$', ''), p.depth + 1
  FROM prefixes p
  WHERE p.candidate ~ '\.' AND p.depth < 5
),
best_match AS (
  SELECT DISTINCT ON (p.src_doc_id, p.original_section)
    p.src_doc_id, sd.doc_id AS tgt_doc_id, p.candidate AS tgt_section
  FROM prefixes p
  JOIN sbc_section_defs sd ON sd.code_type = p.src_code_type AND sd.section = p.candidate
  WHERE sd.doc_id <> p.src_doc_id
  ORDER BY p.src_doc_id, p.original_section, p.depth ASC
)
SELECT count(*) AS prefix_fallback_pairs FROM best_match;

-- --- Apply ---
BEGIN;

-- Scoped delete: this Section owns every row whose cue carries the
-- ':prefix_fallback' suffix, regardless of the original cue it is suffixed
-- to -- Section 3 never writes a cue with that suffix, so this cannot clobber
-- Section 3's rows (and vice versa).
DELETE FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1' AND cue LIKE '%:prefix_fallback';

WITH RECURSIVE cleaned AS (
  SELECT
    d.id AS doc_id, d.code_type,
    regexp_replace(
      d.content,
      'Sections?\s+[0-9]{2,4}(?:\.[0-9]+)*\s+of\s+(?:ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)[^ ]*',
      ' ', 'gi'
    ) AS content
  FROM sbc_documents d
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
raw_refs AS (
  SELECT
    c.doc_id AS src_doc_id, c.code_type AS src_code_type,
    m[1] AS cue_text, m[2] AS target_section
  FROM cleaned c
  CROSS JOIN LATERAL regexp_matches(
    c.content,
    '(\min\s+accordance\s+with\s+Sections?\s+|\msee\s+Sections?\s+|\mcompl(?:y|ies|ying)\s+with\s+Sections?\s+|\mrequired\s+(?:by|in)\s+Sections?\s+|\mspecified\s+in\s+Sections?\s+|\mSections?\s+)([0-9]{3,4}(?:\.[0-9]+)+)',
    'gi'
  ) AS m
),
classified AS (
  SELECT
    src_doc_id, src_code_type, target_section,
    CASE
      WHEN cue_text ~* 'in\s+accordance\s+with'    THEN 'in_accordance_with'
      WHEN cue_text ~* '^see\s'                     THEN 'see'
      WHEN cue_text ~* 'compl(y|ies|ying)\s+with'    THEN 'comply_with'
      WHEN cue_text ~* 'required\s+(by|in)'          THEN 'required_by'
      WHEN cue_text ~* 'specified\s+in'              THEN 'specified_in'
      ELSE 'bare'
    END AS cue
  FROM raw_refs
),
unresolved AS (
  SELECT DISTINCT ON (cl.src_doc_id, cl.target_section)
    cl.src_doc_id, cl.src_code_type, cl.target_section, cl.cue
  FROM classified cl
  WHERE cl.target_section ~ '\.'
    AND NOT EXISTS (
      SELECT 1 FROM sbc_section_defs sd
      WHERE sd.code_type = cl.src_code_type AND sd.section = cl.target_section
    )
  ORDER BY cl.src_doc_id, cl.target_section,
    CASE cl.cue
      WHEN 'in_accordance_with' THEN 1
      WHEN 'comply_with'        THEN 2
      WHEN 'required_by'        THEN 3
      WHEN 'specified_in'       THEN 4
      WHEN 'see'                THEN 5
      ELSE 6
    END
),
prefixes AS (
  SELECT src_doc_id, src_code_type, target_section AS original_section, cue,
         regexp_replace(target_section, '\.[0-9]+$', '') AS candidate, 1 AS depth
  FROM unresolved
  UNION ALL
  SELECT p.src_doc_id, p.src_code_type, p.original_section, p.cue,
         regexp_replace(p.candidate, '\.[0-9]+$', ''), p.depth + 1
  FROM prefixes p
  WHERE p.candidate ~ '\.' AND p.depth < 5
),
best_match AS (
  SELECT DISTINCT ON (p.src_doc_id, p.original_section)
    p.src_doc_id, p.src_code_type, sd.doc_id AS tgt_doc_id, p.candidate AS tgt_section,
    p.original_section, p.cue
  FROM prefixes p
  JOIN sbc_section_defs sd ON sd.code_type = p.src_code_type AND sd.section = p.candidate
  WHERE sd.doc_id <> p.src_doc_id
  ORDER BY p.src_doc_id, p.original_section, p.depth ASC
),
with_evidence AS (
  SELECT
    bm.src_doc_id, bm.tgt_doc_id, bm.src_code_type AS tgt_code, bm.tgt_section, bm.cue,
    bm.original_section,
    left(
      substring(
        c.content
        from greatest(1, position(bm.original_section in c.content) - 80)
        for 300
      ),
      200
    ) AS evidence
  FROM best_match bm
  JOIN cleaned c ON c.doc_id = bm.src_doc_id
),
deduped AS (
  -- best_match is unique per (src_doc_id, ORIGINAL_section), not per resolved
  -- TARGET. One chunk citing both "909.21.11" and "909.21.12" -- neither
  -- defined -- collapses BOTH to the same ancestor "909.21", i.e. two rows
  -- with the same (src_doc_id, tgt_doc_id, tgt_section, edge_kind) unique key.
  -- ON CONFLICT DO NOTHING would silently keep whichever of the two the
  -- executor happened to insert first, which is not a defined order -- and the
  -- design's determinism requirement (2.6.3, "deterministic tie-break ...
  -- without it there is no byte-identical test") applies to the build as much
  -- as to the query path. Collapse them here instead, on a stated key
  -- (lowest original_section), and record how many originals collapsed into
  -- this edge as `occurrences`.
  SELECT DISTINCT ON (src_doc_id, tgt_doc_id, tgt_section)
    src_doc_id, tgt_doc_id, tgt_code, tgt_section, cue, evidence, original_section,
    count(*) OVER (PARTITION BY src_doc_id, tgt_doc_id, tgt_section) AS occurrences
  FROM with_evidence
  ORDER BY src_doc_id, tgt_doc_id, tgt_section, original_section
)
INSERT INTO sbc_xref_edges
  (src_doc_id, tgt_doc_id, tgt_code, tgt_section, edge_kind, cue, occurrences, evidence, extractor_ver)
SELECT
  src_doc_id, tgt_doc_id, tgt_code, tgt_section, 'section_ref', cue || ':prefix_fallback', occurrences, evidence, 'xref_v1'
FROM deduped
-- DO NOTHING (not DO UPDATE) on purpose, and it is the mirror image of
-- Section 3's DO UPDATE: an approximate ancestor fallback must never overwrite
-- an exact resolution, in either run order.
ON CONFLICT (src_doc_id, tgt_doc_id, tgt_section, edge_kind) DO NOTHING;

-- Verify inside the transaction before committing.
-- EXPECTED: approx 168
SELECT count(*) AS prefix_fallback_edges
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1' AND cue LIKE '%:prefix_fallback';

-- OWNER: check the count above is in the same ballpark as 168, then COMMIT.
-- This is the smallest, lowest-stakes Section in the file -- if it looks
-- off, ROLLBACK and re-read design doc Section 2.8 before re-running.
COMMIT;


-- ============================================================================
-- SECTION 6 -- sbc_external_refs: census of citations to standards we do
-- NOT hold (design 2.3, 5.5)
--
-- Same pattern Section 3 STRIPS out of content before extraction -- this
-- Section is the other half of that decision: instead of silently
-- discarding those ~206 citations in ~141 rows, record them in their own
-- table so a future reader can be told "the code cites NFPA 13 here, and
-- ConsultX does not have NFPA 13" (design 5.5, recommendation R4) -- a
-- safety feature, explicitly NOT wired into any reader by this script
-- (that requires a separate owner decision -- design Section 6
-- "recommendations", out of scope here).
-- ============================================================================

-- --- Schema (idempotent) ---
create table if not exists sbc_external_refs (
  id            bigserial primary key,
  doc_id        bigint not null references sbc_documents(id) on delete cascade,
  standard      text   not null,
  standard_ref  text   not null,
  occurrences   int    not null default 1,
  evidence      text   not null,
  extractor_ver text   not null,
  created_at    timestamptz not null default now(),
  unique (doc_id, standard_ref, extractor_ver)
);
create index if not exists idx_sbc_external_refs_doc on sbc_external_refs (doc_id);
create index if not exists idx_sbc_external_refs_standard on sbc_external_refs (standard);

alter table sbc_external_refs enable row level security;
revoke all on sbc_external_refs from public, anon, authenticated;
grant  all on sbc_external_refs to service_role;
-- Same sequence caveat as sbc_xref_edges above: the bigserial sequence has its
-- own ACL, no RLS, and is granted to anon/authenticated by default.
revoke all on sequence sbc_external_refs_id_seq from public, anon, authenticated;
grant  all on sequence sbc_external_refs_id_seq to service_role;

-- --- Verify before insert ---
-- EXPECTED: raw_occurrences approx 206 (band 196-216), distinct_rows approx 141 (band 134-148)
-- [+/-5%, design 2.3]
WITH raw_ext AS (
  SELECT
    d.id AS doc_id,
    m[2] AS standard,
    m[1] AS standard_ref
  FROM sbc_documents d
  CROSS JOIN LATERAL regexp_matches(
    d.content,
    -- {1,4} not {2,4}: design 2.3's census (206 occurrences / 141 rows) counts
    -- single-digit-chapter citations too ("Section 4 of NFPA 13"). Measured
    -- 2026-08-25: {2,4} yields 97/66, {1,4} reproduces the design's 206/141
    -- exactly. The strips in Sections 3-5 deliberately KEEP {2,4}: an internal
    -- edge target requires a 3-4 digit major, so single-digit external refs
    -- can never poison an edge -- see docs/audits/xref-build-s4-band-note-20260825.md.
    'Sections?\s+[0-9]{1,4}(?:\.[0-9]+)*\s+of\s+((ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)(?:\s+[A-Za-z0-9.\-]+)?)',
    'gi'
  ) AS m
  WHERE d.code_type IN ('SBC201', 'SBC801')
)
SELECT count(*) AS raw_occurrences, count(DISTINCT doc_id) AS distinct_rows
FROM raw_ext;

-- --- Apply ---
BEGIN;

DELETE FROM sbc_external_refs WHERE extractor_ver = 'xref_v1';

WITH raw_ext AS (
  SELECT
    d.id AS doc_id,
    upper(m[2]) AS standard,
    -- The separator inside the captured reference is `\s+`, which in this
    -- corpus really can be a hard newline (design 2.2's central finding).
    -- Without collapsing it, "NFPA\n13" and "NFPA 13" in the same chunk are
    -- two DIFFERENT standard_ref values under the unique key
    -- (doc_id, standard_ref, extractor_ver), so one cited standard is
    -- double-counted as two rows. Normalise for storage; keep the raw matched
    -- text separately, because the evidence excerpt below has to locate the
    -- match in the original content.
    regexp_replace(m[1], '\s+', ' ', 'g') AS standard_ref,
    m[1] AS matched_text
  FROM sbc_documents d
  CROSS JOIN LATERAL regexp_matches(
    d.content,
    -- {1,4}: matches the census probe above (design 2.3's 206/141 basis).
    'Sections?\s+[0-9]{1,4}(?:\.[0-9]+)*\s+of\s+((ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)(?:\s+[A-Za-z0-9.\-]+)?)',
    'gi'
  ) AS m
  WHERE d.code_type IN ('SBC201', 'SBC801')
),
grouped AS (
  SELECT
    doc_id, standard, standard_ref,
    count(*) AS occurrences,
    min(matched_text) AS matched_text   -- deterministic representative
  FROM raw_ext
  GROUP BY doc_id, standard, standard_ref
),
with_evidence AS (
  SELECT
    g.doc_id, g.standard, g.standard_ref, g.occurrences,
    left(
      substring(
        d.content
        from greatest(1, position(g.matched_text in d.content) - 80)
        for 300
      ),
      200
    ) AS evidence
  FROM grouped g
  JOIN sbc_documents d ON d.id = g.doc_id
)
INSERT INTO sbc_external_refs (doc_id, standard, standard_ref, occurrences, evidence, extractor_ver)
SELECT doc_id, standard, standard_ref, occurrences, evidence, 'xref_v1'
FROM with_evidence;

-- Verify inside the transaction before committing.
-- EXPECTED: total_occurrences approx 206, distinct_rows approx 141 (same +/-5% band)
SELECT sum(occurrences) AS total_occurrences, count(DISTINCT doc_id) AS distinct_rows
FROM sbc_external_refs
WHERE extractor_ver = 'xref_v1';

COMMIT;


-- ============================================================================
-- SECTION 7 -- sbc_xref_indegree: per-doc in-degree, computed once at build
-- time (feeds hub-damping in a later, not-yet-built phase; this script does
-- not touch fire-safety-chat or anything that reads at query time).
-- ============================================================================

create table if not exists sbc_xref_indegree (
  doc_id    bigint primary key references sbc_documents(id) on delete cascade,
  in_degree int not null
);

alter table sbc_xref_indegree enable row level security;
revoke all on sbc_xref_indegree from public, anon, authenticated;
grant  all on sbc_xref_indegree to service_role;

-- --- Verify before insert (sanity check only -- no tight EXPECTED band;
-- design 2.5 measured 2,404 distinct in-degree targets (51.9% of 4,630) for
-- same-code edges alone, before cross_code/prefix_fallback add a few more) ---
SELECT count(DISTINCT tgt_doc_id) AS distinct_targets
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1';

-- --- Apply ---
BEGIN;

DELETE FROM sbc_xref_indegree;

INSERT INTO sbc_xref_indegree (doc_id, in_degree)
SELECT tgt_doc_id, count(*)
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1'
GROUP BY tgt_doc_id;

-- Verify inside the transaction before committing.
SELECT count(*) AS indegree_rows, max(in_degree) AS max_indegree
FROM sbc_xref_indegree;

COMMIT;


-- ============================================================================
-- SECTION 8 -- G0 gate probes (read-only; no BEGIN/COMMIT -- nothing here
-- writes). Run last, keep the output. This covers the AUTOMATED half of the
-- design's G0 gate (design doc "G0", items 1-3). Item 4 -- manual review of
-- a 50-edge sample, >=90% accuracy against the printed SBC page -- is
-- scripts/sample-xref-edges.mjs, run separately. Item 5 -- tsc / test /
-- build / deno check -- is run separately, outside this SQL file.
-- scripts/build-xref-graph-verify.mjs re-runs this Section's checks
-- read-only through the app's own Supabase credentials, any time after.
-- ============================================================================

-- 8a. Totals vs EXPECTED (all +/-5%, design G0 gate #1)
-- EXPECTED: section_ref approx 9296, cross_code approx 358, prefix_fallback approx 168
SELECT
  count(*) FILTER (WHERE edge_kind = 'section_ref' AND cue NOT LIKE '%:prefix_fallback') AS section_ref_edges,
  count(*) FILTER (WHERE edge_kind = 'cross_code') AS cross_code_edges,
  count(*) FILTER (WHERE cue LIKE '%:prefix_fallback') AS prefix_fallback_edges,
  count(*) AS total_edges
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1';

-- 8b. Zero edges to sbc_code_tables (design 5.2 -- ABSOLUTE constraint: this
-- design is forbidden from ever creating an edge that lends an undocumented
-- editorial table row structural legitimacy it does not have). Structurally
-- impossible here: tgt_doc_id carries a foreign key to sbc_documents(id)
-- only -- sbc_xref_edges has no column that could reference sbc_code_tables
-- at all. This probe confirms that FK -- not assumed, read live from the
-- catalog, in case the schema was ever hand-edited after this file ran.
-- EXPECTED: exactly 1 row, references_table = 'sbc_documents'
SELECT
  tc.constraint_name, kcu.column_name, ccu.table_name AS references_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'sbc_xref_edges'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'tgt_doc_id';

-- 8c. Zero edges whose evidence still shows a {2,4}-digit external-standard
-- citation -- i.e. the Section 3 strip-before-extraction actually worked
-- (design 2.3 zero-tolerance requirement). SCOPE (2026-08-27 review): this
-- gate audits exactly the citation shape the strip removes ({2,4}-digit
-- majors). It is structurally blind to single-digit citations ("Section 4 of
-- NFPA 13"), which the strip deliberately does NOT remove -- see 8c-ii.
-- EXPECTED: 0
SELECT count(*) AS edges_with_leaked_external_citation
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1'
  AND evidence ~* 'Sections?\s+[0-9]{2,4}(\.[0-9]+)*\s+of\s+(ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)';

-- 8c-ii. INFORMATIONAL (not a gate): edges whose evidence carries a
-- SINGLE-digit external-standard citation ("Section 4 of NFPA 13"). These
-- can never mint a false edge (every edge-target regex requires a 3-4 digit
-- major), and the strip keeps {2,4} on purpose so the certified xref_v1
-- extraction stays byte-reproducible -- but such text CAN sit inside the
-- +/-80-char evidence excerpt of a genuine internal edge. Counted here for
-- visibility; widening the strip to {1,4} is a G2 candidate that requires an
-- extractor_ver bump and a rebuild.
-- EXPECTED: report (non-zero acceptable -- record the count, monitor drift)
-- MEASURED 2026-08-27 against production xref_v1: 16 edges (e.g. "Section
-- 4.6 of NFPA 221", "Section 7.3.3.1 of NFPA 14" inside otherwise-valid
-- internal-edge evidence).
SELECT count(*) AS edges_with_single_digit_external_citation_in_evidence
FROM sbc_xref_edges
WHERE extractor_ver = 'xref_v1'
  AND evidence ~* 'Sections?\s+[0-9](\.[0-9]+)*\s+of\s+(ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)'
  AND evidence !~* 'Sections?\s+[0-9]{2,4}(\.[0-9]+)*\s+of\s+(ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)';

-- 8d. Top-10 in-degree -- PLAUSIBILITY probe, not a pass/fail gate. Design
-- 2.5 predicts 903.3.1.1 (automatic sprinkler systems) at the top in BOTH
-- codes. If it is nowhere near the top, the extractor is probably not
-- capturing real citations and the whole build should be treated as
-- suspect regardless of what the counts in 8a say.
SELECT
  d.id AS doc_id, d.code_type, sd.section, i.in_degree
FROM sbc_xref_indegree i
JOIN sbc_documents d ON d.id = i.doc_id
LEFT JOIN sbc_section_defs sd ON sd.doc_id = i.doc_id
ORDER BY i.in_degree DESC
LIMIT 10;

-- ============================================================================
-- End of file. No reader was touched. No row in sbc_documents, source_registry,
-- graph_nodes, graph_edges, or community_summaries was read, written, or
-- deleted by anything above -- this file only creates and populates the four
-- new tables listed in the header.
-- ============================================================================
