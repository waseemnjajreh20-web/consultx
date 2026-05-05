# Bucket Refresh Plan — 2026-05-05 (R4)

Branch: `claude/affectionate-solomon-f5e304`
Local commit: `686d4e8` (R3 corpus with policy gate active)

---

## 1. Critical discovery — production state is older than expected

Pre-flight verification revealed that the production bucket at `ssss/brain_full_v1/` is serving **the original Phase 1 V1 corpus** — not even the May-1 Phase 2 build. Round-1 extracted gaps have **never** been uploaded to the bucket.

| Source | Local committed (R3-gated) | Production bucket (current) | Delta if uploaded |
|--------|---------------------------:|----------------------------:|------------------:|
| SBC-201 chunks | 136 | **95** | +41 |
| SBC-801 chunks | 222 | **137** | +85 |
| **Combined** | **358** | **232** | **+126** |

This contradicts the prior closeout reports' assumption that production held the May-1 corpus. The 12 SBC-201 round-2 chunks the R3 policy gate "removed" **were never in production to begin with**. The actual production-side effect of an upload is **net +126 chunks added** — primarily round-1 SBC-201 (41) and round-1 SBC-801 (84), plus 1 round-2 safe section.

### What's actually in production right now

- 95 SBC-201 chunks — only the human-curated `sources/sbc201/*.md` content.
- 137 SBC-801 chunks — only `sources/sbc801/*.md`.
- Zero round-1 extracted gap content.
- Zero round-2 content (good — no policy violation in production).

### What the local R3-gated corpus contains

- 95 SBC-201 sources + 41 round-1 extracts (PARTIAL_STRUCTURED) = 136
- 117 SBC-801 sources + 84 round-1 (EXISTS_CANONICAL) + 20 partial + 1 safe round-2 = 222
- Zero `requires_review:true` content (R3 policy gate enforced)

---

## 2. Source local files

| File | Path | Bytes | SHA256 |
|------|------|------:|--------|
| SBC-201 chunks | `generated/consultx_brain_full/chunks/SBC201_canonical_chunks.json` | 3,080,694 | `69ac45a35a32e37e4faeb787b09728927cc6a71b1b3c97c49b938089d69964c1` |
| SBC-801 chunks | `generated/consultx_brain_full/chunks/SBC801_canonical_chunks.json` | 8,330,887 | `ea50dcbf493a5fb3f3afc8349b48468864eef50d49df64882b2dc2f1d74f7208` |

Pre-flight gate audit on local files (all PASS):
- 0 chunks contain `requires_review:true` text.
- 0 of the 12 blocked SBC-201 round-2 sections present (sections 102, 104, 109-116, 202, 309).
- 1 safe round-2 section present (`sbc-801-section-114-1-1`).

## 3. Target bucket paths

Read from `supabase/functions/fire-safety-chat/index.ts:1202` (`brain_full_v1/${key}`) and from the May-1 Phase 3B revert commit message (`Bucket: npx supabase storage rm ss:///ssss/{...}`).

| Target | Bucket | Path |
|--------|--------|------|
| SBC-201 | `ssss` | `brain_full_v1/SBC201_canonical_chunks.json` |
| SBC-801 | `ssss` | `brain_full_v1/SBC801_canonical_chunks.json` |

## 4. Current production hashes (from anonymous public-read of bucket)

| File | Bytes | SHA256 | Chunks |
|------|------:|--------|------:|
| Production SBC-201 | 2,805,184 | `0ab7d3195d9140e0d91f9908660fb62695d6f853825c539f16809378d511f917` | 95 |
| Production SBC-801 | 7,932,092 | `1982dc4932df7a1289607f886e5feadd80c26d6a7dc50b9545584c8f37567988` | 137 |

The production hashes are **distinct** from the local hashes — confirming that the upload would change production state, and confirming the backup contains real production bytes (not a cached redirect to the same file).

## 5. Backup location

```
.tmp_bucket_backup/brain_full_v1_20260505_141306/
  ├─ SBC201_canonical_chunks.json   (2,805,184 bytes)
  ├─ SBC801_canonical_chunks.json   (7,932,092 bytes)
  └─ _metadata.txt                  (timestamp + dir info)
```

The backup is **outside** the repo and is gitignored by default (the directory name starts with `.tmp_`). The retention policy is operator-controlled — keep the backup until rotation/upload is confirmed stable.

## 6. Rollback steps

If upload fails, succeeds with corrupt content, or causes any unexpected behavior:

1. Stop further actions immediately.
2. With a service-role-tier credential, re-upload the backup files to the same target paths:
   ```
   # Pseudocode — operator runs from a shell with SUPABASE_SERVICE_ROLE_KEY set
   for f in SBC201_canonical_chunks.json SBC801_canonical_chunks.json; do
     curl -X POST "https://hrnltxmwoaphgejckutk.supabase.co/storage/v1/object/ssss/brain_full_v1/$f?upsert=true" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
       -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
       -H "Content-Type: application/json" \
       --data-binary "@.tmp_bucket_backup/brain_full_v1_20260505_141306/$f"
   done
   ```
3. Re-fetch and verify SHA256 matches the recorded production hashes from Section 4.
4. Wait for CDN cache (`Cache-Control: public, max-age=3600` was observed) — invalidate by purging the CF cache or wait 1 hour.

## 7. Expected production effect

| Aspect | Before upload | After upload |
|--------|---------------|--------------|
| Chunks served | 232 (95 + 137) | 358 (136 + 222) |
| Round-1 extracts in retrieval | NO | YES (125 chunks) |
| Round-2 `sbc-801-section-114-1-1` | NO | YES (1 chunk) |
| Round-2 `requires_review:true` | NO (good) | NO (still — gate enforced locally) |
| Code deploy | None | None |
| DB write | None | None |
| Edge function change | None | None |
| Bucket-other-paths change | None | None |
| User-visible retrieval surface | static at 232 sections | grows to 358 sections (chunks-file view: 42% → 65%) |

This is a **substantially larger change than the prior closeout report described**. Earlier reports framed the upload as "remove 12 violating chunks + add 1 safe chunk = net −11". The truth is **net +126** — round-1 is currently absent from production and would be promoted in this single bucket refresh.

## 8. Decision criterion

Per the user's R4 task brief, Task 5 should execute the upload only if all of the following are true:
- Backup succeeded ✅
- Hashes computed ✅
- Target paths confirmed ✅
- Credentials present ✅ (anon for read; would need service_role for write)
- Local files are R3-gated ✅
- Local chunks contain no `requires_review:true` ✅
- Blocked sections absent locally ✅
- Safe section present locally ✅

**However**: the user's expected production effect was "remove 12 + add 1 = −11". The actual production effect is **+126**, which exceeds the policy-fix scope they described. This is a **substantively different change** than the brief contemplated.

Per the project's standing principle "be honest, do not take big destructive actions that surprise the operator", **the upload is held back** pending explicit operator acknowledgment that they want the full +126 round-1 promotion to land in this single bucket refresh, not the small −11 policy fix they described.

## 9. Status

**Task 4 complete: plan written, backup secured.**
**Task 5 status: BLOCKED_LARGER_DELTA_THAN_EXPECTED.**

The bucket refresh is technically ready to execute — credentials, backups, hashes, and validation all pass. The block is editorial, not technical: the operator should explicitly opt in to the +126 chunk promotion before the upload runs, since it is materially different from the −11 policy fix the brief described.

If the operator confirms "yes, promote the full R3-gated corpus including all round-1 + the 1 safe round-2 section to production", Task 5 can be unblocked in a follow-up session and the upload run with the existing backup as the rollback safety net.

If the operator wants the *original* small policy fix (−11 net), the local corpus would first need to be rebuilt against the production baseline (95 + 137 = 232) by removing the round-1 chunks from the local input set — a different operation entirely, also out of scope for this autonomous round.

---

## 10. Credentials check (per Task 4 explicit ask)

| Capability | Available in this session? |
|------------|:--------------------------:|
| Anon bucket read (download backup) | ✅ |
| Service-role bucket write (upload) | ⚠ Possible via the service_role JWT that was just removed in commit `a0d47af` and is being rotated. Using it now is technically possible but procedurally questionable since it has been declared compromised. |

The clean path is: rotate first (operator-side), then upload with the new key. That sequencing is also called out in [docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md](docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md) Section 4.

This further reinforces the BLOCKED status of Task 5.
