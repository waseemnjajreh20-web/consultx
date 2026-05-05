# Live PDF Lookup — Runtime Contract

Date: 2026-05-05 (R9, Phase 0 design — no execution)
Companion: [docs/advisory/LIVE_PDF_LOOKUP_INDEX_DESIGN.md](docs/advisory/LIVE_PDF_LOOKUP_INDEX_DESIGN.md)

This document specifies the function signature, types, behavior contract, and rules for `lookupPdfSourceTextV1`. **No code is implemented in this round.** Phase 1 will implement against this contract; Phase 1 fixtures will lock the contract behavior.

---

## 1. Function signature

```ts
async function lookupPdfSourceTextV1(input: LookupInput): Promise<LookupOutput>
```

Located at: `supabase/functions/fire-safety-chat/_pdf_lookup.ts` (new file, Phase 1).

Imported by: `supabase/functions/fire-safety-chat/index.ts` from inside the Advisory branch only.

---

## 2. Input contract

```ts
interface LookupInput {
  // Code family the user's reference belongs to. The caller is responsible for
  // family resolution before calling — typically by parsing the user's query
  // ("SBC-801 Section 903.2.7" → family="SBC-801") or by chapter heuristic
  // ("Section 903.x.y" → likely SBC-801 fire-suppression family).
  code: "SBC-201" | "SBC-801";

  // What kind of reference is being looked up.
  ref_kind: "section" | "table" | "figure";

  // Canonical-form reference id. Sections: dotted form like "903.2.7" or
  // "1004.5.4.2". Tables: "1004.5", "504.3". Figures: "9-1", "10-2".
  // The runtime normalizes hyphens vs dots before the lookup. Caller may
  // pass either form; the function tries both.
  ref_id: string;

  // The original user query. Used only for logging; does NOT influence the
  // returned excerpt or its length.
  query: string;

  // Maximum length (chars) of the verbatim excerpt to return. Default 1500.
  // Useful when the caller wants a tighter quote (e.g. for citation tooltips).
  max_excerpt_length?: number;

  // Mode discriminator. The function fails fast unless mode === "standard"
  // (Advisory). Main / Analytical paths must NOT call it. This is enforced
  // in the function body with an early-return if mode is wrong, NOT a thrown
  // error — so calling sites that pass mode="analysis" simply get
  // {found: false, ...} with reason "wrong_mode" rather than crashing.
  mode: "standard" | "analysis" | "main";
}
```

### Caller responsibilities

The caller (the Advisory branch of `fire-safety-chat/index.ts`) does pre-flight work BEFORE invoking this function:

1. Parse the user's query for an explicit section/table reference. Use the existing regex utilities (`buildQueryMeta`, `getTargetChapters`).
2. Resolve which code family the reference belongs to (`SBC-201` vs `SBC-801`).
3. Verify the existing Evidence Ledger does NOT already have a chunk covering this reference. If it does, skip the lookup — primary retrieval already has it.
4. Verify the structured-table DB-first path did not match (for table refs).
5. Only call `lookupPdfSourceTextV1` when all the above are true.

These pre-conditions are **not enforced by the function itself** — they are caller contract. If caller forgets and calls the function on every query, the function still works but adds 100-500 ms overhead per call.

---

## 3. Output contract

```ts
interface LookupOutput {
  // Did the function find ANY page-level evidence?
  found: boolean;

  // Confidence band. See LIVE_PDF_LOOKUP_INDEX_DESIGN.md Section 4 for the
  // numeric → band mapping. Index entries have float confidence; the runtime
  // collapses to one of these bands for the model and citation verifier.
  confidence: "exact" | "likely" | "not_found";

  // Echo-back of input for the caller's logging convenience.
  code: "SBC-201" | "SBC-801";
  ref_kind: "section" | "table" | "figure";
  ref_id: string;

  // Resolved PDF location. null when found=false.
  pdf_file: string | null;        // bucket-relative: "SBC801/pp_0801-1000.pdf"
  page_start: number | null;      // global page in the book (1-indexed)
  page_end: number | null;

  // Verbatim excerpt — null when found=false or when the page has no
  // extractable text. NEVER paraphrased, NEVER summarized.
  excerpt: string | null;

  // Short label suitable for a citation token. Example: "SBC-801 §903.2.7
  // (p. 712)". null when found=false.
  citation_label: string | null;

  // Caveats / limitations. Free-form short string — e.g.
  // "extracted from PDF live; no canonical record exists" or
  // "Arabic and English columns merged on this page". The model surfaces
  // this to the user only when confidence !== "exact".
  limitations: string | null;

  // Should the model be ALLOWED to give a compliance answer based on this
  // excerpt alone? See Section 4 for the rules.
  should_answer_compliance: boolean;

  // Diagnostic for the function's own logs. Not user-visible.
  diagnostic: string;
}
```

### Output examples

**Successful exact lookup**:
```json
{
  "found": true,
  "confidence": "exact",
  "code": "SBC-801",
  "ref_kind": "section",
  "ref_id": "903.2.7",
  "pdf_file": "SBC801/pp_0801-1000.pdf",
  "page_start": 712,
  "page_end": 712,
  "excerpt": "903.2.7 Group M. An automatic sprinkler system shall be provided throughout buildings containing a Group M occupancy where ...",
  "citation_label": "SBC-801 §903.2.7 (p. 712)",
  "limitations": null,
  "should_answer_compliance": true,
  "diagnostic": "lookup_kind=section method=existing_ledger conf_raw=0.92 page_match=exact"
}
```

**Likely match — model must caveat**:
```json
{
  "found": true,
  "confidence": "likely",
  "code": "SBC-801",
  "ref_kind": "section",
  "ref_id": "915.5.1",
  "pdf_file": "SBC801/pp_1001-1200.pdf",
  "page_start": 1042,
  "page_end": 1042,
  "excerpt": "915.5.1 Audible alarm signals. Audible alarm notification ...",
  "citation_label": "SBC-801 §915.5.1 (p. 1042)",
  "limitations": "section anchor matched on first paragraph only — section may continue on the next page",
  "should_answer_compliance": false,
  "diagnostic": "lookup_kind=section method=pdf_text_search conf_raw=0.78 page_match=anchor_only"
}
```

**Not found**:
```json
{
  "found": false,
  "confidence": "not_found",
  "code": "SBC-801",
  "ref_kind": "section",
  "ref_id": "6304.2.1.1",
  "pdf_file": null,
  "page_start": null,
  "page_end": null,
  "excerpt": null,
  "citation_label": null,
  "limitations": "section is in chapter 63 (specialty hazmat); no PDF page mapping exists in the V1 index",
  "should_answer_compliance": false,
  "diagnostic": "lookup_kind=section method=index_miss reason=chapter_range_inferred_only_with_no_match"
}
```

---

## 4. Compliance-answer rules

The `should_answer_compliance` flag is the most important behavioral lever. It tells the model whether it can give a binding compliance answer based purely on the live-PDF excerpt, or whether it must caveat / decline.

| `confidence` | `should_answer_compliance` | Model behavior expected |
|--------------|:--------------------------:|-------------------------|
| `exact` | `true` | Quote the excerpt verbatim. Cite with `[SBC-XXX §X.Y.Z \| conf:high \| live_pdf]`. Provide compliance analysis. |
| `likely` | `false` | Quote the excerpt verbatim. Cite with `[SBC-XXX §X.Y.Z \| conf:medium \| live_pdf]`. Add: "the section anchor matched but may have continued on adjacent pages — please verify against the source PDF". Do NOT give a binding compliance answer. |
| `not_found` | `false` | Apply the diagnostic protocol. The model says: "Section X.Y.Z is not currently in the indexed corpus. The closest match would be ... (chapter range inferred). Could you confirm the section number?" |

The model is reminded of these rules through a system-prompt addition (Phase 1) that is appended to the existing Advisory binding rules:

> When the Evidence Ledger contains a `live_lookup: true` entry, you may cite the section verbatim. If `should_answer_compliance: true`, give the binding answer. If `should_answer_compliance: false`, surface the excerpt + the limitation note + ask the user to confirm against the official source. Never extrapolate from a `live_lookup` excerpt to OTHER sections that are not in the Ledger.

---

## 5. Behavioral rules (do / don't)

### MUST

- ✅ Return verbatim PDF text only. No summarization, no paraphrasing.
- ✅ Echo back exact input fields in output for caller-side logging.
- ✅ Return a stable `diagnostic` string the runtime can grep for in production logs.
- ✅ Truncate excerpt at `max_excerpt_length` characters, append `…[truncated]` suffix.
- ✅ Append a `live_lookup: true` flag to the Evidence Ledger entry created from this output.
- ✅ Use the same service-role storage client the existing function already creates.
- ✅ Cache the index in instance memory after first download.
- ✅ Log every call as `[PdfLookup] code=X kind=Y ref=Z confidence=W diag=...`.

### MUST NOT

- ❌ Generate text from the model. The function must NOT call any LLM.
- ❌ Use OCR in V1. If text-layer extraction returns < 50 chars, return `confidence: "not_found"` with diagnostic `text_layer_empty` — do NOT fall back to vision-LLM.
- ❌ Call across families. SBC-201 lookup may not return SBC-801 excerpts even if the section number is also valid in the other code.
- ❌ Mutate the index. The function reads the index; updates are operator-side.
- ❌ Throw exceptions to the caller. Catch internally; return `confidence: "not_found"` with `diagnostic: "extraction_error: <message>"`.
- ❌ Run on Main or Analytical mode (`mode !== "standard"`). Return immediately with `found: false` and `diagnostic: "wrong_mode"`.
- ❌ Add latency to queries that don't need it. The function only runs when the caller explicitly invokes it (caller's pre-flight check is the gate).

### MAY

- May normalize the input `ref_id` (hyphen→dot, lowercase, trim) before lookup.
- May try aliased variants from `section_aliases.json` if direct lookup fails.
- May cache the parsed index in instance memory across calls.
- May log latency, hit/miss rates, and confidence-band distribution to console (non-PII telemetry).

---

## 6. Errors and edge cases

### Index file missing in bucket

If `sbc_pdfs_private/index/pdf_source_lookup_index.json` returns 404 from the storage client:

```json
{
  "found": false,
  "confidence": "not_found",
  "diagnostic": "index_unavailable",
  ...nulls...
}
```

The runtime continues without lookup. Nothing crashes. Production logs will show `[PdfLookup] index_unavailable` so an operator can see the bucket isn't yet populated.

### Index entry exists but PDF download fails

If the index has an entry pointing at `SBC801/pp_0801-1000.pdf` but the storage download returns 404 (file deleted or never uploaded):

```json
{
  "found": false,
  "confidence": "not_found",
  "diagnostic": "pdf_download_failed: 404",
  ...
}
```

Logs the failure. Does not retry. Returns to caller.

### Text-layer extraction returns empty

If `pdf-parse` (or whichever lib Phase 1 chooses) returns < 50 chars for the requested page:

```json
{
  "found": false,
  "confidence": "not_found",
  "diagnostic": "text_layer_empty page=712",
  ...
}
```

This is the case where OCR (Phase 2) would help. V1 returns not_found cleanly.

### Section anchor not found on resolved page

If the index says `Section 903.2.7` is on page 712 but the page text doesn't contain the literal string `903.2.7` (e.g. line breaks broke the regex match):

```json
{
  "found": true,
  "confidence": "likely",
  "page_start": 712,
  "page_end": 712,
  "excerpt": "<full page text, capped at max_excerpt_length>",
  "citation_label": "SBC-801 §903.2.7 (p. 712, page-level match)",
  "limitations": "section anchor not localizable within page — returned full page text",
  "should_answer_compliance": false,
  "diagnostic": "lookup_kind=section method=pdf_text_search anchor_match=page_only"
}
```

This is more conservative than the prior R8 design (which would have returned `confidence: "exact"` here). After Phase 1 fixtures verify the difference is meaningful, this band may be relaxed.

### Multiple section refs in one query

If the user asks "what do Sections 903.2.7 AND 907.2.11 say?", the caller must invoke `lookupPdfSourceTextV1` twice — once per ref. The function does NOT batch.

---

## 7. Index reload contract

The function maintains an in-memory index cache:

| Event | Cache action |
|-------|-------------|
| First call after instance start | Download index, parse, cache |
| Subsequent calls within instance | Use cache |
| Manual cache invalidation | The function does NOT support force-reload in V1. Operator-side: redeploy or wait for natural instance recycling (typically every few hours). |

Index TTL: **infinite within instance**. Supabase Edge Functions recycle instances often enough (typically hourly) that staleness is bounded naturally. V2 may add a manual `?reload=1` query parameter if this proves a real pain.

---

## 8. Performance budget

Target: 90% of triggered calls complete in < 1.5 s.

| Phase | Cost | Total |
|-------|------|-------|
| Index lookup (in-memory map) | < 1 ms | 1 ms |
| Cache miss → index download | 100-300 ms (163 KB JSON) | once per instance |
| PDF download (single part, ~10 MB average) | 200-500 ms | per call |
| `pdf-parse` text extraction (single page) | 100-300 ms | per call |
| Text post-processing (truncation, anchor match) | 5-10 ms | per call |
| **Total per call (warm cache)** | | **400-1000 ms** |
| **Total per call (cold cache)** | | **600-1300 ms** |

Within the function's 1.5 s budget. The end-to-end Advisory turn already takes 5-15 s due to Gemini streaming, so an extra second is in the noise.

The 31 MB SBC-801 pp 801-1000 PDF is the largest. Even at slowest, downloading and extracting from it should stay under 2 s for a single page. Fixture: a smoke test on this specific PDF lookup.

---

## 9. Telemetry & logging

Each call emits exactly one structured log line:

```
[PdfLookup] code=SBC-801 kind=section ref=903.2.7 confidence=exact page=712 latency_ms=823 diag=lookup_kind=section method=existing_ledger conf_raw=0.92 page_match=exact
```

This format:
- Single line per call (greps cleanly).
- Stable key=value pairs (post-process easily).
- Includes latency for performance monitoring.
- Includes raw `conf_raw` from the index entry, separate from the band.

After 30 days of production traffic, the telemetry tells us:
- Which sections are being looked up most frequently → that's where to invest in canonical extraction.
- What fraction of lookups hit `exact` vs `likely` vs `not_found` → whether confidence-band tuning is needed.
- p50 / p90 / p99 latency → whether OCR fallback (Phase 2) is needed for any specific PDF parts.

---

## 10. Security boundary

- The function runs **inside the Supabase Edge Function process**. No network call goes outside the project's own Supabase storage.
- The service-role JWT is read from `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. Same key the function already uses. No new secret is introduced.
- The function NEVER returns raw PDF bytes — only extracted text. Even if the caller misuses the output, no PDF binary leaks.
- The function NEVER calls an LLM. No prompt-injection vector.
- The function is a single async export from a single TypeScript file. It cannot be called from outside the edge function process.

---

## 11. Testing contract (Phase 1 fixtures)

Phase 1 lands a fixture file `evals/advisory/pdf_lookup_fixtures.test.ts` with the following test cases:

1. **Exact-found section** — `SBC-801 Section 903.2.7` (canonical-tracked, in `existing_ledger`) → `confidence: "exact"`, excerpt contains "903.2.7", `should_answer_compliance: true`.
2. **Likely-found section** — `SBC-801 Section 915.5.1` (in `pdf_text_search` band) → `confidence: "likely"`, `should_answer_compliance: false`.
3. **Not-found section** — `SBC-801 Section 6304.2.1.1` (chapter 63, not indexed) → `confidence: "not_found"`, `should_answer_compliance: false`, all `null`.
4. **Wrong-mode call** — `mode: "analysis"` → `found: false`, diagnostic `wrong_mode`.
5. **Aliased ref id** — `ref_id: "1004-5"` (hyphen) → resolves to `Table 1004.5` (dot).
6. **Empty text layer** — points at the SBC-201 pp 1251-1500 weak PDF on a page that has no extractable text → `confidence: "not_found"`, diagnostic `text_layer_empty`.
7. **Truncation** — request with `max_excerpt_length: 100` against a long section → excerpt is exactly 100 chars + `…[truncated]` suffix.
8. **Index unavailable** — simulate the bucket returning 404 on the index file → graceful `confidence: "not_found"` with `diagnostic: "index_unavailable"`.

These fixtures go in the same file as the existing `intent_gate_fixtures.test.ts`-style scenarios. Each test is self-contained — no live storage call needed for test 1, 2, 3, 4, 5, 7, 8 (mocked). Test 6 may need a fixture PDF excerpt or stay as a live-only smoke.

---

## 12. What this contract does NOT support (V1 limitations)

- ❌ No multi-page section spans. If a section spans 3 pages, V1 returns only `page_start`'s page text.
- ❌ No table-cell parsing. Table excerpts come back as raw paragraph text including the cell content as flat lines.
- ❌ No figure extraction. `ref_kind: "figure"` always returns `not_found` in V1; documented as deferred.
- ❌ No retroactive citation rewrite. Once the model has streamed an answer, V1 does NOT go back and add citations.
- ❌ No persistent cache (only in-memory).
- ❌ No batch lookup (one ref per call).
- ❌ No cross-section aggregation (e.g. "all sub-clauses of 903.2"). Caller can iterate.

V2+ tightens these; V1 is the minimum useful surface.

---

## 13. Decision summary

| Aspect | Choice |
|--------|--------|
| Function name | `lookupPdfSourceTextV1` |
| File path | `supabase/functions/fire-safety-chat/_pdf_lookup.ts` |
| Async? | Yes |
| Throws? | Never to caller |
| Calls model? | Never |
| OCR in V1? | No |
| Mode gate | Advisory only (early-return on Main/Analytical) |
| Index location | `sbc_pdfs_private/index/pdf_source_lookup_index.json` |
| Cache | In-memory, instance lifetime |
| Telemetry | Single structured log per call |
| Test fixtures | 8 scenarios (Phase 1) |

**Phase 0 deliverable**: this contract document. The function is not implemented in this round.

The implementation is the meat of Phase 1, alongside:
- `scripts/build-pdf-source-lookup-index.cjs` (generates the index).
- The new bucket `sbc_pdfs_private` with PDFs uploaded.
- The integration call site in `fire-safety-chat/index.ts` Advisory branch.

All four pieces (index builder, bucket, runtime helper, integration) are tightly coupled — they ship together in Phase 1.
