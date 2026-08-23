# ConsultX Enterprise Pages Blueprint — v2

This is a pages-level blueprint for future UI (no UI implementation here).
Each page maps to clearly defined data and actor roles.

Primary pages
-------------
- Enterprise Dashboard — high-level metrics, active projects, pending approvals.
- Projects List — filterable by office, status, and owner.
- Project Detail — tabs: overview, versions, uploads, reviews, approvals, audit.
- Upload Flow — multi-step upload for surveys and architectural files (uploader only).
- Review Queue — items assigned to Direct Managers and Heads of Department.
- Approval Console — HOD view for granular approval and sign-off.
- Client Portal — delivered artifacts and comment thread; clients can raise issues.
- Admin Console — user/role management, enterprise settings (Local Super Admin / Owner only).

Page-level permission notes
-------------------------
- Pages respect RBAC and RLS; ensure server APIs validate enterprise scope for
  every action.

Page responsibilities, actions and restricted data (Phase 1)
---------------------------------------------------------
- Enterprise Dashboard
  - Purpose: overview of office health and pending approvals.
  - Actions: view aggregated counts, drill into Projects List.
  - Allowed roles: Local Enterprise Owner, Local Super Admin, HOD (office-scoped), Platform Owner (global read-only).
  - Restricted data: no client-visible uploads displayed here.

- Projects List
  - Purpose: list and filter projects by `office_id`, status, owner.
  - Actions: create new project (Local Enterprise Owner / Local Super Admin), open Project Detail.
  - Allowed roles: internal roles for the office; Clients may see only projects delivered and client-visible.

- Project Detail
  - Purpose: single project view with tabs for versions, uploads, reviews, approvals and audit.
  - Actions:
    - Edit metadata: Local Enterprise Owner / Local Super Admin / assigned Project Owner.
    - Create version: Engineer / Designer.
    - Upload files: Survey Uploader, Engineer, Designer.
    - Submit for review: Engineer / Designer.
    - Request changes / review actions: Direct Manager.
    - Approve to HOD: Direct Manager.
    - HOD final approval: Head of Department.
    - Deliver to client: Local Enterprise Owner / Local Super Admin.
    - Archive: Local Enterprise Owner / Local Super Admin (archive UI control in Project Detail; confirmation required).
  - Restricted data:
    - Internal notes tab: visible only to internal roles; not surfaced in Client Portal.
    - Client-visible files: only shown if `client_visible=true` and `delivered_at` set.

- Upload Flow
  - Purpose: guided uploader for survey and architectural files.
  - Actions: upload, tag as `is_client_visible` (uploader suggestion only), add metadata.
  - Allowed roles: Survey Uploader, Engineer, Designer.
  - Restricted data: uploaded files flagged `internal_only` never appear in Client Portal.

- Review Queue
  - Purpose: prioritized list for Direct Managers and HODs to act on pending reviews.
  - Actions: open review, mark `changes_requested`, mark `approved_for_hod`, add review comments (internal only flag optional).
  - Allowed roles: Direct Manager, HOD.

- Approval Console
  - Purpose: HODs to view ready-for-approval versions and sign-off.
  - Actions: approve/reject with comments; set `client_visible` for delivery if appropriate.
  - Allowed roles: Head of Department.

- Client Portal
  - Purpose: expose delivered, client-visible content to client users.
  - Actions: view delivered artifacts, comment/request reopen.
  - Allowed roles: Client (only for projects/versions specifically delivered to them).
  - Restricted data: internal notes, reviewer-only comments, and audit logs are not visible here.

- Admin Console
  - Purpose: manage users, roles (office-scoped), and enterprise settings for the office.
  - Actions: assign `user_roles` scoped to `office_id`, manage audit views.
  - Allowed roles: Local Super Admin, Local Enterprise Owner.


Navigation & UX notes
---------------------
- Keep critical review/approval actions auditable and require explicit
  confirmation dialogs for approvals and archival operations.
