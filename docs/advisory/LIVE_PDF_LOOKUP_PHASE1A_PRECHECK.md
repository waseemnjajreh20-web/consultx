# Live PDF Lookup — Phase 1A Pre-Upload Safety Check

Date: 2026-05-05 (R10)
Branch: `claude/affectionate-solomon-f5e304`
Local hashes: `.tmp_phase1a/local_hashes.json` (gitignored — intermediate file)

---

## 1. PDF inventory at `D:/sbc_consultx/`

| Metric | Value |
|--------|------:|
| Total PDFs found | **18** ✅ |
| Total bytes | 240,265,268 (~229.1 MB) |
| Per-file SHA256 | All 18 computed |
| Family split | SBC-201: 8 parts, ~140 MB · SBC-801: 10 parts, ~89 MB |

### Per-file SHA256 + target bucket path

```
8c7e9737...11ae0077  33,108,986  SBC201/pp_0001-0250.pdf  ← SBC 201 ...-1-250.pdf
b39677bd...d771bd     8,916,109  SBC201/pp_0251-0500.pdf  ← SBC 201 ...-251-500.pdf
0b1aab3a...0502a0    21,802,545  SBC201/pp_0501-1000.pdf  ← SBC 201 ...-501-1000.pdf
9d7a8890...aaf1e0f   14,952,279  SBC201/pp_1001-1250.pdf  ← SBC 201 ...-1001-1250.pdf
a5e571f1...64d4a     34,162,751  SBC201/pp_1251-1500.pdf  ← SBC 201 ...-1251-1500.pdf
8c38c417...e66e       7,330,744  SBC201/pp_1501-1750.pdf  ← SBC 201 ...-1501-1750.pdf
5b5e9227...8e4c      15,053,132  SBC201/pp_1751-2000.pdf  ← SBC 201 ...-1751-2000.pdf
642e5663...9c78      11,138,585  SBC201/pp_2001-2200.pdf  ← SBC 201 ...-2001-2200.pdf
75bd5c55...ec1f5     28,020,428  SBC801/pp_0001-0200.pdf  ← SBC 801 ...-(3)-1-200.pdf
637212f7...2bb55      6,842,247  SBC801/pp_0201-0400.pdf  ← SBC 801 ...-(3)-201-400.pdf
6332e245...ab588      4,032,860  SBC801/pp_0401-0600.pdf  ← SBC 801 ...-(3)-401-600.pdf
75703068...e298       4,963,339  SBC801/pp_0601-0800.pdf  ← SBC 801 ...-(3)-601-800.pdf
0480a515...6f001     31,503,285  SBC801/pp_0801-1000.pdf  ← SBC 801 ...-(3)-801-1000.pdf
ef17f645...c6c8e      3,494,435  SBC801/pp_1001-1200.pdf  ← SBC 801 ...-(3)-1001-1200.pdf
fc4f7e45...c06b       4,775,762  SBC801/pp_1201-1400.pdf  ← SBC 801 ...-(3)-1201-1400.pdf
abb3d9fe...31d6       3,466,739  SBC801/pp_1401-1600.pdf  ← SBC 801 ...-(3)-1401-1600.pdf
0a495b3e...3167       2,859,849  SBC801/pp_1601-1800.pdf  ← SBC 801 ...-(3)-1601-1800.pdf
61e1f46a...62cc9      3,841,193  SBC801/pp_1801-2061.pdf  ← SBC 801 ...-(3)-1801-2061.pdf
```

(Hashes truncated to first 8 + last 6 chars for readability. Full hashes in `.tmp_phase1a/local_hashes.json`.)

---

## 2. Text-layer status (re-verified)

R9 already verified all 18 PDFs have working text layers. Two spot-checks today re-confirm:

| File | First-5-page chars |
|------|-------------------:|
| `SBC 201 ...-1-250.pdf` | 3,498 ✅ |
| `SBC 801 ...-(3)-801-1000.pdf` (the 31 MB) | 24,725 ✅ |

OCR is **NOT required** for Phase 1A. The text-layer-only path is sufficient for the lookup index.

---

## 3. Bucket inventory (production state)

| Bucket | Public? | File-size limit | MIME types | Notes |
|--------|:-------:|----------------:|------------|-------|
| `ConsultX _file` | false | 50 MB | `application/json`, `text/plain` | Project's general-purpose private bucket |
| `ssss` | **true** | 50 MB | (any) | Public bucket — primary corpus + V1 sidecar (R5 refresh landed here). Critical runtime data path. |
| `chat-images` | **true** | unlimited | (any) | Frontend-uploaded chat images |
| `source-pdfs` | **true** | 100 MB | `application/pdf`, `application/json` | **Already contains all 18 SBC PDFs** (see Section 4) |
| `enterprise-case-documents` | false | 50 MB | (any) | Enterprise documents — RLS-gated |
| `sbc_pdfs_private` | (does not exist yet) | n/a | n/a | Target for Phase 1A |

### `sbc_pdfs_private` status

**Not yet created.** Confirmed via two independent checks:
1. `GET /storage/v1/bucket` lists all buckets — `sbc_pdfs_private` not present.
2. `POST /storage/v1/object/list/sbc_pdfs_private` returns `[]` (empty list — bucket may exist but is empty, OR bucket doesn't exist; the API response is the same).

Phase 1A Task 2 will create this bucket.

---

## 4. ⚠ CRITICAL FINDING — All 18 SBC PDFs already exposed in PUBLIC bucket

### What was found

The bucket `source-pdfs` (configured `public=true`, file-size 100 MB) **already contains all 18 SBC source PDFs**:

- `source-pdfs/sbc/sbc-201/SBC 201 - ... .pdf` — 8 files (matching all 8 local SBC-201 PDFs by byte size)
- `source-pdfs/sbc/sbc-801/SBC 801 - ... .pdf` — 10 files (matching all 10 local SBC-801 PDFs by byte size)
- `source-pdfs/manifest/source-map.json` — a 20 KB metadata file

### Anonymous-access verification

Tested live (no auth header at all):

```
$ curl -sI "https://hrnltxmwoaphgejckutk.supabase.co/storage/v1/object/public/source-pdfs/sbc/sbc-201/SBC%20201%20-%20The%20Saudi%20General%20Building%20Code-1-250.pdf"
HTTP=200 content_type=application/pdf size=33108986
```

**The 33 MB SBC-201 PDF #1 is currently downloadable by ANY internet client without authentication.** Same applies to all 18 PDFs by analogy.

The `source-pdfs` bucket is also publicly listable — anonymous clients can enumerate the folder structure.

### Why this exists

The frontend code at `src/utils/sourceMetadata.ts:15` defines `const PDF_BUCKET = "source-pdfs"` and constructs URLs like `https://.../storage/v1/object/public/source-pdfs/sbc/sbc-201/...`. The Source Panel in the chat UI uses these URLs as click-to-open-source links for citation chips. The public-ness of the bucket is **deliberate** for the Source Panel feature — it's been part of the runtime UX for some time.

### Conflict with R10 owner directives

The R10 brief states explicitly:
- "PDFs تخزن في private bucket فقط" (PDFs stored in private bucket ONLY)
- "ممنوع public download" (public download FORBIDDEN)
- "ممنوع كشف روابط مباشرة للمستخدمين" (exposing direct URLs to users FORBIDDEN)
- "bucket public=false"

Today's production state contradicts all four. The conflict was almost certainly **not anticipated by the owner when R10 was written** — they likely don't know that `source-pdfs` was created and populated as a public bucket.

### What I am NOT doing in Phase 1A

- ❌ NOT deleting the `source-pdfs` bucket. Frontend depends on it.
- ❌ NOT flipping `source-pdfs` to private. That would break the Source Panel UX immediately.
- ❌ NOT modifying `src/utils/sourceMetadata.ts`. R10 brief forbids any code change.
- ❌ NOT modifying any frontend code.

### What I AM doing in Phase 1A

- ✅ Surfacing this finding clearly to the owner via this report.
- ✅ Creating the new `sbc_pdfs_private` bucket per R10 directives. The new private bucket is for Phase 1B's runtime helper to use; it does NOT replace `source-pdfs` for the existing Source Panel feature.
- ✅ Uploading PDFs to the new private bucket only. Will not touch the existing public copies.
- ✅ Flagging the conflict in the Phase 1A final report with three options for owner resolution.

### Owner-side resolution options (deferred to a separate decision)

1. **Status quo**: keep `source-pdfs` public for the Source Panel UX; new `sbc_pdfs_private` is server-side-only per R10. The "private bucket only" directive applies to the NEW Live PDF Lookup work, NOT retroactively to existing infrastructure. (The simplest interpretation.)
2. **Phase out public exposure**: deprecate `source-pdfs` over time. Phase 1B's Live PDF Lookup helper returns text excerpts instead of PDF links. Frontend updated separately to read excerpts from edge-function responses instead of constructing public URLs. This is V2-style work, not in R10's scope.
3. **Immediate flip to private**: change `source-pdfs` to `public=false` now. **DO NOT recommend** — would break the Source Panel feature, plus the brief says no code change.

**Recommendation**: option 1 (status quo for `source-pdfs`, new private bucket for Live PDF Lookup). The R10 brief's "PDFs in private bucket only" naturally reads as applying to the NEW work the brief authorizes, not to prior production state.

---

## 5. Pre-upload safety summary

| Check | Result |
|-------|:------:|
| 18 PDFs available locally | ✅ |
| Total size known (229 MB) | ✅ |
| Per-file SHA256 computed | ✅ |
| Text layer verified | ✅ |
| Target bucket exists | ❌ (will be created in Task 2) |
| Existing public exposure of same content (orphan finding) | ⚠ — flagged |
| Code references for new bucket name | ✅ none (clean slate) |
| Service-role credential reachable | ✅ (from git history per R5 deferred-rotation directive) |
| Local PDFs unchanged since R9 | ✅ — same SHA256 |

### `ready_to_upload`: **YES** (with the caveat that the `source-pdfs` public exposure issue is flagged separately for owner attention).

---

## 6. Next steps

Per R10:

| Task | Status |
|------|--------|
| Task 1 — Pre-Upload Safety Check | **DONE (this document)** |
| Task 2 — Create `sbc_pdfs_private` bucket | Ready to start |
| Task 3 — Upload 18 PDFs with hash verification | Ready (after Task 2) |
| Task 4 — Build lookup index | Ready (after Task 3) |
| Task 5 — Privacy verification | Ready (after Task 3 + 4) |
| Task 6 — Phase 1A final report | Ready (after Tasks 1-5) |

Phase 1A continues. No PDF uploaded yet. The R10 brief's "no PDF upload before Task 3" rule is respected.

---

## 7. What this document does NOT change

- ❌ No file uploaded.
- ❌ No bucket created.
- ❌ No bucket deleted or modified.
- ❌ No code changed.
- ❌ No deploy.
- ❌ No DB write.
- ❌ No frontend change.

This is read-only safety + design. The next task (Task 2) is the first state-changing action of R10.
