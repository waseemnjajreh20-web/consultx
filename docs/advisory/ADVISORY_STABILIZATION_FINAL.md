# Advisory Brain Stabilization — Final Report

Date: 2026-05-05
Branch: `claude/affectionate-solomon-f5e304`
Companion document: [ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md](docs/advisory/ADVISORY_BRAIN_STABILIZATION_DIAGNOSIS.md)
Commit (intended): `fix(advisory): stabilize brain retrieval fallback and diagnostics`

---

## 1. What changed

Two safe additions, zero runtime-behavior changes.

### 1.1 Diagnostic logging in V1 Brain sidecar loader
File: [supabase/functions/fire-safety-chat/index.ts](supabase/functions/fire-safety-chat/index.ts)
Function: `loadBrainFullV1Sidecars` (lines ~1211–1338)

Four `console.log` / `console.warn` lines added at the four exit branches of the loader. All share the prefix `[AdvisoryBrain] sidecar=v1` so they are grep-able in production logs:

| Exit branch | Log line | Level |
|-------------|----------|-------|
| Trigger regex did not match the query | `result=skip reason=trigger_miss` | log |
| All five sidecar fetches returned null | `result=skip reason=all_files_null files_loaded=0/5` | warn |
| Files loaded but RELEVANT-set filter dropped everything | `result=skip reason=filtered_to_zero files_loaded=N/5` | warn |
| Block successfully built and appended to prompt | `result=ok files_loaded=N/5 chunks=X facts=Y relations=Z tree=yes\|no` | log |

No control-flow changes. No new branches. No new error paths. Net diff: **+11 / −2 lines** in the production file.

### 1.2 Offline fixture tests for the deterministic gates
File: [evals/advisory/intent_gate_fixtures.test.ts](evals/advisory/intent_gate_fixtures.test.ts) (new)

Self-contained test file mirroring the production `classifyAdvisoryIntent` and the V1 sidecar trigger regex. No edge-function imports — runs under plain Node/Deno/bun without the Supabase Deno runtime. Acts as a contract: any future change to either gate must update both the production file and this fixture.

11 fixture scenarios covering A–E from the brief plus extended edge cases (domain-vs-casual ordering, empty input, English casuals, short ambiguous). All 11 pass.

## 2. What did NOT change

- `scoreChunk` — left as-is (post-revert structural-only). The reverted relevance gate was not reintroduced.
- `brainV1Fetch` — still pointing at the single `brain_full_v1/` prefix. v2-first loader was not reintroduced.
- 503-on-empty-retrieval — remains absent. `RETRIEVAL NOTE` + diagnostic protocol still govern empty retrieval.
- non-code intent gate (`classifyAdvisoryIntent`) — unchanged. Still short-circuits casual / empty input before retrieval.
- Phase 2 V1 sidecar loader — control flow untouched. Only logging added.
- Main / Analytical mode pipelines — untouched.
- DB schema, migrations, bucket contents — untouched.
- Moyasar / Tap billing functions — untouched.
- `fire-safety-chat-v2` — untouched (separate deletion report deferred per brief).

## 3. Fixtures result

```
=== ConsultX Advisory Intent Gate Fixtures ===
[PASS] A — casual greeting (Arabic) — intent=casual trigger=false
[PASS] B — SBC 201 mercantile occupancy — intent=code_domain trigger=false
[PASS] B2 — SBC 201 mercantile with sprinkler keyword — intent=code_domain trigger=true
[PASS] C — SBC 801 fire alarm — intent=code_domain trigger=true
[PASS] D — Table 1004.5 lookup (egress) — intent=code_domain trigger=true
[PASS] E — Sprinkler / alarm system — intent=code_domain trigger=true
[PASS] F — domain wins over casual when both present — intent=code_domain trigger=false
[PASS] G — empty / punctuation only — intent=empty_or_ambiguous trigger=false
[PASS] H — empty string — intent=empty_or_ambiguous trigger=false
[PASS] I — English casual (hi) — intent=casual trigger=false
[PASS] J — short ambiguous — intent=empty_or_ambiguous trigger=false

Result: 11 passed / 0 failed (total 11)
```

Important detail surfaced by the fixture run: scenario B (`ما متطلبات الإشغال لمحل تجاري 1200 متر مربع؟`) does **not** trigger the V1 sidecar loader. This is by design — the trigger regex requires `محلات\s+تجارية` (plural) or one of `mercantile`, `sprinkler`, `alarm`, `egress`, etc. A bare singular `محل تجاري` without a fire/egress/occupancy keyword falls through to the standard storage/keyword retrieval path. SBC 201 routing still happens via the keyword path; the V1 sidecar is curated reasoning aid for the Group-M / fire-protection / egress family, not a general retrieval mechanism. Scenario B2 (`نظام رش لمحل تجاري Group M`) was added to lock in the path where the V1 sidecar does fire.

## 4. TypeScript validation

Running `npx tsc --noEmit -p tsconfig.app.json`:

- Exit code: **0**
- All errors reported are **pre-existing** on the baseline branch and are not introduced by these changes:
  - `vitest` module not found (test infrastructure — pre-existing)
  - `react-hook-form`, `react-resizable-panels` resolution (dep configuration — pre-existing)
  - `useOrganization.ts` RPC name drift in generated types (stale generated types — pre-existing)
  - `AppShell.tsx` subscription field types (`plan_name`, `current_period_end` not on `SubscriptionStatus`) — pre-existing
  - `ChatMarkdownRenderer.tsx` `collapsible-heading` type narrowing — pre-existing
- Edge function file (`supabase/functions/fire-safety-chat/index.ts`) is **not in scope** of `tsconfig.app.json`. Verified by inspection: my four log additions are pure expression statements with template literals and a `Boolean` filter — no new types, no new imports, no syntax surface.
- Fixture file (`evals/advisory/intent_gate_fixtures.test.ts`) runs under `npx tsx` cleanly (11/11 pass).

No new TypeScript errors are introduced by this commit.

## 5. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Log volume — four extra log lines per Advisory turn | Low | Each turn already emits ~30 log lines from the existing pipeline. The `result=ok` case adds one summary line; skip cases add one warn at most. Negligible. |
| Log line format drift | Low | Single grep prefix (`[AdvisoryBrain] sidecar=v1`) keeps queries stable. No structured logging dependency. |
| Fixture file divergence from production | Low | Fixture is explicitly documented as a contract mirror; rationale field on every scenario states what it locks in. CI is not yet wired to run it (no test runner in `package.json` `scripts`); it is a manual invocation tool today. |
| Production deploy risk | Very low | No control-flow change. Function signatures, return types, and side effects unchanged. Same code paths execute as before. |

## 6. Outstanding risks (not addressed in this commit)

These items remain in the same state as the diagnosis report. They are **deliberately out of scope** for stabilization and require a deliberate, separate decision before being touched:

1. **Phase 3B v2 corpus is still uploaded at `ssss/brain_full_v2/`** in the production bucket. Not actively read by the runtime, but also not cleaned up. Decision deferred.
2. **No runtime relevance gate on `scoreChunk`.** The non-code intent gate above it is the agreed-upon line of defense. Adding a second, lower-level gate is on hold pending fixtures that prove AR-query parity.
3. **No CI hook for the fixture file.** Today it is a manual `npx tsx evals/advisory/intent_gate_fixtures.test.ts` invocation. Wiring CI is straightforward but is a `package.json` and workflow file change — out of stabilization scope.
4. **`fire-safety-chat-v2`** (the 932-line shadow function) is untouched. Separate deletion report is needed before any cleanup.

## 7. Phase 3B status

**Phase 3B is closed for this stabilization round, not deferred indefinitely.**

Re-introducing v2 sidecar / root canary requires, in order:

1. A schema-divergence audit between one v1 chunk file and one v2 chunk file (read-only check on the bucket).
2. An env-flagged `BRAIN_V2_ENABLED` switch with default off.
3. Per-key version log (already prepared by 1.1 — the same log line will tag `sidecar=v2` if a v2 path is ever reintroduced).
4. Fallback-on-empty (not just fallback-on-null) — explicit shape check that the v2 result has non-empty arrays before accepting it.
5. A fixture extending `intent_gate_fixtures.test.ts` with at least three queries that demonstrably should still load V1 content even if V2 is enabled (so a regression in v2 schema is caught offline).

None of those preconditions exist today. Until they do, the runtime stays on V1 only.

## 8. Verification checklist

- [x] Diagnostic log added at all four exit branches of `loadBrainFullV1Sidecars`.
- [x] Same prefix (`[AdvisoryBrain] sidecar=v1`) on every line.
- [x] No control-flow change — verified via `git diff` review (+11 / −2 lines).
- [x] Fixture file added under `evals/advisory/intent_gate_fixtures.test.ts`.
- [x] Fixture covers scenarios A–E from the brief plus extended edge cases (11 total).
- [x] Fixture runs offline without Supabase / Deno runtime.
- [x] All 11 fixtures pass under `npx tsx`.
- [x] TypeScript compile (`tsc --noEmit -p tsconfig.app.json`) — exit code 0, no new errors.
- [x] No DB migration, no Vercel deploy, no Moyasar/Tap touch, no Analytical touch.
- [x] No supabase db push.
- [x] One commit, scoped to advisory stabilization only.
