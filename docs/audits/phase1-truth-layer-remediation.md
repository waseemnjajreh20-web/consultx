# ConsultX — Phase 1: Truth-Layer Remediation Report

**Project:** `hrnltxmwoaphgejckutk`
**Scope:** Execute Phase 1 per the approved plan, gated on `docs/audits/truth-layer-baseline.md`.
**Method:** Every claim below is backed by an actual `SELECT`/`information_schema` query against production, a code citation, or a passing test run. No result is approximated. Where evidence was insufficient to act safely, the item is recorded as a blocker, not "done."

---

## 0. Correction to a correction (read this first)

`truth-layer-baseline.md` (T3) concluded: *"26 users were granted an active trial server-side but are locked out client-side because `getUserActivePlan()`/`canAccessMode()` (`src/utils/planAccess.ts`) read `profiles.plan_type='free'`."* Deeper investigation this phase disproves that mechanism, and a second layer of investigation then disproved the *replacement* hypothesis too. Both corrections are recorded because the same shallow-read mistake nearly caused a wrong fix twice:

1. `getUserActivePlan()` / `canAccessMode()` have **zero call sites** anywhere in `src/` (verified by `rg`). They are dead utility code, not wired into any page. The real, live entitlement gate is `useEntitlement()` → `useSubscription()` → `check-subscription` edge function, which reads `user_subscriptions.status` directly and does **not** consult `profiles.plan_type` for the trial/active decision (`src/hooks/useEntitlement.ts:99`: `isTrialActive = ... || subscription?.status === "trialing"`). So the 26 users were never actually blocked by a `profiles` mismatch.
2. Having disproved "blocked in UI," the next hypothesis was "so `user_subscriptions.status='trialing'` correctly grants them access today." This was also checked against real data and disproved: **every one of the 44 `status='trialing'` rows in production had `trial_end` in the past** (`trial_still_valid = false` for 100% of them, confirmed by direct query). These are not active trials being mis-gated — they are **stale rows that were never transitioned to `expired`** because the transition only happens inside `check-subscription`'s own self-heal branch, which only runs when that specific user calls the endpoint again. Users who trialed once and never returned left an orphaned `trialing` row behind.

Net effect: `profiles.plan_type` was already correct for every affected user (either `'free'`, or a real paid value like `'engineer'`/`'enterprise'` granted through a separate path). The actual defect was 100% inside `user_subscriptions.status` hygiene, not in the frontend/`profiles` layer. See §4 for the fix actually applied.

---

## 1. Advisory Vector Retrieval (P0)

**Implemented, deployed, default OFF.** `fetchSBCContext` (keyword/storage) was **not removed**; it remains the sole path unless the flag is on, and remains the automatic fallback when the flag is on.

`supabase/functions/fire-safety-chat/index.ts`:
- `fetchSBCContextVector` (~line 2671) gained a 4th optional parameter `forceFilterCode` so the existing R26 rule (`wf_occupant_load` → restrict to SBC201 only) survives the switch from keyword to vector retrieval — without it the vector path would have silently dropped that safety constraint.
- New env flag `ADVISORY_VECTOR_RETRIEVAL_ENABLED` (line 5479). When `"1"` **and** `mode === "standard"`: try `fetchSBCContextVector` first; on thrown error **or** empty result, fall back to `fetchSBCContext` automatically (lines 5483–5510). When unset/`"0"`: behavior is byte-identical to before this change.
- `_retrievalEngine: "vector" | "keyword"` (line 5319) tracks which engine actually served the request and is now exposed as response header `X-Retrieval-Engine` on all three response-building sites (lines 5822, 5887, 6046) and added to `Access-Control-Expose-Headers` (line 19) — this gives production-safe usage telemetry without any additional logging infrastructure.
- Documented in `.env.example` alongside the existing Brain B2 flags.

**Deployment verification:** `npx supabase functions deploy fire-safety-chat` succeeded; a post-deploy smoke call (anon key, no session) returned the same `401 Invalid session, please login again` as pre-deploy — confirms no boot-time crash was introduced and default-off behavior is preserved.

### A/B benchmark — **retrieval-level completed; E2E BLOCKED**

`evals/run_advisory_benchmark.ts` requires calling the deployed function with a real user JWT (`Authorization: Bearer <user_jwt>`). Two attempts to obtain one without touching auth code:
- `auth_mode: anon` → `401 Invalid session`.
- `auth_mode: service_role` (Bearer = service-role JWT) → **also** `401 Invalid session` — `supabase.auth.getUser()` inside the function rejects a service-role token because it has no valid `auth.users` subject.
- No Composio/Supabase tool available in this environment can mint a user session, and no test-account password is known.

Because the operating rule forbids faking a blocked result, the benchmark was run at the **retrieval layer only**: direct `match_sbc_documents` calls vs. the same `ILIKE`-based keyword filters used by `fetchSBCContext`. Three representative advisory queries were tested:

| Query | Vector target rank | Keyword target rank | Interpretation |
|---|---|---|---|
| Occupant load factor for office | 1 | 1 | Both retrieve the canonical Table 1004.5 chunk; vector top-5 is more focused on the correct chapter |
| Standpipe class for high-rise / 15-storey | 1 | 2 | Vector rank 1 on Section 905; keyword rank 2 because literal "four or more stories" pulled an egress section first |
| Fire separation distance | 1 | 4 | Vector rank 1 on Section 705.5; keyword rank 4 and included 602.x figure captions because of literal phrase matches |

**Decision:** `ADVISORY_VECTOR_RETRIEVAL_ENABLED` remains **OFF** in production. The retrieval-only benchmark is promising but does not prove safe downstream citation/answer quality, so no rollout is justified.

Full details: `docs/audits/advisory-vector-benchmark-20260501.md`.

---

## 2. Provenance (P0)

**Minimal integration implemented; no schema change.**

`source_registry` (11 rows) already contains `source_id`, `authority_level` (`normative`/`commentary`/`informative`), and `edition_year`. It had **zero consumers** in `src/` or `supabase/functions/` at the start of this phase.

### What was done

- Created `src/data/sourceRegistry.json` from the production `source_registry` snapshot.
- Updated `src/utils/sourceMetadata.ts` to look up each resolved source in the registry and expose two new fields on `SourceMeta`:
  - `authorityLevel: "normative" | "commentary" | "informative" | "unknown"`
  - `editionYear: number | null`
- The lookup key normalises the frontend document code (`SBC-201` / `SBC-801`) to the registry `source_id` (`SBC201` / `SBC801`).
- Updated `src/__tests__/sourceMetadata.test.ts` to assert the new fields.

### Important correction

The production `source_registry.edition_year` column currently shows **2018** for `SBC201`, `SBC801`, and `SBC801_COMM`. The owner confirmed the actual SBC edition used by ConsultX is **2024**. The static `src/data/sourceRegistry.json` was therefore corrected to `2024`; the database row remains stale and should be updated by the owner (see `production-final-readiness.md`).

### Limitations

- This integration is at the **citation-link resolution layer** in the frontend, not inside the retrieval function. The edge function still emits `SourcePageMeta` without reading `source_registry`.
- A fuller integration would add `sbc_documents.source_id` as a nullable FK and have `fetchSBCContext`/`fetchSBCContextVector` join `source_registry` to emit `authorityLevel`/`editionYear` directly. That change touches the citation-critical retrieval path and was kept out of this phase to avoid untested regression.

### Verification

- `npm test -- --run` — `sourceMetadata.test.ts` passes with 14 tests, asserting `authorityLevel` and `editionYear` for SBC 201/801 and unknown sources.
- `npm run typecheck` — clean.

---

## 3. Migration / Schema Reconciliation (P0)

**Treated production as runtime truth, as instructed. No `supabase db push`, no local migration reordering/deletion.**

Confirmed from `truth-layer-baseline.md` and re-verified: 43 local migration files (`20260119153131`→`20260501000001`) vs 57 recorded in `supabase_migrations.schema_migrations` in production, **zero shared version**. `source_registry`, `source_versions`, `corpus_coverage`, `validation_runs` exist in production with no corresponding local migration at all — genuine drift, not a numbering mismatch.

A full production schema baseline was extracted via read-only SQL and `npx supabase gen types typescript` and saved under `docs/audits/schema-baseline-20260501/`:

| File | Count | Source |
|---|---|---|
| `tables.json` | 78 | Read-only SQL |
| `columns.json` | 78 table groups | Read-only SQL |
| `indexes.json` | 78 table groups | Read-only SQL |
| `constraints_check.json` | all CHECK constraints | Read-only SQL |
| `constraints_keys.json` | all PK/UK/FK constraints | Read-only SQL |
| `rls_enabled.json` | all tables | Read-only SQL |
| `policies.json` | all RLS policies | Read-only SQL |
| `triggers.json` | all user triggers | Read-only SQL |
| `extensions.json` | 9 extensions | Read-only SQL |
| `functions_registry.json` | functions by schema | Parsed from generated types |
| `types_public.ts` | full public schema | `supabase gen types typescript` |
| `types_auth.ts` | auth schema | `supabase gen types typescript` |
| `types_storage.ts` | storage schema | `supabase gen types typescript` |
| `manifest.json` | index of all files | Generated |

The companion drift analysis remains in `docs/audits/migration-reconciliation-20260501.md`. The local migration folder still cannot reproduce the current production schema from scratch; the baseline provides a reproducible starting point for future reconciliation.

Every production-side change made in this phase was captured in `supabase/migrations/20260501000002_phase1_truth_layer_remediation.sql`, so today's changes at least have a local source-of-truth record even though the historical 43-vs-57 gap remains open. The file's header explicitly warns against ever running it via `db push`.

### Local DB backup

A true local SQL dump was attempted and **BLOCKED** because `pg_dump` and Docker are unavailable in this environment. Supabase managed backups are the current fallback. Details: `docs/audits/local-backup-assessment-20260501.md`.

---

## 4. Trial / Subscription Reconciliation (P0)

**Canonical entitlement source identified:** live gating is `user_subscriptions.status` as read by `check-subscription`/`useEntitlement` (see §0). `profiles.plan_type` is a secondary/legacy field that in practice was already correct for every user touched below.

### What was found (full data, not a sample)
- **44 of 44** `user_subscriptions` rows with `status='trialing'` had `trial_end` already in the past (`trialing_still_valid = 0` production-wide at time of audit). Zero currently-valid trials existed in the table.
- Of the 36 distinct users behind those 44 rows: 27 had `profiles.plan_type='free'` (already correct), 7 had `'engineer'`, 2 had `'enterprise'` (also already correct — real paid access via a different path, with an orphaned old trial row left behind).
- **8 users had duplicate `user_subscriptions` rows** (22 rows total across them), all created within milliseconds to a few seconds of each other — consistent with the known `auto-trial` check-then-insert race, not distinct billing events.

### What was changed
Applied as a tracked Supabase migration (`trial_reconciliation_expire_stale_trialing_rows`, mirrored in the local file above):
```sql
UPDATE user_subscriptions SET status = 'expired'
WHERE status = 'trialing' AND trial_end < now();  -- exact 44 row IDs enumerated in the migration
```
This is the **same self-heal rule `check-subscription` already applies per-user on every live call** — it was run once, in bulk, for users who never returned to trigger it themselves. **`profiles.plan_type` was not touched anywhere** — verified case-by-case that touching it risked nothing for the 27 already-`free` users and would have actively corrupted the 9 already-paid users. No entitlement was granted or revoked for any real user; the only currently-active-anything row in the entire trial cohort was already inert.

**Duplicate resolution:** the 44-row fix above already resolved the *trialing* half of all 8 duplicate users' rows (their duplicates were, without exception, also stale trials). The one remaining user with two live rows, `577e2326-acf2-4feb-b2e1-3dca82ccd1f2`, had two rows with `status='active'` on the same plan, created 24ms apart. Evidence:
- Row `f2e4...` has complete billing period data (`current_period_start`, `current_period_end`).
- Row `38687300-18b1-40d8-b281-439a4282c9a9` has `current_period_start = NULL` and was created 24ms after the first.
This pattern is consistent with a race-condition duplicate insert, not a second billing event. The second row was cancelled (status → `cancelled`), preserving the first active row and all paid entitlement. `profiles.plan_type='engineer'` for this user was left untouched.

**Unique constraint — now live:**
```sql
CREATE UNIQUE INDEX user_subscriptions_one_live_row_per_user
ON user_subscriptions (user_id) WHERE status IN ('active','trialing','past_due');
```
This is a **partial** index (at most one *live* row per user), not a blanket `UNIQUE(user_id)` — a blanket constraint would be wrong, since legitimate re-subscription history requires multiple historical `expired`/`cancelled` rows per user over time. After cancelling the duplicate, the index was created successfully. Verified by `pg_indexes`: `user_subscriptions_one_live_row_per_user` exists. Verified by query: zero users now have more than one live row.

**Regression coverage:** `src/__tests__/subscriptionIntegrity.test.ts` added. It tests the selection precedence (newest `created_at` among live rows), the live-status set, and the null case. The primary regression guard, however, is the partial unique index itself — any future `auto-trial` race will fail at the database layer with a `unique_violation` instead of silently inserting a duplicate.

---

## 5. Knowledge Graph (P1) — documentation only, no changes

`sbc-graph-indexer` (Gemini 2.5 Flash) extracts entities (sections/requirements/components/concepts/standards) and typed relationships (`references`/`requires`/`conflicts`/`enables`/`modifies`/`exempts`) from the same SBC 201/801 chunk text used for embeddings, then generates hierarchical bilingual community summaries (micro/mid/macro) over clusters of related nodes. Restricted to two admin emails.

- Data: `graph_nodes`=171, `graph_edges`=133, `community_summaries`=10, `graph_indexing_status`=18 (read only by `get_indexed_chunk_count()`).
- Metadata reliability: LLM-generated, not human-verified; no confidence score field exists.
- Consumers: **none.** The only historical consumer was `fire-safety-chat-v2` (`localSearch`/`globalSearch`), already deleted; current `fire-safety-chat/index.ts` explicitly excludes `community_summaries` from any query.
- Potential value: the relationship graph (`requires`/`conflicts` between code sections) is a plausible input to future cross-reference or conflict-detection reasoning in Advisory/Analytical, but this is unverified since nothing has ever consumed it — no claim is made about its actual usefulness.
- **No action taken**, per instructions — retire/revive/freeze decision remains an owner decision pending the vector-retrieval benchmark this phase could not run.

---

## 6. Storage Bucket Security Review (P1) — one fix applied

| Bucket | Public before | Consumers found | Verdict |
|---|---|---|---|
| `ssss` (SBC chunk JSON + `brain_full_v1` sidecars, 77MB/57 objects) | **true** | Two backend `service_role` reads only (`fire-safety-chat`, `sbc-graph-indexer`); **zero** frontend references anywhere in `src/` (`.storage.from("ssss")`, `getPublicUrl`, raw string `"ssss"` — all checked) | **CRITICAL — fixed** |
| `source-pdfs` (raw SBC PDFs, 229MB/19 objects) | true | `src/utils/sourceMetadata.ts` constructs `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` directly to build the clickable citation links users see in chat | **Intentional, justified — left unchanged** |

`ssss`'s own creation migration (`20260119153131_...sql`) has a comment reading *"Allow authenticated users and service role to read"*, but the policy it actually created granted `SELECT` to the `public` role — the stated intent and the implementation never matched. Combined with zero legitimate consumers and the bucket holding ConsultX's own proprietary `brain_full_v1` reasoning data (not just re-chunked SBC text), this met the plan's CRITICAL bar for "smallest reversible fix."

**Fix applied** (migration `security_ssss_bucket_close_public_exposure`, mirrored locally):
```sql
DROP POLICY "Allow public read access to SBC bucket" ON storage.objects;
CREATE POLICY "Allow authenticated read access to SBC bucket"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ssss');
UPDATE storage.buckets SET public = false WHERE id = 'ssss';
```
This restores the bucket's *originally documented* intent rather than inventing a new policy. Verified afterward: `storage.buckets.public = false` for `ssss`; the `service_role` policy (used by both real consumers) is untouched; a post-fix smoke call to `fire-safety-chat` still returns the same `401` as before (no new error surfaced). `source-pdfs` was left exactly as-is with its public-read design documented above.

---

## 7. Exact files changed

| File | Change |
|---|---|
| `supabase/functions/fire-safety-chat/index.ts` | Added `ADVISORY_VECTOR_RETRIEVAL_ENABLED` flag + fallback logic; `fetchSBCContextVector` gained `forceFilterCode` param; added `_retrievalEngine` tracking + `X-Retrieval-Engine` response header (3 sites) + CORS expose-header |
| `supabase/functions/fire-safety-chat/workflow_constraints.ts` | Fixed two minor type errors uncovered by `deno check` (no runtime behavior change) |
| `.env.example` | Documented `ADVISORY_VECTOR_RETRIEVAL_ENABLED` |
| `supabase/migrations/20260501000002_phase1_truth_layer_remediation.sql` | New local record of the 4 production changes below (idempotent; not a `db push` target) |
| `docs/audits/migration-reconciliation-20260501.md` | Comprehensive production schema snapshot and drift analysis |
| `docs/audits/schema-baseline-20260501/*` | Full production schema baseline (tables, columns, indexes, constraints, RLS, policies, triggers, extensions, function registry, generated types, manifest) |
| `docs/audits/advisory-vector-benchmark-20260501.md` | Retrieval-level A/B benchmark report |
| `docs/audits/local-backup-assessment-20260501.md` | Backup blocker assessment |
| `src/data/sourceRegistry.json` | Snapshot of production `source_registry` with owner-corrected edition year (2024) |
| `src/utils/sourceMetadata.ts` | Provenance lookup: added `authorityLevel` and `editionYear` to `SourceMeta` |
| `src/__tests__/sourceMetadata.test.ts` | Provenance assertions added |
| `src/__tests__/subscriptionIntegrity.test.ts` | Regression tests for the "one live subscription per user" invariant |
| Production (via tracked Management API migrations, not local push) | `ssss` bucket policy + `public` flag fix; 44-row `user_subscriptions` stale-trial expiry; cancellation of one duplicate active row; live partial unique index |
| `supabase/functions/fire-safety-chat` (deployment) | Redeployed with the above flag change (default OFF) |

No changes were made to: billing/payment code paths, UI components, `profiles` data, KG tables, or any local migration older than today's new file.

## 8. SQL / data corrections executed on production

1. `DROP POLICY "Allow public read access to SBC bucket"` + `CREATE POLICY ... TO authenticated` + `UPDATE storage.buckets SET public=false WHERE id='ssss'`.
2. `UPDATE user_subscriptions SET status='expired' WHERE status='trialing' AND trial_end < now()` — 44 explicit row IDs, verified before and after.
3. Duplicate active row resolution: `UPDATE user_subscriptions SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE id='38687300-18b1-40d8-b281-439a4282c9a9'` (second of two `active` rows for user `577e2326-...`, identified as a race duplicate due to `current_period_start = NULL`).
4. `CREATE UNIQUE INDEX user_subscriptions_one_live_row_per_user ON user_subscriptions (user_id) WHERE status IN ('active','trialing','past_due')` — now live; verified zero duplicate-live users remain.

## 9. Tests executed

- `npx supabase functions deploy fire-safety-chat` — succeeded.
- Post-deploy smoke call (anon, no session) before and after both the code deploy and the `ssss` fix — `401 Invalid session` both times (no crash introduced).
- `npm run typecheck` — clean, no errors.
- `npx deno check supabase/functions/fire-safety-chat/index.ts` — clean, no errors.
- `npm test -- --run` — **314/314 tests passed**, 13 files.
- Read-only verification queries after each write: bucket `public` flag, policy list, remaining `trialing` count (0), remaining live-row duplicate count (0), partial unique index present in `pg_indexes`.

## 10. Rollback procedure

Each production change was applied as a tracked migration with an explicit inverse, so rollback is a direct re-application of the paired statement:
- Storage: re-create `"Allow public read access to SBC bucket"` `TO public` + `UPDATE storage.buckets SET public=true WHERE id='ssss'`.
- Trial expiry: `UPDATE user_subscriptions SET status='trialing' WHERE id IN (<same 44 IDs, enumerated in the migration file>)`.
- Duplicate row cancellation: `UPDATE user_subscriptions SET status='active', cancelled_at=NULL, updated_at=now() WHERE id='38687300-18b1-40d8-b281-439a4282c9a9'`.
- Unique index: `DROP INDEX IF EXISTS user_subscriptions_one_live_row_per_user`.
- Code: `ADVISORY_VECTOR_RETRIEVAL_ENABLED` is unset by default; deleting the secret or redeploying the prior commit fully reverts retrieval behavior with no data migration involved.
- Provenance: `src/data/sourceRegistry.json`, `src/utils/sourceMetadata.ts`, and the new tests can be reverted in one commit; no database change was made.

## 11. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| A/B benchmark for vector vs keyword retrieval: E2E never ran; flag is implemented but unvalidated by real traffic | HIGH | Blocked on obtaining a real user session; owner action needed |
| Local migrations still cannot reproduce production schema (0/57 overlap) | HIGH (unchanged from baseline) | Full reconciliation documented in `migration-reconciliation-20260501.md`; `pg_dump --schema-only` + tested restore still required |
| Local SQL dump not created | HIGH | Blocked by environment; Supabase managed backups are the fallback. See `local-backup-assessment-20260501.md` |
| `source_registry.edition_year` in production is stale (2018) vs. actual SBC edition (2024) | MEDIUM | Corrected in `src/data/sourceRegistry.json`; database row needs owner update |
| `source_registry`/provenance layer is only linked in frontend `SourceMeta`, not inside the retrieval edge function | MEDIUM | Design documented; full retrieval integration is Phase 2 scope |
| KG (171 nodes/133 edges/10 summaries) remains unconsumed | MEDIUM (unchanged) | No action taken, per instructions |
| `source-pdfs` bucket is public and serves copyrighted SBC PDFs via public URL | HIGH | Intentional for current citation-link design, but exposes licensed content; switch to signed URLs is an owner decision |
| `SUPABASE_SERVICE_ROLE_KEY` / `GOOGLE_GEMINI_API_KEY` Git-history exposure | HIGH | No rotation performed; owner action required (requires re-deploy of all functions) |
| `auto-trial` returns a generic 500 on any future unique-constraint violation instead of gracefully reusing the existing row | LOW/P1 | Not fixed — out of scope for this pass |
| `fire-safety-chat/index.ts` is ~6,055 lines, now with slightly more branching in the retrieval block | LOW (unchanged risk profile) | No refactor attempted |
