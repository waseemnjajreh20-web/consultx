# Live Production Smoke Test — Plan (no execution)

Date: 2026-05-05
Branch: `claude/affectionate-solomon-f5e304`
Status: **plan only — not executed in this session**

---

## Context

The Phase 3 smoke audit ([docs/enterprise/PRODUCTION_SMOKE_TEST_REPORT.md](docs/enterprise/PRODUCTION_SMOKE_TEST_REPORT.md)) was a code-path audit. This document is the **executable runbook** to follow when an operator with production access runs the live smoke. Every step has a copy-pasteable command or click path and a clear pass/fail signal.

**Non-destructive guarantee.** No step in this plan creates, modifies, or deletes production data. The only writes are:
- Adding a member to a *test* organization (already reversible by removing the member)
- Uploading a small document to a *test* case (cleanup step included)
- Toggling the public-tracking switch (idempotent)

**No Moyasar / Tap charge is initiated** at any step.

## Identifiers used

| Variable | Value | Where to set |
|----------|-------|--------------|
| `APP_URL` | `https://www.consultx.app` | already public |
| `SUPABASE_URL` | `https://hrnltxmwoaphgejckutk.supabase.co` | already public |
| `SUPABASE_ANON_KEY` | (ANON public key — see [orchestrator.cjs:10](orchestrator.cjs:10) or `.env`) | dev environment |
| `ADMIN_JWT` | sign-in JWT for an `ADMIN_EMAILS` user (`waseemnjajreh20@gmail.com`) | session cookie or sign-in flow |
| `TEST_ORG_ID` | UUID of a designated test org | created once via Enterprise UI |
| `TEST_CASE_ID` | UUID of a test case under TEST_ORG_ID | created once via Enterprise UI |
| `PUBLIC_TOKEN` | tracking token returned by `ensure_case_public_tracking` RPC | once per case |

For all `curl` examples, the auth header is shown as `-H "Authorization: Bearer <ADMIN_JWT>"`. Replace at exec time.

---

## A. Public Case Tracking — `/track/:token`

### A.1 Get a safe test token (no destructive action)

In the Enterprise Workspace UI, on a test case:
1. Open the case drawer.
2. Click the "Public tracking" panel (CaseTrackingPanel).
3. Click "Enable public tracking" if not already enabled. The UI shows the token.
4. Copy the token. Store as `PUBLIC_TOKEN`.

If the token already exists, this is idempotent — the same token is returned.

### A.2 Happy path — anonymous load

Browser:
```
GET https://www.consultx.app/track/$PUBLIC_TOKEN
```

**Pass signal**:
- HTTP 200, page renders.
- Header shows organization name and (optional) logo.
- Status pill shows AR + EN labels (e.g. "تم تعيين المهندس" / "Engineer assigned").
- Timeline shows zero-or-more updates.
- No "Sign in" prompt anywhere.

**Fail signals**:
- HTTPS error / 5xx
- Internal field names visible (case_id, status enum strings like `under_engineering_review` rather than the AR/EN label)
- Email addresses or member UUIDs visible anywhere

### A.3 Privacy regression — what must NOT appear

Inspect HTML source via DevTools "View page source" or `curl https://www.consultx.app/track/$PUBLIC_TOKEN | grep -E "case_id|org_id|user_id|email|case_notes|decision_notes"`.

**Pass signal**: zero matches for `email`, `case_notes`, `decision_notes`, member UUIDs, internal `case_status_history`. Only the public allow-listed fields from [supabase/functions/get-public-case-tracking/index.ts:201-246](supabase/functions/get-public-case-tracking/index.ts:201) appear.

**Fail signal**: any internal field present.

### A.4 Disabled-token path

In the UI, toggle "Public tracking" OFF on the same case, then immediately:
```
GET https://www.consultx.app/track/$PUBLIC_TOKEN
```

**Pass signal**: page renders the generic "Tracking link not available" card (one card, no internal details).

**Fail signal**: 500 error, or any case data leaked despite the disable.

### A.5 Malformed-token path

```
GET https://www.consultx.app/track/short
GET https://www.consultx.app/track/AAAA0000111122223333444455556666999988887777
```

**Pass signal**: same generic "not available" card. The 16–64-char length validator at [supabase/functions/get-public-case-tracking/index.ts:80](supabase/functions/get-public-case-tracking/index.ts:80) rejects short tokens; the unrecognized 40-char string falls through to the same path.

### A.6 Cleanup
Re-enable public tracking on the test case if needed. Token is preserved.

---

## B. Enterprise Assignment — `submitted` → `assigned`

### B.1 Setup

Use the test org. As `ADMIN_EMAILS` user, ensure the org has at least:
- 1 owner / admin / head_of_department member (you)
- 1 engineer member
- 1 finance_officer member (or invite one)
- 1 head_of_department member

If missing roles, invite via the Enterprise members panel.

### B.2 Create a test case in `submitted` status

Via Enterprise UI: "Create new case", fill title and client name, submit. New case auto-starts in `submitted`. Capture `TEST_CASE_ID`.

### B.3 Assign engineer (manager path)

In the case drawer, open "Case responsibilities" panel. Pick the engineer member from dropdown. Pick the head_of_department member. Click "Save assignments".

**Pass signals**:
- Toast "Assignments saved" / "تم حفظ التعيينات" appears.
- Status pill on the case row flips from "تم استلام الطلب" to "تم تعيين المهندس" (i.e. `submitted` → `assigned`).
- Re-opening the drawer shows engineer and head reviewer pre-selected.

DB-side verification (via Supabase SQL editor or service-role curl):
```sql
SELECT id, status, assigned_engineer_id, head_reviewer_id, assigned_at
FROM enterprise_cases WHERE id = '$TEST_CASE_ID';

SELECT * FROM case_status_history
WHERE case_id = '$TEST_CASE_ID' ORDER BY created_at DESC LIMIT 3;
```
**Pass signal**: `status='assigned'`, both FKs set, `assigned_at IS NOT NULL`, `case_status_history` has a row for the `submitted → assigned` transition.

### B.4 finance_officer denial — server side

Switch session to a `finance_officer` user (sign in as them, or use an admin override that simulates the role). In the case drawer:
- Open Assignment panel → must be **read-only** (no Select dropdowns rendered).

Direct RPC call (verify server-side gate):
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/assign_enterprise_case" \
  -H "Authorization: Bearer $FINANCE_OFFICER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_case_id": "'"$TEST_CASE_ID"'",
    "p_assigned_engineer_id": "'"$ENGINEER_USER_ID"'"
  }'
```
**Pass signal**: HTTP 4xx with body containing "Only owner, admin, or head_of_department may assign cases (caller role: finance_officer)".

**Fail signal**: HTTP 200 / 204.

### B.5 finance_officer-as-engineer denial

As a manager, try to assign a `finance_officer` user as the engineer. The UI dropdown excludes them. To verify the server gate, call the RPC directly with the finance_officer's user_id:
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/assign_enterprise_case" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_case_id": "'"$TEST_CASE_ID"'",
    "p_assigned_engineer_id": "'"$FINANCE_OFFICER_USER_ID"'"
  }'
```
**Pass signal**: HTTP 4xx with "finance_officer cannot be assigned as case engineer".

---

## C. Case Documents — upload / signed URL / delete

### C.1 Upload a small test document

In the case drawer, "Documents" panel → click "Upload" → pick a small PDF or image (< 1 MB). Wait for upload completion.

**Pass signal**: file appears in the list with thumbnail / filename.

DB verification:
```sql
SELECT id, org_id, case_id, storage_path, content_type, byte_size
FROM case_documents WHERE case_id = '$TEST_CASE_ID' ORDER BY created_at DESC LIMIT 1;
```

**Pass signal**: row exists, `storage_path` like `<org_id>/<case_id>/<category>/<filename>`.

### C.2 Signed URL fetch (active member path)

As a manager (or engineer assigned to this case):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/get-case-document-url" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"document_id":"$DOC_ID"}'
```

**Pass signal**: HTTP 200 with body `{"url":"https://...","expires_in":60}`. Open the URL in a browser → file downloads / displays.

After 60 seconds, opening the same URL **must** return an expired error.

### C.3 Signed URL — finance_officer denial

```bash
curl -X POST "$SUPABASE_URL/functions/v1/get-case-document-url" \
  -H "Authorization: Bearer $FINANCE_OFFICER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"document_id":"$DOC_ID"}'
```

**Pass signal**: HTTP 403 with `{"error":"Access denied"}`.

### C.4 Delete — owner/admin only

As admin:
```bash
curl -X POST "$SUPABASE_URL/functions/v1/delete-case-document" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"document_id":"$DOC_ID"}'
```

**Pass signal**: HTTP 200 `{"ok":true}`. Re-checking the documents list shows the file gone. DB row is deleted.

### C.5 Delete — head_of_department / engineer denial

As a head_of_department or engineer (NOT owner/admin):
```bash
curl -X POST "$SUPABASE_URL/functions/v1/delete-case-document" \
  -H "Authorization: Bearer $HEAD_JWT" \
  -H "Content-Type: application/json" \
  -d '{"document_id":"$DOC_ID_2"}'
```

**Pass signal**: HTTP 403 `{"error":"Access denied: owner or admin required"}`.

### C.6 Delete — finance_officer denial

Same as C.5 with finance_officer JWT. **Pass signal**: HTTP 403.

---

## D. Reviews / Approvals

### D.1 Submit a review

Move the test case forward into `engineer_review_completed` (this is the path that's eligible for `submit_case_review`):
1. As the assigned engineer, call `transition_case_status(case_id, 'under_engineering_review', null)` via the UI or RPC.
2. Then advance through `ai_review_attached` (only if the AI flow is being exercised) → `engineer_review_completed`.

When the case is in `engineer_review_completed`, in the UI submit a review with summary text. Or RPC:
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/submit_case_review" \
  -H "Authorization: Bearer $ENGINEER_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_case_id":"'"$TEST_CASE_ID"'",
    "p_summary":"Smoke test review",
    "p_findings":[],
    "p_recommendation":null
  }'
```

**Pass signal**:
- HTTP 200 with the new `case_reviews.id` UUID returned.
- Case status auto-advances to `submitted_to_head` (verify in DB or UI).
- `case_reviews` row exists with `revision_number = max(existing) + 1`.

### D.2 Approve

As the assigned head_of_department or owner:
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/decide_case_approval" \
  -H "Authorization: Bearer $HEAD_JWT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_case_id":"'"$TEST_CASE_ID"'",
    "p_decision":"approved",
    "p_decision_note":null
  }'
```

**Pass signal**:
- HTTP 200, returns approval UUID.
- Case status advances to `approved_internal`.
- `case_reviews.status = 'accepted'` for the latest revision.
- `case_approvals` row exists.

### D.3 Return for revision (with required note)

Repeat D.1 with a fresh case (or re-submit a new revision after the approved one). Then call:
```bash
curl ... -d '{
  "p_case_id":"...",
  "p_decision":"returned_for_revision",
  "p_decision_note":"Need clarification on egress assumption"
}'
```

**Pass signal**:
- HTTP 200, case status → `returned_for_revision`.
- Calling without `p_decision_note` should HTTP 4xx with "A decision_note is required".

### D.4 admin denial on approval

As an `admin` role user (not owner / head_of_department), call `decide_case_approval`. **Pass signal**: HTTP 4xx with "only owner and head_of_department can approve or return cases (role: admin)". This locks in the operating-model rule that admin **does not** approve cases.

### D.5 accepted_with_notes — out of scope

Per the Phase 3 audit, `accepted_with_notes` is **not currently a valid decision value**. The brief explicitly conditioned this on "إن مدعوم". Do **not** test it; `decide_case_approval` will reject it as an invalid decision string.

---

## E. Subscription / access — `check-subscription` overrides

### E.1 Admin override smoke (no charge)

As an `ADMIN_EMAILS` user:
```bash
for OVR in free engineer pro enterprise owner; do
  echo "=== override=$OVR ==="
  curl -s -X POST "$SUPABASE_URL/functions/v1/check-subscription" \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -H "X-ConsultX-Admin-Entitlement-Override: $OVR" | jq '{plan_slug, active, status, advisory_limit, analysis_limit, daily_messages_limit, owner_mode, effective_access}'
done
```

**Pass signal** (one row per override):
| override | plan_slug | active | advisory_limit | analysis_limit | owner_mode | effective_access |
|----------|-----------|--------|----------------|----------------|------------|-------------------|
| free | free | false | null | null | false | ineligible |
| engineer | engineer | true | 20 | 10 | false | paid_active |
| pro | pro | true | 100 | 50 | false | paid_active |
| enterprise | enterprise | true | null | null | false | enterprise |
| owner | owner | true | null | null | true | owner |

**Fail signal**: any column wrong, or HTTP 4xx/5xx, or any DB write side-effect (compare `user_subscriptions` and `profiles` rows pre vs post — must be unchanged).

### E.2 Non-admin lifecycle smoke

For a non-admin test user (sign in as a fresh user that has no subscription):
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-subscription" \
  -H "Authorization: Bearer $TEST_USER_JWT" | jq '{access_state, launch_trial_status, launch_trial_active, plan_slug}'
```

**Pass signal**: `access_state` is one of `paid_active`, `trial_active`, `trial_expired`, `eligible_existing_pending`, `ineligible`. `launch_trial_status` matches the campaign rules.

**Reject — no Moyasar charge anywhere**: do NOT initiate `create-checkout`, `moyasar-create-subscription`, `moyasar-initiate-token-payment`, or `tap-charge-subscription` in this smoke. Those are the destructive endpoints.

### E.3 Org-membership override smoke

For a user who is an `org_members` row in an `active`/`trial` enterprise org:
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-subscription" \
  -H "Authorization: Bearer $ORG_USER_JWT" | jq '{effective_access_source, effective_access, org_access}'
```

**Pass signal**: `effective_access_source = "organization"`, `effective_access = "enterprise"`, `org_access` populated with the org id and role.

---

## F. Cleanup checklist

After all tests:
- [ ] Re-enable public tracking on the test case if it was disabled.
- [ ] Delete any test documents uploaded in section C.
- [ ] Optionally: archive or close the test case.
- [ ] Compare `user_subscriptions` rows pre vs post — must be unchanged.
- [ ] Compare `profiles.plan_type` for the admin user pre vs post — must be unchanged.
- [ ] Inspect Supabase function logs for `check-subscription`, `get-case-document-url`, `delete-case-document`, `assign_enterprise_case` — every call should have completed in expected latency, no 5xx.

---

## G. Pre-flight credentials needed

To execute this plan, the operator needs:
- A web browser logged in to `https://www.consultx.app` as an `ADMIN_EMAILS` user.
- A second tab / incognito session for the finance_officer test user.
- Supabase project access (read-only DB read + Functions logs view).
- `curl` + `jq` on the local machine.
- The Supabase `ANON_KEY` (already public — see `.env.local` or the Vercel env vars).

**Not needed**: service-role key, Moyasar credentials, Tap credentials.

---

## H. Decision log

This plan is **non-destructive**. It does not include any of the prohibited operations:
- ❌ Moyasar / Tap charge → not in plan
- ❌ Production migration → not in plan
- ❌ DB destructive write → only tracked, reversible writes (test case, test document, test member)
- ❌ Bucket overwrite of canonical chunks → not in plan
- ❌ Edge function redeploy → not in plan

This plan **is** intended to be executed by a human operator with production access. It is **not** intended to be run by an autonomous agent.
