# Advisory Corpus Source Repair Audit

**Date:** 2026-05-01
**Scope:** Make SBC 801 Section 903.2.7 and Section 907.2.7 (and SBC 201 sister clauses) real retrieved sources for Advisory mode, not "expected references".
**Mode:** read-only inspection. No code edits, no DB writes, no migrations, no deploys.

---

## 1. Inspection constraints

- The live Supabase service-role key is not available in this shell, and per the strict rules I did not request it. Therefore live `sbc_documents` / `sbc_code_tables` / `graph_nodes` / `community_summaries` / `ssss` bucket queries were **not executed**. The "live state" findings below are derived from code-level evidence already analyzed in prior audits (live retrieval traces, `fetchSBCContext`, `fetchSBCContextVector`, the `output_processed` upload manifest) plus what the previous live retest showed in the source panel.
- External asset path `D:\sbc_consultx` is **available** and contains 625 entries. Inventory and key files are below.

## 2. D:\sbc_consultx — confirmed contents (relevant subset)

**Raw PDFs** (same volumes as the production bucket `ssss`):
- `SBC 801 - The Saudi Fire Protection Code (3)-1-200.pdf` … `-1801-2061.pdf` (10 page-range volumes).
- `SBC 201 - The Saudi General Building Code-1-250.pdf` … `-2001-2200.pdf` (8 page-range volumes).

**Section-level Markdown** (the asset that does NOT exist in the production bucket):
- `sbc-801-section-903.md` — full Section 903 with Section 903.1, Section 903.2 lead-in, Section 903.2.1–Section 903.2.11 (incl. Section 903.2.7 Mercantile, 1,115 m² threshold), Section 903.3.1.1–Section 903.3.1.3, cross-references, page anchor `pp. 443–471`.
- `sbc-801-section-903-2.md` — meta-stub for Section 903.2 (pending maintainer synthesis; not source-rich).
- `sbc-801-section-907.md` — full Section 907 with Section 907.1–Section 907.2.1 verbatim, Group-by-Group commentary table, NFPA 72 reference, source anchor `pp. 531–588`.
- `sbc-801-section-907-2-11.md` — meta-stub for Section 907.2.11 (not source-rich).
- `sbc-201-section-903.md` — full mirror in SBC 201 (Chapter 9).
- `sbc-201-section-907.md` — full mirror in SBC 201.

**Raw extracted text**:
- `extracted_907_909.txt` (lines 1312–1376) — verbatim Section 907.2.7 Group M clause text including:
  > "907.2.7 Group M. A manual fire alarm system that activates the occupant notification system in accordance with Section 907.5 shall be installed in Group M occupancies where one of the following conditions exists: 1. The combined Group M occupant load of all floors is 500 or more persons. 2. The Group M occupant load is more than 100 persons above or below the lowest level of exit discharge. Exceptions: 1. … 2. …"
  Plus the cross-reference: "Buildings with a fire area containing a Group M occupancy in excess of 1115 m² must be equipped with an automatic sprinkler system complying with Section 903.2.7."
- `extracted_sections.md` (lines 869–897) — verbatim Section 903.2.7 Group M sprinkler text:
  > "903.2.7 Group M. An automatic sprinkler system shall be provided throughout buildings containing a Group M occupancy where one of the following conditions exists: 1. A Group M fire area exceeds 1115 m². 2. A Group M fire area is located more than three stories above grade plane. 3. The combined area of all Group M fire areas on all floors, including any mezzanines, exceeds 2230 m²."
  Plus Section 903.2.7.1 (high-piled storage, Chapter 32 reference) and Section 903.2.7.2 (upholstered furniture / mattresses, 465 m² threshold).

**Helper scripts** (do not need to run for repair, but useful for re-extraction):
- `extract_ch9.py`, `extract_text*.py` — produced `extracted_907_909*.txt`.
- `gen_ledger.py`, `update_ledger_b1.py` — produced `ch9_sections.txt`.
- `gen_chapter*.py`, `gen_section716.py`, `gen_section506.py` — section-md generation pattern (the same pattern would generate section-bound chunks for Section 903 and Section 907).
- `sbc801_sections_clean.json` (sibling: `sbc201_sections_clean.json`) — section-level structured JSON from earlier extraction.

## 3. Live state — what's actually retrievable today

Derived from `supabase/functions/fire-safety-chat/index.ts` and `scripts/upload-sbc-files.cjs`:

- **Bucket `ssss`** holds JSON chunks named `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` (one file per 200-page raw-PDF range). These are NOT section-level; they are page-range JSON blobs from `output_processed/`.
- **`fetchSBCContext`** (Advisory text path, lines 1599–1905) downloads up to 12 of these files based on filename page-range overlap with the chapter-keyword target. Chunks are scored against keywords; only chunks with score > 0 contribute to `sourcesUsed`, and only those files end up in `X-SBC-Sources`.
- **`fetchSBCContextVector`** is wired but **explicitly bypassed** in the Advisory text branch (`fire-safety-chat:5101` comment: "vector RPC (match_sbc_documents) is not provisioned"). So `sbc_documents` is read only by the Step-3.x click-time DB lookup, not by Advisory retrieval.
- **`sbc_documents` rows** are populated by `sbc-graph-indexer`; per the existing CLAUDE memory and Step 2.5 work, `section_number` drift is known. Quoting `index.ts:2329`: "Step 2.5 showed labels can drift, so we never emit 'high' from chunk metadata alone." Translation: even if Section 903.2.7 / Section 907.2.7 are present in some `sbc_documents` row, the label may not be `'903.2.7'` / `'907.2.7'`, which means the click-time DB lookup that filters `.eq('section_number', sectionNum).eq('code_type', 'SBC801')` will return nothing.
- **`sbc_code_tables`** seeded rows (`supabase/migrations/20260410000003_sbc_tables_seed.sql`): only `1004.5, 1006.3.3, 1006.3.4, 504.3, 504.4, 506.2`. There is **no row for `903.2.7`, `907.2.7`, or `309`**. The Step-4.1 Advisory ledger therefore cannot prove these sections via the structured-table path.

## 4. Side-by-side matrix for Section 903.2.7 and 907.2.7

| Source location | Source type | Section detected | Current label | Exact text available | Page start–end | Confidence | Issue | Recommended action |
|---|---|---|---|---|---|---|---|---|
| `D:\sbc_consultx\extracted_sections.md:869-897` | external_asset | SBC-201 Section 903.2.7 + .1 + .2 | (raw text, no metadata) | yes — verbatim, includes 1,115 m² + 2,230 m² thresholds and 465 m² upholstery clause | unspecified (extract) | high | not in live system | Convert to section-bound chunk JSON or `sbc_code_tables` row. |
| `D:\sbc_consultx\extracted_907_909.txt:1312-1376` | external_asset | SBC-801 Section 907.2.7 + .7.1 | (raw text, no metadata) | yes — verbatim, includes the 500/100 occupant thresholds, both Exceptions, and the cross-reference to Section 903.2.7 + 1,115 m² | book page 514 / OCR PDF p.144 | high | not in live system | Same as above. |
| `D:\sbc_consultx\sbc-801-section-903.md` | external_asset | SBC-801 Section 903 (umbrella) | curated frontmatter `code_family: SBC 801`, `section_id: '903'`, `source_pages: 'pp. 443–471'`, `source_files: ['SBC 801 - Part 5.pdf']` | Section 903 lead-in is verbatim; Section 903.2.1–Section 903.2.11 present as commentary list (not verbatim Group-M block) | pp. 443–471 | medium-to-high | metadata is rich; verbatim Section 903.2.7 lives in extracted_sections.md, not in this file | Combine: emit one chunk per Section 903.2.x with metadata from this MD plus verbatim text from extracted_sections.md. |
| `D:\sbc_consultx\sbc-801-section-907.md` | external_asset | SBC-801 Section 907 (umbrella) | curated frontmatter `section_id: '907'`, `source_pages: 'pp. 531–588'` | Section 907.1, Section 907.1.2, Section 907.1.3, Section 907.2 lead-in, Section 907.2.1 (Group A) verbatim; Section 907.2.7 NOT verbatim in this file (table-of-thresholds only) | pp. 531–588 | medium | verbatim Section 907.2.7 is in `extracted_907_909.txt` | Same combine pattern. |
| `D:\sbc_consultx\sbc801_sections_clean.json` | external_asset | unknown (file-level not inspected verbatim — would need to load) | structured JSON | likely yes per filename | unknown | medium | not yet inspected for these specific sections | Read JSON and verify Section 903.2.7 / Section 907.2.7 presence before relying on it. |
| Live bucket `ssss` (e.g. `SBC 801 …-401-600_extracted_chunks.json`) | live_bucket | depends on chunk segmentation | page-range chunk JSON; section_number is per-chunk metadata, drift-prone | **probably yes** (the SBC-801 Ch.9 Section 907.2.7 block is on the in-PDF page corresponding to physical PDF page ~444 in the 401-600 volume) | varies | low — depends on chunk boundary | If the chunk straddles the Section 907.2.7 header, neither keyword scoring nor section_number indexing latches onto it cleanly. | Verify via ad-hoc inspection of one chunk file (no DB write needed); may already be enough on its own once retrieval ranks it. |
| Live `sbc_documents` row (pgvector) | live_db | per-row `section_number` | drift-prone label | unknown — depends on indexing run | varies | low | Step 2.5 documented drift; vector RPC also not provisioned for Advisory. | Either (a) re-index from cleaner section-level chunks, or (b) leave alone and rely on bucket retrieval + structured tables. |
| Live `sbc_code_tables` (DB) | live_db | seeded rows only | `1004.5, 1006.3.3, 1006.3.4, 504.3, 504.4, 506.2` | **no row for 903.2.7 / 907.2.7 / 309** | n/a | n/a | absent | Insert curated rows. |

## 5. Why the live answer still says "expected reference"

Combined cause:

1. **Family filtering at retrieval level** (audit step 6 in earlier run): the user's failing question is fire-protection-loaded. Keyword scoring inside SBC 201 chunks scores zero; only SBC 801 chunks survive — but those are page-range chunks, not section chunks.
2. **Section header crossing chunk boundary**: a 200-page PDF is sliced into chunks of typically a few hundred chars to a few KB. The verbatim Section 907.2.7 header line (`907.2.7 Group M. A manual fire alarm system that activates …`) is one line; the surrounding paragraph spans ~600 chars. With the existing chunker, this block can land at the start of a chunk (good) or split across two (bad). Even when whole, the chunk's `section_number` metadata is not authoritative.
3. **Vector path off**: `match_sbc_documents` is not used for Advisory text. Even if `sbc_documents` had clean Section 907.2.7 rows, the Advisory flow would not see them. The DB lookup runs only at click-time for resolving page numbers.
4. **No structured-table backup**: there is no `sbc_code_tables` row for `903.2.7` or `907.2.7`, so Step-4.1 cannot promote it to ledger-proven.
5. **Verifier consequence**: with neither bucket-chunk nor structured-table evidence carrying a clean (family, section) match, Step 4 verifier downgrades the citation to `conf:low | section_label:unsupported` — which is the correct, defensive behavior, but the model's compensating phrase becomes "مرجع متوقع يحتاج تحقق من مصدر مطابق". That is the symptom the user observed.

## 6. Repair options — ranked

| Rank | Option | Files / tables touched | DB changes | Risk | Rollback | Expected improvement | Validation test |
|---|---|---|---|---|---|---|---|
| **1 (recommended)** | **D — Curated structured-table rows for Section 903.2.7 and Section 907.2.7** | one new SQL migration adding rows to `public.sbc_code_tables` (table, content_md, source_code, edition, chapter, section, keywords, notes); zero code change | 2–4 INSERTs (idempotent, ON CONFLICT DO UPDATE — same pattern as the existing 2026-04-10 seed) | low | drop the new migration / DELETE WHERE table_id IN ('903.2.7','907.2.7') | Step-4.1 surfaces them as visible structured-table chips (`🗂️ SBC 801 — جدول 903.2.7 (دليل منظم)`); verifier accepts `[SBC-801 Section 903.2.7 \| conf:medium]` and never lets it drift back to "expected reference" | Live retest the Group M question; expect the source panel to show the structured chip and the answer text to cite Section 903.2.7 with `conf:medium`. |
| **2** | **A — `sbc_documents.section_number` correction** | only `sbc_documents` rows | UPDATE statements on existing rows whose body text contains Section 903.2.7 / Section 907.2.7 but `section_number` drifted | low-to-medium | per-row UPDATE rollback by stored prior values | Click-time DB lookup starts returning correct page anchors; vector path becomes usable. Does NOT affect Advisory retrieval until vector path is enabled. | Smoke test the click-time deep-link (Step 3.2) on a `[SBC-801 Section 903.2.7]` token — should land on the correct PDF page. |
| **3** | **B — Import Ch.9-section-level chunks into the bucket** | new JSON file `SBC801_Ch9_sections_v1_chunks.json` containing one chunk per Section 903.2.x and Section 907.2.x with verbatim text | bucket write to `ssss`; optional re-index into `sbc_documents` | medium (chunker boundaries) | delete the new bucket file | Advisory keyword scoring would latch onto the section header verbatim; both bucket and ledger paths cover Section 903.2.7 | Live retest. The keyword path's `usedFiles` should now include the new section-chunk file. |
| **4** | **C — New section-level chunks generated from D:\sbc_consultx (highest precision)** | re-run a generator script on `extracted_sections.md` + `extracted_907_909.txt` to emit a JSON like option B but per-section and per-clause | bucket write + DB index | medium | delete generated artifacts | Best long-term result but requires a script, regression risk on chunk-id stability | Comparison test: same query before/after must produce same families but with Section 903.2.7 / Section 907.2.7 in `usedFiles` and `sourceMeta.sectionRef`. |

## 7. Recommended shortest safe repair path

**Option 1 (Option D — structured-table rows).**

Rationale:
- Lowest blast radius. Mirrors the existing 2026-04-10 seed pattern exactly. No new function, no schema change, no chunker re-run.
- Works **today** with all already-deployed code: Step 4 verifier accepts `tableRef`, Step 4.1 already plumbs `sbc_code_tables` rows into both the Evidence Ledger and the visible source panel as structured chips.
- Does not require enabling the vector RPC and does not depend on `sbc_documents.section_number` drift cleanup.
- Migrations 2026-04-10 already proved idempotency under `ON CONFLICT DO UPDATE`, so re-running is safe.
- Defers the larger Option C re-chunk to a separate planned step without blocking consultant-grade behavior on the two sections that matter most.

Plan (NOT executed in this audit):
1. Create one new migration `supabase/migrations/<timestamp>_sbc_tables_seed_903_2_7_907_2_7.sql` that INSERTs four rows into `sbc_code_tables`:
   - `(table_id='903.2.7', source_code='SBC 801', edition='2024', chapter=9, section='903')` — content sourced from `D:\sbc_consultx\extracted_sections.md:869-897` (the canonical Section 903.2.7 Mercantile sprinkler text + .1 + .2). This appears in both SBC 201 and SBC 801; the SBC 801 source rules per the existing prompt examples.
   - `(table_id='907.2.7', source_code='SBC 801', edition='2024', chapter=9, section='907')` — content sourced from `D:\sbc_consultx\extracted_907_909.txt:1312-1409` (the canonical Section 907.2.7 Group M alarm text + Exception 1 + Exception 2 + Section 907.2.7.1 commentary).
   - One mirror row in `source_code='SBC 201'` for Section 903.2.7 (since SBC 201 Chapter 9 also defines this requirement; useful for SBC-201 token verification).
   - Optional: one structured row for `table_id='309'` (Group M occupancy classification) so the Mercantile classification token (the source of the Step 4.1 Table 309 chip) carries verbatim definitional text.
2. `extractTableIds` already maps "محلات تجارية" to `["309"]`. To make the verifier latch onto Section 903.2.7 / Section 907.2.7, add a SEMANTIC_ALIAS line that maps Mercantile-fire keywords to those table ids:
   - `[/(mercantile|محلات\s+تجارية).*sprinkler|sprinkler.*(mercantile|محلات\s+تجارية)|رش.*(محلات|Mercantile)/i, ["903.2.7"]]`
   - `[/(mercantile|محلات\s+تجارية).*(alarm|إنذار)|(alarm|إنذار).*(mercantile|محلات\s+تجارية)/i, ["907.2.7"]]`
   This is a **1–2 line code edit in `fire-safety-chat/index.ts`** and goes through normal deploy.
3. After deploy + DB migration, retest the Group M question. Expected: source panel shows two new chips `🗂️ SBC 801 — جدول 903.2.7 (دليل منظم)` and `🗂️ SBC 801 — جدول 907.2.7 (دليل منظم)`; the answer cites these at `conf:medium`; the Step 4 verifier no longer downgrades to `unsupported`/`unretrieved`.

## 8. Exact next implementation command (NOT executed by this audit)

```
# 1) Author the new SQL migration with verbatim content
#    extracted from:
#      D:\sbc_consultx\extracted_sections.md   (lines 869-897 → 903.2.7 / .1 / .2)
#      D:\sbc_consultx\extracted_907_909.txt   (lines 1312-1409 → 907.2.7 / .1)
#    Mirror existing seed style in:
#      supabase/migrations/20260410000003_sbc_tables_seed.sql
#    New filename:
#      supabase/migrations/20260501000001_sbc_tables_seed_903_2_7_907_2_7.sql
#
# 2) Add 2 SEMANTIC_ALIAS lines in
#    supabase/functions/fire-safety-chat/index.ts (extractTableIds region, around line 2278).
#
# 3) Apply the migration to the production project
#      hrnltxmwoaphgejckutk
#    via the existing apply-migration script pattern.
#    Then deploy fire-safety-chat.
#
# 4) Live retest: Group M / 1,200 m² question.
#    Pass: source panel shows 903.2.7 + 907.2.7 structured chips,
#          tokens stream at conf:medium, no "expected reference" string.
```

This audit does NOT execute any of the above. Approval is required before either the SQL migration or the alias edit lands.
