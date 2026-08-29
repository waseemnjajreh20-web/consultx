# ADV-031 / ADV-032 root cause: legacy synthetic chapter blobs hijack sprinkler retrieval

**Date:** 2026-08-29 · **Status:** CONFIRMED (four independent evidence reads)
**Scope:** why both safety-critical sprinkler questions failed tier-A in the
2026-08-26 baseline (flags OFF, keyword engine), and what the corpus actually
holds for Section 903.3.1.1.

## The failure as measured

Baseline run `evals/results/2026-08-26-baseline-flagsoff/`:

| Row | tier-A outcome | What the answer did |
|---|---|---|
| ADV-031 standard | 0/2 sections, chain 0/1 | Asked a clarifying question instead of answering |
| ADV-031 analysis | 2/2 sections, chain 1/1, **fabricated clause** | Cited a fabricated NFPA clause number |
| ADV-032 standard | 1/2 sections | Answered honestly: "required code text ... not available in the provided files. [NO SOURCE]" |
| ADV-032 analysis | 1/2 sections, chain 0/1 | Classified correctly, could not cite 903.3.1.1 |

All four rows share one retrieval signature (`sbc_sources` header):
`SBC801_Ch10_v2_chunks.json` was the ONLY narrative file that survived
chunk selection. The repaired page-range blob that actually holds
Section 903 (`SBC 801 ... 401-600_extracted_chunks.json`) contributed
nothing to the context.

## Evidence

1. **The bucket still holds three legacy synthetic files** (verified by
   read-only `storage/v1/object/list` on 2026-08-29):
   `SBC801_Ch9_v1_chunks.json` (378,747 B), `SBC801_Ch10_v2_chunks.json`
   (625,581 B), `SBC801_Ch11_v2_chunks.json` (16,237 B). These are NOT
   canonical extractions - they are AI-generated study summaries
   (`generated_at: 2026-04-24`, `[VERIFIED_CORE][STRUCTURED_FACT]`
   banners, emoji headers, `[[sbc-...]]` wiki links, Arabic paraphrase).
   The Ch9 file contains the section-sign symbol 15 times (symbol-hygiene
   violation living in production retrieval data) and the string "NFPA"
   140 times in 20 chunks.

2. **The canonical 903 content lives in the repaired 401-600 blob**: 31
   chunks with `section_number` 903.* including 903.2.1, 903.2.3 and four
   903.3.1 chunks whose text carries the 903.3.1.1 requirement language.

3. **The production corpus has NO `sbc_documents` row with
   `section_number = '903.3.1.1'`** (REST probe: exact match 0 rows;
   `903.3.1` has 38 rows across both codes; `903.2.3` has 3 rows). The
   subsection exists only as text INSIDE 903.3.1/903 chunks. Any scorer
   or retrieval path that needs a dedicated 903.3.1.1 row cannot find one.

4. **Mechanism** (`fetchSBCContext`, `supabase/functions/fire-safety-chat/index.ts`):
   file selection admits `SBC801_Ch10_v2_chunks.json` because its name
   contains "801" and has no page-range digits, so `scoreFile` gives it
   the default score 1 and it enters the candidate set. Chunk scoring
   then favors it: the synthetic chunks are short, keyword-dense
   (Arabic + English sprinkler terms repeated in summary form), so they
   outscore the longer canonical chunks and consume the context budget.
   The model then sees egress/summary content instead of the canonical
   903.3.1.1 text -> it either asks for clarification (ADV-031 standard),
   answers "not available" (ADV-032 standard - honest, still a tier-A
   fail), or free-recalls NFPA from priors and fabricates a clause
   number (ADV-031 analysis - the dangerous one).

## Relation to prior record

`docs/audits/chapter-volume-map-20260823.md` already flagged the phantom
chapters and the deferred "egress -> ch10 keyword" fix with the note that
changing keywords before the blob upload "would evict repaired MB files
for truncated KB blobs." The blob upload has since been completed
(Station 3, 2026-08-25). The eviction is no longer hypothetical - it is
measured live in the baseline. What was deferred is now actionable.

## Remediation options (decision pending, NOT executed)

- **Option A (data-only, no deploy, reversible):** rename the three
  legacy files in bucket `ssss` to a quarantine prefix (e.g.
  `_quarantined_SBC801_Ch9_v1_chunks.json`). `fetchSBCContext` matches
  files by name pattern, so renamed files simply stop being selected.
  Risk: any query whose context currently comes ONLY from these
  files loses that context. Mitigation: the canonical page-range blobs
  cover chapters 9/10/11 of SBC 801 - VERIFIED 2026-08-29 against the
  local byte-identical copies of the uploaded blobs: ch9 = 150 chunks
  (401-600), ch10 = 271 chunks (601-800 + 801-1000), ch11 = 34 chunks.
  Nothing in the three legacy files is exclusive.
- **Option B (code change):** exclude `Ch\d+_v\d` name patterns in
  `fetchSBCContext`. Same effect, but requires function deploy +
  three-mode validation per the operating contract.
- Either option is measured by re-running the 8-question subset and
  comparing ADV-031/032 before/after, per the runbook's
  one-change-per-measurement rule.

Option A is recommended first: no deploy, instantly reversible by
renaming back, and testable within minutes.
