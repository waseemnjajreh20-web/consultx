# ConsultX — Pascal Editor Fast Integration Audit v1

**Status:** Recommendation — ready for execution gate
**Date:** 2026-05-19
**Phase:** Plan Lab Phase 1 (Audit Only — no code changes)
**Companion documents (planned):** `iframe-contract-v1.md`, `consultx-plan-model-v1.md`, `postmessage-contract-v1.md`, `analytical-overlay-binding-v1.md`
**Scope:** Establish the shortest, safest path to draw inspiration from "Pascal Editor" inside ConsultX without merging Pascal code, without destabilizing existing features, and without introducing new runtime dependencies or backend changes. This document binds the next seven phases.

---

## 0. Recommendation (Read First)

**Adopt the iframe + `postMessage` micro-frontend approach behind a Vite feature flag, with ConsultX-owned data contracts.** Do not import Pascal packages into ConsultX. Do not let Pascal be the source of truth for plan data. Build a hidden, admin-only `/plan-lab` route that initially renders an empty state, then progressively gains: (a) a sandboxed iframe, (b) a typed `postMessage` contract, (c) a `ConsultXPlanModel` data contract, (d) a Pascal JSON adapter that converts Pascal-like scene data into `ConsultXPlanModel`, (e) a Fire Safety Overlay layer with evidence-status semantics, and (f) a documented mapping from existing `analytical_plan_evidence_v1` outputs to overlay markers.

Every phase is reversible by removing four newly-introduced paths (`src/pages/PlanLab.tsx`, `src/types/planLab.ts`, `src/lib/plan-lab/`, `docs/plan-lab/`) and reverting a two-line addition in [src/App.tsx](../../src/App.tsx). No DB migrations, no edge function changes, no billing-path touches, and no Enterprise schema work are required at any point.

---

## 1. Why Iframe + `postMessage`, Not Direct Import

The integration path was selected by ruling out the alternatives against ConsultX's stability constraints.

### 1.1 Rejected — direct package import

Importing Pascal as an npm/source dependency forces ConsultX to absorb Pascal's full toolchain pressure: its React major version, its Tailwind major version, its bundler quirks, its global CSS, and any peer-dependency conflicts. ConsultX is currently running a permissive TypeScript config (`strict: false`, `noImplicitAny: false`) and a single shared Vite + SWC pipeline. A version mismatch on `react`, `react-dom`, `framer-motion`, or `lucide-react` would cascade into Main / Advisory / Analytical UIs that are not part of the Plan Lab scope and that we are explicitly forbidden to touch.

A second reason to reject this path is licensing: Pascal's licensing terms are not yet audited. Pulling the source in would entangle ConsultX's licensing posture with Pascal's before that audit completes.

A third reason is reversibility. Once Pascal modules are imported and tree-shaken into our bundle, "undoing" the integration becomes a code-removal exercise that can leave silent dependency residue (unused transitive packages, retired Tailwind classes, etc.). Iframe isolation lets us cut the wire by deleting one route and clearing one env var.

### 1.2 Rejected — module federation / remote ESM

Module federation gives runtime composability but at the cost of shared React contexts, complex error boundaries, and a build-time agreement between host and remote on framework versions. ConsultX has no existing federation plumbing; adding it for a single experimental page would dwarf the value being delivered.

### 1.3 Selected — iframe + `postMessage` with origin pinning

An iframe contains Pascal in its own JavaScript realm, its own DOM, its own bundler output, its own framework versions, and its own CSS scope. Communication is restricted to structured messages over a typed `postMessage` channel, validated on receipt, and pinned to a known origin. This isolation is the natural fit for an "inspiration, not integration" stance: ConsultX can replace Pascal with any compatible editor later by swapping a URL.

The codebase already proves iframes work without infrastructure changes: [src/components/SourcePanel.tsx](../../src/components/SourcePanel.tsx) renders source PDFs in an iframe with `allow="fullscreen"`, and neither [index.html](../../index.html) nor [vite.config.ts](../../vite.config.ts) sets `X-Frame-Options`, `Content-Security-Policy`, or any header that would block sandboxed iframes or `postMessage`. The new Plan Lab iframe will use a stricter sandbox (`sandbox="allow-scripts allow-forms"`, no `allow-same-origin`, no `allow-top-navigation`) and a stricter `referrerPolicy="no-referrer"`. Origin pinning is performed before any message is parsed.

---

## 2. New Conventions Introduced

Exploration of the codebase found that three of the patterns this plan needs do not yet exist. Plan Lab will introduce them. Existing code is **not** migrated into them — Plan Lab is the seed, future work can follow.

| Convention | Pre-Plan-Lab state | Introduced in | Why |
|---|---|---|---|
| `import.meta.env.VITE_*` runtime feature flag | Three existing `VITE_*` vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MOYASAR_PUBLISHABLE_KEY`) are configuration, not flags | Phase 2 | Plan Lab must be runtime-gated, admin-only, and silently hidden when disabled |
| `src/types/` centralized type module | No directory exists; types are co-located with components and hooks | Phase 2 | The `ConsultXPlanModel` contract spans Plan Lab page, adapter, and message validators — needs a single owner module |
| `src/lib/` domain helper directory | No directory exists; helpers live under `src/utils/` | Phase 2 | `src/utils/` is already populated with chat-runtime helpers (`chatRouting.ts`, `analyticalRouting.ts`, `sourceMetadata.ts`). Plan Lab helpers must be cleanly separated to enforce non-coupling |
| `docs/plan-lab/` documentation folder | No folder exists; docs live in `docs/` flat or `docs/brain/`, `docs/enterprise/` | Phase 1 (this doc) | All Plan Lab decisions, contracts, and bindings live in one folder so they can be audited or removed atomically |

These additions are **purely additive**. Phase 1–8 do not migrate, rename, or restructure any existing file.

---

## 3. The 8-Phase Ladder

| Phase | Name | Output kind | Touches `src/App.tsx`? | New env vars | New deps |
|---|---|---|---|---|---|
| 1 | Pascal fast integration audit | Doc only (this file) | No | None | None |
| 2 | Plan Lab shell behind feature flag | New page + new lib module + new types module + 1 route registration | Yes (2 lines: `lazy` import + `<Route>`) | `VITE_PLAN_LAB_ENABLED`, `VITE_PLAN_LAB_IFRAME_URL` (declared, unused in Phase 2) | None |
| 3 | Iframe micro-frontend support | Extend PlanLab.tsx, extend planLabConfig.ts, add `iframe-contract-v1.md` | No | Iframe URL now consumed | None |
| 4 | `ConsultXPlanModel` data contract | Extend planLab.ts types, add `consultx-plan-model-v1.md` | No | None | None |
| 5 | Typed `postMessage` contract | New `planLabMessages.ts`, wire into PlanLab.tsx, add `postmessage-contract-v1.md` | No | None | None |
| 6 | Pascal JSON adapter prototype | New `adapters/pascal/` library + fixtures + tests | No | None | None |
| 7 | Fire Safety Overlay V1 | Extend planLab.ts types, render read-only legend in PlanLab.tsx | No | None | None (reuses `lucide-react`) |
| 8 | Analytical → Plan Lab binding (doc only) | `analytical-overlay-binding-v1.md` | No | None | None |

After each phase the executor reports PASS/FAIL with validation output and waits for explicit go-ahead before continuing.

---

## 4. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Pascal licensing terms incompatible with ConsultX distribution | High | Iframe isolation defers licensing absorption — Pascal is loaded from its own URL, not bundled. A licensing audit is required **before** any path that bundles Pascal source. This audit blocks future "bundle Pascal" decisions; it does not block any of Phases 1–8. |
| R2 | Iframe sandbox lets Pascal navigate parent, exfiltrate, or render fullscreen modals | Medium | Sandbox attributes pinned to `allow-scripts allow-forms` only. No `allow-same-origin`, no `allow-top-navigation`, no `allow-popups`. `referrerPolicy="no-referrer"`. Documented in `iframe-contract-v1.md` (Phase 3). |
| R3 | A foreign window posts crafted messages to ConsultX pretending to be Pascal | Medium | All `postMessage` handlers filter on `event.origin === planLabConfig.iframeOrigin` **before** parsing. Structural validators reject any payload whose `type` field is unknown or whose payload shape is malformed. Documented in `postmessage-contract-v1.md` (Phase 5). |
| R4 | Plan Lab code accidentally imports from billing / chat / org hooks and tightly couples to them | High | Forbidden-zone audit runs in End-to-End Verification: `git diff main --name-only` is matched against a denylist regex. Adapter code (Phase 6) is also greppped for forbidden import patterns. |
| R5 | Pascal becomes the schema source of truth, locking ConsultX into Pascal's data shape | High | `ConsultXPlanModel` is defined **first** (Phase 4), before any Pascal data flows in (Phase 6). The adapter converts Pascal → `ConsultXPlanModel`, never the reverse. Unknown Pascal nodes are preserved in `metadata.pascalUnknownNodes` without leaking into typed fields. |
| R6 | Plan Lab leaks its existence to non-admin users (an information disclosure) | Low | `/plan-lab` renders `NotFound` for non-admin, logged-out, or flag-off visitors — no redirect to `/auth`, no 403 page. Behaviorally indistinguishable from a non-existent route. |
| R7 | Gemini / Analytical pipeline behavior changes because Plan Lab code accidentally imports a shared util | High | The Analytical-to-overlay mapping (Phase 8) is **documentation only**. It cites paths in [supabase/functions/fire-safety-chat/index.ts](../../supabase/functions/fire-safety-chat/index.ts) as **read-only** anchors. No prompt, edge function, report generator, or PDF pipeline is modified. |
| R8 | New `VITE_PLAN_LAB_ENABLED` flag is treated as build-time-stripped and shipped on by accident | Low | Plan Lab reads the flag at runtime via `import.meta.env.VITE_PLAN_LAB_ENABLED === "true"`. The flag is documented in this audit, in Phase 2, and in `iframe-contract-v1.md`. Default is `false` in any environment that does not set it. |
| R9 | Dependency creep — someone adds a chart / canvas / drawing library "just for Plan Lab" | Medium | Each phase's PASS gate explicitly checks `git diff -- package.json package-lock.json` is empty. Plan Lab reuses existing dependencies (`lucide-react`, Tailwind, framer-motion via `PageTransition`). |
| R10 | Rollback leaves orphan `.env` entries on a developer's machine | Trivial | `VITE_PLAN_LAB_ENABLED` and `VITE_PLAN_LAB_IFRAME_URL` are inert when the route is gone. Rollback documentation reminds the developer to delete them locally; no production env touches `.env*` files. |

---

## 5. Forbidden Zones (Read-Only for Every Phase)

This list is the contractual boundary of Plan Lab. If any phase appears to require touching one of these files, **stop and ask** — do not edit.

### 5.1 Supabase migrations & schema

- `supabase/migrations/**` — hard-blocked by [.claude/hooks/guard-migrations.js](../../.claude/hooks/guard-migrations.js) (exit 2).
- `schema.sql` — same hook.

### 5.2 Runtime AI surface (Gemini)

- `supabase/functions/fire-safety-chat/index.ts`
- `supabase/functions/fire-safety-chat-v2/index.ts`

### 5.3 Billing / subscription edge functions

- `supabase/functions/tap-webhook/**`
- `supabase/functions/tap-charge-subscription/**`
- `supabase/functions/tap-create-subscription/**`
- `supabase/functions/create-checkout/**`
- `supabase/functions/process-subscription-renewal/**`
- `supabase/functions/cancel-subscription/**`
- `supabase/functions/verify-payment/**`
- `supabase/functions/payment-webhook/**`
- `supabase/functions/moyasar-webhook/**`
- `supabase/functions/moyasar-create-subscription/**`

### 5.4 High-risk admin / trial edge functions

- `supabase/functions/admin-manage-user/**`
- `supabase/functions/launch-trial-activate/**`
- `supabase/functions/check-subscription/**`
- `supabase/functions/auto-trial/**`
- `supabase/functions/corporate-trial/**`

### 5.5 Critical UI components

- [src/components/ChatInterface.tsx](../../src/components/ChatInterface.tsx) — warned by [.claude/hooks/guard-critical-ui.js](../../.claude/hooks/guard-critical-ui.js)
- [src/components/ChatMarkdownRenderer.tsx](../../src/components/ChatMarkdownRenderer.tsx)
- [src/components/ChatSidebar.tsx](../../src/components/ChatSidebar.tsx)
- [src/components/BottomNav.tsx](../../src/components/BottomNav.tsx)
- [src/components/AppShell.tsx](../../src/components/AppShell.tsx) — explicitly excluded by the user's "Hidden URL only" decision in this planning session

### 5.6 Auth / profile / entitlement hooks

- [src/hooks/useAuth.tsx](../../src/hooks/useAuth.tsx) — warned by hook
- [src/hooks/useProfile.ts](../../src/hooks/useProfile.ts) — warned by hook
- [src/hooks/useEntitlement.ts](../../src/hooks/useEntitlement.ts) — **read-only import** of `isAdmin` is permitted; modification is not
- [src/hooks/useSubscription.ts](../../src/hooks/useSubscription.ts) — must not be imported anywhere in Plan Lab
- [src/hooks/useOrganization.ts](../../src/hooks/useOrganization.ts) — must not be imported anywhere in Plan Lab
- [src/hooks/useConversations.ts](../../src/hooks/useConversations.ts) — must not be imported anywhere in Plan Lab

### 5.7 Chat / mode utilities

- [src/utils/chatRouting.ts](../../src/utils/chatRouting.ts)
- [src/utils/analyticalRouting.ts](../../src/utils/analyticalRouting.ts)
- [src/utils/sourceMetadata.ts](../../src/utils/sourceMetadata.ts)

### 5.8 Environment files

- `.env`, `.env.local`, `.env.production`, `.env.development`, etc. — hard-blocked by hook. The two new flags below are added by the user to their local `.env` outside of any phase's edit set.

---

## 6. Files To Be Touched in Phases 2–8 (Exact List)

This is the complete write-set for the next seven phases. Anything outside this list is out of scope and must trigger a stop-and-ask.

### 6.1 New files (created)

| Path | Phase introduced | Later extended in |
|---|---|---|
| `docs/plan-lab/pascal-fast-integration-audit.md` | 1 (this file) | — |
| `docs/plan-lab/iframe-contract-v1.md` | 3 | — |
| `docs/plan-lab/consultx-plan-model-v1.md` | 4 | — |
| `docs/plan-lab/postmessage-contract-v1.md` | 5 | — |
| `docs/plan-lab/analytical-overlay-binding-v1.md` | 8 | — |
| `src/pages/PlanLab.tsx` | 2 | 3, 5, 7 |
| `src/types/planLab.ts` | 2 | 4, 7 |
| `src/lib/plan-lab/planLabConfig.ts` | 2 | 3 |
| `src/lib/plan-lab/planLabMessages.ts` | 5 | — |
| `src/lib/plan-lab/adapters/pascal/pascalAdapter.ts` | 6 | — |
| `src/lib/plan-lab/adapters/pascal/__fixtures__/minimal-scene.json` | 6 | — |
| `src/lib/plan-lab/adapters/pascal/__fixtures__/missing-fields-scene.json` | 6 | — |
| `src/lib/plan-lab/adapters/pascal/__fixtures__/unknown-node-scene.json` | 6 | — |
| `src/lib/plan-lab/adapters/pascal/pascalAdapter.test.ts` | 6 | — |

### 6.2 Existing files (modified)

| Path | Phase | Nature of edit |
|---|---|---|
| [src/App.tsx](../../src/App.tsx) | 2 only | Two lines: one `lazy(() => import("./pages/PlanLab"))` declaration near the existing `lazy` block (around line 31), one `<Route path="/plan-lab" element={<PageTransition><PlanLab /></PageTransition>} />` immediately above the catch-all comment at line 65 |

No other existing file is modified in any phase. This includes `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, and every file under `src/components/`, `src/hooks/`, `src/utils/`, `supabase/`.

---

## 7. Environment Variables (User-Set, Not Edited by Plan Lab)

Two new `VITE_*` variables are introduced. The user adds them to their local `.env` files; Plan Lab phases never modify `.env*`.

| Name | Type | Default behavior when unset | Read by |
|---|---|---|---|
| `VITE_PLAN_LAB_ENABLED` | `"true"` \| `"false"` (string compared at runtime) | Treated as disabled — `/plan-lab` renders `NotFound` | `planLabConfig.ts`, consumed by `PlanLab.tsx` |
| `VITE_PLAN_LAB_IFRAME_URL` | URL string (absolute, https) \| empty | Empty — Plan Lab renders empty state + legend (Phase 7), no iframe | `planLabConfig.ts`, consumed by `PlanLab.tsx` (Phase 3+) |

The flag pattern (`=== "true"`) is intentional. It matches Vite's coercion semantics (env vars are strings), avoids accidental truthy bugs from values like `"false"` or `"0"`, and makes the audit trail explicit in code review.

---

## 8. Coupling Guards

Because ConsultX's hooks are tightly interlinked (entitlement → subscription → organization → auth), Plan Lab applies an import allowlist:

**Permitted imports for any Plan Lab file:**
- `@/hooks/useEntitlement` — only the `isAdmin` field
- `@/components/PageTransition` — for route consistency
- `@/components/LoadingSpinner` — for suspense fallback consistency (already used in App.tsx)
- `@/components/ui/*` — shadcn primitives (unrestricted, all components reusable)
- `lucide-react` icons
- `react`, `react-router-dom`, `framer-motion`
- `tailwind-merge`, `clsx` (already in repo)

**Forbidden imports for any Plan Lab file:**
- `@/hooks/useSubscription`, `@/hooks/useOrganization`, `@/hooks/useConversations`
- `@/hooks/useAuth`, `@/hooks/useProfile` (entitlement already wraps these)
- `@/utils/chatRouting`, `@/utils/analyticalRouting`, `@/utils/sourceMetadata`
- `@/components/ChatInterface`, `@/components/ChatMarkdownRenderer`, `@/components/ChatSidebar`, `@/components/BottomNav`, `@/components/AppShell`
- Anything under `supabase/`

This list is enforced by a manual grep in each phase's PASS gate and by the End-to-End Verification step.

---

## 9. Validation Discipline

After every phase the executor runs:

```powershell
npx tsc --noEmit
npm run build
git status --porcelain
git diff --stat
git diff -- package.json package-lock.json
```

and reports PASS or FAIL with output. PASS requires:
- `tsc` returns zero errors.
- `vite build` exits successfully.
- The changed-file list matches the phase's declared write-set.
- `package.json` and `package-lock.json` have no diff in any phase except where explicitly planned (no phase plans this).

End-to-End Verification (after Phase 8) additionally runs the forbidden-zone audit regexes documented in the master plan.

---

## 10. Recommended Execution Cadence

The user's master plan is gated phase-by-phase. The recommendation in this audit is:

1. After each phase's PASS report, the user reviews and types `go` (or equivalent) before the next phase begins.
2. If a phase reports FAIL, the executor does not improvise — it surfaces the exact failure and waits for direction.
3. The execution is paced so that each phase is a coherent, atomically-revertable commit (or kept as uncommitted diff if the user prefers to inspect before committing).

---

## 11. What This Audit Does Not Decide

The following are out of scope for Phase 1. They are flagged here so that they are not silently introduced later without an explicit decision:

- **Persistence.** No phase 1–8 stores a `ConsultXPlanModel` anywhere (no Supabase table, no localStorage, no IndexedDB). Persistence design is a separate decision after Phase 8.
- **Authoring rights.** Plan Lab is read-only in Phases 2–7; the legend in Phase 7 is non-interactive. Authoring UI is a future scope.
- **Public exposure.** Plan Lab is admin-only in every phase. Whether non-admin users (engineers in Enterprise mode, for example) ever see it is a future decision tied to RBAC.
- **Real Pascal URL.** No phase commits a specific Pascal hosted URL. The iframe is fed by `VITE_PLAN_LAB_IFRAME_URL`, which the developer points wherever they choose. Production hosting of the Pascal app is out of scope.
- **Test runner.** Phase 6 ships tests as files. If the repo does not have a runner wired, the tests are documentation-grade until a follow-up wires one. No new dev dependency is added by Phase 6 itself.

---

## 12. Acceptance for Phase 1

This document is the entire Phase 1 deliverable. PASS criteria:

- File exists at `docs/plan-lab/pascal-fast-integration-audit.md`.
- `git status --porcelain` lists exactly this file as `??` (untracked) or `A` (staged).
- `npx tsc --noEmit` returns the same baseline result as before Phase 1 began.
- No other file is modified.

On PASS, the executor reports the result and waits for explicit go-ahead before beginning Phase 2.
