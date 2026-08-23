# ConsultX Enterprise RBAC + RLS Blueprint — v2

High-level approach
-------------------
Use RBAC roles for coarse-grained permissions and Row-Level Security (RLS)
for data isolation. Roles are assigned per-enterprise. RLS policies enforce
that users can only access rows where `enterprise_id` matches their current
enterprise context (unless Platform Owner/global).

Role to capability mapping (summary)
-----------------------------------
- Platform Owner: global read/write for platform tables, cannot impersonate
  or modify enterprise data except via admin flows.
- Local Enterprise Owner: manage users, roles, enterprise settings, and
  high-level project lifecycle operations.
- Local Super Admin: day-to-day admin and user provisioning.
- Head of Department: approve releases within their department scope.
- Direct Manager: review and request changes.
- Engineer/Designer/Survey Uploader: create and update uploads and drafts.
- Client: read access to delivered approved versions and comment access.

RLS policy examples (described in plain language)
-----------------------------------------------
- For `projects`: ALLOW SELECT/INSERT/UPDATE/DELETE when `projects.enterprise_id = current_setting('app.current_enterprise')::uuid` OR user has Platform Owner role.
- For `uploads`: ALLOW INSERT when uploader belongs to the enterprise; ALLOW SELECT when `uploads.project_id` belongs to a project the user can view.
- For `approvals` and `reviews`: only reviewers/managers and HODs in the same enterprise/department can modify state.

Action → Role mapping (Phase 1)
-------------------------------
- `create_project`: Local Enterprise Owner, Local Super Admin (office-scoped)
- `edit_project_metadata`: Local Enterprise Owner, Local Super Admin, assigned Project Owner
- `create_version` / `edit_version`: Engineer, Designer
- `upload_file`: Survey Uploader, Engineer, Designer
- `submit_for_review`: Engineer/Designer
- `request_changes`: Direct Manager
- `approve_for_hod`: Direct Manager
- `hod_approve`: Head of Department
- `deliver_to_client`: Local Enterprise Owner, Local Super Admin
- `request_reopen` (client): Client (creates request); `confirm_reopen`: Direct Manager/HOD/Local Enterprise Owner
- `archive`: Local Enterprise Owner, Local Super Admin

RLS and policy notes (explicit)
--------------------------------
- Tenant context: each request/session must carry `enterprise_id` and `office_id` claims, or the API layer must set `app.current_enterprise` and `app.current_office` via `SET LOCAL` for the session before executing queries.
- `projects` policy (plain language): allow `SELECT`/`UPDATE`/`DELETE` when `projects.enterprise_id = current_setting('app.current_enterprise')::uuid` AND `projects.office_id = current_setting('app.current_office')::uuid`, or when user has `platform` role.
- `project_versions` policy: allow `SELECT` when `project_versions.project_id` points to a project the user can access and (`client_visible=true` OR user has any internal role in that office). For `UPDATE` allow when the user is the `created_by` or has office-admin role.
- `uploads` policy: `SELECT` only if `is_client_visible = true` for client-scoped sessions; otherwise allow internal roles to view regardless of `is_client_visible` if they belong to the office.
- `internal_notes` and `review.comments` policy: only accessible when user role is internal (Engineer, Designer, Direct Manager, HOD, Local Super Admin, Local Enterprise Owner) and the session `office_id` matches.

Policy hardening
-----------------
- Avoid role name collisions — keep Platform Owner claims strictly separate and auditable.
- All approval and archive actions must write an `audit_logs` row with `user_id`, `action`, `target_table`, `target_id`, and `detail`.

Audit & admin
--------------
- All role/grant changes and approval state transitions must be written to
  `audit_logs` with `created_by` and `created_at`.

Operational notes
-----------------
- Keep Platform Owner policies explicit and separate to avoid accidental
  privilege escalation of local admins.
