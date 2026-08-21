# Migration / Schema Reconciliation — Production vs Local Migrations

**Project:** `hrnltxmwoaphgejckutk`
**Captured:** 2026-05-01 during Phase 1 truth-layer remediation.
**Principle:** Production schema is treated as the current runtime truth. No `supabase db push` was run. No existing local migration was deleted, renamed, or rewritten. Historical drift (43 local vs 57 production with zero shared versions) remains open; this document captures the production reality so future reconciliation has a baseline.

## 1. Summary snapshot

| Object class | Count in production `public` |
|---|---|
| Tables | 47 |
| Constraints | 193 |
| Indexes | 180 |
| Database functions | 51 |
| Extensions | 9 |
| RLS policies | 75 |
| Triggers | 0 |

All 47 `public` tables have `ENABLE ROW LEVEL SECURITY`. 38 have at least one policy; 9 have RLS enabled but no policies and therefore reject direct user access by default (e.g. `user_subscriptions`, which is written to by service-role edge functions only).

## 2. Extensions

```
pg_cron
pg_net
pg_stat_statements
pgcrypto
plpgsql
supabase_vault
uuid-ossp
vector
wrappers
```

`vector` is critical — it backs `match_sbc_documents` and the `idx_sbc_documents_embedding` ivfflat index.

## 3. Tables grouped by subsystem

| Group | Tables |
|---|---|
| **Core auth / chat** | `profiles`, `conversations`, `messages`, `daily_message_usage`, `mode_daily_usage`, `user_public_profiles` |
| **Subscriptions / billing** | `subscription_plans`, `user_subscriptions`, `plans`, `payment_transactions`, `payment_history`, `webhook_dead_letters` |
| **SBC corpus & retrieval** | `sbc_documents`, `sbc_pages`, `sbc_code_tables`, `document_tables` |
| **Provenance registry** | `source_registry`, `source_versions`, `corpus_coverage`, `validation_runs` |
| **Knowledge graph** | `graph_nodes`, `graph_edges`, `community_summaries`, `graph_indexing_status` |
| **Enterprise case management** | `organizations`, `org_members`, `org_invitations`, `enterprise_case_counters`, `enterprise_cases`, `case_documents`, `case_status_history`, `case_notes`, `case_reviews`, `case_approvals`, `case_ai_sessions`, `ai_report_versions`, `case_review_ai_reports`, `organization_branding_settings`, `org_member_presence`, `org_member_profiles`, `org_messages`, `case_client_contacts`, `case_public_tracking`, `case_public_updates`, `case_tasks`, `case_task_events` |
| **Admin / audit** | `admin_audit_log` |

## 4. Notable drift relative to local source

### 4.1 Tables present in production with no corresponding local migration

The following tables exist in the production schema but cannot be traced back to any file in `supabase/migrations/`:

- `source_registry`, `source_versions`, `corpus_coverage`, `validation_runs`
- `document_tables`
- `graph_nodes`, `graph_edges`, `community_summaries`, `graph_indexing_status`
- `mode_daily_usage`
- `enterprise_cases` and the entire case-management table family (17 tables)
- `organizations`, `org_members`, `org_invitations`, `enterprise_case_counters`
- `organization_branding_settings`, `org_member_presence`, `org_member_profiles`, `org_messages`
- `case_client_contacts`, `case_public_tracking`, `case_public_updates`, `case_tasks`, `case_task_events`
- `admin_audit_log`
- `payment_transactions`, `payment_history`
- `webhook_dead_letters`
- `subscription_plans`
- `user_public_profiles`
- `plans` (legacy table; apparently unused by current code)

### 4.2 Functions present in production not represented in local migrations

Critical functions include:

- `match_sbc_documents(query_embedding vector, match_count int, filter_code text)` — the vector-retrieval RPC at the center of Phase 1.
- `get_unindexed_chunks(batch_size int)` — used by `sbc-graph-indexer` to enumerate chunks awaiting KG indexing.
- `get_indexed_chunk_count()` — used to report KG coverage.
- `search_graph_nodes(...)`, `get_node_neighbors(...)` — KG read helpers, currently unused by any deployed consumer.
- `increment_daily_usage`, `decrement_mode_daily_count`, `get_mode_daily_count`, etc. — rate-limit helpers.
- `transition_case_status`, `create_enterprise_case`, `assign_enterprise_case`, `attach_ai_report_version`, `submit_case_review`, etc. — enterprise case workflow.
- `accept_org_invitation`, `create_organization_with_owner`, `is_active_org_member`, etc. — organization/invitation helpers.

### 4.3 RLS highlights and anomalies

- `sbc_documents` allows **public read** (`"Allow public read"` to `public`). This is intentional and required by the frontend citation-link flow; it is the table-level equivalent of the `source-pdfs` bucket exposure.
- `community_summaries`, `graph_nodes`, `graph_edges`, `graph_indexing_status` allow authenticated read. No edge-case risk since they contain only derived metadata.
- `user_subscriptions` has **no policies** — only service_role writes it. Confirmed secure design.
- `plans` (legacy) is readable by everyone; `subscription_plans` is readable by authenticated users filtering on `is_active = true`.
- `messages` and `conversations` policies use `public` role (not `authenticated`). This works because `auth.uid()` is null for anon users and the expressions evaluate to false, but it is a stylistic inconsistency worth noting.

## 5. Business logic present only in production

The following subsystems are fully deployed and running but have no source-of-truth representation in the local migration folder:

1. **Enterprise case lifecycle** — status machine with 13 states (`draft`, `submitted`, `assigned`, `under_engineering_review`, `ai_review_attached`, `engineer_review_completed`, `submitted_to_head`, `returned_for_revision`, `approved_internal`, `delivered_to_client`, `closed`, `cancelled`) enforced by `enterprise_cases_status_check`.
2. **Organization seat enforcement** — `subscription_plans.min_seats`, `user_subscriptions.seat_count`, `get_org_seat_usage()`, and `organizations_subscription_id_unique_idx` (unique index on `subscription_id WHERE NOT NULL`).
3. **Case review / approval** — `case_reviews`, `case_approvals`, `ai_report_versions` with decision fields consistency checks.
4. **Graph / KG** — tables and functions exist but no consumer as of this audit.
5. **Provenance registry** — `source_registry` and satellites exist but are not referenced by code.

## 6. What this means for reproducibility

You cannot recreate the current production database by running the local migration files. The gap is not a numbering mismatch; it is a **substantial set of schema objects created outside the local migration lineage**. Reconciling this requires one of the following strategies (none applied in Phase 1):

- **Option A (dump-based baseline):** run `pg_dump --schema-only` against production, compare object-by-object with the concatenated local migrations, then decide whether to adopt the production dump as the new canonical baseline and archive the 43 legacy files.
- **Option B (incremental catch-up):** write new migrations that create every missing object, ensuring idempotency. Risky because it requires reconstructing the exact historical order and some objects may depend on functions/tables whose creation path is unknown.
- **Option C (status quo + documentation):** keep the current mismatch documented, forbid `supabase db push`, and require that all future schema changes be applied through the Supabase Management API (or a new controlled migration path) and mirrored locally. This is the current de-facto state.

Phase 1 chose to **document** the drift and apply only the three production changes that were independently required (vector flag, storage fix, trial cleanup). Those three changes are mirrored in `supabase/migrations/20260501000002_phase1_truth_layer_remediation.sql`.

## 7. Remaining critical action

A full `pg_dump --schema-only` **and a tested restore** into an empty project is the only way to claim the database is reproducible. That operation is gated on having `pg_dump`/Docker credentials and a disposable Supabase project, neither of which was available in this environment. Recorded as open risk in `phase1-truth-layer-remediation.md` § Remaining risks.
