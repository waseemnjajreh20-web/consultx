# ConsultX Enterprise Schema Blueprint — v2 (conceptual)

This file is a conceptual blueprint only — do NOT apply as SQL. It outlines
the core tables, key columns, and relationships required for the enterprise
operating layer.

Core tables
-----------
- `enterprises` — id, name, billing_profile_id, created_at
- `offices` — id, enterprise_id, name, location, timezone
- `users` — id, enterprise_id, office_id (nullable), email, display_name, profile_id
- `roles` — id, name, description
- `user_roles` — user_id, role_id, scope (enterprise/office/project)
- `projects` — id, enterprise_id, office_id, name, status, created_by, created_at
- `project_versions` — id, project_id, version_number, status, created_at, created_by
- `uploads` — id, project_version_id, uploader_id, file_name, file_type, s3_path, content_hash, metadata
- `reviews` — id, project_version_id, reviewer_id, review_state, comments, created_at
- `approvals` — id, project_version_id, approver_id, approval_state, created_at
- `audit_logs` — id, user_id, action, target_table, target_id, detail, created_at
- `profiles` — existing app profile table; include `enterprise_id` optional for enterprise-wide settings

Migration: `supabase/migrations/20260419121500_create_enterprises.sql` (creates `enterprises` table, Phase 2 P2-SCHEMA-001)
Migration: `supabase/migrations/20260419123000_create_offices.sql` (creates `offices` table, Phase 2 P2-SCHEMA-002)
Migration: `supabase/migrations/20260419130000_create_roles.sql` (creates `roles` table, Phase 2 P2-SCHEMA-003)
Migration: `supabase/migrations/20260419131500_create_user_roles.sql` (creates `user_roles` table, Phase 2 P2-SCHEMA-004)
Migration: `supabase/migrations/20260419133000_create_projects.sql` (creates `projects` table, Phase 2 P2-SCHEMA-005)
Migration: `supabase/migrations/20260419134500_create_project_versions.sql` (creates `project_versions` table, Phase 2 P2-SCHEMA-006)

Minimum recommended fields (project lifecycle and visibility)
----------------------------------------------------------
- `projects`:
  - `id UUID PRIMARY KEY`
  - `enterprise_id UUID NOT NULL`
  - `office_id UUID NOT NULL`
  - `name text`
  - `description text`
  - `status text` (enum: `active|suspended|archived`)
  - `created_by UUID`
  - `created_at timestamptz`

- `project_versions`:
  - `id UUID PRIMARY KEY`
  - `project_id UUID REFERENCES projects(id)`
  - `version_number int`
  - `status text` (enum: `draft|in_review|changes_requested|approved_for_hod|hod_approved|delivered|client_review|reopened|archived`)
  - `client_visible boolean DEFAULT false` (controls Client Portal visibility)
  - `internal_notes jsonb` (array of internal note objects: `{ author_id, note, created_at, internal_only:true }`)
  - `delivered_at timestamptz NULL`
  - `archived_at timestamptz NULL`
  - `archived_by UUID NULL`

- `uploads`:
  - `id UUID PRIMARY KEY`
  - `project_version_id UUID REFERENCES project_versions(id)`
  - `uploader_id UUID`
  - `file_name text`
  - `content_hash text`
  - `is_client_visible boolean DEFAULT false` (uploaded content visibility; final client visibility controlled by HOD/Delivery)
  - `internal_only boolean DEFAULT false`

- `reviews`:
  - `id UUID PRIMARY KEY`
  - `project_version_id UUID`
  - `reviewer_id UUID`
  - `review_state text` (enum: `changes_requested|approved_for_hod|approved`)
  - `comments text`
  - `internal_only boolean` (whether the review/comment is internal)
  - `created_at timestamptz`

- `approvals`:
  - `id UUID PRIMARY KEY`
  - `project_version_id UUID`
  - `approver_id UUID`
  - `approval_state text` (enum: `approved|rejected`)
  - `comments text`
  - `created_at timestamptz`

- `user_roles`:
  - `user_id UUID`
  - `role_id UUID`
  - `scope text` (`platform|enterprise|office|project`)
  - `scope_id UUID` (null for platform scope)
  - `assigned_by UUID`
  - `assigned_at timestamptz`

- `audit_logs`:
  - `id UUID PRIMARY KEY`
  - `user_id UUID`
  - `action text`
  - `target_table text`
  - `target_id UUID`
  - `detail jsonb`
  - `created_at timestamptz`

Indexes & constraints
---------------------
- Index `projects(enterprise_id, office_id)` and `project_versions(project_id, status)`.
- Enforce `enterprise_id` and `office_id` existence for tenant-scoped rows.

Recommended columns and indexes
--------------------------------
- All tenant-scoped tables must include `enterprise_id` and optional `office_id`.
- Index `projects(enterprise_id)`, `project_versions(project_id)`, and
  `uploads(project_version_id)` for read-heavy flows.

Versioning and immutable artifacts
---------------------------------
- Store immutable references to original uploads (content_hash) so provenance
  is retained. Project versions are the unit of review and approval.

Notes on extensibility
----------------------
- Keep subscription/billing references separate (platform-owned) to avoid
  entangling enterprise data with billing logic.
