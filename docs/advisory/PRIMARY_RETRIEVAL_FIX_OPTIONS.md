# Primary Retrieval — Fix Options

Date: 2026-05-05 (R7, decision document — no execution)
Companions:
- [docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md](docs/advisory/PRIMARY_RETRIEVAL_ROOT_INVENTORY.md)
- [docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md](docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md)

---

## 1. The actual problem to fix

From the inventory and diff:

| Issue | Severity | Affects |
|-------|:--------:|---------|
| **SBC-801 pp 601-1000 page-range files near-empty** (3 chunks + 0 chunks) | **High** | Primary retrieval for SBC-801 Chapters 7-9 (the most-cited fire-protection chapters). Mitigated by special `Ch9_v1_chunks.json` and `Ch10_v2_chunks.json` files, but those are in non-primary schemas. |
| **5 critical SBC-201 tables missing from primary** (1004.5, 1006.3.3, 504.3, 504.4, 506.2) | **High** | Table-id queries in Advisory cannot land on a discrete table record from primary; they fall back to keyword retrieval against page-range chunks. |
| **~30 high-value SBC-801 sections missing from primary** (egress 1013.5/1021-1032; occupancy 301-315; fire-service 501-510) | Medium | Section-specific queries miss these; Advisory has them via the v1 sidecar reasoning aid but Citation Verifier won't trace citations back. |
| **`SBC801_Ch10_v2_chunks.json` parser fall-through** (mega-chunk JSON.stringify) | Medium | Egress retrieval precision for Chapter 10 of SBC-801 is degraded — 30 chunks become one big blob to the scorer. |
| **Schema heterogeneity across 21 root files** (3 different shapes) | Low | Parser is tolerant; only Ch10_v2 actually breaks. |
| **`brain_full_v3` orphan in bucket** | Latent (Medium) | Foot-gun for future PRs; not exploitable today. Separate report. |

The first two rows are the **actual user-visible retrieval defects**. Everything else is either secondary or theoretical.

---

## 2. Three fix options compared

### OPTION A — Bucket-root patch (replace empty/broken files only)

**What it does**
1. Re-extract SBC-801 page ranges 601-800 and 801-1000 from `D:/sbc_consultx/SBC 801 ...-{601-800,801-1000}.pdf` using the existing extraction tooling. Upload the resulting `_extracted_chunks.json` files to bucket root, replacing the near-empty / empty placeholders.
2. Re-save `SBC801_Ch10_v2_chunks.json` in the standard `{chunks: [...]}` shape so the parser walks it correctly.
3. Optionally seed the 5 critical SBC-201 tables (1004.5, 1006.3.3, 504.3, 504.4, 506.2) into the `sbc_code_tables` DB so the structured-table path catches them — but this is a DB write, which the brief forbids in this round.

**Files changed**: 0 code files. 2-3 bucket files replaced.

**Risk**: Low. Replacement happens against the existing primary schema; existing chunks for Chapter 9-10 stay untouched (the Ch9_v1 special file remains as a redundant source). If the new page-range files are lower quality than expected, rolling back is just re-uploading the empty placeholders.

**Effect on citations**: Improves coverage on SBC-801 Chapters 7-9. Chapter 10 (egress) precision improves due to schema fix. No SBC-201 changes.

**Effect on Main / Analytical**: All three modes share `fetchSBCContext`, so all three benefit. None are *degraded*.

**Rollback difficulty**: Low — re-upload the backed-up empty files.

**Needs deploy?**: No.

**Needs bucket write?**: Yes — replaces 2-3 files.

**Needs user smoke?**: Recommended (verify retrieval lands on the new files for typical SBC-801 Ch9 queries) but not strictly required for the change itself.

**Estimated time**: 1-2 hours of operator work (extraction + upload + verification). Single bucket-only commit cycle.

---

### OPTION B — Switch primary `fetchSBCContext` to read `brain_full_v1/`

**What it does**
1. Modify `fetchSBCContext` to list / download from `brain_full_v1/` instead of bucket root.
2. Change the keyword scoring loop to consume v1's chunk shape (`section_ref` instead of `section_number`, `content_kind: "canonical_verbatim"`, etc.).
3. Adjust the page-meta extraction to handle v1's `source_pages: "p. 5"` format alongside primary's `page_start: 5, page_end: 6`.
4. Add a kill-switch env var to revert to bucket-root reads.

**Files changed**: `supabase/functions/fire-safety-chat/index.ts` (significant — `fetchSBCContext` function rewrite). Possibly `extractAndScoreChunks` for page-meta. Add fixtures for the new path. Net: 2-3 changed code regions, ~50-100 lines.

**Risk**: **High**.
- Per [diff Section 5](docs/advisory/PRIMARY_VS_SIDECAR_CORPUS_DIFF.md), this would **lose 377 sections** that primary has and v1 doesn't (212 SBC-201 + 165 SBC-801).
- Many of those 377 are admin/Ch11+/specialty content but a real subset is Chapter 10 sub-clauses and specialty-chapter coverage.
- Citation Verifier would suddenly resolve a different set of section_refs as valid — could break previously-working citations on chapters now uncovered.
- Affects Main, Advisory, AND Analytical, since all three call the same `fetchSBCContext`.

**Effect on citations**: User-visible citations would change for many queries. Some queries get *better* citations (the 5 SBC-201 tables, the 30 SBC-801 high-value sections); many lose citation support entirely.

**Effect on Main / Analytical**: Same as Advisory — all three modes get the new primary corpus. The brief forbids touching Analytical, so this option **violates the no-Analytical rule** by changing what Analytical retrieves.

**Rollback difficulty**: Code revert + redeploy.

**Needs deploy?**: Yes — code change to the edge function.

**Needs bucket write?**: No (the v1 files are already there from R5).

**Needs user smoke?**: Mandatory before deploy.

**Estimated time**: 2-3 days including fixtures, smoke, and deploy with rollback ready. Brain-side metadata reconciliation alone (hyphenated `102-7-1` vs dotted `102.7.1` IDs) is its own subtask.

---

### OPTION C — Hybrid: keep root primary, augment with v1 as fallback / supplement

**What it does**
1. Keep `fetchSBCContext` reading bucket-root files unchanged. This preserves the 4,096-chunk primary corpus and all current Main/Analytical behavior.
2. **For Advisory only** (`mode === "standard"`), after the primary keyword retrieval completes, run a second pass that reads `brain_full_v1/SBC{201,801}_canonical_chunks.json` and adds any v1 sections **not already represented** in the primary's selected chunks to the Evidence Ledger.
3. Tag the v1-derived ledger entries with a `source: "v1_supplement"` field so the Citation Verifier and the source-meta panel can distinguish them.
4. Add a kill-switch env var (`ADVISORY_V1_SUPPLEMENT=0` to disable) so the augmentation can be turned off without redeploy.
5. Add fixtures locking the augmentation behavior.

**Files changed**: `supabase/functions/fire-safety-chat/index.ts` — one new helper function (~30 lines), one call site inside the Advisory branch (~5 lines). `evals/advisory/intent_gate_fixtures.test.ts` — extend with 2-3 supplement scenarios. Net: ~50 lines added, no existing logic changed for non-Advisory modes.

**Risk**: **Medium**.
- Advisory-only blast radius. Main and Analytical untouched.
- The v1 supplement is *additive* — it can't remove primary content from the ledger.
- The Citation Verifier currently expects `[SBC-201|801 Section X.Y.Z]` format; v1 chunks already use the same dot-form `section_ref` for most sections, so the verifier should accept them. Hyphenated-form sections (`102-7-1`) need ID normalization before they can be cited.
- Some duplication risk: a section that primary already covers may also appear in the v1 supplement. The dedup logic must be reliable. Falling back to primary when both are present is the safest tie-break.

**Effect on citations**: Advisory citations gain access to ~142 v1-only sections (the 5 critical SBC-201 tables + 125 SBC-801 sections + 17 SBC-201 misc). Main and Analytical citations unchanged.

**Effect on Main / Analytical**: **None** — the supplement is gated on `mode === "standard"`.

**Rollback difficulty**: Low — env-var kill-switch can disable without redeploy. Or git revert + redeploy.

**Needs deploy?**: Yes — code change.

**Needs bucket write?**: No (v1 files are already at `brain_full_v1/` from R5).

**Needs user smoke?**: Mandatory before deploy.

**Estimated time**: 1 day including fixtures + smoke. Smaller scope than Option B because Main/Analytical paths are not touched.

---

## 3. Comparison matrix

| Criterion | Option A (bucket patch) | Option B (replace primary) | Option C (hybrid supplement) |
|-----------|:-----------------------:|:--------------------------:|:----------------------------:|
| Files changed | 0 code, 2-3 bucket | 2-3 code regions, 0 bucket | 1 code function + fixtures, 0 bucket |
| Risk | Low | **High** | Medium |
| Effect on citations | SBC-801 Ch7-9 better | Mixed — some up, many lost | Advisory gains ~142 sections |
| Effect on Main / Analytical | Slightly better (same as Advisory) | **Changed** (forbidden by brief) | **None** |
| Rollback difficulty | Low | Medium | Low (env var) |
| Needs deploy? | **No** | Yes | Yes |
| Needs bucket write? | **Yes** (2-3 files) | No | No |
| Needs user smoke? | Recommended | Mandatory | Mandatory |
| Time estimate | 1-2 hours | 2-3 days | 1 day |
| Brief compliance | ✅ all rules respected | ❌ touches Analytical | ✅ Advisory-only |

---

## 4. What each option does NOT fix

### Option A leaves these issues open:
- The 5 critical SBC-201 tables are not seeded into `sbc_code_tables` (DB write needed; out of scope).
- The 125 v1-only SBC-801 sections (egress sub-clauses, occupancy 301-315, fire-service 501-510) remain absent from primary unless re-extracted into the bucket root (operator work).
- The hyphenated-ID sections in v1 (62 entries with `102-7-1`-style IDs) are not normalized.

### Option B leaves these issues open:
- Loss of 377 only-primary sections (admin / Ch11+ / specialty) — not "issues" per se but a coverage regression.
- v1 schema's missing page-meta on round-1/round-2 chunks shows up in source panels.
- Hyphenated-ID normalization still needed.

### Option C leaves these issues open:
- The empty SBC-801 pp 601-1000 page-range files are still in primary — a Main-mode user asking about Ch7-9 still gets weak retrieval.
- The Ch10_v2 schema fall-through is still there, degrading egress retrieval precision in primary.
- The 5 SBC-201 tables get reachable via Advisory's supplement but Main/Analytical still don't see them.

The combination **A + C** addresses both the primary-side issues (A) and the v1-side coverage gaps (C). Doing A alone leaves the v1-only content out of reach for Advisory citations. Doing C alone leaves Main/Analytical with the same weak SBC-801 Ch7-9 coverage they have today.

---

## 5. Recommendation (one option only, per brief)

**OPTION C — Hybrid supplement.** Reasons:

1. **Brief compliance**: respects "no Analytical / no Main change" explicitly. Option B violates this; Option A doesn't, but A doesn't address the v1-only coverage either.

2. **Highest user-visible value per unit of risk**: Advisory is the mode the brief is asking about; Advisory gains ~142 net sections (especially the 5 critical tables and the SBC-801 egress / occupancy / fire-service entries) without any other mode being touched.

3. **Smallest code surface**: ~50 lines added in one function, one call site, fixtures, kill-switch. Compare to Option B's full `fetchSBCContext` rewrite.

4. **Cleanest rollback**: env-var kill-switch lets the operator disable instantly without redeploy. Compare to Option B's git-revert-and-redeploy cycle.

5. **No regressions**: the supplement is additive. There's no scenario where a user query was previously getting a citation and now isn't. Compare to Option B which can demonstrably remove citations.

### Ideal sequencing if both A and C are eventually done

If the operator can do bucket-side and code-side work, the optimal sequence is:

1. **First: Option A** (bucket-only). Fixes SBC-801 Ch7-9 coverage in primary for all three modes. ~1-2 hours.
2. **After live smoke**: confirm what gaps remain in Advisory citations. If significant gaps remain in v1-only content (which is likely — egress sub-clauses, the 5 tables), proceed to **Option C**.

This sequence puts the lower-risk lower-effort fix first and uses the live-smoke evidence to decide whether C is needed. If Option A alone closes most of the Advisory gaps, Option C may turn out to be unnecessary.

But the brief asks for a single recommendation. **Option C is the single best Advisory-only step** if forced to choose one. Option A is a stronger first step if the constraint "Advisory only" is relaxed; the brief allows bucket writes but says "لا bucket write في أول مرحلتين" — meaning no bucket write in the first two phases of work — which would push Option A out and elevate Option C as the right starting point.

---

## 6. Stop-and-confirm conditions for any option

Per the user's standing principles:

- **Before any code commit**: run TS check, run the existing 11 fixtures, ensure no regression in deterministic gates.
- **Before any bucket write**: take a backup, record SHA256, document the rollback command (this is what R5 did).
- **Before any deploy**: run live smoke with a real user JWT against the deterministic + augmentation paths.
- **Stop and return** if any of: live smoke shows regression, any forbidden pattern resurfaces (Phase 3B / scoreChunk emission gate / 503 / v3 wiring / fire-safety-chat-v2 activation), or the change requires touching Main / Analytical / billing / migrations / DB.

These conditions apply to all three options. Option C respects them by construction — Advisory-only and additive.
