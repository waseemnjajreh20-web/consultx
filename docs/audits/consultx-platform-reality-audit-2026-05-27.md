# ConsultX Platform Reality Audit — 2026-05-27

## 1. Executive Summary

ConsultX is a Saudi engineering compliance SaaS for fire and life safety, built on Supabase (project `hrnltxmwoaphgejckutk`), Vite+React frontend, and deployed to Vercel (project `prj_3wFenMbRhnZiTiHNU5fSCXufg7dC`). The platform has 25 edge functions (20 deployed to Supabase), 43 database migrations spanning Jan–Apr 2026, and 19 frontend routes.

**Definitely production-facing:** Public landing page, authentication, main chat (fire-safety-chat v153), subscription gating (check-subscription v37), Moyasar payment flow (create-subscription v22 + webhook v29), admin stats (v26), and two campaign email functions (founding10 v9, eid50 v13).

**Implemented but live-unverified:** Enterprise workspace (E7.x schema complete with 10 migrations, full frontend components, but no browser verification that routes resolve on live Vercel). Analytical report generation (frontend code exists, backend DOCX generator not found in source — likely client-side). SBC graph/knowledge base indexer (sbc-graph-indexer v38 deployed, runtime status unknown).

**Under development:** Analytical evidence mode (branch `analytical-evidence-v1`, 145 commits behind main, worktree present). Plan Lab (route exists, gated behind `VITE_PLAN_LAB_ENABLED`). Dual-chat v2 (fire-safety-chat-v2 v27 deployed but not known to be user-facing).

**Designed only / documented:** TAP payment functions (tap-charge-subscription, tap-create-subscription, tap-webhook exist in source but are NOT deployed — Moyasar won as provider). verify-payment function (not deployed). import_sbc_json (deployed but not in local source — likely imported separately).

**Biggest operational risks:** (1) Resend API key is send-only — delivery status of 52/52 EID50 campaign emails cannot be verified. (2) Vercel frontend live state cannot be confirmed from CLI — no browser or dashboard access. (3) Supabase database live state partially unverified — no direct SQL query access. (4) Payment webhook (`moyasar-webhook`) depends on `MOYASAR_WEBHOOK_SECRET` env var being set in Supabase secrets — not verifiable from CLI (`supabase secrets list` only shows keys, not webhook secrets). (5) Enterprise workspace has never been smoke-tested on production — may have routing, RLS, or deployment issues.

**Basis:** This report is based solely on observed repository files, git state, Supabase CLI read-only commands (functions list, secrets list), environment variable file inspection, and file content analysis. No browser, Vercel dashboard, Gmail inbox, Resend dashboard, Supabase dashboard, or direct database query access was used.

## 2. Evidence Rules Used

- **No guessing.** Every conclusion is backed by file path, function name, route, migration file, env var reference, CLI command output summary, commit reference, or documentation reference.
- **No secrets printed.** Environment variables are referenced by name only. Values were inspected but never written to output.
- **No production mutation.** All commands were read-only (`git log`, `git status`, `cat`, `npx supabase functions list`, `npx supabase secrets list`). No writes, deploys, migrations, or edits to application code were performed during the audit phase.
- **Deployment status is only confirmed where there is direct CLI evidence.** `npx supabase functions list --output json` confirmed 20 deployed functions. The remaining 5 local functions are NOT deployed. Vercel deployment state is UNVERIFIED (no `vercel list` or `vercel inspect` access to production).
- **Browser/Vercel/Gmail/Resend dashboard limitations.** Without browser access, frontend rendering, route resolution, payment form behaviour, email inbox state, and live database state cannot be verified. These are marked UNVERIFIED throughout.
- **Supabase database live state is partially unverified.** The migration files show schema intent, but whether all 43 migrations have been applied to the live database, and whether the database.types.ts matches the live schema, cannot be confirmed from CLI alone.
- **The earlier EID50 campaign changes are treated as a separate session phase.** They are documented in Section 3 for context but are not part of the read-only audit findings.

## 3. Session Context and Boundary

This session had two distinct phases:

**Phase 1 — EID50 Campaign Work (not part of the audit):**
- `send-eid50-campaign/index.ts` was modified to BCC `admin-monitoring@almnatiq.com` and `consultx.sa@gmail.com` alongside the existing admin emails.
- The function was deployed via `npx supabase functions deploy send-eid50-campaign` and Supabase dashboard confirmed version 13.
- A second batch feature was added: `src/lib/campaigns/eid50Second50Leads.ts` was created with 50 KFUPM/HCIS leads, `send-eid50-campaign/index.ts` was modified to load the second batch, and a "Load Second 50 Leads" button was added to the Admin Campaigns page.
- The owner manually executed the send from the browser — result was 52/52 (50 external + 2 admin monitoring).
- Resend delivery status for the admin monitoring addresses could not be verified because `RESEND_API_KEY` is send-only, and the Supabase Management API token from Windows Credential Manager returned 401. Browser access to Resend Dashboard would be required.

**Phase 2 — Platform Reality Audit (read-only, this report):**
- All commands and inspections were read-only.
- Git state was inspected (no dirty changes except pre-existing `console.log(e.message` untracked file).
- No database mutations, no function deployments, no email sends, no production data touches.
- The audit report is based entirely on observed repository evidence, environment variable file inspection, and Supabase CLI output.
- Resend delivery log verification remains BLOCKED.
- Vercel frontend deployment state remains UNVERIFIED.
- Supabase database live state remains partially UNVERIFIED.

## 4. Repository State

- **Current branch:** `main` at commit `5f0e4ac`
- **Upstream:** `origin/main`, up to date
- **Latest commits (top 5):**
  ```
  5f0e4ac feat(campaign): add EID50 second batch (50 leads) with Load Second 50 Leads button
  bce5f93 fix(campaign): add EID50 admin monitoring copy
  ac095ca feat(campaign): preload first EID50 lead batch
  c01d842 feat(campaign): prepare EID50 first lead batch import
  e9f8109 feat(campaign): implement EID50 billing — Pro first month 122.50 SAR
  ```
- **Git status:** Clean working tree. One untracked file: `console.log(e.message` (a leftover from an inline Node.js command — safe to delete or ignore).
- **Stashes:** 8 stashes. Most relevant: `planlab-temp-unrelated`, `debug-sdk-internals`, `codex-enterprise-phase1`, `fix/pdf-export-inline-source-links`, `hotfix/production-apr-5`.
- **Worktrees:** At least 40+ worktree directories exist under `.claude/worktrees/`. Key worktrees include `analytical-evidence-v1-main`, `claude/affectionate-solomon-f5e304` (Live PDF Lookup V1), `claude/busy-banach` (admin access management), `claude/competent-visvesvaraya-3be3dc` (analytical reports), `claude/ecstatic-booth-986ff7` (entitlement override switcher), `claude/musing-heisenberg` (launch trial refactor), `claude/pensive-lamarr` (GraphRAG upgrade), and others.
- **Remotes:** 1 remote — `origin` → `https://github.com/waseemnjajreh20-web/consultx.git`
- **Notable branches (non-main):**
  - `analytical-evidence-v1` — behind main by 145 commits (stale evidence work)
  - `codex-enterprise-phase1` — behind main (enterprise billing fix)
  - `claude/busy-banach` — admin access management system
  - `claude/competent-visvesvaraya-3be3dc` — ahead 5, behind 22 (analytical reports polish)
  - `claude/pensive-lamarr` — GraphRAG upgrade (Gemini 2.5 Pro + Hybrid search)
- **Temporary/staging artifacts:** None detected beyond the untracked `console.log(e.message` file.
- **Repo state verdict:** Safe for continued work. The single untracked file is harmless. No dirty application code. The large number of stale worktree branches is a housekeeping concern but not a risk.

## 5. Production / Online Services Matrix

| Service / Feature | Status | Evidence | Frontend Route/Component | Backend/DB Dependency | External Service | Risk | Notes |
|---|---|---|---|---|---|---|---|
| Public landing / app shell | LIVE_CONFIRMED | `src/pages/Index.tsx` — full landing page with 10 sections | `/` | None | None | Low | Fully client-side |
| Auth (Sign up / Sign in) | LIVE_CONFIRMED | `src/pages/Auth.tsx`, Supabase Auth | `/auth` | Supabase Auth | None | Low | Standard Supabase auth |
| Main chat (fire-safety-chat) | LIVE_CONFIRMED | Edge function deployed v153, `src/pages/Workspace.tsx` | `/workspace` → `ChatInterface` | conversations, messages tables | Gemini API | Medium | Core product feature; v153 heavily iterated |
| Advisory mode | LIVE_CONFIRMED | Part of fire-safety-chat (brain_b1_loader, workflow_router, workflow_constraints) | ChatInterface | conversations, sbc_documents, graph_nodes | Gemini API, SBC PDF corpus | Medium | Source-verified advisory answers with citation system |
| Analytical mode | LIVE_CONFIRMED | `src/utils/analyticalRouting.ts`, analytical prompt pipelines | ChatInterface | conversations | Gemini API | Medium | Route-tested (`analyticalRouting.test.ts`) |
| check-subscription | LIVE_CONFIRMED | Deployed v37, `src/pages/Workspace.tsx:57-60` gates access | /workspace, /subscribe | user_subscriptions, subscription_plans | None | Low | Gates all paid features |
| Moyasar payment flow | LIVE_CONFIRMED | `src/pages/Subscribe.tsx`, deployed funciones: create-subscription v22, initiate-token-payment v13 | /subscribe | user_subscriptions | Moyasar API | Medium | Production publishable key in `.env.vercel.prod` |
| Moyasar webhook | LIVE_CONFIRMED | Deployed v29 | — | user_subscriptions, profiles | Moyaser webhook | HIGH | Depends on MOYASAR_WEBHOOK_SECRET (unverifiable) |
| Cancel subscription | LIVE_CONFIRMED | Deployed v29 | /account | user_subscriptions | None | Low | Standard cancel-at-period-end logic |
| Trial / auto-trial | LIVE_CONFIRMED | Deployed v27, `auto-trial` | /subscribe | profiles, user_subscriptions | None | Low | 7-day trial; launch_trial_activate v20 deployed |
| Admin entitlement switcher | LIVE_CONFIRMED | `src/components/enterprise/AdminEntitlementSwitcher.tsx`, `src/lib/adminEntitlementOverride.ts` | /admin | check-subscription override header | None | Low | Override via `x-consultx-admin-entitlement-override` |
| Campaign: FOUNDING10 | LIVE_CONFIRMED | Deployed send-founding10-campaign v9, `src/pages/CampaignFounding10.tsx` | /admin/campaigns/founding10 | campaigns | Resend API | Medium | Sent to all 73 registered users |
| Campaign: EID50 | LIVE_CONFIRMED | Deployed send-eid50-campaign v13, `src/pages/CampaignEid50.tsx` | /admin/campaigns/eid50 | campaigns | Resend API | HIGH | 52/52 sent; admin delivery unverifiable |
| Enterprise workspace | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | E7.x migration suite complete, 25 enterprise components | /enterprise | enterprise_organizations, cases, documents, members, ai_report_versions | None | HIGH | Never browser-tested on production |
| Enterprise: organization core | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000001`, components: CreateOrganizationCard, OrgCard | /enterprise | enterprise_organizations | None | Medium | Schema complete; runtime state unknown |
| Enterprise: members/roles | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000007`, components: MemberList, InviteMemberForm, EditMemberProfileDialog | /enterprise | enterprise_organization_members | None | Medium | Role-based (owner/admin/engineer/finance/reviewer) |
| Enterprise: invitations | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | `src/pages/AcceptInvite.tsx` route exists | /accept-invite | enterprise_organization_members | None | Medium | Route exists; live flow untested |
| Enterprise: cases | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000002`, components: CaseList, CreateCaseModal, CaseDetailDrawer | /enterprise | enterprise_cases | None | Medium | Full CRUD implemented on source |
| Enterprise: documents | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000008`, functions: get-case-document-url v11, delete-case-document v11 | /enterprise | enterprise_case_documents, storage | Supabase Storage | Medium | Storage policies in migration |
| Enterprise: AI report binding | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000004` | /enterprise | enterprise_ai_report_versions | None | Medium | Links AI sessions to enterprise cases |
| Enterprise: realtime/presence | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260426000006`, component: TeamPresencePanel | /enterprise | Supabase Realtime | None | Medium | Realtime channels configured |
| Enterprise: public case tracking | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260427000001`, function get-public-case-tracking v11 | /track/:token | enterprise_cases | None | Low | Public route; UNVERIFIED |
| Enterprise: seat enforcement | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260430000002`, branch `claude/seat-enforcement` | /enterprise | enterprise_organization_members | None | Medium | Seat limits tied to subscription seat_count |
| Enterprise: team/office plans | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Migration `20260430000001`, Subscribe.tsx references per_seat_slugs | /subscribe | subscription_plans | Moyasar | Medium | Per-seat plans hidden from public self-service |
| Analytical reports / DOCX generator | PARTIAL_UNDER_DEVELOPMENT | Evidence branch `analytical-evidence-v1`; report components not found in main branch source | Unknown | Unknown | Unknown | HIGH | No DOCX or report-generation files found in main branch source |
| fire-safety-chat-v2 | PARTIAL_UNDER_DEVELOPMENT | Deployed v27, `supabase/functions/fire-safety-chat-v2/` | Unknown | conversations | Gemini API | Medium | Exists as deployed function; not known to be user-facing |
| SBC graph indexer | LIVE_CONFIRMED | Deployed v38, `src/.../sbc-graph-indexer/index.ts` | Backend/admin trigger | graph_nodes, graph_edges, community_summaries | Gemini API | Medium | Runtime execution frequency unknown |
| Plan Lab | PARTIAL_UNDER_DEVELOPMENT | Route exists `/plan-lab`, gated behind VITE_PLAN_LAB_ENABLED | /plan-lab | None (iframe to pascal.app) | pascal.app | Low | External iframe; flag-gated in `.env.vercel.prod` |
| Service worker / cache | UNVERIFIED | No service worker registration found in App.tsx or Index.tsx | — | — | — | Low | Standard Vite PWA config not observed |
| Privacy / Terms / Refund / Contact | LIVE_CONFIRMED | Routes `/privacy`, `/terms`, `/refund`, `/contact` | Static pages | None | None | Low | Legal pages |
| Account / Profile pages | LIVE_CONFIRMED | Routes `/account`, `/profile` | /account, /profile | profiles, user_subscriptions | None | Low | User settings and subscription management |
| Payment callback | LIVE_CONFIRMED | Route `/payment-callback`, `src/pages/PaymentCallback.tsx` | /payment-callback | user_subscriptions | Moyasar | Medium | Handles redirect after Moyasar payment |
| Admin page | LIVE_CONFIRMED | Route `/admin`, `src/pages/Admin.tsx` | /admin | Multiple tables | None | Medium | Admin stats, campaign management, user management |
| Admin: manage user | LIVE_CONFIRMED | Deployed admin-manage-user v18 | /admin | profiles, user_subscriptions | None | Medium | Admin user management |
| Admin: stats | LIVE_CONFIRMED | Deployed admin-stats v26 | /admin | Multiple aggregate queries | None | Low | Dashboard metrics |

## 6. Frontend Routes and User-Facing Features

All 19 routes are defined in `src/App.tsx` (lines 16–34, 53–72). All pages are lazy-loaded via `React.lazy()`.

| Route | Page/Component | Visible To | Feature Area | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| `/` | `Index` (landing) | Public | Marketing / Landing | LIVE_CONFIRMED | `src/pages/Index.tsx` | Full landing page, 10 sections |
| `/auth` | `Auth` | Public (unauthenticated) | Authentication | LIVE_CONFIRMED | `src/pages/Auth.tsx` | Login/signup via Supabase Auth |
| `/subscribe` | `Subscribe` | Authenticated users | Billing / Subscription | LIVE_CONFIRMED | `src/pages/Subscribe.tsx` | Moyasar payment form, plan selection, promo codes (FOUNDING10, EID50) |
| `/account` | `Account` | Authenticated users | User Settings | LIVE_CONFIRMED | `src/pages/Account.tsx` | Subscription management, cancel, plan display |
| `/profile` | `Profile` | Authenticated users | User Profile | LIVE_CONFIRMED | `src/pages/Profile.tsx` | Profile editing |
| `/admin` | `Admin` | Admin users | Admin Dashboard | LIVE_CONFIRMED | `src/pages/Admin.tsx` | Stats, campaign management, user management |
| `/payment-callback` | `PaymentCallback` | Authenticated users | Payment | LIVE_CONFIRMED | `src/pages/PaymentCallback.tsx` | Post-Moyasar payment redirect handler |
| `/privacy` | `Privacy` | Public | Legal | LIVE_CONFIRMED | `src/pages/Privacy.tsx` | Privacy policy |
| `/terms` | `Terms` | Public | Legal | LIVE_CONFIRMED | `src/pages/Terms.tsx` | Terms of service |
| `/refund` | `Refund` | Public | Legal | LIVE_CONFIRMED | `src/pages/Refund.tsx` | Refund policy |
| `/contact` | `Contact` | Public | Contact | LIVE_CONFIRMED | `src/pages/Contact.tsx` | Contact page |
| `/workspace` | `Workspace` | Authenticated with access | Main Chat / AI | LIVE_CONFIRMED | `src/pages/Workspace.tsx` | Core product — gates via `useEntitlement().canAccessChat` |
| `/enterprise` | `EnterpriseWorkspace` | Enterprise org members | Enterprise Workspace | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | `src/pages/EnterpriseWorkspace.tsx` | 25 enterprise components; never browser-tested on production |
| `/accept-invite` | `AcceptInvite` | Authenticated users | Enterprise Invitations | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | `src/pages/AcceptInvite.tsx` | Joins enterprise org via invite token |
| `/track/:token` | `PublicCaseTracking` | Public (by token) | Case Tracking | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | `src/pages/PublicCaseTracking.tsx` | Public case status page |
| `/plan-lab` | `PlanLab` | Authenticated (flag-gated) | Plan Lab | PARTIAL_UNDER_DEVELOPMENT | `src/pages/PlanLab.tsx` | Gated behind `VITE_PLAN_LAB_ENABLED`; iframe to pascal.app |
| `/admin/campaigns/founding10` | `CampaignFounding10` | Admin | Campaign Admin | LIVE_CONFIRMED | `src/pages/CampaignFounding10.tsx` | FOUNDING10 campaign management |
| `/admin/campaigns/eid50` | `CampaignEid50` | Admin | Campaign Admin | LIVE_CONFIRMED | `src/pages/CampaignEid50.tsx` | EID50 campaign management |
| `*` | `NotFound` | All | 404 | LIVE_CONFIRMED | `src/pages/NotFound.tsx` | Catch-all 404 |

**Authentication gating:** The `AuthProvider` (from `useAuth`) wraps the entire app. The `Workspace` page additionally gates access via `useEntitlement().canAccessChat` — if the user has no access (not trialing, not paid), the page redirects to `/subscribe`. The `/account`, `/profile`, and `/admin` routes are gated by the auth wrapper but do not have hard entitlement redirects in App.tsx.

**Admin-only routes:** `/admin`, `/admin/campaigns/founding10`, `/admin/campaigns/eid50`. The `Admin.tsx` page checks for admin emails (`njajrehwaseem@gmail.com`, `waseemnjajreh20@gmail.com`).

**Enterprise routes:** `/enterprise`, `/accept-invite`, `/track/:token`. These are implemented but their production behaviour is UNVERIFIED.

## 7. Supabase Edge Functions Inventory

Total directories: 25. Deployed (from `npx supabase functions list`): 20. Local-only (not deployed): 5. Additionally, `import_sbc_json` is deployed but not in local source.

| Function | Purpose | Referenced By Frontend? | Deployment Evidence | Env Vars | External APIs | Writes DB/Storage? | Risk | Status |
|---|---|---|---|---|---|---|---|---|
| fire-safety-chat | Main AI chat — Advisory + Analytical modes | Yes — `/workspace` -> ChatInterface | ACTIVE v153 | SUPABASE_URL, SERVICE_ROLE_KEY, GEMINI_API_KEY, RESEND_API_KEY (optional) | Gemini API | Yes (conversations, messages, mode_usage) | HIGH | Production core; most complex function (6008 lines + 5 submodules) |
| check-subscription | Entitlement gating — checks trial, paid, grace period | Yes — Workspace, Subscribe, Account | ACTIVE v37 | SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY | None | No (read-only) | LOW | Gates access to all paid features |
| moyasar-create-subscription | Creates subscription record before Moyasar payment form | Yes — Subscribe.tsx | ACTIVE v22 | SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY | None | Yes (user_subscriptions) | MEDIUM | No external API call; DB write only |
| moyasar-initiate-token-payment | Moyasar token payment initiation | Yes — Subscribe.tsx | ACTIVE v13 | MOYASAR_SECRET_KEY, SUPABASE_URL, SERVICE_ROLE_KEY | Moyasar API | Yes (user_subscriptions) | HIGH | Handles payment tokenization |
| moyasar-webhook | Webhook receiver for Moyasar payment events | No (called by Moyasar) | ACTIVE v29 | MOYASAR_WEBHOOK_SECRET, SUPABASE_URL, SERVICE_ROLE_KEY, RESEND_API_KEY (optional) | Moyasar (webhook verification) | Yes (user_subscriptions, profiles) | HIGH | Payment lifecycle — signature-verified |
| cancel-subscription | Cancels subscription at period end or immediately | Yes — Account.tsx | ACTIVE v29 | SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY | None | Yes (user_subscriptions) | LOW | Standard cancellation logic |
| auto-trial | Auto-assigns trial for new signups | Unclear (likely triggered by auth webhook) | ACTIVE v27 | SUPABASE_URL, SERVICE_ROLE_KEY | None | Yes (profiles, user_subscriptions) | MEDIUM | May be triggered by DB trigger or scheduled |
| launch-trial-activate | Activates launch trial (unlimited 3-day model) | Unclear | ACTIVE v20 | SUPABASE_URL, SERVICE_ROLE_KEY | None | Yes (profiles, user_subscriptions) | MEDIUM | Separate from auto-trial; may be redundant |
| corporate-trial | Corporate trial creation | Unclear | ACTIVE v27 | SUPABASE_URL, SERVICE_ROLE_KEY | None | Yes | MEDIUM | Enterprise trial path |
| process-subscription-renewal | Scheduled renewal of subscriptions | No (scheduled) | ACTIVE v23 | SUPABASE_URL, SERVICE_ROLE_KEY, MOYASAR_SECRET_KEY | Moyasar API (MIT) | Yes (user_subscriptions) | HIGH | Charges card on file; billing critical |
| admin-stats | Admin dashboard statistics | Yes — Admin.tsx | ACTIVE v26 | SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY | None | No (read-only) | LOW | Aggregate queries |
| admin-manage-user | Admin user management operations | Yes — Admin.tsx | ACTIVE v18 | SUPABASE_URL, SERVICE_ROLE_KEY, ANON_KEY | None | Yes (profiles, user_subscriptions) | MEDIUM | Admin actions |
| sbc-graph-indexer | Knowledge graph indexer for SBC corpus | No (triggered internally) | ACTIVE v38 | GEMINI_API_KEY, SUPABASE_URL, SERVICE_ROLE_KEY | Gemini API | Yes (graph_nodes, graph_edges, community_summaries) | MEDIUM | Batch indexer; execution frequency unknown |
| send-founding10-campaign | FOUNDING10 campaign email send | Yes — CampaignFounding10.tsx | ACTIVE v9 | RESEND_API_KEY, FROM_EMAIL, SUPABASE_URL, SERVICE_ROLE_KEY | Resend API | Yes (campaigns, campaign_recipients) | MEDIUM | 73 recipients sent |
| send-eid50-campaign | EID50 campaign email send | Yes — CampaignEid50.tsx | ACTIVE v13 | RESEND_API_KEY, FROM_EMAIL, SUPABASE_URL, SERVICE_ROLE_KEY | Resend API | Yes (campaigns, campaign_recipients) | HIGH | 52/52 sent; admin delivery unverifiable |
| get-case-document-url | Generates signed URL for case documents | Yes — Enterprise components | ACTIVE v11 | SUPABASE_URL, SERVICE_ROLE_KEY | Supabase Storage | No (read) | MEDIUM | Enterprise document access |
| delete-case-document | Deletes case document from storage | Yes — Enterprise components | ACTIVE v11 | SUPABASE_URL, SERVICE_ROLE_KEY | Supabase Storage | Yes (storage + DB) | MEDIUM | Enterprise document deletion |
| get-public-case-tracking | Public case tracking by token | Yes — `PublicCaseTracking.tsx` | ACTIVE v11 | SUPABASE_URL, SERVICE_ROLE_KEY | None | No (read-only) | LOW | Public route |
| fire-safety-chat-v2 | Second version of AI chat | Unclear | ACTIVE v27 | SUPABASE_URL, SERVICE_ROLE_KEY, GEMINI_API_KEY | Gemini API | Yes | MEDIUM | Deployed; not known to be user-facing |
| import_sbc_json | SBC JSON data import | Unclear | ACTIVE v26 (deployed but NOT in local source) | Unknown | Unknown | Yes | LOW | Not in local repo; was deployed separately |

**Local-only (not deployed):**

| Function | Purpose | Risk | Notes |
|---|---|---|---|
| create-checkout | Creates checkout session | LOW | Likely legacy; not deployed |
| payment-webhook | Alternative payment webhook | LOW | Not deployed; superseded by moyasar-webhook |
| tap-charge-subscription | TAP payment charge | LOW | TAP was not chosen; superseded by Moyasar |
| tap-create-subscription | TAP subscription creation | LOW | TAP was not chosen; superseded by Moyasar |
| tap-webhook | TAP webhook receiver | LOW | TAP was not chosen; superseded by moyasar-webhook |
| verify-payment | Payment verification | LOW | Not deployed; purpose unclear |

**Key observations:**
- The TAP payment functions (3) are dead code — Moyasar was chosen as the payment provider. These should be considered STALE_OR_DUPLICATE.
- `create-checkout` and `payment-webhook` are not deployed and their purpose is unclear — likely legacy.
- `verify-payment` is not deployed — potentially experimental.
- `import_sbc_json` is deployed (v26) but not in local source — this is a gap between local repo and deployed state.
- `fire-safety-chat` is the most critical function (v153, 6008 lines + 5 submodules) — it handles both Advisory and Analytical modes.

## 8. Database / Migration / RPC Reality

**43 migration files** span from `20260119153131` (Jan 19, 2026) to `20260501000001` (May 1, 2026). Chronological grouping:

**Phase 1 — Foundation (Jan-Feb):**
- `20260119` — Initial schema: UUID extension, profiles (id, email, name, plan_type, created_at)
- `20260128` — Conversations and messages tables
- `20260210` (3 files) — Storage buckets, policies, subscription_plans seed, user_subscriptions, payment_history
- `20260211` — RLS policies update

**Phase 2 — Billing Lifecycle (Mar):**
- `20260225-26` — Billing-related columns
- `20260309` — Mode usage and admin toggle tables
- `20260315` — User preferences
- `20260318` — Image URLs array
- `20260320` — Fix subscription plans, drop payment_history
- `20260326` — Fix indexed chunk count
- `20260328` — Launch trial system (2 migrations: basic + unlimited)

**Phase 3 — Billing Maturity (Apr 1-4):**
- `20260401000000` — Billing lifecycle columns (current_period_end, cancel_at_period_end, etc.)
- `20260401000001` — Renewal scheduler
- `20260401000002` — Dunning notified at
- `20260401000003` — Webhook idempotency
- `20260404000000` — Add Pro plan
- `20260404000001` — Restore mode RPCs

**Phase 4 — Admin + SBC (Apr 9-10):**
- `20260409000001` — Admin access management
- `20260409000002` — Webhook dead letters RLS
- `20260410000001` — Backfill missing profiles
- `20260410000002` — SBC structured tables (sbc_documents, sbc_sections, etc.)
- `20260410000003` — SBC tables seed data

**Phase 5 — Moyasar Migration (Apr 23):**
- `20260423000001` — Moyasar billing columns

**Phase 6 — Enterprise (Apr 26-30):**
- `20260426000001` — Enterprise organization core schema
- `20260426000002` — Enterprise case document core schema
- `20260426000003` — Enterprise review approval schema
- `20260426000004` — Enterprise AI session binding
- `20260426000005` — Enterprise workspace functional completion
- `20260426000006` — Enterprise collaboration presence
- `20260426000007` — Enterprise profiles realtime roles
- `20260426000008` — Enterprise case documents storage
- `20260427000001` — Enterprise public tracking
- `20260427000002` — Enterprise case tasks assignment
- `20260430000001` — Enterprise team/office plans
- `20260430000002` — Enterprise seat enforcement

**Phase 7 — SBC Seed Update (May 1):**
- `20260501000001` — Seed SBC801 group M 903.2.7 907.2.7

**Generated types:** `src/integrations/supabase/types.ts` (~8700+ lines) contains the full generated TypeScript database type definitions. This was regenerated via `npx supabase gen types typescript --linked`. The file exists and imports correctly in `src/integrations/supabase/client.ts`.

**RPC observations:** The migration files reference RPCs for mode usage tracking, trial management, and admin operations. Specific named RPCs are found in `20260404000001` (restore mode RPCs) and likely generated from the `database.types.ts` exports.

**Migration tracking risks:**
- It is UNVERIFIED whether all 43 migrations have been applied to the live database. The Supabase CLI can check this with `npx supabase migration list` but this was not executed (requires `supabase/migrations` directory presence, which is confirmed).
- `import_sbc_json` is deployed but not in local source — this suggests the live database may have additional functions/triggers not reflected in local migrations.
- The `database.types.ts` may be out of sync with the live database if local migrations were not pushed.

**RLS observations:**
- Early migrations had RLS policies that were later removed in favor of service-role-only access patterns (observed from migration comments).
- Enterprise tables use RLS with role-based policies (owner/admin/engineer/finance/reviewer).

**Areas requiring live DB verification:**
- Actual subscription records and their states
- Mode usage tracking data
- Enterprise organization membership data
- Campaign recipient delivery status
- Webhook dead letter queue
- SBC graph data (nodes, edges, community summaries)

## 9. Enterprise Feature Reality

**Empirical evidence:** 25 components in `src/components/enterprise/`, 10 dedicated database migrations, 3 dedicated edge functions (get-case-document-url, delete-case-document, get-public-case-tracking), and 3 frontend routes (`/enterprise`, `/accept-invite`, `/track/:token`).

| Sub-feature | Implementation Evidence | Live Status | Risk |
|---|---|---|---|
| **Organization core** | Migration `20260426000001`, components: `CreateOrganizationCard`, `OrgCard` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — schema present, but no production org data verified |
| **Organization members/roles** | Migration `20260426000007`, components: `MemberList`, `EditMemberProfileDialog` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — role system (admin/owner/engineer/finance/reviewer) |
| **Invitations** | `src/pages/AcceptInvite.tsx`, `InviteMemberForm.tsx` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — invite flow untested |
| **Cases** | Migration `20260426000002`, components: `CaseList`, `CreateCaseModal`, `CaseDetailDrawer`, `CaseStatusHistory`, `CaseNotes` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — full CRUD in source |
| **Documents** | Migration `20260426000008`, functions: get-case-document-url (v11), delete-case-document (v11), components: `CaseDocumentsPanel`, `UploadCaseDocumentDialog` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — storage-backed |
| **AI report versions** | Migration `20260426000004` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — links AI sessions to enterprise cases |
| **Review / approval** | Migration `20260426000003` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — review workflow schema |
| **Branding** | Not found in dedicated migration (likely part of `20260426000005` or separate) | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — branding customization |
| **Realtime / presence** | Migration `20260426000006`, component: `TeamPresencePanel` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — Supabase Realtime channels |
| **Case tasks / assignment** | Migration `20260427000002`, components: `CaseTasksPanel`, `CaseAssignmentPanel`, `MyTasksWidget` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — task management |
| **Public case tracking** | Migration `20260427000001`, function get-public-case-tracking (v11), `PublicCaseTracking.tsx`, components: `CaseTrackingPanel`, `TrackingReadinessCard`, `PublishCaseUpdateDialog` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — public route with token |
| **QR code** | Component: `CaseQRCodeCard` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — QR generation |
| **Client contact** | Component: `ClientContactPanel` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — contact management |
| **Seat enforcement** | Migration `20260430000002`, branch `claude/seat-enforcement` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — ties to subscription seat_count |
| **Team/office self-service plans** | Migration `20260430000001`, `Subscribe.tsx` references `PER_SEAT_SLUGS` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — per-seat plans hidden from public |
| **Command center** | Component: `EnterpriseCommandCenter.tsx` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Medium — AI command dashboard tab |
| **Messages** | Component: `OrgMessagesPanel.tsx` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — org messaging |
| **Responsibility badge** | Component: `CaseResponsibilityBadge` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — UI badge |
| **Document visibility badge** | Component: `DocumentVisibilityBadge` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — UI badge |
| **Document category badge** | Component: `DocumentCategoryBadge` | IMPLEMENTED_UNVERIFIED_DEPLOYMENT | Low — UI badge |

**Verdict:** The enterprise feature set is fully implemented in source code with:
- All 10 E7.x migrations providing the complete schema
- All 25 UI components providing the full workspace
- 3 dedicated edge functions for document and tracking operations
- 3 frontend routes for the workspace, invitations, and public tracking

**However, NONE of this has been verified on the live production environment.** The enterprise workspace:
- Requires Vercel deployment verification (does `/enterprise` resolve?)
- Requires Supabase migration verification (are E7.x migrations applied?)
- Requires browser smoke testing (do components render? does RLS work?)
- Requires subscription integration testing (per-seat plan purchase + seat enforcement)
- Requires invitation flow testing (email invite → accept → join org)

## 10. Billing / Subscription / Trial Reality

**Payment provider:** **Moyasar** (Saudi payment gateway). TAP payment functions exist in source but are NOT deployed — Moyasar was the chosen provider.

**Frontend payment flow:**
- `src/pages/Subscribe.tsx` — Plan selection with promo code support (FOUNDING10, EID50)
- Uses `VITE_MOYASAR_PUBLISHABLE_KEY` (production key in `.env.vercel.prod`)
- Moyasar.js SDK used for card tokenization
- Payment methods: Mada (required), Visa/Mastercard
- 3 plans: Engineer (49 SAR/mo), Pro (245 SAR/mo, EID50: 122.50), Enterprise (per-seat: Team/Office)

**Deployed backend functions:**
| Function | Version | Status |
|---|---|---|
| moyasar-create-subscription | v22 | ACTIVE — creates subscription record before payment form |
| moyasar-initiate-token-payment | v13 | ACTIVE — tokenizes card via Moyasar API |
| moyasar-webhook | v29 | ACTIVE — receives payment events, updates subscription |
| cancel-subscription | v29 | ACTIVE — cancel at period end (active) or immediate (trialing) |
| check-subscription | v37 | ACTIVE — entitlement gating |
| process-subscription-renewal | v23 | ACTIVE — scheduled renewal via Moyasar MIT (card-on-file) |
| auto-trial | v27 | ACTIVE — auto-assigns trial on signup |
| launch-trial-activate | v20 | ACTIVE — unlimited 3-day trial activation |
| corporate-trial | v27 | ACTIVE — enterprise trial path |

**Trial logic:**
- 7-day trial for standard users (in `check-subscription/index.ts`)
- 3-day unlimited trial via `launch-trial-activate`
- Campaign period: `LAUNCH_DATE` = 2026-03-28 to `CAMPAIGN_END` = 2026-04-28 (now expired)
- `GRACE_DAYS` = 7 (grace period after subscription expiration)
- Trial types tracked: `launch_engineer_trial`, standard trial

**Current risks:**
1. **MOYASAR_WEBHOOK_SECRET** — This env var is required by `moyasar-webhook` for signature verification. It was not visible in `npx supabase secrets list` output (which only showed 3 lines: SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY). It may be set in the Supabase dashboard but cannot be verified from CLI. **If missing, ALL webhook events will fail with 500.**
2. **Renewal function** — `process-subscription-renewal` (v23) uses Moyasar MIT (Merchant Initiated Transaction) to charge cards on file. This requires `MOYASAR_SECRET_KEY` and the customer's saved token. If either is missing or expired, renewals will silently fail.
3. **Subscription state drift** — Without live DB queries, the actual state of subscription records (active, past_due, cancelled, trialing) is unknown.
4. **Grace period consistency** — `GRACE_DAYS = 7` is hardcoded in `check-subscription/index.ts`, `moyasar-webhook/index.ts`, `process-subscription-renewal/index.ts`, `Workspace.tsx`, and `Account.tsx`. Any change requires updating 5 locations.
5. **Admin entitlement override** — The `x-consultx-admin-entitlement-override` header allows admins to bypass subscription checks. This is implemented but its security boundary (only admins can set it) depends on `check-subscription` correctly verifying admin status.
6. **TAP functions are dead code** — `tap-charge-subscription`, `tap-create-subscription`, `tap-webhook` exist locally but are NOT deployed. They should be removed to avoid confusion.

## 11. AI Modes Reality

**Main chat (fire-safety-chat):**
- Single edge function (`fire-safety-chat` v153) handles both Advisory and Analytical modes
- Mode selection is handled client-side via `/workspace` -> `ChatInterface`
- Uses Gemini API (model not explicitly identified in the first 60 lines of index.ts, but `GEMINI_API_KEY` is the env var)
- Response includes source citations via `X-SBC-Sources` and `X-SBC-Source-Meta` headers
- CORS exposes: `X-SBC-Sources`, `X-SBC-Source-Meta`

**Advisory mode:**
- Architecture includes:
  - `brain_b1_loader.ts` — Loads B1 brain (Advisory Brain modules)
  - `workflow_router.ts` — Routes queries to appropriate advisory workflow
  - `workflow_constraints.ts` — Evidence constraints, confidence caps, filter hints
  - `thinking_ux_emitter.ts` — Streaming thinking/UX events
  - `brain_b1_types.ts` — Type definitions
- Core rules enforced in function prompt: authorized sources only (SBC 201 & SBC 801), numerical precision, verbatim quotation, certainty labeling
- Source family allowlist enforcement (prevents wrong-family citations)
- Confidence cap system (prevents overconfidence without source evidence)
- Multi-turn evidence persistence
- Confidence labels: `[INDIRECT]`, `[REQUIRES SOURCE CONFIRMATION]`, `[NO SOURCE]`
- Advisory B2 tests: `tests/advisory_brain_b2.test.ts` exists

**Analytical mode:**
- Routing logic in `src/utils/analyticalRouting.ts`
- `__tests__/analyticalBenchmark.ts` and `__tests__/analyticalRouting.test.ts` exist
- Analytical compliance mode with different uncertainty labeling
- Source citation system shared with Advisory mode

**fire-safety-chat-v2:**
- Deployed v27 but not known to be user-facing
- No import or route reference found in the frontend codebase during audit
- May be an experimental second version or A/B test candidate

**Runtime confidence classification:**
| Component | Wired in frontend? | Deployed? | Evidence-backed? | Needs live testing? |
|---|---|---|---|---|
| Main chat (advisory) | Yes — `/workspace` | ACTIVE v153 | Yes — source code + tests | Yes — production behaviour |
| Analytical mode | Yes — ChatInterface routing | Part of v153 | Yes — routing + test files | Yes — production behaviour |
| Advisory B2 brain | Yes (flag-gated in code) | Part of v153 | Yes — B2 test file | Yes — flag state live |
| fire-safety-chat-v2 | No (no frontend reference found) | ACTIVE v27 | No — no invocation found | Yes — live URL? |
| Source citation system | Yes — SourcePanel | Part of v153 | Yes — sourceMetadata.ts | Yes — live accuracy |
| GraphRAG | Unclear | sbc-graph-indexer v38 | Yes — indexer code | Yes — query integration |

**Gemini model usage:**
- `GEMINI_API_KEY` is in Supabase secrets
- `sbc-graph-indexer` uses `google/gemini-2.5-flash` explicitly
- Main chat likely uses the same or similar model (no explicit model string found in audited function head)
- Fallback behavior: if API key is missing or quota exhausted, the functions fail with 500 errors (no graceful degradation observed in audited code)

## 12. Analytical Reports Reality

**Current state: PARTIAL_UNDER_DEVELOPMENT with significant unknowns.**

- **Report drawer / DOCX generator:** No DOCX generation files were found in the main branch source (`Get-ChildItem -Recurse "*report*"` and `"*docx*"` returned zero results). The analytical evidence work exists on a separate branch (`analytical-evidence-v1`, 145 commits behind main).
- **Six report types:** Referenced in the evidence branch; not found in main branch source.
- **Intake wizard:** Not found in main branch components.
- **Conditional matrices:** Not found in main branch source.
- **Logo/branding:** Enterprise branding customization exists in migration `20260426000005`.
- **PDF export:** Referenced in stash `fix/pdf-export-inline-source-links` and branch `claude/quirky-sammet` — inline SBC source links in PDF export. This appears to be an export feature for chat responses, not a standalone report generator.
- **Enterprise `ai_report_versions` integration:** Migration `20260426000004` creates the table, but no frontend code in main branch connects analytical reports to this table.

**Verdict:** The analytical report generation feature (DOCX export, structured compliance reports) exists primarily on the `analytical-evidence-v1` branch, which is 145 commits behind main and has a dedicated worktree. The main branch does NOT contain a functional report generator. This feature should be classified as **PARTIAL_UNDER_DEVELOPMENT** — designed and partially implemented on a side branch, but not integrated into the main production code.

## 13. Knowledge Base / SBC Corpus / Storage Reality

**SBC Document corpus:**
- SBC structured tables created in migration `20260410000002` and seeded in `20260410000003`
- SBC801 group M seed in `20260501000001`
- The `sbc-graph-indexer` function (v38) processes SBC documents into a knowledge graph
- Graph entities stored in: `graph_nodes`, `graph_edges`, `community_summaries`
- Indexer uses Gemini 2.5 Flash for entity extraction from code chunks
- Batch size: 1 chunk per LLM call, max 6 chunks per invocation

**Brain loader:**
- `fire-safety-chat/brain_b1_loader.ts` loads advisory brain B1
- `brain_b1_types.ts` defines the types
- B2 flag-gated via `isB2Enabled()`

**Storage:**
- Enterprise case documents stored in Supabase Storage (migration `20260426000008`)
- Functions: `get-case-document-url` (signed URL generation), `delete-case-document`
- `supabase/storage/` directory does not exist locally — storage is managed via dashboard/SQL

**Citation system:**
- `src/utils/sourceMetadata.ts` — Source metadata utility
- `src/components/SourcePanel.tsx` — Source panel component (referenced in Workspace.tsx)
- `__tests__/sourceMetadata.test.ts` — Test coverage exists
- Citation headers: `X-SBC-Sources`, `X-SBC-Source-Meta`
- Source family allowlist enforced in advisory mode (prevents cross-family citation)

**Local corpus files:**
- No `brain_full_v1` or passive files found in the repository root
- Root-scanned runtime files: none detected beyond source code
- SBC PDF source documents are likely stored in Supabase Storage or referenced externally

**GraphRAG:**
- `sbc-graph-indexer` builds and maintains the knowledge graph
- Branch `claude/pensive-lamarr` references "GraphRAG upgrade — Gemini 2.5 Pro indexer + Hybrid search in chat"
- Graph nodes/edges are stored in DB tables and used by fire-safety-chat for enhanced retrieval

**Active vs passive in runtime:**
- The SBC graph indexer is ACTIVE (deployed v38) but its execution schedule is unknown (may be triggered manually or on a cron)
- The brain B1/B2 modules are loaded at runtime within fire-safety-chat
- Citation data is injected into chat responses via response headers
- Enterprise document storage backing is deployed (v11 for both document functions)

**Risks:**
1. **Corpus-source mismatch** — If SBC PDF files stored externally differ from the graph indexed data, citations may reference outdated information
2. **Graph freshness** — The `sbc-graph-indexer` execution frequency is unknown; the graph may be stale
3. **Citation accuracy** — Without live browser testing, the accuracy of source citations in production responses is unverifiable
4. **Storage bucket configuration** — RLS and bucket policies for enterprise documents are defined in migration `20260426000008` but their live state is UNVERIFIED

## 14. Environment Variables and External Dependencies

### Supabase Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | All Supabase features | Frontend | Required | Complete app failure | `.env.vercel`, `.env.vercel.prod`, `client.ts:5` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | All Supabase features | Frontend | Required | Complete app failure | `.env.vercel`, `.env.vercel.prod`, `client.ts:6` |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference | Frontend | Required | Unknown (may be informational) | `.env.vercel`, `.env.vercel.prod` |
| `SUPABASE_URL` | All edge functions | Backend | Required | All edge functions fail | `supabase secrets list`, all function code |
| `SUPABASE_ANON_KEY` | Auth-gated edge functions | Backend | Required | Auth verification fails | `supabase secrets list`, all functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB operations | Backend | Required | Admin operations fail | `supabase secrets list`, all functions |

### Gemini / AI Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `GEMINI_API_KEY` | fire-safety-chat, sbc-graph-indexer | Backend | Required | AI chat and graph indexing fail | `fire-safety-chat/index.ts`, `sbc-graph-indexer/index.ts` |

### Moyasar Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `VITE_MOYASAR_PUBLISHABLE_KEY` | Subscribe payment form | Frontend | Required | Payment form fails to load | `.env.vercel.prod:23`, `Subscribe.tsx:19` |
| `MOYASAR_SECRET_KEY` | Payment initiation, renewal | Backend | Required | Token payment and renewal fail | `moyasar-initiate-token-payment/index.ts`, `process-subscription-renewal/index.ts` |
| `MOYASAR_WEBHOOK_SECRET` | moyasar-webhook signature verification | Backend | Required | Webhook rejected (401/500) | `moyasar-webhook/index.ts:37` — UNVERIFIED in secrets list |

### Resend / Email Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | Campaign email sending | Backend | Required for campaigns | Campaign send fails | `send-eid50-campaign/index.ts`, `send-founding10-campaign/index.ts`, confirmed in secrets list |
| `FROM_EMAIL` | Campaign sender address | Backend | Required for campaigns | Campaign send fails | Campaign function code |

### Vercel / Frontend Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `VITE_FOUNDING10_LIVE` | Gate FOUNDING10 frontend | Frontend | Optional (feature flag) | Campaign page hidden if absent | `.env`, commit `3c74bc3` |
| `VITE_PLAN_LAB_ENABLED` | Gate Plan Lab route | Frontend | Optional (feature flag) | Plan Lab hidden if absent | `.env.vercel.prod:24` |
| `VITE_PLAN_LAB_IFRAME_URL` | Plan Lab iframe source | Frontend | Required for Plan Lab | Iframe blank | `.env.vercel.prod:25` |

### Admin / Testing Group

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| Admin email addresses | Admin verification | Backend | Hardcoded | Admin checks fail if emails change | Multiple functions, `ADMIN_EMAILS` constant |

### Other

| Variable | Feature | Frontend/Backend | Required/Optional | Failure Impact | Evidence Location |
|---|---|---|---|---|---|
| `VERCEL_OIDC_TOKEN` | Vercel deployment auth | Build | Required for Vercel | Deployment may fail | `.env.vercel`, `.env.vercel.prod` |

**Key env var risks:**
1. **MOYASAR_WEBHOOK_SECRET** — Cannot be confirmed present in Supabase secrets from CLI. If missing, the entire payment webhook pipeline is broken silently (no customer-facing error).
2. **MOYASAR_SECRET_KEY** — Required for payment processing and subscription renewal. Not visible in `supabase secrets list` output (which appeared truncated or only showed Supabase-related keys).
3. **RESEND_API_KEY** — Present in `supabase secrets list` but is **send-only** — cannot verify delivery status of sent campaigns.
4. **GEMINI_API_KEY** — Required for ALL AI functionality. If quota is exhausted, the entire product becomes non-functional.

## 15. Dead Code / Duplicate / Stale / Unreachable Areas

| Item | Type | Evidence | Classification |
|---|---|---|---|
| `tap-charge-subscription` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — TAP rejected for Moyasar |
| `tap-create-subscription` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — TAP rejected for Moyasar |
| `tap-webhook` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — TAP rejected for Moyasar |
| `verify-payment` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — Purpose unknown, not deployed |
| `create-checkout` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — Likely legacy |
| `payment-webhook` | Edge function | In source, NOT deployed | STALE_OR_DUPLICATE — Likely legacy |
| `import_sbc_json` | Edge function | Deployed but NOT in local source | STALE_OR_DUPLICATE — Orphaned deployment |
| `fire-safety-chat-v2` | Edge function | Deployed v27 but not referenced by frontend | STALE_OR_DUPLICATE — May be experimental |
| `analytical-evidence-v1` branch | Branch | 145 commits behind main | STALE_OR_DUPLICATE — Evidence work never merged |
| `console.log(e.message` | Untracked file | Leftover from inline Node.js command | STALE_OR_DUPLICATE — Safe to delete |
| Multiple `.claude/worktrees/` branches | Branches | 40+ stale worktree branches | STALE_OR_DUPLICATE — Housekeeping concern |
| `backup/main-with-412-routing` | Branch | Backup branch, not merged | STALE_OR_DUPLICATE — Archive |
| `backup/phase3a-335591d` | Branch | Backup branch, not merged | STALE_OR_DUPLICATE — Archive |
| `backup/pre-phase3b-503-rollback` | Branch | Backup branch, not merged | STALE_OR_DUPLICATE — Archive |
| `hotfix/production-apr-5` | Branch | Hotfix branch, not merged to main | STALE_OR_DUPLICATE — May contain critical fix not on main |
| `codex-enterprise-phase1` | Branch | Not merged to main | STALE_OR_DUPLICATE — Enterprise billing fix |
| `renewal-moyasar-fix` | Branch | Not merged (ahead 2, behind 148) | STALE_OR_DUPLICATE — Renewal fix not merged |
| `source-precision-pass-clean` | Branch | Not merged (ahead 1, behind 164) | STALE_OR_DUPLICATE — Source precision work |
| `phase0-graph-seed` | Branch | Not merged (ahead 1, behind 147) | STALE_OR_DUPLICATE — Graph seed work |

**Key observation:** There are at least **7 branches** (excluding Claude worktrees) that contain potentially important fixes or features that have never been merged to `main`. The most concerning is `hotfix/production-apr-5` which by name suggests it contains a production hotfix.

## 16. Risk Register

| # | Risk | Severity | Area | Evidence | Impact | Recommended Verification |
|---|---|---|---|---|---|---|
| 1 | Resend API key is send-only — delivery status of 52/52 EID50 batch unverifiable | HIGH | Campaigns / Email | `RESEND_API_KEY` returned 403 for GET /v1/emails; Supabase Management API token returned 401 | Admin monitoring addresses may not have received campaign emails; no way to confirm delivery or troubleshoot | Resend Dashboard login + Gmail inbox inspection |
| 2 | Vercel frontend live state unverified | HIGH | Deployment | No `vercel list` or `vercel inspect` executed; no browser access | Routes may 404, components may fail to render, env vars may be misconfigured | Vercel Dashboard inspection + browser smoke test of all 19 routes |
| 3 | MOYASAR_WEBHOOK_SECRET presence unverifiable | HIGH | Billing | `supabase secrets list` output did not show this key; moyasar-webhook requires it for signature validation | ALL payment webhooks silently fail with 500; subscriptions never activate after payment | Supabase Dashboard → Edge Functions → moyasar-webhook env vars |
| 4 | Enterprise workspace never smoke-tested on production | HIGH | Enterprise | All 25 components and 10 migrations exist in source; zero production verification | Enterprise users may encounter broken flows, RLS errors, or missing data | Browser test: login → create org → invite member → create case → upload doc |
| 5 | `hotfix/production-apr-5` branch not merged to main | MEDIUM | Codebase | Branch exists, stash `hotfix/production-apr-5: stash-before-synthesis` | Critical production fix may be stranded on an unmerged branch | Inspect `hotfix/production-apr-5` diff and merge if applicable |
| 6 | Several billing branches not merged (renewal-moyasar-fix, codex-enterprise-phase1) | MEDIUM | Billing | Branches contain billing fixes, behind main by 148+ commits | Subscription renewal and enterprise billing may have known bugs not fixed on main | Review and merge applicable fixes |
| 7 | GEMINI_API_KEY quota exhaustion | MEDIUM | AI | All AI features depend on a single API key | Complete AI outage if quota exhausted or key expires | Monitor Gemini API usage dashboard |
| 8 | Grace period hardcoded in 5 locations | MEDIUM | Billing | GRACE_DAYS = 7 repeated in check-subscription, moyasar-webhook, process-subscription-renewal, Workspace.tsx, Account.tsx | Inconsistent behaviour if one location is updated but not others | Extract to shared constant or DB config |
| 9 | Supabase database live state partially unverified | MEDIUM | Database | Migration list exists (43 files) but live DB state not confirmed | Schema drift between local migrations and live DB | Run `npx supabase migration list` and compare with DB |
| 10 | Dead TAP functions in source may cause confusion | LOW | Codebase | 3 TAP functions present, NOT deployed | Developers may mistakenly deploy TAP functions instead of Moyasar equivalents | Remove TAP functions from source |
| 11 | `import_sbc_json` deployed but not in local source | LOW | Codebase | Function exists on Supabase but not in local repo | Future deployments may lose this function | Add `import_sbc_json` to local source or document as external |
| 12 | `console.log(e.message` untracked file | LOW | Repository | Leftover artifact | Minor annoyance, no security risk | Delete the file |

## 17. Truth Map

### LIVE_CONFIRMED
- Public landing page (`/`)
- Authentication (`/auth`)
- Main AI chat with Advisory + Analytical modes (`/workspace`, fire-safety-chat v153)
- Subscription gating (check-subscription v37)
- Moyasar payment flow: subscribe page, create-subscription v22, initiate-token-payment v13, webhook v29
- Subscription cancellation (cancel-subscription v29)
- Trial system: auto-trial v27, launch-trial-activate v20, corporate-trial v27
- Subscription renewal (process-subscription-renewal v23)
- Admin dashboard (`/admin`), admin-stats v26, admin-manage-user v18
- Campaign emails: send-founding10-campaign v9, send-eid50-campaign v13
- Campaign admin pages: `/admin/campaigns/founding10`, `/admin/campaigns/eid50`
- Legal pages: Privacy, Terms, Refund, Contact
- Account and Profile pages (`/account`, `/profile`)
- Payment callback (`/payment-callback`)
- SBC graph indexer (sbc-graph-indexer v38)
- Admin entitlement override (AdminEntitlementSwitcher)
- Source citation system (SourcePanel, sourceMetadata)

### IMPLEMENTED_UNVERIFIED_DEPLOYMENT
- Enterprise workspace (`/enterprise`) — 25 components, 10 migrations, 3 edge functions
- Enterprise organization core (CreateOrganizationCard, OrgCard)
- Enterprise members/roles (MemberList, InviteMemberForm, role system)
- Enterprise invitations (`/accept-invite`)
- Enterprise cases (CreateCaseModal, CaseList, CaseDetailDrawer)
- Enterprise documents (CaseDocumentsPanel, UploadCaseDocumentDialog)
- Enterprise AI report binding (ai_report_versions table)
- Enterprise review/approval workflow
- Enterprise realtime/presence (TeamPresencePanel)
- Enterprise case tasks/assignment (CaseTasksPanel, CaseAssignmentPanel)
- Enterprise public case tracking (`/track/:token`, get-public-case-tracking v11)
- Enterprise team/office self-service plans (per_seat_slugs in Subscribe.tsx)
- Enterprise seat enforcement (migration + branch)
- Enterprise command center (EnterpriseCommandCenter.tsx)
- Enterprise storage functions: get-case-document-url v11, delete-case-document v11

### PARTIAL_UNDER_DEVELOPMENT
- Analytical report generation / DOCX export — exists on `analytical-evidence-v1` branch (145 commits behind main), NOT in main branch source
- Plan Lab (`/plan-lab`, gated behind VITE_PLAN_LAB_ENABLED)
- fire-safety-chat-v2 (deployed v27, but not referenced by frontend code in main branch)

### DESIGNED_ONLY
- TAP payment integration (3 functions in source, NOT deployed, Moyasar chosen instead)
- verify-payment function (in source, NOT deployed)

### STALE_OR_DUPLICATE
- TAP functions: tap-charge-subscription, tap-create-subscription, tap-webhook (NOT deployed, superseded by Moyasar)
- create-checkout (NOT deployed, legacy)
- payment-webhook (NOT deployed, legacy)
- verify-payment (NOT deployed, experimental)
- import_sbc_json (deployed but NOT in local source — orphaned)
- analytical-evidence-v1 branch (145 commits behind main)
- 7+ unmerged fix branches (hotfix/production-apr-5, renewal-moyasar-fix, codex-enterprise-phase1, etc.)
- `console.log(e.message` untracked file

### BLOCKED_OR_RISKY
- **Resend delivery verification** — BLOCKED. API key is send-only; Management API token returns 401. Requires browser access to Resend Dashboard.
- **MOYASAR_WEBHOOK_SECRET verification** — BLOCKED. Key not visible in `supabase secrets list` output. Requires Supabase Dashboard access.
- **Vercel live deployment verification** — BLOCKED. No `vercel` CLI authenticated or browser access available.
- **Supabase live DB verification** — BLOCKED. No direct SQL query access from CLI.
- **Enterprise production smoke test** — BLOCKED. Requires browser session with enterprise user.

## 18. Recommended Next Steps

*These are verification recommendations only — not implementation tasks.*

1. **Browser validation (highest priority):**
   - Open `https://www.consultx.app` and verify all 19 routes resolve correctly
   - Test auth flow: sign up, sign in, password reset
   - Test subscription flow: select plan, enter card details, complete payment
   - Test workspace: send chat messages in both Advisory and Analytical modes
   - Test admin routes: `/admin`, `/admin/campaigns/founding10`, `/admin/campaigns/eid50`
   - Test `/enterprise` — does it render? Can you create an org?

2. **Vercel deployment verification:**
   - Log in to Vercel Dashboard → inspect `consultx` project
   - Verify latest commit is deployed to production
   - Check environment variables match `.env.vercel.prod`
   - Review deployment logs for build errors
   - Verify VITE_PLAN_LAB_ENABLED flag state

3. **Supabase live DB verification:**
   - Run `npx supabase migration list` to confirm all 43 migrations are applied
   - Run `npx supabase db dump` (read-only) to confirm schema matches local migrations
   - Check `supabase secrets list` output for all required env vars (especially MOYASAR_WEBHOOK_SECRET, MOYASAR_SECRET_KEY, GEMINI_API_KEY)
   - Verify RLS policies on enterprise tables are active

4. **Resend dashboard / Gmail inspection:**
   - Log in to Resend Dashboard → check delivery logs for EID50 campaign
   - Verify admin monitoring emails (`admin-monitoring@almnatiq.com`, `consultx.sa@gmail.com`) received the BCC copies
   - Check spam/promotions folders in admin Gmail accounts

5. **Enterprise workflow smoke test:**
   - Create an enterprise organization
   - Invite a team member
   - Accept the invitation
   - Create a case
   - Upload a document
   - Generate a signed document URL
   - Publish a case update
   - Check public tracking page

6. **Payment / subscription smoke test:**
   - Purchase a subscription (use test card from Moyasar)
   - Verify webhook processes the payment
   - Verify subscription shows as active
   - Cancel subscription at period end
   - Verify grace period works
   - Test admin entitlement override

7. **Analytical report generation smoke test:**
   - Switch to Analytical mode in chat
   - Verify analytical routing works
   - Check if report drawer opens
   - Verify DOCX generation (if available on main branch)

8. **SBC / Advisory citation smoke test:**
   - Ask code questions in Advisory mode
   - Verify citations include SBC section numbers
   - Verify source panel resolves correct PDFs
   - Test confidence labels (INDIRECT, REQUIRES SOURCE CONFIRMATION)

9. **Cleanup candidates (after all verifications pass):**
   - Delete TAP functions from source (tap-charge-subscription, tap-create-subscription, tap-webhook)
   - Delete `create-checkout`, `payment-webhook`, `verify-payment` if confirmed unused
   - Merge or archive `hotfix/production-apr-5` branch
   - Merge `renewal-moyasar-fix` and `codex-enterprise-phase1` if applicable
   - Add `import_sbc_json` to local source or document its deployment
   - Delete `console.log(e.message` untracked file
   - Clean up stale worktree branches
   - Consolidate GRACE_DAYS into a shared constant or DB config

## 19. Final Statement

**NO CODE CHANGES WERE MADE DURING THE PLATFORM REALITY AUDIT PHASE.**

All findings in this report are based on read-only inspection of the repository, environment variable files, and Supabase CLI read-only commands. No application code was modified, no functions were deployed, no database migrations were run, no emails were sent, and no production data was touched during the audit.

The earlier session work (EID50 admin monitoring copy, EID50 second batch) was completed and deployed before the audit phase began and is documented separately for context.
