# Advisory Runtime Data Path — Verified After R5

Date: 2026-05-05 (R6 read-only audit, post-R5 bucket refresh)
Branch: `claude/affectionate-solomon-f5e304`

---

## 1. TL;DR — what the R5 refresh actually did and did not change

The R5 bucket refresh updated **`ssss/brain_full_v1/SBC{201,801}_canonical_chunks.json`**. That path feeds the **secondary** V1 sidecar loader, which is Advisory-only and fires on a narrow trigger regex (Group M / fire-protection / egress / occupancy).

The **primary retrieval path** (`fetchSBCContext`) reads from a **different set of files** at the bucket root (`ssss/`), and **was not touched by R5**. The primary path serves Main, Advisory, and Analytical modes.

**Net effect**: the runtime's primary retrieval surface is unchanged from before R5. The reasoning aid available to Advisory queries that hit the V1 sidecar trigger now has the gated 358-chunk corpus instead of the older Phase 2 corpus. Most queries do not change behavior.

---

## 2. Three corpus snapshots in the production bucket

I listed the bucket via the public list API. Three distinct corpus snapshots exist:

### 2.1 Primary — bucket root (`ssss/...`)

These are the files `fetchSBCContext` reads via `supabase.storage.from("ssss").list("")` then downloads by name ([supabase/functions/fire-safety-chat/index.ts:2022-2069](supabase/functions/fire-safety-chat/index.ts:2022)). Filtered to `.json` filenames containing `chunk`.

21 chunk files, total ~17.6 MB:

| Filename | Bytes | Era |
|----------|------:|-----|
| `SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json` | 1,290,551 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-251-500_extracted_chunks.json` | 1,365,580 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-501-1000_extracted_chunks.json` | 2,353,268 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-1001-1250_extracted_chunks.json` | 1,223,935 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-1251-1500_extracted_chunks.json` | 834,933 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-1501-1750_extracted_chunks.json` | 1,126,806 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-1751-2000_extracted_chunks.json` | 1,143,035 | Phase 1 |
| `SBC 201 - The Saudi General Building Code-2001-2200_extracted_chunks.json` | 737,111 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1-200_extracted_chunks.json` | 1,169,387 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-201-400_extracted_chunks.json` | 941,782 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-401-600_extracted_chunks.json` | 249,003 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-601-800_extracted_chunks.json` | **12,245** (effectively empty) | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-801-1000_extracted_chunks.json` | **200** (empty placeholder) | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1001-1200_extracted_chunks.json` | 874,312 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1201-1400_extracted_chunks.json` | 874,791 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1401-1600_extracted_chunks.json` | 962,902 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1601-1800_extracted_chunks.json` | 1,066,136 | Phase 1 |
| `SBC 801 - The Saudi Fire Protection Code (3)-1801-2061_extracted_chunks.json` | 1,135,869 | Phase 1 |
| `SBC801_Ch9_v1_chunks.json` | 378,747 | Phase 1 special — sprinkler chapter |
| `SBC801_Ch10_v2_chunks.json` | 625,581 | Phase 1 special — egress chapter |
| `SBC801_Ch11_v2_chunks.json` | 16,237 | Phase 1 special — hazmat chapter (mostly empty) |

**This is the corpus the runtime actually serves to Main / Advisory / Analytical retrieval.** Two SBC-801 files are effectively empty (the 200-byte and 12-KB ones), suggesting Chapter 7-8 page ranges have very thin content.

### 2.2 Secondary — `brain_full_v1/` (V1 sidecar, Advisory-only)

5 files, freshly refreshed in R5:

| File | Bytes | Source |
|------|------:|--------|
| `SBC201_canonical_chunks.json` | 3,080,694 | Local R3-gated corpus (136 chunks), uploaded R5 |
| `SBC801_canonical_chunks.json` | 8,330,887 | Local R3-gated corpus (222 chunks), uploaded R5 |
| `relations_v1.json` | 576,608 | Pre-R5, from generated/consultx_brain_full/ |
| `facts_v1.json` | 284,804 | Same |
| `decision_tree_v1.json` | 9,811 | Same |

Read only by `loadBrainFullV1Sidecars` ([supabase/functions/fire-safety-chat/index.ts:1211-1339](supabase/functions/fire-safety-chat/index.ts:1211)). Trigger regex (line 1220) is narrow:
```
mercantile / group m / sprinkler / fire alarm / egress / occupant load / stair / corridor / mixed occupancy / residential / storage / educational / institutional / business / assembly / high hazard / Arabic equivalents
```

When the trigger fires, the sidecar appends a "BRAIN FULL V1 — REASONING AID" block to the system prompt. **Citations must still come from the Evidence Ledger**, not the sidecar (per the in-prompt instruction at line 1334).

### 2.3 Orphan — `brain_full_v3/` (NOT used by any code)

6 files generated 2026-05-01 23:23 UTC, total ~13 MB. **Zero references in any committed `.ts/.tsx/.cjs/.mjs/.js` source file** — verified by grep.

| File | Bytes | Notes |
|------|------:|------|
| `brain_manifest_v3.json` | 5,038 | Manifest reports 403 SBC-201 + 1,132 SBC-801 chunks |
| `SBC201_canonical_chunks_v3.json` | 3,414,102 | **403 chunks** — includes `requires_review:true` sections |
| `SBC801_canonical_chunks_v3.json` | 9,211,369 | **1,132 chunks** — same |
| `relations_v3.json` | 637,159 | superset of v1 relations |
| `facts_v3.json` | 352,923 | superset of v1 facts |
| `decision_tree_v3.json` | 9,811 | identical to v1 |

The v3 corpus is much larger than v1 — and **bypasses the R3 policy gate**. Verified by spot-check: v3 includes `sbc-201-section-102` (which the R3 gate blocks because the round-2 `.meta.json` has `requires_review:true`). So whoever generated v3 either ran the build script *before* R3 added the policy gate, or ran a different build that does not enforce the gate.

**This is a latent risk**: if any future code ever switches the V1 sidecar to read from `brain_full_v3/`, the policy gate is bypassed and `requires_review:true` content lands in production. The orphan should be either removed or formally marked as "do not use" in the bucket.

---

## 3. Code path map (Advisory mode = `mode === "standard"`)

The order of operations for a non-casual Advisory query:

```
1. classifyAdvisoryIntent(query)                     [supabase/functions/fire-safety-chat/index.ts:4792]
   ↓ if "casual" or "empty_or_ambiguous": short-circuit, return canned reply, no retrieval
   ↓ if "code_domain": continue

2. fetchStructuredTables(query)                      [PRIMARY-A — DB-first table lookup]
   ↓ DB query against `sbc_code_tables` for explicit table-id matches.
   ↓ Returns matchedTableIds + structured row content if any.

3. fetchSBCContext(query)                            [PRIMARY-B — bucket-root keyword retrieval]
   ↓ Lists all files at ssss/ root.
   ↓ Filters to chunk-named JSONs (the 21 files in Section 2.1 above).
   ↓ Downloads + scoreChunk + sort + select.
   ↓ Returns context string + sourceMeta for the Evidence Ledger.

4. Assemble system prompt:
   - basePrompt
   - structured table context (highest citation priority)
   - storage chunk context
   - empty-retrieval RETRIEVAL NOTE if both 2+3 returned nothing
   - finalBindingReminder
   - Evidence Ledger summary
   - V1 sidecar block IF trigger regex fires            [SECONDARY — brain_full_v1/]

5. Gemini call → streamed response
6. Citation Verifier on the streamed text             [supabase/functions/fire-safety-chat/index.ts:1359]
   ↓ Downgrades unsupported [SBC-201|801] tokens.
```

**Key invariant**: The V1 sidecar block in step 4 is **reasoning aid only**. The Citation Verifier in step 6 enforces that final citations resolve only to entries in the Evidence Ledger (built from steps 2+3, NOT step 4-secondary). So even though the sidecar fetches from `brain_full_v1/`, citations the user sees still trace back to the bucket root — i.e. to the ~17.6 MB Phase 1 corpus.

---

## 4. Fallback behavior

| Layer | Failure | Behavior |
|-------|---------|----------|
| Structured table lookup | No table-id match in query | Skip; continue to keyword retrieval |
| Structured table lookup | DB query errors | Throws; surface to caller (rare) |
| `fetchSBCContext` | `Deno.env` missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Returns `{ context: "", files: [], sourceMeta: [] }` — empty retrieval |
| `fetchSBCContext` | Storage list errors | Returns empty retrieval |
| `fetchSBCContext` | All 21 file downloads fail | Returns empty retrieval |
| `fetchSBCContext` | Retrieved chunks all score 0 | Returns empty retrieval |
| `fetchSBCContext` empty-retrieval branch | (line 5447) | Appends `RETRIEVAL NOTE` to prompt; **does NOT return 503** (R1 fix). The diagnostic protocol in the system prompt instructs the model to ask 1-3 clarifying questions and never cite from general memory. |
| V1 sidecar `loadBrainFullV1Sidecars` | Trigger regex misses | Returns null; logged as `[AdvisoryBrain] sidecar=v1 result=skip reason=trigger_miss` |
| V1 sidecar | All 5 storage downloads return null | Returns null; logged as `result=skip reason=all_files_null files_loaded=0/5` |
| V1 sidecar | Files loaded but RELEVANT-set filter drops everything | Returns null; logged as `result=skip reason=filtered_to_zero` |

The diagnostic logs at the V1 sidecar's four exit points were added in commit `9a53040` (R1) and remain in the deployed function.

---

## 5. Which modes are affected by R5?

| Mode | Reads `brain_full_v1/`? | Affected by R5? |
|------|:----------------------:|:---------------:|
| Main (`mode === "main"`) | No — uses bucket-root chunks via `fetchSBCContext` only | **No** |
| Advisory (`mode === "standard"`) | Yes — when V1 sidecar trigger fires | **Partial** — only on triggered queries |
| Analytical (`mode === "analysis"`) | No — uses `fetchSBCContextVector` which delegates to bucket-root | **No** |

So the R5 production effect is narrower than the prior R5 closeout report implied. Specifically:

- A casual / off-domain query: still bypassed by the non-code intent gate. Same as before.
- An Advisory query that DOES NOT hit the V1 sidecar regex (e.g. a structural-design question, a fire-rating question): retrieval surface unchanged from before R5.
- An Advisory query that DOES hit the V1 sidecar regex: the appended reasoning-aid block now contains gated 358-chunk content rather than the older Phase 2 corpus. **But** the Citation Verifier still requires citations to trace back to the Evidence Ledger built from bucket-root retrieval. So even on triggered queries, the user-visible citations are the same as before — only the model's hidden reasoning aid changed.
- Main / Analytical: completely unchanged.

---

## 6. Should production "now see 358 chunks"?

**No — not in any user-visible way.** The 358-chunk number describes the V1 sidecar reasoning-aid content. The Citation Verifier's source-of-truth is still the bucket-root corpus (~17.6 MB across 21 files), which has not been refreshed.

If the goal is to put the gated 358-chunk corpus on the user-visible retrieval path, the next step would be one of:

1. Replace the bucket-root chunk files with content derived from the gated 358-chunk corpus (large operation; would change Main and Analytical too).
2. Switch `fetchSBCContext` to read from `brain_full_v1/SBC{201,801}_canonical_chunks.json` instead of root files (one-line code change but affects Main and Analytical retrieval — not Advisory-only).
3. Add a new Advisory-only retrieval source that reads `brain_full_v1/` and feeds the Evidence Ledger directly (medium-complexity code change; Advisory-only effect).

Each option has different blast radius. Option 1 is the operationally cleanest if the policy intent is "all modes serve the gated corpus", but it touches Main/Analytical content surfaces. Option 3 is the safest "Advisory-only" path but requires runtime changes — out of scope for read-only verification this round.

This is the gap between what R5's closeout claimed ("production now serves 65% of ledger") and what production actually does ("primary retrieval still serves Phase 1 ~232-section corpus; only the Advisory reasoning aid layer was refreshed").

---

## 7. Summary table

| Question (from Task 1 brief) | Answer |
|-------------------------------|--------|
| What path does Advisory runtime use to load chunks? | Two paths: PRIMARY = bucket root `ssss/` via `fetchSBCContext` (21 files, Phase 1 era). SECONDARY = `ssss/brain_full_v1/` via `loadBrainFullV1Sidecars` (5 files, narrow Group-M/egress trigger, reasoning aid only). |
| Does runtime read from bucket / local / pgvector / mix? | Bucket only. No local file reads at runtime; the function is deployed as a Supabase Edge Function, no file system access. No pgvector — `fetchSBCContextVector` exists but falls back to keyword path because `match_sbc_documents` RPC is not provisioned. |
| Fallback behavior on bucket failure? | Empty retrieval → `RETRIEVAL NOTE` appended to prompt → diagnostic protocol governs response. No 503. Documented in [supabase/functions/fire-safety-chat/index.ts:5447-5462](supabase/functions/fire-safety-chat/index.ts:5447). |
| Diagnostic logs in place? | YES — 4 exit points of `loadBrainFullV1Sidecars` log `[AdvisoryBrain] sidecar=v1 ...`. Empty-retrieval branch warns `[Advisory] SBC context empty after retrieval`. Both added in R1 commit `9a53040`. |
| Sidecar fires in all modes? | NO — Advisory only (`mode === "standard"`), gated by trigger regex. |
| Does production now serve 358 chunks? | NO. Production primary retrieval still serves the Phase 1 root-level corpus. Only the Advisory reasoning-aid layer was refreshed by R5. The "production at 65.1%" framing in the R5 closeout was overstated; the user-visible retrieval surface is closer to the pre-R5 state. |
| Anything unexpected in the bucket? | YES — an orphan `brain_full_v3/` folder with 1,535-chunk corpus that bypasses the R3 policy gate. Not referenced by any code today, but a latent risk if anything wires it in. |
