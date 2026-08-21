# ConsultX — Phase 1: Truth-Layer Remediation Report

**Project:** `hrnltxmwoaphgejckutk`
**Scope:** Execute Phase 1 per the approved plan, gated on `docs/audits/truth-layer-baseline.md`.
**Method:** Every claim below is backed by an actual `SELECT`/`information_schema` query against production, a code citation, or a passing test run. No result is approximated. Where evidence was insufficient to act safely, the item is recorded as a blocker, not "done."

---

## 0. Correction to a correction (read this first)

`truth-layer-baseline.md` (T3) concluded: *"26 users were granted an active trial server-side but are locked out client-side because `getUserActivePlan()`/`canAccessMode()` (`src/utils/planAccess.ts`) read `profiles.plan_type='free'`."* Deeper investigation this phase disproves that mechanism, and a second layer of investigation then disproved the *replacement* hypothesis too. Both corrections are recorded because the same shallow-read mistake nearly caused a wrong fix twice:

1. `getUserActivePlan()` / `canAccessMode()` have **zero call sites** anywhere in `src/` (verified by `rg`). They are dead utility code, not wired into any page. The real, live entitlement gate is `useEntitlement()` → `useSubscription()` → `check-subscription` edge function, which reads `user_subscriptions.status` directly and does **not** consult `profiles.plan_type` for the trial/active decision (`src/hooks/useEntitlement.ts:99`: `isTrialActive = ... || subscription?.status === "trialing"`). So the 26 users were never actually blocked by a `profiles` mismatch.
2. Having disproved "blocked in UI," the next hypothesis was "so `user_subscriptions.status='trialing'` correctly grants them access today." This was also checked against real data and disproved: **every one of the 44 `status='trialing'` rows in production has `trial_end` in the past** (`trial_still_valid = false` for 100% of them, confirmed by direct query). These are not active trials being mis-gated — they are **stale rows that were never transitioned to `expired`** because the transition only happens inside `check-subscription`'s own self-heal branch, which only runs when that specific user calls the endpoint again. Users who trialed once and never returned left an orphaned `trialing` row behind.

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

### A/B benchmark — **BLOCKED, not run**

`evals/run_advisory_benchmark.ts` requires calling the deployed function with a real user JWT (`Authorization: Bearer <user_jwt>`). Two attempts to obtain one without touching auth code:
- `auth_mode: anon` → `401 Invalid session`.
- `auth_mode: service_role` (Bearer = service-role JWT) → **also** `401 Invalid session` — `supabase.auth.getUser()` inside the function rejects a service-role token because it has no valid `auth.users` subject.
- No Composio/Supabase tool available in this environment can mint a user session (no "generate magic link" / "admin update password" action was found via tool search), and no test-account password is known (`ksasmoke@ksa.com` and two `mailnull.com` smoke accounts exist in `auth.users` but their passwords are not recorded anywhere in the repo or `.env.local`).

Per the operating rule "do not fake or approximate a blocked result": **no A/B numbers are reported**. The flag stays default-OFF in production specifically because this benchmark could not be run. Unblocking requires one of: a real login for a test account, a magic-link/password-reset action added to the Supabase toolset, or manual owner-provided credentials.

---

## 2. Provenance (P0)

**No schema change made — investigation + design only, as instructed.**

`source_registry` (11 rows) already contains exactly the fields the plan wanted to add: `source_id`, `authority_level` (`normative`/`commentary`/`informative`), `edition_year`, `tier`, `jurisdiction`, `ingestion_status`, `vector_indexed`, `coverage_verified`, `total_pages`. Confirmed **zero consumers**: no reference in `src/` (only the auto-generated `types.ts`) and no reference in `supabase/functions/`.

New findings this phase:
- `SBC801_COMM` is already tagged `authority_level='commentary'` in the registry, distinct from `SBC201`/`SBC801` (`normative`). The normative/commentary distinction the plan asked for **already exists as data** — it is simply not read by the retrieval or citation-verification code path.
- `vector_indexed=false` for SBC201/SBC801 despite 4,594 real embeddings in `sbc_documents` is confirmed stale (T5) — there is no code path anywhere that writes to this column; it was set once at row creation and never updated.
- `src/utils/sourceMetadata.ts` is a **third, independent metadata mechanism**: it derives document identity (SBC 201 vs 801, page ranges) from filename regex parsing entirely client-side, with no reference to `source_registry` at all. It is the mechanism that builds the public `source-pdfs` citation links shown to users (see §6). So today there are three disconnected "truth" layers for document identity: `source_registry` (DB, unused), `sourceMetadata.ts` (frontend, regex-based), and the ad-hoc `SourcePageMeta` produced inline by `fetchSBCContext`/`fetchSBCContextVector`.

**Linking design (documented, not implemented — out of scope for a single reversible pass):** `sbc_documents` has no foreign key to `source_registry.source_id`; the join key would need to be the existing `code_type` column (`'SBC201'`/`'SBC801'`) matched against `source_registry.source_id`. A minimal, additive migration could add `sbc_documents.source_id` as a nullable FK backfilled by that match, then have `fetchSBCContextVector`/`fetchSBCContext` join it to populate `SourcePageMeta.sourceType`/`editionYear` from the registry instead of inferring them ad hoc. This was **not implemented** this phase because it touches the citation-critical retrieval path and needs its own test pass — recorded as the concrete next step for Phase 2 rather than attempted under time pressure.

---

## 3. Migration / Schema Reconciliation (P0)

**Treated production as runtime truth, as instructed. No `supabase db push`, no local migration reordering/deletion.**

Confirmed from `truth-layer-baseline.md` and re-verified: 43 local migration files (`20260119153131`→`20260501000001`) vs 57 recorded in `supabase_migrations.schema_migrations` in production, **zero shared version**. `source_registry`, `source_versions`, `corpus_coverage`, `validation_runs` exist in production with no corresponding local migration at all — genuine drift, not a numbering mismatch.

A full column-by-column/trigger-by-trigger diff across all 47 `public` tables against all 57 production migrations was **not** performed this phase — that is a multi-day effort on its own and was not the highest-value use of this pass given the concrete, actionable findings elsewhere (vector retrieval, storage exposure, trial hygiene). What **was** done, to avoid claiming false completeness:
- The 47-table / RLS-enabled-on-100% / 38-with-policies inventory from the baseline audit stands as the current canonical snapshot (unchanged since baseline capture).
- Every production-side change made in this phase was captured in a **new** local migration file, `supabase/migrations/20260501000002_phase1_truth_layer_remediation.sql`, so today's changes at least have a local source-of-truth record even though the historical 43-vs-57 gap remains open. The file's header explicitly warns against ever running it via `db push`.

**Remaining risk (unchanged from baseline):** the local migration folder still cannot reproduce the current production schema from scratch. Closing this fully requires a dedicated reconciliation pass (extract full production DDL via `pg_dump --schema-only` once Docker/CLI access is available, diff against concatenated local migrations, then decide whether to adopt the production dump as a new canonical baseline). Recorded as open, not attempted further here.

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

**Duplicate resolution:** the 44-row fix above already resolved the *trialing* half of all 8 duplicate users' rows (their duplicates were, without exception, also stale trials). The only user still failing a "one live row" check afterward is `577e2326-acf2-4feb-b2e1-3dca82ccd1f2`, who has **two rows with `status='active'`** on the same plan, created 24ms apart. Per the explicit "do not change paid status or billing history" guardrail, this was **deliberately left untouched** — it needs a Moyasar-side transaction/idempotency-key check (outside this pass's evidence) to determine whether it's a true double charge or a harmless double-insert around one real payment. Flagged as an owner action (§ Remaining Risks).

**Unique constraint — partially applied, correctly blocked:**
```sql
CREATE UNIQUE INDEX user_subscriptions_one_live_row_per_user
ON user_subscriptions (user_id) WHERE status IN ('active','trialing','past_due');
```
This is a **partial** index (at most one *live* row per user), not a blanket `UNIQUE(user_id)` — a blanket constraint would be wrong, since legitimate re-subscription history requires multiple historical `expired`/`cancelled` rows per user over time. Attempting to create it failed exactly and only on `577e2326`'s duplicate `active` rows, exactly as predicted from the data — confirming no other user violates the invariant. **The index is not yet live**; it will be applied once that one case is resolved by the owner. This is recorded as "attempted, blocked on one specific case," not "done."

**Regression coverage:** no new automated test was added. The actual regression guard is the partial unique index itself — once `577e2326` is cleared and the index is created, any future `auto-trial` race will fail at the database layer with a `unique_violation` instead of silently inserting a duplicate. Note this will currently surface to the end user as a generic `500 "Failed to create trial"` (`supabase/functions/auto-trial/index.ts:78-80` treats all insert errors identically) rather than gracefully reusing the existing row — flagged as a P1 follow-up, not fixed here since it touches live trial-creation logic beyond the reconciliation scope.

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
| `.env.example` | Documented `ADVISORY_VECTOR_RETRIEVAL_ENABLED` |
| `supabase/migrations/20260501000002_phase1_truth_layer_remediation.sql` | New local record of the 3 production changes below (idempotent; not a `db push` target) |
| Production (via tracked Management API migrations, not local push) | `ssss` bucket policy + `public` flag fix; 44-row `user_subscriptions` stale-trial expiry; attempted (blocked) partial unique index |
| `supabase/functions/fire-safety-chat` (deployment) | Redeployed with the above flag change (default OFF) |

No changes were made to: billing/payment code paths, UI components, `profiles` data, KG tables, `source_registry`/provenance schema, or any local migration older than today's new file.

## 8. SQL / data corrections executed on production

1. `DROP POLICY "Allow public read access to SBC bucket"` + `CREATE POLICY ... TO authenticated` + `UPDATE storage.buckets SET public=false WHERE id='ssss'`.
2. `UPDATE user_subscriptions SET status='expired' WHERE status='trialing' AND trial_end < now()` — 44 explicit row IDs, verified before and after.
3. `CREATE UNIQUE INDEX ... WHERE status IN ('active','trialing','past_due')` — **failed as expected** on `577e2326-...`'s duplicate active rows; not yet live.

## 9. Tests executed

- `npx supabase functions deploy fire-safety-chat` — succeeded.
- Post-deploy smoke call (anon, no session) before and after both the code deploy and the `ssss` fix — `401 Invalid session` both times (no crash introduced).
- `npm run typecheck` — clean, no errors.
- `npm test -- --run` — **300/300 tests passed**, 11 files.
- Read-only verification queries after each write: bucket `public` flag, policy list, remaining `trialing` count (0), remaining live-row duplicate count (1, expected).

## 10. Rollback procedure

Each production change was applied as a tracked migration with an explicit inverse, so rollback is a direct re-application of the paired statement:
- Storage: re-create `"Allow public read access to SBC bucket"` `TO public` + `UPDATE storage.buckets SET public=true WHERE id='ssss'`.
- Trial expiry: `UPDATE user_subscriptions SET status='trialing' WHERE id IN (<same 44 IDs, enumerated in the migration file>)`.
- Unique index: never went live, nothing to roll back.
- Code: `ADVISORY_VECTOR_RETRIEVAL_ENABLED` is unset by default; deleting the secret or redeploying the prior commit fully reverts retrieval behavior with no data migration involved.

## 11. Remaining risks

| Risk | Severity | Status |
|---|---|---|
| A/B benchmark for vector vs keyword retrieval never ran — flag is implemented but unvalidated by real traffic | HIGH | Blocked on obtaining a real user session; owner action needed |
| `577e2326-...` has two simultaneous `active` subscription rows on the same plan | HIGH | Needs manual Moyasar transaction check before either row can be touched or the unique index finalized |
| Local migrations still cannot reproduce production schema (0/57 overlap) | HIGH (unchanged from baseline) | Full reconciliation not attempted this phase; scoped as future work |
| `source_registry`/provenance layer remains unlinked to retrieval/citation code | MEDIUM | Design documented, not implemented |
| KG (171 nodes/133 edges/10 summaries) remains unconsumed | MEDIUM (unchanged) | No action taken, per instructions |
| `auto-trial` returns a generic 500 on any future unique-constraint violation instead of gracefully reusing the existing row | LOW/P1 | Not fixed — out of scope for this pass |
| `fire-safety-chat/index.ts` is ~6,055 lines, now with slightly more branching in the retrieval block | LOW (unchanged risk profile) | No refactor attempted |
