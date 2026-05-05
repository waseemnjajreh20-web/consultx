# Advisory Primary Retrieval — Next Step

Date: 2026-05-05 (R7, recommendation only — no execution)

This is the single deliverable the R7 brief asked for at the end. It consolidates the runtime audit, root inventory, primary-vs-sidecar diff, v3 orphan risk, and fix-options analysis into one decision page.

Companion documents (committed alongside this in R7):
- [docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md](docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md)
- [docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md](docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md)
- [docs/brain/BRAIN_FULL_V3_ORPHAN_RISK_REPORT.md](docs/brain/BRAIN_FULL_V3_ORPHAN_RISK_REPORT.md)
- [docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md](docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md)

---

## 1. Current truth

### Primary path (the user-visible one)

`fetchSBCContext` at [supabase/functions/fire-safety-chat/index.ts:1997](supabase/functions/fire-safety-chat/index.ts:1997) reads the **bucket root** `ssss/` — 21 files, 4,096 chunks, ~17.6 MB. This is what feeds the Evidence Ledger. The Citation Verifier ultimately enforces this corpus. Used by Main, Advisory, Analytical.

Health: **18 of 21 files HEALTHY**. The 3 outliers:

| File | Health | Effect |
|------|--------|--------|
| `SBC 801 ...-601-800_extracted_chunks.json` | NEAR_EMPTY (3 chunks, 12 KB) | Weak primary coverage of SBC-801 Ch 7-9 page range |
| `SBC 801 ...-801-1000_extracted_chunks.json` | EMPTY_PLACEHOLDER (0 chunks, 200 B) | Same gap |
| `SBC801_Ch10_v2_chunks.json` | HEALTHY but parser falls back | Egress retrieval becomes one mega-chunk instead of 30 |

Mitigation already in place: `SBC801_Ch9_v1_chunks.json` (20 chunks) and the not-quite-correct `SBC801_Ch10_v2_chunks.json` (30 chunks) provide redundant coverage of the gap chapters but in non-standard schemas.

### Sidecar path (the Advisory-only reasoning aid)

`loadBrainFullV1Sidecars` at [supabase/functions/fire-safety-chat/index.ts:1211](supabase/functions/fire-safety-chat/index.ts:1211) reads `ssss/brain_full_v1/` — 5 files, 358 chunks. Only fires on a narrow trigger regex. Citations the user sees still trace back to the primary path; the sidecar is hidden context for the model.

R5 refreshed this path to the policy-gated 358-chunk corpus. Refresh confirmed: 0 of 12 R3-blocked sections present, 1 safe round-2 section (`sbc-801-section-114-1-1`) added.

### v3 orphan

`ssss/brain_full_v3/` has 6 files (1,535 chunks, ~13 MB) generated 2026-05-01 (before R3's policy gate). **Zero code references.** Currently not exploitable by runtime. **10 of 12 R3-blocked sections ARE present in v3** — if anything ever wires v3 in, the policy gate is bypassed silently.

### Production effect of R5

R5 only changed the secondary sidecar path. The primary path (which drives user-visible citations) is byte-identical to its pre-R5 state. The R5 closeout's "production at 65.1%" framing measured the sidecar, not the primary; **user-visible citation coverage is closer to the primary's pre-R5 state**.

---

## 2. Recommended next surgical action

### The action

**Hybrid Advisory-only supplement** — Option C from [docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md](docs/advisory/PRIMARY_RETRIEVAL_FIX_OPTIONS.md). Specifically:

1. Keep `fetchSBCContext` (the primary lister) **unchanged**. Main, Advisory, and Analytical all keep reading bucket-root files exactly as today.

2. Inside the Advisory branch (`mode === "standard"`) ONLY, after the existing primary retrieval and Evidence Ledger build, run a small new helper `loadBrainFullV1Supplement(query, supabaseAdmin, ledger)` that:
   - Reads `ssss/brain_full_v1/SBC{201,801}_canonical_chunks.json`.
   - Filters chunks whose `section_ref` is **not already represented** in the ledger.
   - Adds those chunks to the ledger tagged with `source: "v1_supplement"`.
   - Caps total addition at ~30 chunks to keep the prompt budget bounded.
   - Logs `[AdvisoryBrain] supplement=v1 added=<n>` at exit.

3. Add an env-var kill switch `ADVISORY_V1_SUPPLEMENT=0` that disables the helper without redeploy.

4. Add 2-3 fixtures to `evals/advisory/intent_gate_fixtures.test.ts` locking the deterministic dedup behavior.

### Why this action

- **Brief compliance**: Advisory-only. No Main / Analytical change. No bucket write. No DB write. No migration. No payment touch. No `supabase db push`.
- **Strictly additive**: cannot remove a citation that primary previously surfaced.
- **Smallest workable code surface**: ~50 lines added, one new helper, one call site, no rewrite of existing logic.
- **Highest-leverage Advisory gain**: closes the 5 critical SBC-201 table gaps (1004.5, 1006.3.3, 504.3, 504.4, 506.2) and the ~30 high-value SBC-801 sections (egress 1013.5/1021-1032, occupancy 301-315, fire-service 501-510) in one shot.
- **Cheap rollback**: flipping the env var disables the supplement without code revert.

### Why NOT the alternatives

- **Option A (bucket patch)** addresses the SBC-801 pp 601-1000 emptiness, which is real, but the brief explicitly says "لا bucket write في أول مرحلتين" — no bucket writes in the first two stages. Option A is ruled out by the brief, regardless of its merits. (It's the right *next* operator action after the live smoke confirms Option C is sufficient.)
- **Option B (replace primary with v1)** would shrink the served corpus by 377 sections AND change Main / Analytical retrieval, which violates the brief's "لا تلمس Analytical" rule.

---

## 3. What we DO NOT do

- ❌ Do not edit `fetchSBCContext` itself. Leave the primary path untouched.
- ❌ Do not delete `brain_full_v3/`. Risk report recommends it but the brief says "لا حذف من bucket قبل backup وخطة rollback".
- ❌ Do not write to bucket. The supplement reads `brain_full_v1/` which already has the right content from R5.
- ❌ Do not re-introduce Phase 3B v2-first sidecar pattern. The supplement reads only `brain_full_v1/`, never v2 or v3.
- ❌ Do not re-introduce the scoreChunk emission gate. The supplement adds chunks to the ledger; existing scoring loop is unchanged.
- ❌ Do not return 503 on empty retrieval. The supplement is best-effort additive; if it fails, the existing primary ledger is unaffected.
- ❌ Do not touch `fire-safety-chat-v2`. Separate decision, deferred.
- ❌ Do not do any of this without a live smoke first that establishes the **Advisory-pre-supplement** behavior baseline. Without that baseline, we can't tell whether the supplement actually changed anything.

---

## 4. Stop condition — when to return to the owner before any write

Halt and return to the owner with status before any code action if any of the following becomes true:

1. **Live smoke is still BLOCKED_NO_USER_SESSION**. The supplement's purpose is to fix Advisory citation coverage; without live smoke, there's no evidence that the gap exists in user-facing terms. Implementing the fix without that evidence is premature.

2. **A live smoke run shows that Advisory citations are already correct on the matrix's Tests B–E** (the SBC-201 mercantile + SBC-201 Table 1004.5 + SBC-801 fire alarm + SBC-801 sprinkler tests). If primary already covers these via Phase 1 chunks, the supplement is unnecessary.

3. **The `brain_full_v1/` corpus turns out to be polluted** — e.g. a future audit shows it now contains `requires_review:true` content despite R5's gate. Don't supplement from a polluted source.

4. **The owner has rotated the leaked service_role key** in the meantime — any code change that touches secret-handling surfaces should pause for the post-rotation environment to be reflected in the runtime.

5. **The change would require modifying Main or Analytical paths** even slightly (e.g. shared helper). The supplement must be Advisory-only or it crosses the brief's no-touch line.

6. **The supplement cap of ~30 chunks proves insufficient** during fixtures — i.e. the v1-supplement set the ledger needs to add is much larger than that. Discuss caps with the owner before raising them.

In each of these cases, write a short status note in `docs/advisory/`, mark the next step BLOCKED, and return.

---

## 5. Next 3 tasks (only)

These are the tasks that matter, sequenced by what they unlock. They are operator-driven; this autonomous round does not execute any of them.

### Task 1 — Operator runs live Advisory smoke against the R6 matrix

Use `docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md` Tests A–G. Capture:
- The streamed response body for each test.
- The `X-SBC-Sources` and `X-SBC-Source-Meta` response headers.
- The Citation Verifier's downgrade events from the function logs.

Write findings to `docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md`. This is the single most important deliverable before any code change.

### Task 2 — IF Task 1 confirms a citation gap → implement Option C

The `loadBrainFullV1Supplement` helper. Single PR, single deploy, env-var kill switch. Run TS check, run fixtures, run smoke against the augmentation behavior. If green, deploy.

### Task 3 — IF Task 1 shows the gap is in primary chapter coverage → operator runs Option A

Re-extract SBC-801 page-range files for pp 601-1000 and the schema-fix on `SBC801_Ch10_v2_chunks.json`. Bucket-only operation. The brief permits bucket writes "بعد المرحلتين الأوليين" — after the first two phases — and Tasks 1 + 2 are those two phases.

If Task 1 surfaces *both* gaps (which is plausible — primary covers different content than v1 misses), do Task 2 first (Advisory-only quick win) and Task 3 second (broader cross-mode fix).

---

## 6. Summary in one paragraph

Production primary retrieval still serves the Phase 1 root corpus (4,096 chunks across 21 files, 18 healthy + 1 near-empty + 1 empty + 1 schema fall-through). The R5 bucket refresh updated the Advisory-only sidecar reasoning aid, but did not change user-visible citations. The single recommended next surgical action — gated on live-smoke evidence — is to add a small Advisory-only `loadBrainFullV1Supplement` helper that augments the Evidence Ledger with high-value v1 sections that primary lacks (the 5 critical SBC-201 tables and ~30 high-value SBC-801 sections). The helper is additive, env-var-killable, Advisory-only, and respects every constraint in the brief. The companion v3 orphan, the empty SBC-801 page-range files, and the Ch10_v2 schema fall-through are documented as separate operator-side cleanup tasks, deferred per the brief's "لا bucket write في أول مرحلتين" rule.
