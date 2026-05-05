# Live PDF Lookup — Integration Result

Date: 2026-05-05 (R11, Phase 1B Task 5)

---

## 1. Status

**Wired**: integration block added inside the Advisory branch of `supabase/functions/fire-safety-chat/index.ts`. Helper is gated on `ADVISORY_PDF_LOOKUP_ENABLED === "1"` (defaults OFF).

| Field | Value |
|-------|-------|
| Insertion point | Between V1 sidecar load (line ~5841 — end of try/catch) and structured-table evidence surface (line ~5843) |
| Integration block size | ~115 lines |
| Mode gate | `if (mode === "standard")` — already wraps the parent block (line 5484) |
| Flag gate | `Deno.env.get("ADVISORY_PDF_LOOKUP_ENABLED") === "1"` — explicit; short-circuits when not set |
| Trigger condition | Query has explicit section/table refs in `queryMeta` AND ref is NOT already in the ledger |
| Per-call concurrency cap | Max 3 lookups per query |
| Per-turn time budget | 5000 ms |
| Failure handling | try/catch wrapping; failure logged but never thrown |

---

## 2. Code flow

When a user submits an Advisory query:

```
1. classifyAdvisoryIntent
2. fetchStructuredTables  → structuredTableEntries
3. fetchSBCContext        → usedFiles, usedSourceMeta
4. buildEvidenceLedger    → advisoryLedger
5. loadBrainFullV1Sidecars (existing, V1 reasoning aid)
6. ◆ NEW: Live PDF Lookup (Advisory + flag-gated)
7. surface structured-table evidence
8. Gemini streaming
9. verifyAdvisoryCitations
```

The new block at step 6:

1. Reads env flag — if not `"1"`, skips entirely (zero cost).
2. Calls `buildQueryMeta(userQuery)` to extract explicit section + table refs.
3. Builds a `ledgerRefs` Set from the existing `advisoryLedger`.
4. Identifies refs in the user query that are NOT in the ledger (the "uncovered" set).
5. For each uncovered ref (capped at 3, total budget 5 s):
   - Infers code family from section number range (`9xx-10xx` → SBC-801; `1xx-8xx` + `11xx-12xx` → SBC-201; `12xx+` → SBC-801 specialty).
   - Calls `lookupPdfSourceTextV1(supabaseAdmin, { code, ref_type, ref, query, mode: "standard" })`.
   - On `found: true`:
     - Appends sentinel filename `__live_pdf__::<family>::<ref>` to `usedFiles`.
     - Pushes a `SourcePageMeta` to `usedSourceMeta` with `precision: 'page_range'` and the resolved page numbers.
     - Pushes an `EvidenceLedgerEntry` with `isClickableSource: false`.
     - Appends a guarded excerpt block to `fullSystemPrompt` (Arabic or English version based on user's language).
6. Logs `[PdfLookup] integration_summary` with counts when at least one lookup was added.

---

## 3. Key design decisions

### Sentinel filename prevents URL construction

The integration uses `__live_pdf__::<family>::<ref>` as the filename in `usedFiles` and `SourcePageMeta.file`. This pattern:

- Mirrors the existing `__sbc_table__::<family>::<tableId>` sentinel (already at line 5850 for structured-table entries).
- Does NOT match the regex in `src/utils/sourceMetadata.ts` that constructs `/storage/v1/object/public/source-pdfs/...` URLs.
- Means the frontend's Source Panel renders the chip as non-clickable.
- Prevents any direct PDF download attempt by the user.

### Reuses existing service-role client

The block uses `supabaseAdminForTables` already created at line 5404 of the Advisory branch. No new client. No new env var read at the call site.

### Confidence-banded compliance gate

The helper returns `confidence: "exact" | "likely"`. The system-prompt block instructs the model to:

- Cite normally with `[SBC-XXX Section Y.Z]` when `confidence === "exact"`.
- Note "likely" confidence and refuse binding compliance answer when `confidence === "likely"`.

The Citation Verifier is unchanged. It already accepts citations whose section refs match ledger entries — so live-PDF entries (added to the ledger) will pass through.

### Guarded excerpt block

The injected prompt section is bilingual and includes:

- The verbatim excerpt (≤ 1,200 chars).
- A strict instruction to quote/analyze ONLY this excerpt for the cited section.
- A confidence-band-specific instruction (cite normally OR "do not give binding compliance").
- Optional limitations note (e.g. "section anchor not localizable").

Sample English block:
```
📄 LIVE PDF SOURCE EXCERPT — SBC-801 Section 903.2.7 (p. 712, live PDF)
<verbatim excerpt>

STRICT INSTRUCTION: This excerpt is verbatim from the source PDF.
Quote and analyze ONLY this excerpt for the cited section.
Do NOT extrapolate to other sections.
Cite as [SBC-801 Section 903.2.7].
```

---

## 4. What does NOT change

- ❌ Main mode (`mode === "main"`) is untouched — the integration block is inside `if (mode === "standard")`.
- ❌ Analytical mode (`mode === "analysis"`) is untouched — same enclosing condition.
- ❌ `fetchSBCContext` unchanged.
- ❌ `fetchStructuredTables` unchanged.
- ❌ V1 sidecar (`loadBrainFullV1Sidecars`) unchanged — runs before the new block.
- ❌ Citation Verifier unchanged — accepts new ledger entries via existing logic.
- ❌ `classifyAdvisoryIntent` unchanged — non-code intent gate runs before retrieval.
- ❌ `buildEvidenceLedger` / `buildEvidenceSummaryForPrompt` unchanged — the new block extends the ledger after it's built but before it's serialized to the prompt summary header. Wait — let me re-check this.

Actually, the integration block runs AFTER `buildEvidenceLedger` (line 5485) and AFTER `buildEvidenceSummaryForPrompt` (line 5486-5487, which appends the summary to `fullSystemPrompt`). So the ledger summary the model sees is the ORIGINAL (pre-lookup) summary. The live-PDF additions to the ledger are NOT in that summary. They ARE added to the ledger as data, so the Citation Verifier sees them.

This is intentional: the prompt's evidence summary describes "what retrieval surfaced". Live PDF lookups add content via a separate, explicit block ("📄 LIVE PDF SOURCE EXCERPT") that's visible to the model. The two are distinct.

---

## 5. Failure modes — graceful degradation

| Failure | Effect |
|---------|--------|
| `ADVISORY_PDF_LOOKUP_ENABLED` unset or `!= "1"` | Block skipped entirely; zero cost |
| Index download fails | Helper returns `not_found`; integration skips this ref |
| Single ref's helper throws an exception | Caught by helper itself, returns `not_found`; integration continues to next ref |
| Whole try/catch around integration throws | Caught; logs warning; existing pre-lookup state preserved |
| Time budget exhausted | Subsequent refs in `uncovered` are skipped; partial supplementation is fine |
| Concurrent cap hit | Same — partial supplementation |
| Family inference picks wrong code | Helper returns `index_miss` / `not_found`; integration moves on |

In every failure mode, the existing Advisory pipeline runs to completion using the pre-Phase-1B retrieval result. Live PDF lookup is strictly additive.

---

## 6. Family inference heuristic

```ts
function inferCode(ref: string): "SBC201" | "SBC801" {
  const num = parseInt(ref.split(".")[0], 10);
  if (num >= 900 && num < 1100) return "SBC801";  // sprinkler/alarm/egress
  if (num >= 100 && num < 900) return "SBC201";    // general building / occupancy
  if (num >= 1100 && num < 1300) return "SBC201";  // SBC-201 Ch 11-12
  return "SBC801";                                  // 1300+ specialty hazmat
}
```

This is a simple section-range heuristic. It mirrors the cross-code routing logic already used elsewhere in `getTargetChapters`. Limitations:

- Section `907` exists in BOTH SBC-201 AND SBC-801. The heuristic picks SBC-801 (correct for the operative fire-alarm requirement).
- Section `1004.5` is the SBC-201 occupant-load table. The heuristic picks SBC-201 (correct).
- Section `903.2.7` is in SBC-801 (sprinkler). Heuristic picks SBC-801 (correct).

For ambiguous cases, the model can re-query with explicit family hint ("SBC-801 Section 907.x") and the helper will route correctly.

---

## 7. SourcePanel / private URL exposure

| Concern | Status |
|---------|:------:|
| Integration block creates public URLs | **NO** — sentinel filename `__live_pdf__::*` doesn't match the URL-construction regex |
| Integration block creates signed URLs | **NO** |
| `pdf_file` field exposed to client | **NO** — only the sentinel goes into `usedFiles` and `SourcePageMeta.file`; the actual `pdf_file` from the helper output stays server-side |
| Frontend can fetch the PDF | **NO** — same as before this round; `sbc_pdfs_private` bucket remains private |
| `source-pdfs` (orphan public bucket) status | **UNTOUCHED** — separate owner-side decision |

---

## 8. Headers (X-SBC-Sources, X-SBC-Source-Meta)

After integration, when at least one live-PDF lookup succeeded, the response headers will include the sentinel:

```
X-SBC-Sources: SBC 201 ...-1-250_extracted_chunks.json,__live_pdf__::SBC-801::903.2.7
X-SBC-Source-Meta: [...,{"file":"__live_pdf__::SBC-801::903.2.7","pageStart":712,"pageEnd":712,"precision":"page_range","sectionRef":"903.2.7","sectionConfidence":"high"}]
```

The frontend's existing parser (per `src/utils/sourceMetadata.ts`) only constructs URLs for filenames matching specific PDF / chunk-file patterns. The `__live_pdf__::*` sentinel is NOT one of those, so:

- The Source Panel renders this entry as a chip (with the section-ref badge).
- Clicking the chip does NOT open a PDF viewer (no URL is constructed).
- Hover text shows the section ref — the user knows the source exists but cannot direct-link to it.

This is the desired behavior per the R11 brief: *"لا ترجع PDF URL للمستخدم"*.

---

## 9. Diff summary

Total addition to `supabase/functions/fire-safety-chat/index.ts`:

| Section | Lines | Purpose |
|---------|------:|---------|
| Helper block (Task 4) | ~280 | `lookupPdfSourceTextV1` + types + caches + utilities (between V1 sidecar and Citation Verifier) |
| Integration block (Task 5) | ~115 | Trigger gating + per-ref loop + ledger/headers/prompt supplementation (inside Advisory branch) |
| **Total** | **~395 lines** | |

Pre-Phase-1B file size: 5,835 lines.
Post-Phase-1B file size: ~6,230 lines.

No existing function was modified. All additions are inside their own try/catch with graceful failure paths.

---

## 10. What this task did NOT do

- ❌ No deploy yet (Task 7).
- ❌ No fixtures yet (Task 6).
- ❌ No flag flip — `ADVISORY_PDF_LOOKUP_ENABLED` defaults OFF.
- ❌ No change to Main mode.
- ❌ No change to Analytical mode.
- ❌ No DB write.
- ❌ No bucket write.
- ❌ No frontend change.
- ❌ No other edge function modified.

---

## 11. Next step

Proceed to Task 6 — add fixtures locking the helper's deterministic behavior + the integration's trigger logic. Then Task 7 — TS check + deploy with flag OFF.
