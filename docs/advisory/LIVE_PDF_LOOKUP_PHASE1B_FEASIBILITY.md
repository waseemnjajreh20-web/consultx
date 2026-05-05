# Live PDF Lookup — Phase 1B Feasibility Check

Date: 2026-05-05 (R11, read-only)
Companion: [docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md](docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md) (Phase 0 design)

This audits the existing Advisory runtime to determine the safest integration approach. **No code is changed in this round.**

---

## 1. Exact integration point

The wiring inserts inside the `if (mode === "standard")` block at [supabase/functions/fire-safety-chat/index.ts:5484-5525](supabase/functions/fire-safety-chat/index.ts:5484), specifically between the V1 sidecar load (ends line 5505) and the structured-table evidence surface (starts line 5511).

Order of operations after wiring:

```
1.  classifyAdvisoryIntent          (existing, line 5363)
2.  fetchStructuredTables           (existing, line 5409) → structuredTableEntries
3.  fetchSBCContext                 (existing, line 5417) → usedFiles, usedSourceMeta
4.  buildEvidenceLedger             (existing, line 5485) → advisoryLedger
5.  loadBrainFullV1Sidecars         (existing, line 5498)
6.  ◆ NEW: maybeRunPdfLookup        ← here ◆
7.  surface structured-table evidence (existing, line 5511)
8.  Gemini streaming
9.  verifyAdvisoryCitations
```

This placement gives the helper:
- Read access to `advisoryLedger` (so it can decide whether the existing retrieval already covers the user's ref).
- Read access to `userQuery` and `queryMeta` (to extract explicit refs).
- Read access to `supabaseAdminForTables` (the existing service-role client at line 5404-5406).
- Write access to `usedFiles` and `usedSourceMeta` (so it can supplement the source meta that gets streamed in headers).
- Write access to `advisoryLedger` and `fullSystemPrompt` (so it can append a live-PDF excerpt block).

The placement avoids any change to Main and Analytical retrieval paths — both bypass the entire `if (mode === "standard")` block.

---

## 2. Helper file decision: INLINE in `index.ts`

### Investigation

`ls supabase/functions/*/` shows every edge function is a **single `index.ts`** file. Eleven functions checked (`admin-stats`, `check-subscription`, `get-public-case-tracking`, `fire-safety-chat`, `fire-safety-chat-v2`, `auto-trial`, `corporate-trial`, etc.) — none has a sibling `_helper.ts` or `lib/` directory. There is **no precedent** for multi-file edge function bundles in this project.

### Risk if I introduce a separate file

Supabase Edge Functions are deployed via `supabase functions deploy <name>`. The CLI bundles the `index.ts` (and any imports) using esbuild. Sibling `.ts` files are bundled IF they're imported. But:
- The current project has never tested multi-file deploys.
- `_pdf_lookup.ts` would need a relative import (`from "./_pdf_lookup.ts"`) which Deno requires to include the `.ts` extension.
- Any path-resolution glitch surfaces only at deploy time, not in local TS check.
- The project's deploy workflow (no CI yet — manual `npx supabase functions deploy`) doesn't include a multi-file integration test.

### Decision

**Implement the helper INLINE inside `supabase/functions/fire-safety-chat/index.ts`.** It will be a single `lookupPdfSourceTextV1(input)` async function plus 1-2 supporting types/caches, totaling ~150-200 lines. The file is already 5,835 lines; adding 200 keeps it well within Edge Function size limits and avoids any deploy bundling risk.

### Trade-off

Inline keeps the helper testable only via integration paths, not via standalone unit tests in isolation. We'll mitigate by:
- Adding fixtures in `evals/advisory/` that test the lookup logic against synthetic ledger states + synthetic index data (mirroring R1's pattern for `intent_gate_fixtures.test.ts`).
- The runtime helper itself can be exported via a `module` annotation if needed — but Deno edge functions don't need explicit exports for dead-code analysis.

---

## 3. Mode discrimination

`mode === "standard"` is the Advisory discriminator throughout the file (~40 occurrences). The new helper hard-checks `if (mode !== "standard") return notFound`. The wiring point is already inside `if (mode === "standard")` so this is a defense-in-depth check, not the primary gate.

Main mode (`"main"`) and Analytical mode (`"analysis"`) take entirely different code paths starting around line 4760 (`mode === "analysis"` branch) and don't reach the Advisory ledger build block. The helper cannot be called from those paths because the wiring is inside the Advisory-only block.

---

## 4. Source metadata headers

Two headers get set at line 5656-5657:

```ts
"X-SBC-Sources": usedFiles.join(","),
"X-SBC-Source-Meta": JSON.stringify(usedSourceMeta),
```

`usedFiles: string[]` — comma-joined source filenames (e.g. `"SBC 201 ...-1-250_extracted_chunks.json"`).

`usedSourceMeta: SourcePageMeta[]` — JSON array of:
```ts
{
  file: string;
  pageStart: number | null;
  pageEnd: number | null;
  precision: 'page_range' | 'chunk_range_only' | 'unavailable';
  sectionRef?: string | null;
  sectionConfidence?: 'high' | 'medium' | 'low' | 'ambiguous';
}
```

### How live-PDF entries surface

When `lookupPdfSourceTextV1` returns `found: true`, the wiring appends to both:
- `usedFiles`: a **safe label** like `"SBC-801 §903.2.7 (live-pdf)"` — NOT the bucket path. Per R11 brief: "لا ترجع PDF URL للمستخدم" — no bucket path leak.
- `usedSourceMeta`: a new entry with:
  - `file`: same safe label as in `usedFiles`
  - `pageStart`/`pageEnd`: page numbers from the lookup
  - `precision`: keep `'page_range'` (existing union; no schema widening needed). The precision is correct — page granularity.
  - `sectionRef`: the resolved section/table id
  - `sectionConfidence`: `'high'` for `confidence: "exact"`, `'medium'` for `'likely'`

### Risk: `precision` union widening

The existing union is `'page_range' | 'chunk_range_only' | 'unavailable'`. Adding `'pdf_lookup_page'` would technically be a TypeScript type widening. Mitigation: reuse `'page_range'`. The frontend doesn't switch on `precision === 'pdf_lookup_page'` today, so adding a new value would not produce visible UI changes anyway. **Decision**: reuse existing `'page_range'` value.

### Risk: bucket path leak via `file` field

The `usedFiles` and `file` fields traditionally carry a real filename like `"SBC 801 ...-1-200_extracted_chunks.json"`. The frontend's `src/utils/sourceMetadata.ts` parses this filename to construct a public URL pointing to the orphan `source-pdfs` bucket. **Risk**: if I put `"SBC801/pp_0801-1000.pdf"` in `usedFiles`, the frontend might try to construct a URL pointing at `source-pdfs/SBC801/pp_0801-1000.pdf` — which doesn't exist there, but tries to look it up.

**Mitigation**: use a non-PDF-shaped label that the frontend's existing parser does not match. Options:
- `"sbc-801-section-903.2.7-live-pdf"` (no `.pdf` extension; no `_extracted_chunks` substring; safe for parser).
- `"__live_pdf__::SBC-801::903.2.7"` (sentinel-style, similar to `__sbc_table__::` already in use at line 5514).

**Decision**: use the sentinel-style `__live_pdf__::<family>::<ref>` pattern, mirroring the existing structured-table sentinel. Frontend parser won't match it, so no URL is constructed; the source panel renders it as a non-clickable chip with the `sectionRef` badge.

---

## 5. Server-side Supabase client + storage access

The Advisory branch already creates `supabaseAdminForTables` at line 5404-5406:
```ts
const supabaseAdminForTables = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
```

This client has full service-role access. The new helper reuses it — no second client created.

### Storage call shape

```ts
const { data, error } = await supabaseAdminForTables.storage
  .from("sbc_pdfs_private")
  .download(`text_pages/SBC801/pp_0801-1000.json`);
```

Returns a `Blob`-like object. The helper:
1. Calls `.download()` (returns binary or JSON content as blob).
2. Reads the blob as text via `await data.text()`.
3. JSON.parses the text-page artifact.
4. Searches inside.

### Required env vars

| Name | Why | Already used in function? |
|------|-----|:-------------------------:|
| `SUPABASE_URL` | Storage client URL | Yes (line 5405) |
| `SUPABASE_SERVICE_ROLE_KEY` | Storage client auth | Yes (line 5406) |
| `ADVISORY_PDF_LOOKUP_ENABLED` | Feature flag — **NEW** | No — needs to be set in Edge Function secrets, default treated as `"0"` if absent |

The function does NOT need any new authentication mechanism. It uses the same service-role key that `fetchSBCContext`, `loadBrainFullV1Sidecars`, etc. already use.

### Flag-default behavior

```ts
const flag = Deno.env.get("ADVISORY_PDF_LOOKUP_ENABLED");
if (flag !== "1") return { found: false, confidence: "not_found", diagnostic: "disabled_by_flag", ...nulls };
```

If `ADVISORY_PDF_LOOKUP_ENABLED` is not set (typical Phase 1B initial state), the helper short-circuits to `not_found` with `diagnostic: "disabled_by_flag"`. **Zero side effects when the flag is OFF.** No storage download, no index parse, no log spam.

---

## 6. Recommended implementation path

### Approach: pre-extracted text-page artifacts (R11 brief approach)

Rather than running a PDF parser inside the edge function on every request:

1. **Phase 1B Task 2**: locally run `pdftotext` against each of 18 PDFs, producing one JSON artifact per PDF with all pages' text. Total artifacts: 18 JSON files.

2. **Phase 1B Task 3**: upload those JSON artifacts to `sbc_pdfs_private/text_pages/SBC{201,801}/pp_NNNN-NNNN.json`. Plus a manifest at `sbc_pdfs_private/text_pages/text_pages_manifest.json`.

3. **Phase 1B Task 4**: runtime helper reads JSON artifacts (much faster than parsing 33 MB PDFs at runtime).

### Why JSON-artifact approach beats live PDF parsing

| Aspect | Live PDF parsing in Deno | Pre-extracted JSON artifacts |
|--------|-------------------------|------------------------------|
| Per-call latency | 500-1500 ms (download + parse) | 50-200 ms (download JSON) |
| Edge function memory | High (33 MB PDF loaded) | Low (per-page text) |
| PDF library dependency | yes (`pdf-parse` or `pdfjs-dist`) | none |
| Failure modes | parser bugs, layout regressions | simpler — JSON shape is fixed |
| Per-page seek cost | reload entire PDF or use lazy parsing | direct JSON map lookup |
| Pre-build complexity | none | Phase 1B Task 2 build script (one-time) |

**Decision**: pre-extracted artifacts.

### Phase 1B Task 2 artifact schema

For each of 18 PDFs, produce one JSON file:

```json
{
  "code": "SBC201",
  "pdf_file": "SBC201/pp_0001-0250.pdf",
  "source_pdf_sha256": "8c7e9737...",
  "page_count": 250,
  "generator": "pdftotext + node v24.11.1",
  "generated_at": "2026-05-05T...Z",
  "pages": [
    { "page": 1, "char_count": 412, "text": "..." },
    { "page": 2, "char_count": 1208, "text": "..." },
    ...
  ]
}
```

The runtime helper:
1. Resolves `(family, ref)` → `(pdf_file, page_start, page_end)` via the existing `pdf_source_lookup_index.json`.
2. Maps `pdf_file` → text-page artifact path: `text_pages/SBC801/pp_0801-1000.json`.
3. Downloads the artifact (one HTTP round-trip per cold-cache lookup).
4. Caches the parsed JSON in instance memory (LRU, max 5 artifacts).
5. Slices the relevant page range from `pages[]`.
6. Searches the page text for the section/table marker.
7. Returns the verbatim excerpt or `not_found`.

### Estimated artifact sizes

For each PDF averaging ~110,000 chars / 30 pages = ~3,700 chars/page. A full 250-page artifact would be ~915,000 chars + JSON overhead ≈ 1.2 MB per artifact. 18 artifacts × ~1 MB = ~18 MB total. Manageable.

The 31 MB SBC-801 pp 801-1000 PDF should produce a ~1.5-2 MB JSON artifact (200 pages × text density).

---

## 7. Risks

| Risk | Severity | Mitigation |
|------|:--------:|-----------|
| Helper runs on every Advisory query and adds latency | High | Trigger gating: only on (a) explicit ref in queryMeta AND (b) ref not already in ledger. Most queries skip the helper entirely. |
| Helper bug surfaces production errors | Medium | Try/catch wrapping (same pattern as V1 sidecar at line 5497-5505). Helper failure logged but never thrown to caller. |
| Inline implementation grows file to 6,000+ lines | Low | Helper is ~200 lines. File already 5,835 lines. No deploy size concerns. |
| Helper exposes bucket path through headers | Medium | Sentinel filename `__live_pdf__::<fam>::<ref>` instead of real path. Frontend's parser doesn't match the sentinel, so no public URL is constructed. |
| Index file format changes between Phase 1A and 1B runtime | Low | Index format frozen in Phase 1A commit `9e3edc5`. Helper reads same JSON shape. |
| Ledger pollution if helper fires multiple times per query | Medium | Concurrent-cap: max 3 lookups per query (per integration plan). |
| Service-role JWT used for storage download is the leaked key | Existing | Owner deferred rotation per R5. Same trust model as the existing function. |
| Flag accidentally flipped ON in production | Medium | Phase 1B deploys with flag missing/0. Phase 1C is a separate operator action. Code path on OFF is zero-side-effect verified. |

---

## 8. Recommended implementation path

### Phase 1B sequence (this round)

1. ✅ Task 1 (this document) — feasibility check.
2. Task 2 — locally extract page text from 18 PDFs using `pdftotext`. Save as 18 JSON artifacts in `generated/consultx_brain_full/pdf_lookup/text_pages/`.
3. Task 3 — upload artifacts + manifest to `sbc_pdfs_private/text_pages/`. Hash-verify each.
4. Task 4 — implement `lookupPdfSourceTextV1` INLINE in `index.ts`. ~200 lines.
5. Task 5 — wire into Advisory branch at line 5505, after V1 sidecar. Flag-gated.
6. Task 6 — add 8 fixtures in `evals/advisory/pdf_lookup_fixtures.test.ts` per the runtime contract.
7. Task 7 — TS check, deno check (if available), deploy `fire-safety-chat` with `ADVISORY_PDF_LOOKUP_ENABLED=0`.
8. Task 8 — final report.

### What this DOES NOT do

- Live smoke with user JWT (still BLOCKED in autonomous sessions).
- Flip flag ON.
- Touch `source-pdfs` bucket.
- Add OCR.
- Modify Main / Analytical paths.
- Modify any other edge function.
- Add DB schema or migration.

---

## 9. Decision summary

| Question | Answer |
|----------|--------|
| Where to wire? | After V1 sidecar (line 5505), before structured-table evidence surface (line 5511) |
| Helper file? | INLINE in `index.ts` (no precedent for multi-file edge functions) |
| Required env vars | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (existing), `ADVISORY_PDF_LOOKUP_ENABLED` (new, defaults to OFF) |
| Approach | Pre-extracted JSON text-page artifacts per PDF (uploaded in Tasks 2-3); runtime reads JSON, not PDF |
| Source meta header strategy | Sentinel filename `__live_pdf__::<family>::<ref>` to prevent URL construction; reuse existing `precision: 'page_range'` |
| Service-role JWT | Reuse `supabaseAdminForTables` already created at line 5404 |
| Flag default | OFF (`ADVISORY_PDF_LOOKUP_ENABLED` unset → treated as `"0"`) |
| Concurrent cap per query | Max 3 lookups |

This is the recommended implementation path. Proceeding to Task 2.
