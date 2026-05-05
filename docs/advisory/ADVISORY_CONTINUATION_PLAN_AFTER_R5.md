# Advisory Continuation Plan — After R5

Date: 2026-05-05 (R6)
Predecessors:
- [docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md](docs/advisory/ADVISORY_RUNTIME_PATH_AFTER_R5.md)
- [docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md](docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md)
- [docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md](docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md)
- [docs/advisory/ADVISORY_POST_R5_ROOT_CAUSE.md](docs/advisory/ADVISORY_POST_R5_ROOT_CAUSE.md)

---

## 1. Current stable baseline

The Advisory runtime is on **Phase 3A** with all R1+R3+R5 work locked in. Specifically:

| Layer | State | Origin |
|-------|-------|--------|
| Non-code intent gate | Active | commit `3be8214` (R1) — short-circuits casual / empty queries before retrieval |
| Primary retrieval | `fetchSBCContext` reads bucket-root chunk files | unchanged since Phase 1 |
| Structured-table path | DB-first lookup against `sbc_code_tables` | unchanged |
| Empty-retrieval handling | `RETRIEVAL NOTE` appended; **no 503** | commit `4922cb3` (R1) |
| V1 sidecar reasoning aid | `loadBrainFullV1Sidecars` reads `ssss/brain_full_v1/`, narrow Group-M / fire-protection / egress trigger | commit `26479a1` (Phase 2) + R1 logs `9a53040` |
| V1 sidecar policy gate | `requires_review:true` files skipped during build | commit `686d4e8` (R3) |
| V1 sidecar bucket content | gated 358-chunk corpus | commit `3a22546` (R5 upload) |
| Citation Verifier | Post-stream pass downgrades unsupported `[SBC-201|801 ...]` tokens | commit `bd36b4a` (Step 4) |
| Step 3.2 hard-stop wrong-family routing | Active | commit `8fdfc6f` |
| Diagnostic logs at sidecar exit branches | Active | commit `9a53040` (R1) |
| Offline contract fixtures | 11/11 pass, locks intent classifier + sidecar trigger regex | `evals/advisory/intent_gate_fixtures.test.ts` |

This baseline is **production-deployed** for the runtime code (the edge function `fire-safety-chat` last deployed before R5 carried all of these — R5 was bucket-only). The only recent production change is the R5 bucket refresh that updated the secondary V1 sidecar reasoning aid.

---

## 2. What changed after R5

### What changed
- `ssss/brain_full_v1/SBC{201,801}_canonical_chunks.json` updated from the Phase 1 V1 corpus (95 + 137 = 232 chunks) to the R3-gated corpus (136 + 222 = 358 chunks).
- All 12 SBC-201 round-2 sections that were not in the May-1 build (and never were in the bucket) are still excluded.
- 1 round-2 SBC-801 section (`sbc-801-section-114-1-1`) added to the V1 sidecar's available content.

### What did NOT change
- The **primary retrieval surface** (the 21 chunk files at the bucket root) is byte-identical to its pre-R5 state. Citations the user sees still trace back to that primary corpus.
- Main mode and Analytical mode read paths — unchanged.
- The Advisory edge function code itself — unchanged since `9a53040`.
- The `brain_full_v3/` orphan corpus is still in the bucket (no code reads it).

### Net production-visible effect of R5
For a query that hits the V1 sidecar trigger regex (Group M, sprinkler, alarm, egress, etc.), the model now sees a richer reasoning aid in its hidden context. **The Citation Verifier still requires citations to trace to the Evidence Ledger built from primary retrieval**, so user-visible citations are unchanged. For queries that don't hit the trigger (most non-Group-M questions), R5 produces no observable change at all.

The R5 closeout's framing of "production now serves 65% of SBC ledger" is **not user-visible**; it describes the secondary reasoning aid, not the citable corpus. Updating the user-visible coverage requires either (a) refreshing the bucket-root chunk files or (b) wiring the gated corpus into the primary path. Both are out of scope here.

---

## 3. What must NOT be reintroduced

These are explicitly forbidden per prior diagnosis ([docs/advisory/ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md](docs/advisory/ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md) Section 4) and the user's R6 brief:

1. **Phase 3B v2-first sidecar loader** (commit `6ec141b`, reverted in `395c63d`) — failure-on-empty silently degraded retrieval; would re-trigger the same problem if re-shipped without per-version log + fallback-on-empty + schema check + AR-query parity fixtures.

2. **scoreChunk emission gate** (commit `5db4cf0`, reverted in `4e4f032`) — hard zero-relevance gate dropped legitimate AR-query chunks because the keyword extractor builds language-specific keys that don't always overlap with English SBC chunk text.

3. **503-on-empty-retrieval** (commit removed by `4922cb3`) — replaced by the diagnostic-protocol approach which is now the agreed pattern.

4. **`brain_full_v3/` corpus** — bypasses the R3 policy gate and contains `requires_review:true` content. Must not be wired into any code path.

5. **`fire-safety-chat-v2` shadow function** — separate decision deferred per multiple prior closeouts. Not to be activated; kept on disk as historical artifact only.

6. **Direct frontend / Enterprise UI changes** to the Advisory pipeline — out of scope for this brief.

---

## 4. Next 3 implementation tasks (only)

Each task is sized for a single focused session.

### Task 1 — Live Advisory smoke (operator-driven)

Run the 7-test matrix in [docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md](docs/advisory/ADVISORY_POST_R5_TEST_MATRIX.md) against production with a real user JWT. The matrix is fully specified — query, expected retrieval family, expected citation family, pass/fail criteria per test. The goal is to convert the four "suspected" issues (cross-family routing, structured-table fallback, threshold hallucination, empty-retrieval anti-hallucination) into either confirmed bugs or ruled-out non-issues.

Deliverable: update the `Result table` in [docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md](docs/advisory/ADVISORY_POST_R5_SMOKE_RESULT.md) with actual response data and pass/fail per test.

This is a **read/observe** session — no code change unless a smoke test surfaces a small isolated bug that's documented in the result.

### Task 2 — Bucket cleanup of empty SBC-801 page ranges + v3 orphan

Two bucket-only operations, both owner-side:

**(a)** Re-extract SBC-801 page ranges 601–800 and 801–1000 from `D:/sbc_consultx/SBC 801 - The Saudi Fire Protection Code (3)-{601-800,801-1000}.pdf`. The current bucket files are 12,245 B and 200 B respectively — effectively empty placeholders. This holes Chapter 7-9 coverage in the **primary retrieval path**, which is the highest-leverage corpus issue for Advisory. Use `scripts/build-consultx-brain-full.cjs` (which already enforces the R3 `requires_review:true` policy gate) and the existing chunk-naming convention (`*_extracted_chunks.json`). Upload to bucket root.

**(b)** Delete `ssss/brain_full_v3/` (6 files, ~13 MB) from the bucket. Removes the latent policy-bypass risk identified in the root-cause report Section 1.2.

Deliverable: documented `BUCKET_CHAPTER_BACKFILL_RESULT.md` + a follow-up audit confirming the orphan is removed.

This is **bucket-only**. No code change. No DB write. No deploy.

### Task 3 — Conditional code change: wire the V1 corpus into primary retrieval (gated by Task 1 outcome)

If Task 1's live smoke shows that Advisory queries are missing citations that are present in `brain_full_v1/` but not in the bucket-root corpus, this task adds a small code change to make the V1 corpus available to the Citation Verifier. Specifically:

- Add an Advisory-only fetch from `ssss/brain_full_v1/SBC{201,801}_canonical_chunks.json` inside `fetchSBCContext` (or as a sibling helper called only from the `mode === "standard"` branch).
- Feed the resulting chunks into the same Evidence Ledger as the bucket-root chunks.
- Add an env-flagged kill switch (e.g. `BRAIN_V1_PRIMARY_DISABLED=1`) so a single env change can revert the behavior without a redeploy.
- Update the diagnostic logs to tag which source each chunk came from.

Add fixtures locking the new behavior. Run TS check. Single commit, scope-limited to the Advisory branch and the Evidence Ledger plumbing — no Main / Analytical change.

This task is **conditional**. If Task 1 shows the existing primary corpus is sufficient for the matrix, defer Task 3 indefinitely. Doing it without Task 1 evidence risks adding code that doesn't move any user-visible metric.

---

## 5. Stop condition

Halt and return to the owner before any code action if:

1. **Live smoke surfaces a regression** (something that worked before R5 doesn't work now). Capture evidence, do not start fixes.
2. **A confirmed bug requires changes to anything outside the Advisory branch** — Main / Analytical / Enterprise / billing / migrations / DB. R6 brief explicitly forbids touching these.
3. **The fix would re-introduce a forbidden pattern** — Phase 3B, scoreChunk gate, 503-on-empty, v3 corpus, fire-safety-chat-v2 activation.
4. **The fix requires a service_role key for production write** beyond what the V1 sidecar refresh already needed. Service-role usage was documented as a "deferred-rotation procedural cost" in R5; further uses should be paused until rotation is complete.
5. **The fix would change observable behavior for non-Advisory modes** (Main / Analytical). Even if it's "harmless", the brief is clear: don't touch other modes.

In each of these stop conditions the action is the same: write a one-page status note in `docs/advisory/`, mark the task BLOCKED, and return for the owner's decision.

---

## 6. What this round did NOT do

- **No runtime code change.** The R6 brief allowed small-isolated bug fixes if "موثق ومطلوب بوضوح" (documented and clearly required); no such isolated bug was identified during read-only audit.
- **No fixture additions.** The existing 11 fixtures still cover the deterministic gates correctly.
- **No bucket write.** No upload, no delete, no metadata change.
- **No production smoke.** Blocked by absence of user JWT.
- **No re-build.** The `scripts/build-consultx-brain-full.cjs` was not invoked; the local `generated/consultx_brain_full/` directory is the same state as after the R5 build run.

The deliverables for this round are five new documents under `docs/advisory/` that capture the runtime audit, the test matrix, the smoke-blocked status, the root-cause classification, and this continuation plan. No code, no corpus, no production state changed in R6.
