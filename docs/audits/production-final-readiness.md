# ConsultX — Production Final Readiness Report

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-05-01 (updated 2026-08-21)  
**Scope:** Close Phase 1 P0 items only. No Phase 2 work started.

## Legend

- **CLOSED** — verified directly, with evidence.
- **VERIFIED** — checked and confirmed, no code change required.
- **BLOCKED** — could not be completed after exhausting safe alternatives; blocker is environmental or external.
- **OWNER ACTION** — requires a decision or credential the agent does not have.

---

## 1. CLOSED

| # | Item | Evidence |
|---|---|---|
| 1 | Supabase project recovered and `ACTIVE_HEALTHY` | Management API status |
| 2 | SMTP/Resend operational; signup → confirmation → redirect verified | Prior remediation + DNS/DKIM/SPF valid |
| 3 | `consultx.sa` retired; `www.consultx.app` operational | DNS check |
| 4 | Tap Payments retired; dead source/secrets removed | No `src/` references; functions not deployed |
| 5 | `payment-webhook` removed | Function not deployed; source deleted |
| 6 | `fire-safety-chat-v2` orphan resolved | Deployment removed; source absent |
| 7 | 18 Edge Functions deployed with matching source | Reconciliation table verified |
| 8 | `ssss` bucket public exposure closed | `storage.buckets.public = false`; authenticated policy in place |
| 9 | Trial/subscription duplicates resolved | 44 stale `trialing` rows expired; one duplicate active row cancelled; partial unique index live |
| 10 | Schema baseline extracted from production | `docs/audits/schema-baseline-20260501/*` |
| 11 | `npm run typecheck` | PASS |
| 12 | `npx deno check supabase/functions/fire-safety-chat/index.ts` | PASS |
| 13 | `npm test -- --run` | **314/314 PASS**, 13 files |
| 14 | Provenance minimal integration | `src/data/sourceRegistry.json` + `src/utils/sourceMetadata.ts` now expose `authorityLevel` and `editionYear`; tests pass |
| 15 | Advisory vector retrieval flag | Implemented behind `ADVISORY_VECTOR_RETRIEVAL_ENABLED`, default OFF, keyword fallback preserved |
| 16 | `source_registry.edition_year` corrected to 2024 in production | Migration `fix_source_registry_edition_year_2024` applied; verification query returns `SBC201=2024 (normative)`, `SBC801=2024 (normative)`, `SBC801_COMM=2024 (commentary)`; `src/data/sourceRegistry.json` and `sourceMetadata.test.ts` synced to match DB |

---

## 2. VERIFIED

| # | Item | Evidence |
|---|---|---|
| 1 | `source_registry` contains `authority_level` and `edition_year` | Production query returned 11 rows |
| 2 | `match_sbc_documents` exists and returns 768-dim vector matches | `pg_proc` signature + live query results |
| 3 | 4,594 embeddings in `sbc_documents` | Production count query |
| 4 | `source-pdfs` public access is a live frontend dependency (not accidental) | `src/utils/sourceMetadata.ts:170` builds `storage/v1/object/public/source-pdfs/...` URLs; `SourcePanel.tsx` uses `meta.pdfUrl` as the PDF viewer `iframe src` and citation `href`; regression tests assert these public URLs |
| 5 | No orphaned deployed functions | Reconciliation table |
| 6 | `source-pdfs` content inventory | 19 objects: 18 full SBC 201/801 code PDFs (~306 MB) + `manifest/source-map.json` |

---

## 3. BLOCKED

| # | Item | Blocker | Alternatives tried | Best path forward |
|---|---|---|---|---|
| 1 | Local SQL database backup | `pg_dump` and Docker unavailable in environment | `npx supabase db dump` (fails: Docker prerequisite), `npx supabase gen types` fallback | Run `supabase db dump` on a machine with Docker, or download managed backup snapshot |
| 2 | `pg_dump --schema-only` restore-tested baseline | Same as #1 | Schema metadata extracted via SQL as partial substitute | Use managed backup + later restore test |

---

## 4. OWNER ACTION

| # | Item | Severity | Why owner action | Suggested action |
|---|---|---|---|---|
| 1 | Rotate `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_GEMINI_API_KEY` — **exposure confirmed** in Git history | HIGH | Commit `34fbeb5` ("security: purge committed secrets") removed hardcoded Gemini key from test scripts and hardcoded `service_role` key from `scripts/setup-admins.cjs`; both values remain visible in history. Available API tooling can only update key metadata, not regenerate keys; Gemini keys can only be created in AI Studio | Supabase dashboard → regenerate `service_role` JWT secret; AI Studio → new Gemini key; update Supabase secrets; redeploy affected functions; revoke old keys after verification |
| 2 | Decide on `source-pdfs` public exposure | HIGH | Bucket is public AND is a live frontend dependency: making it private today breaks the citation PDF viewer (`SourcePanel.tsx`) and direct citation links. Content is 18 full copyrighted SBC 201/801 PDFs — redistribution is a legal/operational decision | Either keep public with documented justification, or migrate citation viewer to signed URLs (code change) then set bucket private |
| 3 | Provide a test session for the E2E Advisory vector A/B benchmark | HIGH | Test accounts exist (`ksasmoke@ksa.com`, `smoke_retrieval_*`) but no credentials are available to the agent; JWTs cannot be minted via SQL; resetting passwords would mutate Auth and trigger emails (prohibited). Flag stays OFF until benchmark proves vector is not worse | Owner logs in once in a browser and runs the benchmark, or supplies a short-lived test JWT |
| 4 | Approve Phase 2 scope | MEDIUM | Truth-layer architecture (full provenance in retrieval, KG consume/replace, migration lineage rebuild) needs deliberate planning | Review Phase 1 findings and approve Phase 2 plan |

---

## 5. Production inconsistencies still present

| # | Inconsistency | Severity | Note |
|---|---|---|---|
| 1 | 43 local migrations vs 57 production migrations, zero overlap | HIGH | Baseline exists, but historical lineage is not reproducible |
| 2 | `source_registry.vector_indexed=false` despite 4,594 real embeddings | LOW | Stale boolean; does not affect retrieval |
| 3 | `auto-trial` may throw 500 on future unique-constraint race | LOW/P1 | Partial unique index now blocks the duplicate, but error handling could be smoother |
| 4 | `fire-safety-chat/index.ts` ~6,055 lines | LOW | Risk accepted; no refactor in Phase 1 |

---

## 6. Deleted / deprecated components

- `tap-webhook`, `tap-create-subscription`, `tap-charge-subscription`, `create-checkout`, `verify-payment`, `payment-webhook` source and secrets.
- `fire-safety-chat-v2` deployment.
- Duplicate `Gemini_API_Key1` secret (after confirming no deployed function used it).
- Obsolete Tap-related environment variables/configurations.

---

## 7. Tests executed and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (re-run 2026-08-21) |
| `npx deno check supabase/functions/fire-safety-chat/index.ts` | PASS (re-run 2026-08-21) |
| `npm test -- --run` | **314/314 PASS**, 13 files (re-run 2026-08-21 after `edition_year` sync) |
| Production verification query on `source_registry` | `SBC201`, `SBC801`, `SBC801_COMM` all `edition_year=2024` with correct `authority_level` |

---

## 8. Remaining risks summary

| Risk | Severity | Status |
|---|---|---|
| E2E vector benchmark not run; flag remains OFF | HIGH | OWNER ACTION |
| Local backup not created | HIGH | BLOCKED |
| Service-role / Gemini key rotation not performed (exposure confirmed in history) | HIGH | OWNER ACTION |
| `source-pdfs` public exposure of copyrighted PDFs | HIGH | OWNER ACTION |
| Provenance not integrated into retrieval edge function | MEDIUM | Phase 2 |
| KG unconsumed | MEDIUM | Phase 2 |

---

## 9. Conclusion

Phase 1 is **closed to the extent possible in this environment**. All four remaining items from the final pass were addressed on 2026-08-21:

1. **`source_registry.edition_year`** — CLOSED: corrected to 2024 in production via migration, verified by query, static registry and tests synced (314/314 PASS).
2. **Secret rotation** — OWNER ACTION: exposure of `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_GEMINI_API_KEY` in Git history is confirmed (commit `34fbeb5`); no available tooling can regenerate either key, so rotation must be done from the Supabase dashboard and AI Studio.
3. **`source-pdfs`** — VERIFIED/OWNER ACTION: bucket left public because the production citation PDF viewer and citation links depend on its public URLs; changing access without a signed-URL migration would break citations. Redistribution of copyrighted SBC PDFs is an owner decision.
4. **E2E Advisory vector benchmark** — OWNER ACTION: test accounts exist but no credentials/session are available; the vector flag stays OFF and keyword retrieval remains the verified production path.

No Phase 2 work was started. The platform remains stable: keyword retrieval is the verified production path, the vector path is available but default-off, subscription integrity is enforced at the database layer, and the public `ssss` bucket exposure is closed.
