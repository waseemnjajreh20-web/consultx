# Local Database Backup Assessment — Phase 1

**Project:** `hrnltxmwoaphgejckutk`  
**Date:** 2026-05-01  
**Status:** BLOCKED — environment cannot produce a local logical dump.

## Attempted approaches

| Approach | Result |
|---|---|
| `pg_dump` binary | Not found in PATH |
| Docker Desktop | Not installed |
| `npx supabase db dump --project-ref hrnltxmwoaphgejckutk` | Failed: `Docker Desktop is a prerequisite for local development` |
| `npx supabase gen types typescript --project-id hrnltxmwoaphgejckutk` | Succeeded for `public`, `auth`, and `storage` schemas — saved as types files only |

## Fallback in place

- Supabase Pro is active on the project.
- Supabase managed backups and Point-in-Time Recovery (PITR) are the current recovery mechanism.
- A **schema baseline** was extracted via read-only SQL and `supabase gen types` and saved under `docs/audits/schema-baseline-20260501/`.

## What is available

| Artifact | Location | Coverage |
|---|---|---|
| Generated TypeScript types (public) | `docs/audits/schema-baseline-20260501/types_public.ts` | Public tables, relationships, functions, enums |
| Generated TypeScript types (auth) | `docs/audits/schema-baseline-20260501/types_auth.ts` | Auth schema |
| Generated TypeScript types (storage) | `docs/audits/schema-baseline-20260501/types_storage.ts` | Storage schema |
| Tables baseline | `docs/audits/schema-baseline-20260501/tables.json` | Public/auth/storage tables |
| Columns baseline | `docs/audits/schema-baseline-20260501/columns.json` | All columns |
| Indexes baseline | `docs/audits/schema-baseline-20260501/indexes.json` | All indexes |
| Constraints baseline | `docs/audits/schema-baseline-20260501/constraints_*.json` | PK/UK/FK and CHECK constraints |
| RLS enablement | `docs/audits/schema-baseline-20260501/rls_enabled.json` | RLS flags per table |
| RLS policies | `docs/audits/schema-baseline-20260501/policies.json` | All RLS policies |
| Triggers | `docs/audits/schema-baseline-20260501/triggers.json` | User triggers |
| Extensions | `docs/audits/schema-baseline-20260501/extensions.json` | Installed extensions |
| Function registry | `docs/audits/schema-baseline-20260501/functions_registry.json` | Functions by schema |
| Manifest | `docs/audits/schema-baseline-20260501/manifest.json` | Index of all baseline files |

## Gap

These artifacts are **schema metadata only**, not a restorable SQL dump. They cannot restore data or reproduce the exact production schema without additional manual work.

## Recommendation

To obtain a true local backup:

1. Install Docker Desktop or `pg_dump` locally, **or**
2. Use Supabase's dashboard/API to download a managed backup snapshot, **or**
3. Run `supabase db dump` from a machine that already has the Supabase CLI prerequisites.

Do not consider the Phase 1 baseline a replacement for a tested backup/restore procedure.
