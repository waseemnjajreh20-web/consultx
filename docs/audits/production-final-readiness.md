# ConsultX — Production Final Readiness Report

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-05-01  
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

---

## 2. VERIFIED

| # | Item | Evidence |
|---|---|---|
| 1 | `source_registry` contains `authority_level` and `edition_year` | Production query returned 11 rows |
| 2 | `match_sbc_documents` exists and returns 768-dim vector matches | `pg_proc` signature + live query results |
| 3 | 4,594 embeddings in `sbc_documents` | Production count query |
| 4 | `source-pdfs` public access is intentional (used by citation links) | `src/utils/sourceMetadata.ts` constructs public URLs |
| 5 | No orphaned deployed functions | Reconciliation table |

---

## 3. BLOCKED

| # | Item | Blocker | Alternatives tried | Best path forward |
|---|---|---|---|---|
| 1 | Full E2E Advisory vector A/B benchmark | No real user JWT available; service_role rejected by `supabase.auth.getUser()` | `anon` invocation, `service_role` invocation, tool search for session minting | Owner provides test credentials or enables a magic-link/password-reset tool |
| 2 | Local SQL database backup | `pg_dump` and Docker unavailable in environment | `npx supabase db dump` (fails: Docker prerequisite), `npx supabase gen types` fallback | Run `supabase db dump` on a machine with Docker, or download managed backup snapshot |
| 3 | `pg_dump --schema-only` restore-tested baseline | Same as #2 | Schema metadata extracted via SQL as partial substitute | Use managed backup + later restore test |

---

## 4. OWNER ACTION

| # | Item | Severity | Why owner action | Suggested action |
|---|---|---|---|---|
| 1 | Rotate `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_GEMINI_API_KEY` if they were ever exposed in Git history | HIGH | Requires project-level API key rotation and re-deployment of all Edge Functions | Generate new keys in Supabase dashboard, update secrets, redeploy functions |
| 2 | Correct `source_registry.edition_year` in production from 2018 to 2024 for `SBC201`, `SBC801`, `SBC801_COMM` | MEDIUM | Agent has read-only access; static JSON corrected but DB row is stale | Run `UPDATE source_registry SET edition_year=2024 WHERE source_id IN ('SBC201','SBC801','SBC801_COMM');` |
| 3 | Decide on `source-pdfs` public exposure | HIGH | Bucket intentionally public for citation links, but serves copyrighted standards PDFs | Either keep with documented justification or migrate to signed URLs + authenticated bucket policy |
| 4 | Provide test account credentials or enable session minting | HIGH | Unblocks E2E benchmark and full AI validation | Owner login or Management API action |
| 5 | Approve Phase 2 scope | MEDIUM | Truth-layer architecture (full provenance in retrieval, KG consume/replace, migration lineage rebuild) needs deliberate planning | Review Phase 1 findings and approve Phase 2 plan |

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
| `npm run typecheck` | PASS |
| `npx deno check supabase/functions/fire-safety-chat/index.ts` | PASS |
| `npm test -- --run` | **314/314 PASS**, 13 files |

---

## 8. Remaining risks summary

| Risk | Severity | Status |
|---|---|---|
| E2E vector benchmark not run | HIGH | BLOCKED |
| Local backup not created | HIGH | BLOCKED |
| Service-role / Gemini key rotation not performed | HIGH | OWNER ACTION |
| `source-pdfs` public exposure of copyrighted PDFs | HIGH | OWNER ACTION |
| `source_registry.edition_year` stale in DB | MEDIUM | OWNER ACTION |
| Provenance not integrated into retrieval edge function | MEDIUM | Phase 2 |
| KG unconsumed | MEDIUM | Phase 2 |

---

## 9. Conclusion

Phase 1 is **closed to the extent possible in this environment**. All P0 items that could be safely completed are done and verified. The two P0 items that remain open are blocked by the absence of a real user session (E2E benchmark) and the absence of `pg_dump`/Docker (local backup), not by open defects in the platform.

No Phase 2 work was started. The platform remains stable: keyword retrieval is the verified production path, the vector path is available but default-off, subscription integrity is enforced at the database layer, and the public `ssss` bucket exposure is closed.
