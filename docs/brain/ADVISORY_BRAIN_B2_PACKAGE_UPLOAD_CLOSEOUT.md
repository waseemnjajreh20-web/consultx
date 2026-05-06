# Advisory Brain B2 — Package Upload Closeout

**Date:** 2026-05-06  
**Upload Timestamp:** 2026-05-06T04:50:36Z  
**Task:** TASK 5 — Closeout  
**Status:** COMPLETE — 7/7 files uploaded and verified

---

## Upload Script

```bash
# Run from repo root:
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/upload_advisory_brain_b2_package.cjs
```

The script covers:
- TASK 2: Checks and backs up any existing advisory_* files in bucket
- TASK 3: Uploads all 7 files with SHA256 post-upload verification
- TASK 4: Post-upload bucket validation against local package

---

## Files to Upload

| Local | Bucket Key | Size |
|-------|-----------|------|
| advisory_brain_manifest.json | `brain_full_v1/advisory_brain_manifest.json` | 1,913 bytes |
| nodes_compact.json | `brain_full_v1/advisory_nodes_compact.json` | 164,171 bytes |
| orphans_compact.json | `brain_full_v1/advisory_orphans_compact.json` | 4,781 bytes |
| thresholds_compact.json | `brain_full_v1/advisory_thresholds_compact.json` | 36,214 bytes |
| edges_compact.json | `brain_full_v1/advisory_edges_compact.json` | 223,192 bytes |
| workflows_compact.json | `brain_full_v1/advisory_workflows_compact.json` | 36,155 bytes |
| validation_cases_compact.json | `brain_full_v1/advisory_validation_cases_compact.json` | 8,690 bytes |

**Total:** 7 files, 475,116 bytes

---

## Upload Results (Actual)

| Check | Result |
|-------|--------|
| advisory_* files in bucket | 7 / 7 ✅ |
| manifest validation_result | PASS ✅ |
| no_orphan_promoted | true ✅ |
| no_secrets | true ✅ |
| all SHA256 match local | PASS ✅ (7/7) |
| backup required | No (first upload) ✅ |

---

## After Upload: Loader Readiness

With `ADVISORY_BRAIN_B2_ENABLED=1`, the loader will find:
```
[AdvisoryBrainB2] flag=on loading brain package from bucket…
[AdvisoryBrainB2] flag=on package_loaded=true nodes=440 edges=278 workflows=8 validation_cases=10
```

Without the flag (current state), no bucket fetch occurs regardless.

---

## What Changes After Upload

- **User behavior:** unchanged (all flags remain OFF)
- **Function behavior:** unchanged (loader returns null when flag OFF)
- **Bucket state:** 7 new advisory_* files under brain_full_v1/
- **Flag state:** all four B2 flags remain OFF

---

## Rollback

If upload produces wrong results:
```bash
# Files in backup (created by script if any advisory_* existed before):
.tmp_bucket_backup/advisory_brain_before_b2_<timestamp>/

# Delete uploaded files from bucket:
# (via Supabase dashboard or supabase storage rm command)
```

---

## Next Step After Upload

1. Run Stage 1 smoke: `ADVISORY_BRAIN_B2_ENABLED=1` in staging → verify `package_loaded=true`
2. See: `docs/brain/ADVISORY_BRAIN_B2_CONTROLLED_ENABLEMENT_PLAN.md`
