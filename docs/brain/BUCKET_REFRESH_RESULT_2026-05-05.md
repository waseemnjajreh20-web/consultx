# Bucket Refresh Result — 2026-05-05 (R4)

Companion: [docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md](docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md)

---

## 1. Status

**Executed: NO. Status: BLOCKED.**

| Field | Value |
|-------|-------|
| Executed? | **NO** |
| Uploaded files | None |
| Pre-upload local SHA256 (SBC-201) | `69ac45a35a32e37e4faeb787b09728927cc6a71b1b3c97c49b938089d69964c1` |
| Pre-upload local SHA256 (SBC-801) | `ea50dcbf493a5fb3f3afc8349b48468864eef50d49df64882b2dc2f1d74f7208` |
| Pre-upload production SHA256 (SBC-201) | `0ab7d3195d9140e0d91f9908660fb62695d6f853825c539f16809378d511f917` |
| Pre-upload production SHA256 (SBC-801) | `1982dc4932df7a1289607f886e5feadd80c26d6a7dc50b9545584c8f37567988` |
| Post-upload SHA256 | n/a — no upload performed |
| Match yes/no? | n/a |
| Rollback available? | YES — backup at `.tmp_bucket_backup/brain_full_v1_20260505_141306/` |
| Production effect | **None** — the bucket is unchanged from its pre-session state |
| Errors | None — every pre-flight check passed; the block is editorial, not technical |

## 2. Why blocked

Two reasons, both surfaced during pre-flight verification:

### 2.1 Larger delta than the brief described

The R4 task brief described the expected production effect as:
- Remove 12 `requires_review:true` chunks
- Add 1 safe chunk
- Net: −11 chunks

Pre-flight discovery (documented in [BUCKET_REFRESH_PLAN_2026-05-05.md](docs/brain/BUCKET_REFRESH_PLAN_2026-05-05.md) Section 1) revealed that the production bucket is actually serving the **original Phase 1 V1 corpus** — only 232 chunks (95 + 137). It contains **no round-1 extracts at all**. The 12 violating round-2 chunks **were never in production**.

The local R3-gated corpus has 358 chunks (136 + 222). Uploading would:
- Add 125 round-1 extracts that have never been in production.
- Add 1 round-2 safe section.
- Remove 0 chunks (nothing to remove — production never had the violating sections).
- Net: **+126 chunks** to production.

This is a **substantially different change** than the brief contemplated. Per the project standing principle "be honest, do not take big destructive actions that surprise the operator", the upload is held back pending explicit operator acknowledgment of the +126 scope.

### 2.2 Key rotation pending

The security remediation in commit `a0d47af` (Task 3 of this round) declared the leaked Supabase `service_role` JWT compromised and stipulated manual rotation as a precondition. Using that same JWT to perform a write to the `ssss/` bucket *after* declaring it compromised would create:

- A production-write trail attributable to a key marked "must rotate immediately".
- A muddied operator audit story when investigating any anomalous service-role activity from the leak window.

The clean sequencing is: **operator rotates the key first → then a follow-up session uses the new key for the bucket upload**.

## 3. Rollback availability

If a future session does execute the upload and something goes wrong, the rollback path is intact:

```
.tmp_bucket_backup/brain_full_v1_20260505_141306/
  ├─ SBC201_canonical_chunks.json   (2,805,184 bytes; sha256 0ab7d319...)
  ├─ SBC801_canonical_chunks.json   (7,932,092 bytes; sha256 1982dc49...)
  └─ _metadata.txt                  (timestamp + dir info)
```

Re-uploading these backup files to `ssss/brain_full_v1/` (with a service_role-tier credential) restores production to its current state. The backup is verified-good: it was downloaded successfully via the public anon endpoint (HTTP 200, expected sizes), and the SHA256s differ from the local R3-gated files (confirming the backup contains real production bytes, not a cached redirect).

## 4. Errors

None. The task was deliberately stopped before any write was attempted. Read-only operations (anon download) all returned HTTP 200 with expected payloads.

## 5. Production state

**Unchanged from pre-session.** The bucket continues to serve the Phase 1 V1 corpus (95 + 137 = 232 chunks). The runtime fire-safety-chat function reads from this same path.

## 6. What needs to happen before a successful execution

1. **Operator decides** whether to opt in to the +126 chunk promotion (round-1 + 1 safe round-2) in this single refresh, OR to pursue a smaller scope (round-1 only, no round-2; or round-2 safe only, etc.). The local input set would need adjustment if the smaller scope is chosen.

2. **Operator rotates** the leaked Supabase `service_role` key (steps in [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md) Section 4.1).

3. **Operator updates** the new `SUPABASE_SERVICE_ROLE_KEY` in their environment.

4. A follow-up session (or operator manually):
   - Re-runs the build script if needed.
   - Re-verifies the local SHA256 matches the recorded value (file unchanged since this session).
   - Performs the upload with the new key.
   - Re-fetches the bucket file and confirms post-upload SHA256 matches local.
   - Documents the result.

The backup directory should be retained until the upload is confirmed stable.
