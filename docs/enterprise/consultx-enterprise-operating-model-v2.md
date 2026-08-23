# ConsultX Enterprise Operating Model — v2

Purpose
-------
Define the institutional operating layer for ConsultX when deployed inside
engineering consultancy offices. This document is specification-only (no UI,
no SQL, no backend handlers). It establishes boundaries between global
platform responsibilities and local enterprise responsibilities.

Scope & Tenancy
---------------
- Tenancy model: single `enterprise` entity (organization) owning multiple
  `office` (local sites) and projects. Users belong to enterprises and may be
  scoped to offices.
- Platform Owner (global): product-level responsibilities (billing,
  model updates, global admin features). This role is NOT mixed with local
  enterprise owner capabilities.
- Local Enterprise Owner: administrative owner for a single enterprise; can
  manage users, roles, and enterprise-level settings for their enterprise
  only.

Governance
----------
- Each enterprise has an isolated policy surface enforced by RBAC and RLS.
- Audit trails required for all admin actions and approvals.
- Separation of duties: Local Super Admin vs Local Enterprise Owner vs
  Platform Owner must remain distinct.

Data Ownership & Compliance
---------------------------
- Enterprises own project data and documents. Sensitive exports and audit
  logs must be controlled by enterprise-scoped policies.
- Schema design must include `enterprise_id` and `office_id` on tenant data
  for RLS filters.

Operational Considerations
--------------------------
- Backfill and large batch jobs (e.g., migrating preferences) require a
  maintenance window and should be scheduled by platform/SRE.

Actor Responsibilities (summary)
--------------------------------
- Project creation: Local Enterprise Owner or Local Super Admin (office-scoped) create project/case records. They set `office_id` and initial project metadata.
- Project metadata edit: Local Enterprise Owner, Local Super Admin, and assigned Project Owner may edit project-level metadata. Engineers/Designers may not change project identifiers (name, enterprise/office) without admin rights.
- Version/content edit: Engineers and Designers create and edit draft `project_versions` and uploads. They author content and internal notes.
- Review: Direct Manager performs the first review and may mark `changes_requested` or `approved_for_hod`.
- Approval: Head of Department (HOD) is the authority to `approve` a version for client delivery.
- Client delivery: Only after HOD approval may a Local Enterprise Owner / Super Admin mark version as `delivered` to the Client Portal.
- Reopen: Clients may request a reopen (comment/request); only Direct Manager, HOD, or Local Enterprise Owner may set the project/version back to `reopened` and assign it to an Engineer.
- Archive: Local Enterprise Owner or Local Super Admin for the office may archive an `approved` and `delivered` version; archiving requires audit entry and timestamp.

Visibility & Internal / Client Separation
----------------------------------------
- Internal notes: visible to internal roles only (Engineer, Designer, Direct Manager, HOD, Local Super Admin, Local Enterprise Owner). Internal notes MUST be stored with an `internal_only` flag and never surfaced to Client pages or APIs filtered for clients.
- Client-visible outputs: only versions marked `client_visible=true` and with `approval_state='approved'` and `delivered_at` set are visible to the Client role via the Client Portal or client-facing APIs.

Boundaries & Scope
------------------
- Platform Owner (global) manages platform-level operations and billing; Platform Owner cannot act as a Local Enterprise Owner for an office in day-to-day operations and must not be used to bypass office-scoped RLS.
- Local Enterprise Owner and Local Super Admin are strictly office-scoped in Phase 1: their privileges apply only to resources with the matching `office_id` (and `enterprise_id` where applicable).

