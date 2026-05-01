# ConsultX Enterprise Role Model — v2

Core roles (do not change without approval)
------------------------------------------
- Platform Owner (global)
- Local Enterprise Owner (office-scoped)
- Local Super Admin (office-scoped)
- Head of Department (department-scoped)
- Direct Manager (team-scoped)
- Engineer (team-scoped)
- Designer (team-scoped)
- Survey Uploader (team-scoped)
- Client (external)

Role responsibilities and explicit capabilities
---------------------------------------------
Platform Owner (global)
- Responsibilities: platform operations, billing, global admin actions.
- Capabilities: platform-scoped management only; cannot exercise office-scoped admin flows for day-to-day operations.

Local Enterprise Owner (office-scoped)
- Responsibilities: administrative ownership of a single office; creates projects, assigns Local Super Admins for that office, archives approved/delivered versions.
- Capabilities: create/edit office metadata and projects, assign roles within the office scope, archive office artifacts (audit required).

Local Super Admin (office-scoped)
- Responsibilities: day-to-day administration within an office.
- Capabilities: provision users, assign roles scoped to the office, manage project membership, run audits.

Head of Department (HOD)
- Responsibilities: final approver for deliverables in their department.
- Capabilities: approve `project_versions` for client delivery, view manager reviews and internal notes for decisions.

Direct Manager
- Responsibilities: technical review of engineers' work before HOD escalation.
- Capabilities: review and mark `changes_requested` or `approved_for_hod`, assign revisions to engineers.

Engineer / Designer
- Responsibilities: produce design work, create and edit draft `project_versions`, add internal notes.
- Capabilities: create & update drafts/uploads, submit versions for review; cannot approve for delivery.

Survey Uploader
- Responsibilities: upload survey/raw files and metadata.
- Capabilities: create `uploads` associated with a `project_version`; flag upload visibility (internal or suggested client-visible), cannot approve client visibility.

Client (external)
- Responsibilities: consumes delivered artifacts and provides feedback.
- Capabilities: view only `client_visible` delivered versions/files, comment, and request reopen via client comment thread. Clients cannot see internal notes or perform admin actions.

Privilege model
---------------
- System privileges are expressed via RBAC roles that map to fine-grained
  permission checks and RLS policies. Roles are scoped to `enterprise_id`
  and optionally `office_id`.
