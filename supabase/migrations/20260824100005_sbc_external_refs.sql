-- ConsultX 2026-08-24 -- sbc_external_refs: standards the code CITES, not
-- standards the platform HAS
-- Part of the Advisory Brain plan (P5-R4).
-- Idempotent. Safe to re-run. The OWNER applies this by hand in the Supabase
-- SQL Editor. NEVER `supabase db push` -- this repo has known migration drift.
--
-- WHAT THIS IS FOR -- READ THIS BEFORE USING THIS TABLE FOR ANYTHING
-- ---------------------------------------------------------------------
-- public.sbc_external_refs records every place an SBC chunk cites an
-- external standard by name -- "in accordance with NFPA 13", "per ASTM
-- E119", and so on (the strip-before-extraction pattern in design doc
-- Section 2.3: `Sections? N of (ICC|NFPA|ASTM|UL|ASME|ANSI|ISO|API|AWS)`,
-- measured at 206 occurrences in 141 rows of the current corpus).
--
-- THIS TABLE IS A SAFETY/HONESTY FEATURE, NOT A SOURCE CATALOG. It exists so
-- that a future reader can say "the code points to NFPA 13 here" WITHOUT
-- ever implying ConsultX has NFPA 13's text, can quote it, or can verify
-- compliance against it. ConsultX does not hold NFPA, SFPE, IBC, or IFC
-- content. CLAUDE.md is explicit: "Never claim sources the model does not
-- have (no fabricated NFPA/SFPE/IBC/IFC availability)." A row in this table
-- is evidence of a CITATION found in SBC text -- never evidence of
-- AVAILABILITY. Any future UI, prompt, or retrieval code that reads this
-- table MUST surface it as "the code references external standard X here"
-- and MUST NOT present it as a source ConsultX can retrieve, quote, or
-- reason over. This is precisely the boundary
-- docs/audits/graphrag-design-20260823.md Section 2.3/5.5 designs the
-- cross-reference graph never to cross: zero sbc_xref_edges rows may be
-- sourced from an external-standard reference (G0 gate 3 in that document);
-- this table is where those references go instead, kept structurally
-- separate from the internal section-to-section graph in
-- 20260824100004_sbc_xref_graph.sql.
--
-- THIS MIGRATION SHIPS SCHEMA ONLY. No extractor script and no first
-- population are part of this file. The table is empty immediately after
-- this migration is applied: ZERO readers, ZERO writers, ZERO effect on any
-- answer the product gives today.
--
-- NO NEW INFRASTRUCTURE. Same Postgres database as everything else in this
-- project.
--
-- RLS -- service_role only, matching sbc_xref_edges and public.job_locks
-- -------------------------------------------------------------------------
-- RLS ENABLED, NO policy for anon or authenticated, explicit REVOKE from
-- PUBLIC/anon/authenticated, explicit GRANT to service_role. RLS is never
-- weakened anywhere in this file.

-- ============================================================================
-- SECTION 1 -- sbc_external_refs
-- ============================================================================
-- FK carries ON DELETE CASCADE, matching every other new-table reference to
-- sbc_documents(id) in this migration set (20260824100004_sbc_xref_graph.sql)
-- -- a citation record has no meaning once the chunk that cited it is gone.
--
-- standard_ref has no NOT NULL / CHECK constraint here: a citation can name
-- only the family ("NFPA") without a specific document number, and forcing a
-- value would mean inventing one that was never in the source text.

CREATE TABLE IF NOT EXISTS public.sbc_external_refs (
  id            bigserial   PRIMARY KEY,
  doc_id        bigint      NOT NULL REFERENCES public.sbc_documents(id) ON DELETE CASCADE,
  standard      text        NOT NULL,      -- e.g. 'NFPA'
  standard_ref  text,                      -- e.g. 'NFPA 13'
  occurrences   int         NOT NULL DEFAULT 1,
  evidence      text        NOT NULL,
  extractor_ver text        NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (doc_id, standard_ref, extractor_ver)
);

CREATE INDEX IF NOT EXISTS idx_sbc_external_refs_doc ON public.sbc_external_refs (doc_id);

COMMENT ON TABLE public.sbc_external_refs IS
  'Standards an SBC chunk CITES, not standards ConsultX HAS. Safety/honesty feature, not a source catalog -- see the header of 20260824100005_sbc_external_refs.sql. Never read as "available sources"; ConsultX holds no NFPA/SFPE/IBC/IFC content. One row per distinct (doc_id, standard_ref, extractor_ver) citation, e.g. a chunk citing "NFPA 13". Empty until a future extractor script populates it. RLS on, service_role only.';
COMMENT ON COLUMN public.sbc_external_refs.standard IS
  'Standards body or family named at the citation site, e.g. NFPA, ASTM, UL, ASME, ANSI, ISO, API, AWS, ICC.';
COMMENT ON COLUMN public.sbc_external_refs.standard_ref IS
  'Specific document cited, e.g. ''NFPA 13'', when the source text names one. NULL when the citation names only the family (e.g. bare "NFPA") with no specific document number -- left NULL rather than inventing a number the source text never stated.';
COMMENT ON COLUMN public.sbc_external_refs.occurrences IS
  'How many times this exact citation was seen while extracting doc_id''s chunk. Not a corpus-wide count.';
COMMENT ON COLUMN public.sbc_external_refs.evidence IS
  'Verbatim source text the citation was derived from, so a human can audit any row against the printed page without re-running the extractor.';
COMMENT ON COLUMN public.sbc_external_refs.extractor_ver IS
  'Version tag of the extractor run that produced this row. Lets a re-extraction be told apart from the previous one and rolled back independently.';

-- ============================================================================
-- SECTION 2 -- Row Level Security
-- ============================================================================
-- RLS on, no policy for anon or authenticated -- not even a read policy --
-- so both roles see zero rows regardless of the grants in SECTION 3.
-- service_role bypasses RLS entirely.

ALTER TABLE public.sbc_external_refs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 3 -- grants (defence in depth; see SECTION 2)
-- ============================================================================

REVOKE ALL ON TABLE public.sbc_external_refs FROM PUBLIC;
REVOKE ALL ON TABLE public.sbc_external_refs FROM anon;
REVOKE ALL ON TABLE public.sbc_external_refs FROM authenticated;
GRANT  ALL ON TABLE public.sbc_external_refs TO   service_role;

-- ============================================================================
-- SECTION 4 -- PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';
