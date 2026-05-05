# Live PDF Lookup — Integration Plan

Date: 2026-05-05 (R9, Phase 0 design — no execution)
Companion: [docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md](docs/advisory/LIVE_PDF_LOOKUP_RUNTIME_CONTRACT.md)

This document specifies WHERE inside `fire-safety-chat/index.ts` the new `lookupPdfSourceTextV1` helper is wired, what conditions trigger it, what it does to the Evidence Ledger, and how it surfaces to the user. **No code is implemented in this round.**

---

## 1. The integration question

The function is a tool — it works correctly, it returns clean output. The harder question is **when do we call it**. Calling it on every Advisory query adds 400-1300 ms of unnecessary latency to queries that don't need it. Calling it only on the perfect trigger requires a clean signal.

The answer below splits into 5 sub-questions and gives an explicit position on each.

---

## 2. After retrieval, before Evidence Ledger build

**Position**: insert the call **AFTER `fetchSBCContext` returns AND AFTER `fetchStructuredTables` returns**, but **BEFORE the Evidence Ledger is built** at line 5476:

```
1. classifyAdvisoryIntent           // existing — short-circuits casual queries
2. fetchStructuredTables            // existing — DB-first table lookup
3. fetchSBCContext                  // existing — bucket-root keyword retrieval
4. NEW: maybe-call lookupPdfSourceTextV1   ← integration point
5. buildEvidenceLedger              // existing — incorporates new lookup output
6. loadBrainFullV1Sidecars          // existing — Phase 2 reasoning aid
7. Build system prompt + Gemini call
8. verifyAdvisoryCitations          // existing — citation verifier
```

Why here (and not earlier or later):

- **Earlier than this** (e.g. before `fetchSBCContext`): would risk calling the helper on every query, even ones primary covers fully.
- **After Evidence Ledger build**: too late — the ledger is already finalized when the system prompt is assembled. We want lookup output to be IN the ledger so the verifier sees it.
- **After Gemini streaming**: model has already answered without the live-PDF excerpt. Retroactive citation rewrite is V2+, not V1.

**The integration point is line 5476 of `supabase/functions/fire-safety-chat/index.ts`** (just before `advisoryLedger = buildEvidenceLedger(...)`). Phase 1 inserts ~30 lines there.

---

## 3. When does the helper fire?

Position: **only on three signals, all of which must be true**:

### Signal 1 — `mode === "standard"` (Advisory only)

Hard gate. If the request is Main or Analytical, skip entirely. Already enforced in the helper itself, but the call site can short-circuit cheaper.

### Signal 2 — User's query contains an explicit ref-pattern

Use the existing `buildQueryMeta(query)` ([supabase/functions/fire-safety-chat/index.ts:1654](supabase/functions/fire-safety-chat/index.ts:1654)) which already extracts `sectionNumbers`, `tableRefs`, `exactPhrases` from the query.

If `queryMeta.sectionNumbers.length > 0 || queryMeta.tableRefs.length > 0`, there's an explicit reference to look up. Otherwise the user is asking a general design question without naming a section — primary retrieval should serve the answer; live PDF lookup adds no value.

### Signal 3 — Existing retrieval did NOT cover the reference

Build a quick set:
```ts
const ledgerSectionRefs = new Set([
  ...usedSourceMeta.map(s => s.sectionRef).filter(Boolean),
  ...structuredTableEntries.map(e => e.tableId),
]);
```

For each `ref` in `queryMeta.sectionNumbers ∪ queryMeta.tableRefs`:
- If `ledgerSectionRefs.has(ref)`: skip — already covered.
- Else: call `lookupPdfSourceTextV1` once per uncovered ref.

This is the **gap-only** invocation policy. A typical Advisory query that names a section primary already covers will trigger zero live-PDF calls. A query that names a section primary doesn't cover triggers one call per gap-section.

### Combined trigger (pseudocode)

```ts
if (mode === "standard" && (queryMeta.sectionNumbers.length || queryMeta.tableRefs.length)) {
  const ledgerRefs = new Set([
    ...usedSourceMeta.map(s => s.sectionRef).filter(Boolean),
    ...structuredTableEntries.map(e => e.tableId),
  ]);
  const uncoveredSections = queryMeta.sectionNumbers.filter(r => !ledgerRefs.has(r));
  const uncoveredTables   = queryMeta.tableRefs.filter(r => !ledgerRefs.has(r));
  for (const ref of uncoveredSections) {
    const out = await lookupPdfSourceTextV1({ code, ref_kind: "section", ref_id: ref, query: userQuery, mode });
    if (out.found) supplementLedger(out);
  }
  for (const ref of uncoveredTables) {
    const out = await lookupPdfSourceTextV1({ code, ref_kind: "table", ref_id: ref, query: userQuery, mode });
    if (out.found) supplementLedger(out);
  }
}
```

This pattern guarantees:
- **Casual queries** (intent gate already short-circuits) never reach this code.
- **General design queries without explicit refs** (e.g. "what are sprinkler thresholds for Group M") never trigger live-PDF — only their primary-retrieved answer is used.
- **Explicit ref queries that primary covers** never trigger live-PDF.
- **Explicit ref queries that primary does NOT cover** trigger exactly one live-PDF call per uncovered ref.

---

## 4. How it modifies the Evidence Ledger

When `lookupPdfSourceTextV1` returns `found: true`, the call site appends an entry:

```ts
function supplementLedger(out: LookupOutput) {
  advisoryLedger.push({
    family: out.code,                          // "SBC-201" or "SBC-801"
    section_ref: out.ref_id,
    title: out.citation_label,
    source_pdf_key: out.pdf_file,
    page_start: out.page_start,
    page_end: out.page_end,
    extraction_status: "live_pdf_lookup",      // new value (not in existing union)
    confidence: out.confidence === "exact" ? "high" : "medium",
    canonical_status: "PDF_LIVE",              // new — communicates "runtime fetch, not canonical"
    live_lookup: true,                          // new flag
    excerpt: out.excerpt,                       // new — the verbatim text itself
    should_answer_compliance: out.should_answer_compliance,  // new — gates the model
  });

  // Also append the excerpt to the system prompt as supplementary context
  fullSystemPrompt += `\n\n📄 LIVE PDF LOOKUP (source-of-record extraction): ${out.citation_label}\n${out.excerpt}\n`;
}
```

Two new fields are introduced on `EvidenceLedgerEntry`:
- `canonical_status: "PDF_LIVE"` — tells the Citation Verifier that this entry is a runtime fetch.
- `live_lookup: true` — easier flag for log filtering than checking `canonical_status`.
- `excerpt` and `should_answer_compliance` — used by the system prompt builder.

The existing Citation Verifier ([supabase/functions/fire-safety-chat/index.ts:1359](supabase/functions/fire-safety-chat/index.ts:1359)) currently checks `ledger.has(family) && ledger.section_refs.includes(refId)`. With the new entries:

- A `[SBC-801 §903.2.7 | conf:high]` token whose ledger entry has `live_lookup: true` is still accepted (the verifier doesn't care about the source).
- The verifier should be UPDATED in Phase 1 to attach a `live_lookup` flag to its rewrites — so the model sees `[SBC-801 §903.2.7 | conf:high | live_pdf]` in the streamed output. The user can interpret the `live_pdf` tag if they understand it; if not, it doesn't break anything.

---

## 5. How does it appear in `SourcePanel`?

The frontend's source panel is driven by the `X-SBC-Sources` and `X-SBC-Source-Meta` response headers. A live-PDF entry produces:

| Field | Value |
|-------|-------|
| `X-SBC-Sources` | Comma-joined list of source family + section ref. Existing format: `SBC-801,Section 903.2.7`. Live PDF entries follow the same format. |
| `X-SBC-Source-Meta` | JSON array of objects. Each object has `file`, `pageStart`, `pageEnd`, `precision`, `sectionRef`, `sectionConfidence`. Live PDF entries get a new field `live_lookup: true` so the frontend can render them differently if it wants (e.g. a "live source" badge). |

The frontend may opt to:
- Render live-PDF entries with a "📄 Source PDF" badge.
- Disable click-to-jump for live-PDF entries (the runtime doesn't expose the PDF URL to the frontend).
- Show the limitations note as a tooltip.

**This is a frontend follow-up — out of scope for Phase 1.** Phase 1 ships the backend headers; frontend uses them as-is (existing behavior renders the section ref as a clickable chip; clicks open a "section X" modal, which still works because the section ref is well-formed).

---

## 6. Latency control — avoiding slowdown on every query

The trigger conditions ensure most queries don't hit the helper. But within the queries that DO hit it, latency must stay bounded:

| Lever | Mechanism |
|-------|-----------|
| Cap concurrent lookups | Max 3 lookups per query (if user's query has 5 section refs but only 3 are gaps, OK; if 8 are gaps, only first 3 run). |
| Index cache | One-time download per instance; subsequent calls O(1). |
| PDF download cache | Per-instance LRU of last 5 PDF parts. SBC-801 pp 801-1000 (31 MB) doesn't get downloaded twice in a session. |
| Per-call timeout | 2.5 s per `lookupPdfSourceTextV1` call. If it doesn't return in time, treat as `not_found` and continue. |
| Total budget | 5 s for ALL live-PDF work in one Advisory turn. After that, skip remaining lookups. |

These caps mean an outlier query (user mentions 8 sections) still completes in roughly `5 s + Gemini stream time` instead of `8 × 1 s + Gemini`. Most queries see no change vs today.

---

## 7. Failure modes — graceful degradation

Each failure path returns the runtime to the existing baseline behavior, never worse:

| Failure | Behavior |
|---------|---------|
| `sbc_pdfs_private` bucket not yet created | Index download returns 404. All `lookupPdfSourceTextV1` calls return `found: false`. Existing flow continues. |
| Index file present but stale (entry points to a section not actually on that page) | Function returns `confidence: "likely"`. Model doesn't give compliance answer. User sees a caveated response. |
| Source PDF gone from bucket | Function returns `found: false` with `diagnostic: "pdf_download_failed"`. Existing flow continues. |
| Function throws an unexpected exception | Wrapped in try/catch at the call site. Returns to existing flow. Logs a warning. |
| Gemini streaming starts before the lookup completes | The lookup is awaited BEFORE the `fetch(GEMINI_URL)` call, so this can't happen. The system prompt is fully assembled before streaming starts. |

In every case, the existing R5/R6/R7-state behavior is the floor. Live PDF Lookup never makes the runtime worse than today.

---

## 8. Feature flag — on/off control

**Env var**: `ADVISORY_PDF_LOOKUP_ENABLED`

| Value | Behavior |
|-------|---------|
| `1` (or unset, defaulting to `1`) | Helper runs on triggered queries |
| `0` | Helper short-circuits with `found: false`, `diagnostic: "disabled_by_flag"`. Zero PDF downloads, zero index downloads. |

The flag is read on EVERY function call (cheap — `Deno.env.get` is a constant-time lookup). An operator can flip the flag in the Supabase dashboard's Edge Function secrets and disable the feature within seconds — no redeploy.

For Phase 1 launch:
1. Deploy with `ADVISORY_PDF_LOOKUP_ENABLED=0` (off).
2. Smoke test the helper offline + with one user-JWT live test that exercises a known gap section.
3. After smoke passes, flip flag to `1` for production traffic.
4. Monitor logs for 24 hours.
5. If anything looks off, flip back to `0`. Code stays deployed; only behavior is gated.

This is the safest possible launch sequence. Code is shipped behind a flag; the flag flip is the actual "go-live".

---

## 9. Source-meta header changes (X-SBC-Source-Meta)

Today's header schema (existing):
```json
[{"file":"SBC 201 ...-1-250_extracted_chunks.json","pageStart":12,"pageEnd":15,"precision":"page","sectionRef":"303","sectionConfidence":"high"}]
```

Phase 1 schema (additive):
```json
[{
  "file": "SBC 201 ...-1-250_extracted_chunks.json",
  "pageStart": 12,
  "pageEnd": 15,
  "precision": "page",
  "sectionRef": "303",
  "sectionConfidence": "high"
},{
  "file": "SBC801/pp_0801-1000.pdf",
  "pageStart": 712,
  "pageEnd": 712,
  "precision": "page",
  "sectionRef": "903.2.7",
  "sectionConfidence": "high",
  "live_lookup": true
}]
```

The `live_lookup: true` field is new and additive. Existing frontend code that doesn't know about it just ignores it — backwards compatible. Frontend updates to render it differently are a follow-up.

---

## 10. What this integration does NOT change

- ❌ `mode === "main"` — Main retrieval flow untouched.
- ❌ `mode === "analysis"` — Analytical retrieval flow untouched.
- ❌ `fetchSBCContext` itself — primary lister unchanged.
- ❌ `fetchStructuredTables` — table DB-first path unchanged.
- ❌ `loadBrainFullV1Sidecars` — V1 sidecar reasoning aid unchanged.
- ❌ `verifyAdvisoryCitations` — citation verifier MAY get a tiny update (add `live_pdf` tag), but core logic unchanged.
- ❌ Frontend code — backwards compatible header changes only; frontend update is a separate task.
- ❌ DB schema — no migration.
- ❌ `sbc_code_tables` — unchanged.
- ❌ Moyasar / Tap / billing — untouched.
- ❌ Enterprise UI / RPCs — untouched.

---

## 11. Phase 1 implementation checklist

In a single deploy:

- [ ] Create new file `supabase/functions/fire-safety-chat/_pdf_lookup.ts` (~150 lines) implementing `lookupPdfSourceTextV1` per the runtime contract.
- [ ] Add a new build script `scripts/build-pdf-source-lookup-index.cjs` that generates `pdf_source_lookup_index.json`.
- [ ] Run the build script locally; commit the resulting index to `generated/consultx_brain_full/indexes/pdf_source_lookup_index.json`.
- [ ] Operator-side: create `sbc_pdfs_private` bucket, upload 18 PDFs, upload index.
- [ ] Modify `supabase/functions/fire-safety-chat/index.ts` line ~5475 to add the trigger-and-call block (~30 lines).
- [ ] Add a small extension to the Citation Verifier to recognize the `live_lookup` flag (~10 lines).
- [ ] Add new fixtures to `evals/advisory/intent_gate_fixtures.test.ts` (or a new sibling file) per the runtime contract Section 11 (8 scenarios).
- [ ] Run TS check — must pass.
- [ ] Run all existing fixtures — must still pass.
- [ ] Run new fixtures — must pass.
- [ ] Deploy with `ADVISORY_PDF_LOOKUP_ENABLED=0`.
- [ ] One-time live smoke with user JWT: trigger a query for a known gap section. Verify telemetry log line appears. Verify ledger entry has `live_lookup: true`. Verify model uses the excerpt with appropriate caveat.
- [ ] Flip flag to `1`. Monitor.

---

## 12. Phase 1 estimated time

| Task | Hours |
|------|------:|
| Build script for index | 4 |
| Runtime helper `_pdf_lookup.ts` | 4 |
| Integration call site | 2 |
| Citation Verifier extension | 1 |
| Fixtures | 2 |
| Live smoke + iteration | 2 |
| Bucket setup + upload | 1 |
| **Total** | **~16 hours** |

Spread over 2-3 operator sessions — doesn't need to be one giant push.

---

## 13. Decision summary

| Question | Answer |
|----------|--------|
| Where to call? | After `fetchStructuredTables` + `fetchSBCContext`, before `buildEvidenceLedger`. ~line 5476. |
| When to call? | `mode === "standard"` AND query has explicit ref AND ref is NOT already in the ledger |
| At empty retrieval? | Not specifically — at gap-coverage. The empty-retrieval branch already exists for the "no refs at all" case. |
| At weak citation? | The function fires BEFORE the model streams. There is no "weak citation" yet to react to. V2+ may add a post-stream rewrite path. |
| At explicit section/table request? | YES — that's the primary trigger condition |
| Before or after Evidence Ledger? | BEFORE — so the ledger contains the lookup output |
| Source panel changes? | Backwards-compatible header field `live_lookup: true`; frontend optional update |
| Avoid slowdown? | Trigger gates queries to lookup-needed only; per-call timeout 2.5 s; total budget 5 s; concurrent cap 3 |

**Phase 0 deliverable**: this integration plan. No code change. No deploy. The plan is ready for owner review alongside the storage plan, index design, and runtime contract.
