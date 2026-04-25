# ConsultX Enterprise — Operating Model V1

**Status:** Draft V1 — provisional, subject to revision before billing implementation.
**Audience:** Internal product, engineering, and operations.
**Scope:** Defines the enterprise/institutional product layer for engineering consultancy offices. Excludes the existing individual subscription product, which remains untouched.
**Authoritative version:** This document is the canonical reference for Phases E1–E7. Implementation phases must align with this model or update the model first.

---

## 0. Purpose of This Document

This is the **operating model**, not the implementation plan. It defines:

- What ConsultX Enterprise is (and what it is not)
- The entities the system manages and how they relate
- The roles that act on those entities
- The membership and billing principles
- The case lifecycle
- The document model
- How AI outputs bind to enterprise work
- The phased roadmap from this document to a shipped product

No SQL, no edge function names, no UI wireframes. Implementation specifics live in their phase-specific design documents.

---

## 1. North Star

### English

> ConsultX Enterprise turns an engineering consultancy office into an AI-augmented fire and life safety review practice. A consultancy office subscribes as one organization, operates on Cases (معاملات), routes work through engineers and a head of department, attaches AI Advisory and Analytical outputs as evidence, and delivers reviewed deliverables to clients with a complete audit trail.

### Arabic — العربية

> منصة ConsultX للمؤسسات تحوّل مكتب الاستشارات الهندسية إلى ممارسة مراجعة سلامة من الحريق مدعومة بالذكاء الاصطناعي. يشترك المكتب الاستشاري ككيان واحد، ويعمل على المعاملات، ويوزّع العمل على المهندسين ورئيس القسم، ويُلحق مخرجات الوضع الاستشاري والوضع التحليلي كأدلة، ويُسلّم المخرجات المراجعة إلى العملاء مع سجل تدقيقي كامل.

### What this is NOT

- **Not** a generic team-billing add-on. Enterprise is a workflow product, billing is a consequence.
- **Not** a replacement for the individual subscription. Individual users continue with the existing Pro / Engineer plans, untouched.
- **Not** a public marketplace, contractor portal, or government submission system in V1.
- **Not** a project-management tool. Project grouping is deferred to a later version; V1 operates on Cases.

---

## 2. Core Operating Entity — Case / معاملة

The **Case** is the fundamental unit of work in ConsultX Enterprise. Every action in the system either creates, attaches to, transitions, approves, or closes a Case.

A Case represents one fire/life-safety review engagement for one client. It bundles:

- Client identity (or client reference)
- The drawing package under review
- All supporting documents (calculations, technical reports, internal notes)
- Linked AI Advisory and Analytical outputs
- Engineer review record
- Head of department approval record
- Delivered output package
- Full status history with actor and timestamp

**Why "Case" and not "Project":**
A consultancy office's daily operating vocabulary is the معاملة (transaction/case file). A project may span multiple cases over months; treating Project as the primary unit forces premature grouping and complicates billing-per-engagement metrics. Project grouping may be added later as a parent layer over Cases.

**Case identity:** Each case has a human-readable `case_number` (per organization) and a system UUID. Cases are owned by exactly one organization.

---

## 3. Entity Relationships

### Entity catalogue (V1)

| Entity | Purpose | Owner |
|--------|---------|-------|
| `organization` | The consultancy office, billing entity | Self (created by owner user) |
| `org_member` | Internal staff with role and seat | `organization` |
| `org_invitation` | Pending email invite with role and token | `organization` |
| `client` | External client of the consultancy (V1: stored as reference inside cases; full client table optional) | `organization` |
| `case` (معاملة) | Single fire/life-safety review engagement | `organization` |
| `drawing_package` | Logical grouping of architectural / life-safety / fire-alarm / fire-fighting drawings within a case | `case` |
| `case_document` | Any uploaded document (drawing, calculation, report, note, deliverable) | `case` |
| `case_ai_session` | A pinned link from a chat AI session to a case | `case` |
| `ai_report_version` | A frozen version of an Advisory or Analytical output, attached as evidence | `case_ai_session` or `case` |
| `case_review` | Engineer's recorded review of the case | `case` |
| `case_approval` | Head of Department's approval/return decision | `case_review` |
| `case_status_history` | Append-only timeline of status transitions and actors | `case` |
| `deliverable` | Final client-visible output package | `case` |

### Relationship graph (high-level)

```
organization
    ├── org_members (1..N)
    ├── org_invitations (0..N)
    ├── organization_subscription (0..1, billing — Phase E7)
    └── cases (0..N)
            ├── client_reference (1)
            ├── drawing_packages (1..N)
            │       └── drawings (1..N) [as case_documents with category=drawing*]
            ├── case_documents (0..N)
            ├── case_ai_sessions (0..N)
            │       └── ai_report_versions (0..N)
            ├── case_reviews (0..N — engineer reviews)
            │       └── case_approvals (0..N — head decisions on each review)
            ├── case_status_history (1..N)
            └── deliverable (0..1 final package)
```

### Cardinality rules (V1)

- One user may belong to **at most one organization** in V1. Multi-org membership is deferred.
- One Case has **exactly one** owning organization.
- One Case has **exactly one** `assigned_engineer` at a time (reassignment recorded in history).
- One Case has **exactly one** `head_reviewer` at a time (typically the head of department).
- One Case may have **multiple** AI sessions and multiple AI report versions attached.
- One Case has **at most one** active deliverable; previous deliverables are archived as versions.

---

## 4. Role Matrix

### Internal roles

| Role | Arabic | Purpose | Bills as Seat? |
|------|--------|---------|---------------|
| `owner` | مالك المؤسسة | Organization founder, billing owner, ultimate authority | ✅ Yes — counts as 1 seat |
| `admin` | مسؤول إداري | Manages members, invitations, organization settings | ✅ Yes |
| `head_of_department` | رئيس القسم | Reviews and approves engineer outputs before delivery | ✅ Yes |
| `engineer` | مهندس | Performs case work, runs AI sessions, submits reviews | ✅ Yes |
| `finance_officer` | مسؤول مالي | Views billing, invoices, plan changes; no case access by default | ✅ Yes |

### External roles

| Role | Arabic | Purpose | Bills as Seat? |
|------|--------|---------|---------------|
| `client` | عميل | Receives deliverables, uploads requested documents (Phase E8) | ❌ No (V1) |

### Role permissions matrix (V1)

| Action | owner | admin | head_of_department | engineer | finance_officer | client |
|--------|:-----:|:-----:|:------------------:|:--------:|:---------------:|:------:|
| Manage organization settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite / remove members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Change member roles | ✅ | ✅¹ | ❌ | ❌ | ❌ | ❌ |
| View billing / invoices | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Update payment method | ✅ | ❌ | ❌ | ❌ | ✅² | ❌ |
| Cancel subscription | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create case | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Assign engineer to case | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Run AI Advisory / Analytical session bound to case | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Attach AI report version as evidence | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Submit engineer review | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve / return case | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Mark case delivered | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View internal notes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View final deliverable | ✅ | ✅ | ✅ | ✅ | ❌ | ✅³ |

¹ admin cannot promote anyone to `owner`; ownership transfer is owner-only.
² finance_officer can update the payment method but cannot cancel.
³ Only after case status reaches `delivered_to_client`.

### Role invariants

- An organization always has **exactly one** `owner`. Ownership transfer is a single transaction (old owner becomes admin, new owner promoted).
- `head_of_department` is a role, not a unique position — an organization may have multiple heads of department.
- `engineer` is the default role for newly accepted invitations unless otherwise specified.
- `finance_officer` has **no case visibility by default** — this is a deliberate separation of duties for compliance.
- `client` accounts (Phase E8) are scoped to one organization and one or more cases; they never see internal organization metadata.

---

## 5. Membership and Invitation Model

### Joining an organization

A user becomes an `org_member` exactly one of three ways:

1. **Founding** — The user creates a new organization. They are inserted as `owner` with `status='active'`.
2. **Accepting an invitation** — The user accepts an `org_invitation` token. A row is inserted with the invited role and `status='active'`.
3. **Direct add by owner/admin** (deferred to V2) — for users who already exist in the system.

### Invitation flow

```
[owner/admin] creates invitation
         ↓
   org_invitations row (status='pending', token, expires_at = now + 14 days)
         ↓
   email sent to invitee with token-bearing link
         ↓
   [invitee] signs up or signs in, accepts invitation
         ↓
   token validated, not expired, not revoked
         ↓
   org_members row created (status='active', joined_at=now)
   org_invitations row updated (status='accepted', accepted_at=now)
```

### Invitation rules

- One pending invitation per `(org_id, email)` at any time. New invitations to a pending email revoke the old one.
- Token is cryptographically random, single-use, opaque (no embedded data).
- Default expiry: 14 days. Revocable by owner/admin at any time before acceptance.
- Pending invitations **do not consume a billing seat**.
- Accepting an invitation when already a member of another organization is **rejected in V1** (one org per user).

### Member lifecycle states

```
invited (only via direct add path; invitations themselves are in org_invitations)
    ↓
active ──────────┐
    ↓            ↓
suspended    removed
    ↓            ↓
active       (terminal, soft delete via removed_at)
```

- `active` — counts as a billed seat
- `suspended` — temporary access revocation; **does not count** as a billed seat in V1
- `removed` — terminal; user loses all org access; **does not count** as a billed seat
- A removed member can be re-invited (creates a new `org_invitations` row)

---

## 6. Provisional Billing Model

> **Status:** Provisional. May change before Phase E7 (Enterprise Billing) implementation. This section defines the **principles**, not the implementation. Implementation lives in the Phase E7 plan.

### Pricing principle

- **399 SAR per active internal seat per month** (provisional, subject to commercial approval before E7 ships).
- Charged at the organization level. No per-user payment within an organization.
- Currency: SAR. Billed via Moyasar (same provider as individual subscriptions, separate billing pipeline).

### Seat count definition

> **active internal seat = `org_members` row where `status = 'active'` AND `role IN ('owner', 'admin', 'head_of_department', 'engineer', 'finance_officer')`**

Specifically:

| Member state | Counts as paid seat? |
|--------------|:--------------------:|
| Owner with `status='active'` | ✅ Yes |
| Active admin / head / engineer / finance_officer | ✅ Yes |
| Suspended member | ❌ No |
| Removed member | ❌ No |
| Pending invitation (`org_invitations.status='pending'`) | ❌ No |
| External `client` (Phase E8) | ❌ No (V1) |

### Trial

- **One-month free organization trial.** Starts at organization creation (`organizations.trial_start = now()`, `trial_end = now() + interval '1 month'`).
- During trial: no card required, full enterprise functionality.
- Trial expiry: organization transitions to `past_due` if no card on file, or auto-charges if a card was added during trial.

### Seat-count snapshot

- Seat count is **recomputed at the start of each billing period** (the moment of renewal charge).
- Mid-period changes (member added/removed) do **not** trigger immediate proration in V1. Proration may be added later.
- The seat count used for the charge is the count at **renewal time**, not the average across the period.

### What is NOT billed in V1

- Pending invitations.
- Suspended or removed members.
- External client accounts.
- AI usage volume (no per-message overage; usage limits enforced at session/case level later if needed).
- Storage of documents (subject to fair-use cap to be defined later).

### Independence from individual billing

Enterprise billing is a **completely separate pipeline** from individual subscriptions:

- Different table (`organization_subscriptions`, separate from `user_subscriptions`)
- Different Moyasar metadata (`billing_type: "enterprise"`, `org_id`, `seat_count`)
- Different webhook routing branch
- Different renewal job
- Owner's individual subscription (if any) continues independently

A user may simultaneously have a personal Pro subscription and be the owner of an enterprise organization. These are two separate billing relationships.

---

## 7. Case Lifecycle

### Status definitions

| Status | Meaning | Who can transition out |
|--------|---------|------------------------|
| `draft` | Case created, not yet ready for review | Creator, admin |
| `submitted` | Case submitted into the review queue | admin, head_of_department |
| `assigned` | Engineer assigned to perform review | head_of_department, admin (reassign), assigned engineer (start work) |
| `under_engineering_review` | Engineer is actively reviewing | assigned engineer |
| `ai_review_attached` | Engineer has attached AI Advisory/Analytical evidence | assigned engineer |
| `engineer_review_completed` | Engineer signed off on review | assigned engineer |
| `submitted_to_head` | Sent to head of department for approval | head_of_department |
| `returned_for_revision` | Head returned the case with comments | assigned engineer (resubmit) |
| `approved_internal` | Head approved; ready for client delivery | admin, head_of_department |
| `delivered_to_client` | Final deliverable made available to client | admin |
| `closed` | Case formally closed | owner, admin |
| `cancelled` | Case cancelled before delivery | owner, admin |

### Lifecycle diagram

```
draft
  │
  ▼
submitted ─────────────► cancelled
  │
  ▼
assigned ──────────────► cancelled
  │
  ▼
under_engineering_review ─────► cancelled
  │
  ▼
ai_review_attached
  │
  ▼
engineer_review_completed
  │
  ▼
submitted_to_head
  │       │
  │       ▼
  │   returned_for_revision ──► under_engineering_review (loop)
  │
  ▼
approved_internal ─────► cancelled
  │
  ▼
delivered_to_client
  │
  ▼
closed
```

### Lifecycle invariants

- Every status transition writes a row to `case_status_history` with: `from_status`, `to_status`, `actor_user_id`, `note`, `created_at`.
- A case can be `cancelled` from any pre-delivery status; cancellation is terminal.
- Once `delivered_to_client`, the only allowed transition is `closed`.
- `returned_for_revision` is the only loop-back transition. Each revision iteration is fully recorded in history.
- The transition `engineer_review_completed → submitted_to_head` requires at least one attached `ai_report_version` (configurable per organization in a later version).

---

## 8. Document Model

### Document categories (V1)

| Category | Arabic | Visibility default |
|----------|--------|--------------------|
| `architectural_drawings` | مخططات معمارية | `internal_only` |
| `life_safety_drawings` | مخططات سلامة الحياة | `internal_only` |
| `fire_alarm_drawings` | مخططات إنذار الحريق | `internal_only` |
| `fire_fighting_drawings` | مخططات مكافحة الحريق | `internal_only` |
| `pump_tank_details` | تفاصيل المضخات والخزانات | `internal_only` |
| `calculations` | الحسابات | `internal_only` |
| `technical_reports` | التقارير الفنية | `approval_required` |
| `client_documents` | وثائق العميل | `client_visible` |
| `internal_notes` | ملاحظات داخلية | `internal_only` |
| `final_deliverables` | المخرجات النهائية | `client_visible` |

### Visibility states

- `internal_only` — visible to internal members per role permissions; never visible to client
- `client_visible` — visible to the case's client (Phase E8 client portal)
- `approval_required` — visible internally; becomes `client_visible` only after head approval and explicit "share with client" action
- `final_deliverable` — the canonical signed-off output bundle; visible to client once delivered

### Versioning

- Documents support `version_number`, incremented on each new upload of the same logical file (matched by user choice, not filename).
- All previous versions are retained and visible internally; only the latest version of `final_deliverables` is shown to the client.

### Storage and access

- Files stored in Supabase Storage in an `enterprise/` bucket prefix.
- Storage path includes `org_id` and `case_id` for hierarchical access enforcement.
- Read/write access enforced by signed URLs issued through an edge function that re-validates org membership and case access.
- Direct public storage access is disabled for enterprise documents.

---

## 9. AI Binding

The existing public AI behavior (Advisory and Analytical modes) **is not modified** by Enterprise. Enterprise adds a thin layer that lets the user link AI sessions and outputs to a Case.

### Binding model

- A `case_ai_session` row links a chat conversation to a specific case. Engineer initiates the link from inside the case workspace.
- Each significant Advisory or Analytical response can be **frozen** as an `ai_report_version`:
  - Captures the prompt, response, model, mode, source references, citations, and timestamp.
  - Stores the rendered report (PDF or markdown) as an attached `case_document`.
  - Becomes immutable evidence — the live conversation can continue, but the frozen version is the version of record.

### Source references

- All AI-generated outputs that reference SBC standards, code clauses, or the corpus must persist their source references as part of the `ai_report_version`.
- Source references are stored as structured JSON: `[{type, code, page, snippet, retrieval_score}]`.
- This enables auditability — a head of department can see exactly which clauses the AI cited.

### Engineer acceptance

- Each `ai_report_version` has an `engineer_decision` field: `accepted | rejected | accepted_with_notes | needs_revision`.
- An engineer's recorded decision is part of the audit trail.
- Only `accepted` or `accepted_with_notes` versions can be submitted to the head of department as supporting evidence.

### Head approval scope

- The head of department approves the **engineer's review**, which references the AI evidence.
- The head does **not** directly approve raw AI output — only human-reviewed output is approved.
- Approval is recorded with the head's identity, decision, and any returned-for-revision comments.

### Constraints

- AI output never moves a case status on its own. All status transitions require a human actor.
- AI output is never delivered to a client without first appearing inside an `engineer_review` and being approved by the head.
- The Analytical mode pipeline (current `fire-safety-chat-v2` and analytical packaging) is **not modified** by enterprise. Enterprise only stores references to its outputs.

---

## 10. Phased Build Roadmap

The roadmap below mirrors the Master Track phases. Each phase has a hard stop gate. Implementation does not start the next phase until the current phase has been validated and explicitly authorized.

| Phase | Name | Type | Outcome |
|-------|------|------|---------|
| **E0** | Current Baseline Verification | Audit (read-only) | Architecture audit report, gap list, recommended approach. **Status: Complete.** |
| **E1** | Operating Model Document | Documentation | This document. **Status: Complete (this file).** |
| **E2** | Organization Core Schema | Schema migration (additive) | `organizations`, `org_members`, `org_invitations` tables with RLS. No edge functions, no UI. |
| **E3** | Case + Document Core Schema | Schema migration (additive) | `enterprise_cases`, `case_documents`, `case_status_history`, `case_notes` tables with RLS. |
| **E4** | Reviews + Approvals Schema | Schema migration (additive) | `case_reviews`, `case_approvals`, comment tables. |
| **E5** | AI Session Binding | Backend integration design + safe implementation | `case_ai_sessions`, `ai_report_versions`, source ref storage, acceptance fields. No public chat behavior change. |
| **E6** | Enterprise Access Gating | Edge function + frontend hook extension (additive) | Extended `check-subscription` returns `org_access` + `effective_access`. `useEntitlement` exposes org state without breaking individual flow. |
| **E7** | Enterprise UI Foundation | Frontend only | Create-organization flow, members management, invitations, role assignment, seat preview, organization account section, case list shell. |
| **E8** | Enterprise Billing | Audit-first then implementation | `organization_subscriptions` table, enterprise create-subscription function, dedicated Moyasar webhook branch, seat-count snapshot at renewal, organization-level dunning, organization-level cancel. Individual billing pipeline untouched. |
| **E9** | Client Portal | Deferred | Client-facing case view, client document upload, deliverable download. |
| **E10** | Execution / Inspection / Certificate | Deferred | Contractor execution tracking, site inspection workflow, conformity certificates, stamp issuance. |

### Dependency graph

```
E0 (audit) ──► E1 (this doc) ──► E2 (org schema)
                                    │
                                    ▼
                                  E3 (case schema)
                                    │
                                    ▼
                                  E4 (review schema)
                                    │
                                    ▼
                                  E5 (AI binding)
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                       E6 (access gating)  E7 (UI foundation)
                          │
                          ▼
                       E8 (billing)
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
              E9 (client portal)  E10 (inspection)
```

### Hard rules across all phases

1. **No phase modifies individual subscription tables.** Enterprise lives in its own tables.
2. **No phase modifies Analytical Mode, fire-safety-chat, fire-safety-chat-v2, corpus, graph, or brain code paths.**
3. **No phase modifies individual Moyasar billing behavior** until E8, and even then only via additive webhook branching.
4. **Each phase begins with an inspect/audit pass** appropriate to its type before any change is made.
5. **Each phase has a hard stop gate.** The next phase requires explicit authorization.
6. **Production deploys and migration applications require explicit phase-scoped authorization.** Writing the migration ≠ applying it.

---

## 11. Glossary

| Term | Definition |
|------|------------|
| **Case (معاملة)** | The fundamental unit of work — one fire/life-safety review engagement. |
| **Drawing Package** | A logical group of architectural and life-safety drawings within a case. |
| **AI Report Version** | A frozen, immutable snapshot of an AI Advisory/Analytical output attached to a case as evidence. |
| **Source Reference** | A structured citation produced by AI, pointing to SBC clauses, codes, or corpus passages. |
| **Active Internal Seat** | An `org_members` row with `status='active'` and an internal role; the unit of enterprise billing. |
| **Effective Access** | The aggregated access decision for a user, considering individual subscription, enterprise membership, trial state, and admin bypass. |
| **Owner** | The single user who founded or was promoted to lead an organization; bills and ultimate authority. |
| **Head of Department** | An internal role authorized to approve engineer reviews before client delivery. |
| **Deliverable** | The final, approved, client-visible output package for a case. |

---

## 12. Open Questions (For Resolution Before E7+)

These are knowingly unresolved as of V1 of this document. Each must be answered before the phase that depends on it ships.

1. **Final pricing.** 399 SAR/seat is provisional. Confirm before E8.
2. **Client account model.** Are clients real `auth.users` with portal accounts, or ephemeral references inside cases until E9? V1 assumes the latter; E9 may upgrade them.
3. **Multi-organization users.** V1 forbids one user belonging to two organizations. If commercial pressure requires it later, the access model in E6 must be revisited.
4. **Mid-period seat changes.** V1 does not prorate. Confirm or define proration before E8.
5. **Storage quotas.** No quota in V1. Define fair-use cap before scaling.
6. **AI usage cap per organization.** V1 has none. Decide before E5 ships if needed.
7. **Ownership transfer.** Mechanism described in role invariants; UI flow needs design in E7.
8. **Audit log retention.** `case_status_history` is append-only; retention policy not yet defined.

---

## 13. Document Lifecycle

- **V1** — this document. Initial publication.
- **V1.1+** — Each phase may propose updates to this document via a separate PR before its implementation work begins. Updates are versioned, not retroactively edited.
- **V2** — Full revision triggered when client portal (E9) or execution/inspection (E10) start, since both expand the entity model.

---

**End of ConsultX Enterprise Operating Model V1.**
