# ConsultX Enterprise Workflow — v2

Core workflow (linear but with re-open paths)
------------------------------------------------
1. Project / Case creation — a Local Enterprise Owner or Super Admin
   creates a project record; project is tagged with `enterprise_id` and
   optional `office_id`.
2. Survey upload — Survey Uploader uploads survey files and raw datasets;
   system stores originals and extracts metadata.
3. Architectural upload — Designer/Engineer uploads architectural files and
   supporting documents.
4. Classification & required systems determination — automated assistants
   and engineers tag project with required systems (e.g., egress, suppression).
5. Engineering design — Engineers produce design artifacts and draft
   deliverables (versions tracked).
6. Direct Manager review — Manager reviews deliverable, requests changes or
   approves for HOD.
7. Head of Department approval — HOD signs off for client delivery.
8. Client delivery — deliverable exported to client portal (read-only) and
   client notified.
9. Client comments / reopen — Client may request revisions; project re-enters
   engineering design step.
10. Archive approved version — final approved artifacts are archived and
    versioned; audit log records the approval.

Case lifecycle states (explicit)
--------------------------------
- `draft` — initial state for a `project_version`; editable by Engineer/Designer.
- `in_review` — submitted to Direct Manager for review.
- `changes_requested` — reviewer (Direct Manager) has requested changes; back to `draft` for author.
- `approved_for_hod` — Direct Manager approved; escalated to HOD for final approval.
- `hod_approved` — HOD approved; ready for client delivery.
- `delivered` — version has been delivered to the Client Portal; client-visible if `client_visible=true`.
- `client_review` — client is reviewing and may request reopen via comment.
- `reopened` — project/version returned to engineering for revisions.
- `archived` — approved/delivered version moved to archive; read-only.

Transitions and handoff rules
----------------------------
- `draft` -> `in_review`: action = `submit_for_review` by Engineer/Designer. Triggers notification to Direct Manager.
- `in_review` -> `changes_requested`: action = `request_changes` by Direct Manager. Version owner moves back to `draft` and is assigned to an Engineer.
- `in_review` -> `approved_for_hod`: action = `approve_for_hod` by Direct Manager. Escalates to HOD.
- `approved_for_hod` -> `hod_approved`: action = `hod_approve` by Head of Department. HOD may add approval comments.
- `hod_approved` -> `delivered`: action = `deliver_to_client` by Local Enterprise Owner or Local Super Admin for the office. Sets `delivered_at` timestamp and marks `client_visible=true` if applicable.
- `delivered` -> `client_review`: automatic upon delivery; client receives notification and may comment.
- `client_review` -> `reopened`: action = `request_reopen` (client comment) followed by `confirm_reopen` by Direct Manager/HOD/Local Enterprise Owner. Only Direct Manager, HOD, or Local Enterprise Owner may set state to `reopened`.
- `reopened` -> `draft`: system assigns to Engineer and state becomes `draft` for edits.
- `delivered` -> `archived`: action = `archive` by Local Enterprise Owner or Local Super Admin after business/retention conditions met. Archive creates `archived_at`, `archived_by` and is recorded in `audit_logs`.

Who creates / edits / reviews / approves / archives (concise mapping)
-----------------------------------------------------------------
- Create project: Local Enterprise Owner, Local Super Admin.
- Edit project metadata: Local Enterprise Owner, Local Super Admin, Project Owner (assigned user).
- Create/edit version & uploads: Engineer, Designer, Survey Uploader (uploads only).
- Review (technical): Direct Manager.
- Approve (final): Head of Department.
- Deliver to client: Local Enterprise Owner / Local Super Admin (office-scoped).
- Reopen: Direct Manager, Head of Department, Local Enterprise Owner (must confirm client reopen requests).
- Archive: Local Enterprise Owner or Local Super Admin (office-scoped) after approval/delivery and retention conditions.

Internal notes vs client-visible outputs
--------------------------------------
- Internal notes: can be added by Engineers, Designers, Direct Managers, HODs, and Local Super Admins. Stored with `internal_only=true` flag and excluded from Client Portal and any client-facing APIs.
- Client-visible outputs: produced only from `hod_approved` -> `delivered` transitions and visible only when `client_visible=true`.


Events & notifications
----------------------
- Each state transition emits an event and a notification to relevant actors.
- Audit entries are created for all approvals and re-open actions.

Versioning & traceability
-------------------------
- All document uploads must include content-hash, uploader-id, timestamp,
  and linked to the project version they belong to.
