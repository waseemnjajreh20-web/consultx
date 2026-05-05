# Live PDF Lookup — Helper Implementation Notes

Date: 2026-05-05 (R11, Phase 1B Task 4)

---

## 1. Status

**Implemented**: `lookupPdfSourceTextV1` + supporting types/cache/helpers added INLINE in `supabase/functions/fire-safety-chat/index.ts`.

| Field | Value |
|-------|-------|
| File modified | `supabase/functions/fire-safety-chat/index.ts` |
| Lines added | ~280 (block between V1 sidecar and Citation Verifier) |
| Decision file | INLINE (per [LIVE_PDF_LOOKUP_PHASE1B_FEASIBILITY.md](docs/advisory/LIVE_PDF_LOOKUP_PHASE1B_FEASIBILITY.md) Section 2) |
| Insertion point | between line 1338 (end of `loadBrainFullV1Sidecars`) and line 1340 (start of Citation Verifier) |
| Wiring (Task 5) | Not yet done in this task |
| Flag default | `ADVISORY_PDF_LOOKUP_ENABLED` unset → treated as `"0"` → helper short-circuits |

---

## 2. Public surface

### Function signature

```ts
async function lookupPdfSourceTextV1(
  supabaseAdmin: any,
  input: PdfLookupInput,
): Promise<PdfLookupOutput>
```

### Input type

```ts
interface PdfLookupInput {
  code: "SBC201" | "SBC801";
  ref_type: "section" | "table" | "figure";
  ref: string;
  query: string;
  max_excerpt_chars?: number;
  mode: string;
}
```

### Output type

```ts
interface PdfLookupOutput {
  found: boolean;
  confidence: "exact" | "likely" | "not_found";
  code: "SBC201" | "SBC801";
  ref: string;
  ref_type: "section" | "table" | "figure";
  pdf_file: string | null;
  page_start: number | null;
  page_end: number | null;
  excerpt: string | null;
  citation_label: string | null;
  limitations: string | null;
  should_answer_compliance: boolean;
  diagnostic: string;
}
```

### Helper sub-types (also defined inline)

```ts
interface PdfIndexEntry { code, ref_type, ref, normalized_ref, pdf_path, page_start, page_end, confidence, source_method, notes? }
interface PdfIndexDoc { entries: PdfIndexEntry[]; pdf_parts?: ... }
interface TextArtifact { code, pdf_file, source_pdf_sha256?, page_count, pages: [...] }
```

### Module-level state

```ts
const PDF_LOOKUP_BUCKET = "sbc_pdfs_private";
const PDF_LOOKUP_INDEX_KEY = "index/pdf_source_lookup_index.json";
let PDF_LOOKUP_INDEX_CACHE: PdfIndexDoc | null = null;          // index, lifetime cache
const PDF_LOOKUP_ARTIFACT_CACHE = new Map<string, TextArtifact>(); // LRU, max 5
const PDF_LOOKUP_ARTIFACT_CACHE_MAX = 5;
```

The index cache lives forever within an instance (manual rebuild requires instance recycle or redeploy). The artifact cache is LRU-bounded — it holds at most 5 PDF text-page documents at once. With 18 artifacts and an LRU of 5, a typical Advisory turn touches at most 1-2 artifacts; the cache hits should approach 90% on warm instances after a few queries.

---

## 3. Hard gates (rejected paths return `not_found` cleanly)

```ts
// Gate 1: feature flag
const flag = Deno.env.get("ADVISORY_PDF_LOOKUP_ENABLED");
if (flag !== "1") return buildPdfLookupNotFound(input, "disabled_by_flag");

// Gate 2: Advisory mode only
if (input.mode !== "standard") return buildPdfLookupNotFound(input, "wrong_mode_" + input.mode);

// Gate 3: figure refs not supported in V1
if (input.ref_type === "figure") return buildPdfLookupNotFound(input, "figure_not_supported_v1");
```

When the flag is OFF (the Phase 1B initial state):
- The helper returns immediately with `confidence: "not_found"`, `diagnostic: "disabled_by_flag"`.
- No storage call.
- No JSON parse.
- No log line emitted.
- Total cost: ~5 microseconds for the env-var check.

This makes the helper safe to wire into the Advisory branch even before the flag is flipped — every call is a no-op until the flag arrives.

---

## 4. Lookup algorithm

When the flag is ON and mode is Advisory:

1. **Index resolve** (`loadPdfLookupIndex`)
   - Read `sbc_pdfs_private/index/pdf_source_lookup_index.json` once per instance.
   - Cache the parsed index forever.
   - On any error: log `[PdfLookup] index_unavailable` and return `not_found`.

2. **Entry match** (`findIndexEntry`)
   - Filter the 555 entries by `(code, ref_type)`.
   - Match `normalized_ref` against the input ref (with hyphen→dot normalization).
   - Return the first match or `null`.

3. **Artifact load** (`loadTextArtifact`)
   - Convert `entry.pdf_path` (e.g. `SBC801/pp_0801-1000.pdf`) to artifact path (`text_pages/SBC801/pp_0801-1000.json`).
   - Check LRU cache.
   - On miss: download from bucket, parse JSON, evict oldest if cache full.
   - On error: log warning, return `null`.

4. **Page-marker search** (`findSectionInPages`)
   - Build a regex for the ref:
     - `section`: `(?:^|\n|\s)(?:Section\s+)?<ref>(?:\s+[A-Z؀-ۿ]|\s*\.|\s*$)` — matches "903.2.7 Group M" OR "Section 903.2.7" with section-anchor follow-through (capital letter, period, or end-of-line).
     - `table`: `Table\s+<ref>\b` (case-insensitive).
   - Search within hinted page window (page_start ± 2 pages) first.
   - Phase 1: exact marker match → return `(page, matchStart, "exact")`.
   - Phase 2 fallback: page-only match (any page in window with text > 100 chars) → return `(page, 0, "page_only")`.
   - Both miss: return `null`.

5. **Excerpt extraction** (`extractExcerptAroundMatch`)
   - From `matchStart`, take up to `max_excerpt_chars` (default 1,200, capped at 1,500).
   - Trim leading whitespace.
   - Try to break on `\n\n` paragraph boundary.
   - If not, break on sentence-end `". "`.
   - If excerpt cuts mid-content, append " …[truncated]".
   - Reject excerpts shorter than 30 chars (`diagnostic: "excerpt_too_thin"`).

6. **Build output**
   - `confidence: "exact"` if marker matched, `"likely"` if page-only fallback.
   - `should_answer_compliance: true` only when `confidence === "exact"`.
   - `citation_label`: human-readable `"SBC-801 Section 903.2.7 (p. 712, live PDF)"`.
   - `pdf_file`: the bucket path (used internally; the wiring in Task 5 will redact it from public-facing headers).

---

## 5. What the helper does NOT do

- ❌ Does NOT call any LLM.
- ❌ Does NOT use OCR.
- ❌ Does NOT touch Main or Analytical paths.
- ❌ Does NOT throw exceptions to the caller — every error path returns `not_found` with a diagnostic.
- ❌ Does NOT call across families. SBC-201 lookup never returns SBC-801 content.
- ❌ Does NOT generate URLs — `citation_label` is a human-readable string; `pdf_file` is bucket-relative for internal use only.
- ❌ Does NOT modify the index or any artifact.
- ❌ Does NOT write to storage.
- ❌ Does NOT run on every Advisory query — caller (Task 5 wiring) gates trigger conditions.

---

## 6. Telemetry

The helper emits exactly one structured log line per call (when flag is ON):

```
[PdfLookup] code=SBC-801 kind=section ref=903.2.7 confidence=exact page=712 method=exact latency_ms=824
```

Or on miss:
```
[PdfLookup] code=SBC-801 kind=section ref=6304.2.1.1 confidence=not_found diag=index_miss latency_ms=12
```

When the flag is OFF, no log line is emitted (the helper short-circuits before any storage call).

The standard log prefix `[PdfLookup]` makes it grep-able in production logs. After 30 days of telemetry on a flag-flipped-ON deployment, the project can analyze:
- Which sections get queried most.
- What fraction of lookups hit `exact` vs `likely` vs `not_found`.
- p50 / p95 / p99 latency.

---

## 7. Cache behavior

| Cache | Scope | TTL | Size |
|-------|-------|-----|------|
| `PDF_LOOKUP_INDEX_CACHE` | Module-level (instance lifetime) | Infinite within instance | 1 entry (the index, ~163 KB) |
| `PDF_LOOKUP_ARTIFACT_CACHE` | Module-level | LRU (eviction on insert when size >= max) | Max 5 artifacts (~5 MB peak) |

On instance recycling (Supabase Edge Functions recycle frequently — typically hourly), the cache empties. The first call after recycle pays ~150-300 ms for index download; subsequent lookups within the same instance are fast.

No persistent cache (DB / pgvector / disk). V1 keeps it simple; if production telemetry shows the cold-cache hit is too costly, V2 can add persistence.

---

## 8. Known limitations (V1)

1. **Single-page assumption** — sections that span 2-3 pages return only the first page's excerpt. Multi-page span support is V2.
2. **Marker regex precision** — depends on PDF text-extraction layout. The form-feed-split + regex approach works for Saudi Building Code PDFs (verified empirically by R9 + R11) but may need tuning for other documents.
3. **No table-cell parsing** — `Table 1004.5` returns the page text including the table as flat lines. Cell-by-cell structuring is V2.
4. **No alias handling beyond hyphen→dot** — e.g. typing "section 1004 5" with a space won't match "1004.5". Caller must pre-normalize.
5. **No fuzzy match** — typing "903.2.71" (typo for "903.2.7") returns `not_found`. The index has 555 entries; fuzzy matching across them per query would add latency.
6. **No telemetry beyond logs** — no counter or DB row recording lookup demand. V2 may add a counter table.
7. **No retroactive citation rewrite** — the helper produces output; the wiring in Task 5 inserts it into the prompt before Gemini streams. Once streaming starts, V1 doesn't go back.

---

## 9. Test coverage (Phase 1B Task 6)

The fixture file `evals/advisory/pdf_lookup_fixtures.test.ts` (Task 6) will lock the helper's deterministic behavior:

- Input parsing: hyphenated IDs → dotted form.
- Mode gate: `mode !== "standard"` → `not_found`.
- Flag gate: `ADVISORY_PDF_LOOKUP_ENABLED !== "1"` → `not_found`.
- Figure ref → `not_found` ("figure_not_supported_v1").
- Excerpt truncation at exactly `max_excerpt_chars`.
- Confidence band logic.
- Index-miss handling.

These tests run offline against synthetic index + artifact payloads (similar to the existing R1 fixture pattern at `evals/advisory/intent_gate_fixtures.test.ts`).

---

## 10. Security review

| Surface | Status |
|---------|--------|
| Reads service-role storage only | ✅ same client (`supabaseAdmin`) the rest of the function uses |
| Returns no public URLs | ✅ `citation_label` is a string label; no URL constructed |
| Returns no signed URLs | ✅ |
| Returns no bucket path to caller | The output has `pdf_file: "SBC801/pp_..."` — that's the bucket-relative path. The wiring in Task 5 will use this internally but NOT put it in the X-SBC-Source-Meta header (per the feasibility decision: use sentinel `__live_pdf__::<family>::<ref>` instead). |
| Cannot be called from Main / Analytical | ✅ enforced by `mode === "standard"` gate |
| Cannot be triggered without the flag | ✅ enforced by env-var gate |
| Excerpt size capped | ✅ at 1,500 chars hard-max, 1,200 default |
| No prompt-injection vector from PDF text | The helper returns the verbatim text; the calling site is responsible for treating it as untrusted source content (which the existing Advisory prompt already does for retrieved chunks) |

---

## 11. What this task did NOT do

- ❌ No wiring into the Advisory branch yet (Task 5).
- ❌ No fixtures yet (Task 6).
- ❌ No deploy yet (Task 7).
- ❌ No flag flip — ADVISORY_PDF_LOOKUP_ENABLED stays unset by default (treated as `"0"`).
- ❌ No change to any existing function in the file.
- ❌ No change to V1 sidecar, `fetchSBCContext`, `fetchStructuredTables`, Citation Verifier, etc.
- ❌ No DB write, no migration.

---

## 12. Next step

Proceed to Task 5 — wire the helper into the Advisory branch at line ~5505 (after V1 sidecar load, before structured-table evidence surface). The wiring is responsible for:

- Trigger gating (only on explicit ref + ref not already in ledger).
- Per-call concurrency cap (max 3 lookups per query).
- Total time-budget cap (5 s per turn).
- Supplementing `usedFiles`, `usedSourceMeta`, `advisoryLedger`, and `fullSystemPrompt` with the lookup result.
- Using the sentinel filename `__live_pdf__::<family>::<ref>` in `usedFiles` to prevent frontend URL construction.
