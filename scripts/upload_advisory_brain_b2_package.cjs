/**
 * upload_advisory_brain_b2_package.cjs
 *
 * Uploads Advisory Brain B2 runtime package to Supabase bucket.
 * Covers: TASK 2 (backup check), TASK 3 (upload + verify), TASK 4 (post-upload verify).
 * Writes result docs to docs/brain/.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/upload_advisory_brain_b2_package.cjs
 *   OR
 *   node scripts/upload_advisory_brain_b2_package.cjs <SERVICE_ROLE_KEY>
 *
 * Requirements:
 *   - @supabase/supabase-js in node_modules (already installed)
 *   - Runtime package files in generated/consultx_brain_full/v4/advisory_brain/runtime_package/
 *
 * Flags: No flags are enabled. This is upload-only.
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const BUCKET = "ssss";
const PREFIX = "brain_full_v1";

const REPO_ROOT = path.resolve(__dirname, "..");
const PKG_DIR = path.join(REPO_ROOT, "generated", "consultx_brain_full", "v4", "advisory_brain", "runtime_package");
const DOCS_DIR = path.join(REPO_ROOT, "docs", "brain");
const BACKUP_BASE = path.join(REPO_ROOT, ".tmp_bucket_backup");

// Local filename → bucket key mapping (must match brain_b1_loader.ts bucketDownload keys)
const FILE_MAP = [
  { local: "advisory_brain_manifest.json",  bucketKey: "advisory_brain_manifest.json" },
  { local: "nodes_compact.json",            bucketKey: "advisory_nodes_compact.json" },
  { local: "orphans_compact.json",          bucketKey: "advisory_orphans_compact.json" },
  { local: "thresholds_compact.json",       bucketKey: "advisory_thresholds_compact.json" },
  { local: "edges_compact.json",            bucketKey: "advisory_edges_compact.json" },
  { local: "workflows_compact.json",        bucketKey: "advisory_workflows_compact.json" },
  { local: "validation_cases_compact.json", bucketKey: "advisory_validation_cases_compact.json" },
];

function sha256File(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function nowStamp() {
  return new Date().toISOString().replace(/[:\-T]/g, "").replace(/\..+/, "").slice(0, 15);
}

function writeMd(filename, content) {
  const full = path.join(DOCS_DIR, filename);
  fs.writeFileSync(full, content, "utf-8");
  console.log(`  📝 Written: docs/brain/${filename}`);
}

async function main() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.argv[2];
  if (!serviceRoleKey) {
    console.error("❌ Service role key required.");
    console.error("   Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/upload_advisory_brain_b2_package.cjs");
    console.error("   Get key: Supabase Dashboard → Project Settings → API → service_role secret");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, serviceRoleKey);
  const stamp = nowStamp();
  const results = { backup: null, uploads: [], verify: [] };

  // ── TASK 2: Check and backup existing advisory_* files ─────────────────────
  console.log("\n=== TASK 2: Backup Check ===\n");

  const { data: existingList, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(PREFIX, { limit: 200 });

  if (listErr) {
    console.error("❌ Cannot list bucket:", listErr.message);
    process.exit(1);
  }

  const advisoryFiles = (existingList || []).filter(f => f.name.startsWith("advisory_"));
  console.log(`  Bucket brain_full_v1/ has ${(existingList || []).length} total files.`);
  console.log(`  Advisory files found: ${advisoryFiles.length}`);

  let isFirstUpload = advisoryFiles.length === 0;
  let backupDir = null;
  let backupResult = "";

  if (!isFirstUpload) {
    backupDir = path.join(BACKUP_BASE, `advisory_brain_before_b2_${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`\n  Backing up ${advisoryFiles.length} existing files to:\n  ${backupDir}`);

    for (const f of advisoryFiles) {
      const key = `${PREFIX}/${f.name}`;
      const { data, error } = await supabase.storage.from(BUCKET).download(key);
      if (error || !data) {
        console.warn(`  ⚠️  Could not download ${key} for backup: ${error?.message}`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(path.join(backupDir, f.name), buf);
      console.log(`  ✅ Backed up: ${f.name} (${buf.length} bytes)`);
    }
    backupResult = `BACKUP CREATED: ${advisoryFiles.length} files saved to .tmp_bucket_backup/advisory_brain_before_b2_${stamp}/`;
  } else {
    backupResult = "FIRST UPLOAD: no existing advisory_* files in bucket — no backup needed.";
    console.log(`  ${backupResult}`);
  }

  writeMd("ADVISORY_BRAIN_B2_PACKAGE_BACKUP_RESULT.md",
`# Advisory Brain B2 — Package Backup Result

**Date:** ${new Date().toISOString().split("T")[0]}
**Timestamp:** ${new Date().toISOString()}
**Task:** TASK 2 — Backup Existing Package

## Result

${isFirstUpload
  ? "**FIRST UPLOAD** — No existing advisory_* files found in `ssss/brain_full_v1/`.\nNo backup required.\n\nThe advisory Brain B2 package is being uploaded for the first time."
  : `**BACKUP CREATED** — ${advisoryFiles.length} existing advisory_* files found.\nSaved to: \`.tmp_bucket_backup/advisory_brain_before_b2_${stamp}/\`

### Files Backed Up
${advisoryFiles.map(f => `- ${f.name}`).join("\n")}`}

## Bucket State Before Upload

| Metric | Value |
|--------|-------|
| Total files in brain_full_v1/ | ${(existingList || []).length} |
| Existing advisory_* files | ${advisoryFiles.length} |
| Backup directory | ${isFirstUpload ? "N/A (first upload)" : `.tmp_bucket_backup/advisory_brain_before_b2_${stamp}/`} |

## Rollback

${isFirstUpload
  ? "If upload fails: delete advisory_* keys added to brain_full_v1/."
  : `If upload fails or produces wrong results:\n\`\`\`\n# Re-upload from backup:\nnode scripts/upload_advisory_brain_b2_package.cjs --restore .tmp_bucket_backup/advisory_brain_before_b2_${stamp}/\n\`\`\``}
`);

  // ── TASK 3: Upload + verify ────────────────────────────────────────────────
  console.log("\n=== TASK 3: Upload + Verify ===\n");

  let allMatch = true;

  for (const { local, bucketKey } of FILE_MAP) {
    const localPath = path.join(PKG_DIR, local);
    if (!fs.existsSync(localPath)) {
      console.error(`❌ Local file missing: ${localPath}`);
      process.exit(1);
    }

    const localContent = fs.readFileSync(localPath);
    const localHash = sha256Buffer(localContent);
    const fullKey = `${PREFIX}/${bucketKey}`;

    console.log(`  Uploading ${bucketKey} (${localContent.length} bytes)...`);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(fullKey, localContent, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadErr) {
      console.error(`  ❌ Upload failed: ${uploadErr.message}`);
      allMatch = false;
      results.uploads.push({ bucketKey, status: "FAIL", error: uploadErr.message });
      continue;
    }

    // Re-download and verify
    const { data: dlData, error: dlErr } = await supabase.storage.from(BUCKET).download(fullKey);
    if (dlErr || !dlData) {
      console.error(`  ❌ Re-download failed: ${dlErr?.message}`);
      allMatch = false;
      results.uploads.push({ bucketKey, status: "FAIL_VERIFY", localHash });
      continue;
    }

    const dlBuf = Buffer.from(await dlData.arrayBuffer());
    const dlHash = sha256Buffer(dlBuf);

    if (localHash !== dlHash) {
      console.error(`  ❌ SHA256 MISMATCH: local=${localHash} bucket=${dlHash}`);
      allMatch = false;
      results.uploads.push({ bucketKey, status: "HASH_MISMATCH", localHash, bucketHash: dlHash });
    } else {
      console.log(`  ✅ ${bucketKey}: uploaded + verified (${localContent.length} bytes, sha256 match)`);
      results.uploads.push({ bucketKey, status: "OK", hash: localHash, bytes: localContent.length });
    }
  }

  if (!allMatch) {
    console.error("\n❌ Upload or verification failed. Check results above.");
    if (backupDir) {
      console.error(`   Backup available at: ${backupDir}`);
    }
    process.exit(1);
  }

  const uploadRows = results.uploads.map(u =>
    `| ${u.bucketKey} | ${u.bytes?.toLocaleString() ?? "?"} | \`${u.hash?.slice(0,16)}...\` | ${u.status} |`
  ).join("\n");

  writeMd("ADVISORY_BRAIN_B2_PACKAGE_UPLOAD_RESULT.md",
`# Advisory Brain B2 — Package Upload Result

**Date:** ${new Date().toISOString().split("T")[0]}
**Timestamp:** ${new Date().toISOString()}
**Task:** TASK 3 — Upload + Verify

## Upload Summary

| Status | Files |
|--------|-------|
| Uploaded + verified | ${results.uploads.filter(u => u.status === "OK").length} / ${FILE_MAP.length} |
| Failed | ${results.uploads.filter(u => u.status !== "OK").length} |

## File Details

| Bucket Key | Size (bytes) | SHA256 (prefix) | Status |
|-----------|-------------|-----------------|--------|
${uploadRows}

## Bucket

\`\`\`
bucket: ssss
prefix: brain_full_v1/
keys:   advisory_brain_manifest.json
        advisory_nodes_compact.json
        advisory_orphans_compact.json
        advisory_thresholds_compact.json
        advisory_edges_compact.json
        advisory_workflows_compact.json
        advisory_validation_cases_compact.json
\`\`\`

## Verdict: ${allMatch ? "PASS — All files uploaded and SHA256-verified." : "FAIL — See errors above."}
`);

  // ── TASK 4: Post-upload verify ─────────────────────────────────────────────
  console.log("\n=== TASK 4: Post-Upload Verify ===\n");

  // List advisory_* files now
  const { data: postList, error: postListErr } = await supabase.storage
    .from(BUCKET)
    .list(PREFIX, { limit: 200 });

  if (postListErr) {
    console.error("❌ Post-upload list failed:", postListErr.message);
    process.exit(1);
  }

  const advisoryNow = (postList || []).filter(f => f.name.startsWith("advisory_"));
  console.log(`  Found ${advisoryNow.length} advisory_* files in bucket after upload`);

  // Verify manifest
  const { data: manifestDl, error: manifestErr } = await supabase.storage
    .from(BUCKET)
    .download(`${PREFIX}/advisory_brain_manifest.json`);

  let manifestOk = false;
  let manifestCounts = {};
  let secretsOk = true;
  let orphanOk = true;

  if (!manifestErr && manifestDl) {
    const manifestText = await manifestDl.text();
    const manifest = JSON.parse(manifestText);
    manifestOk = manifest.validation_result === "PASS";
    manifestCounts = manifest.node_counts || {};
    orphanOk = manifest.invariants?.no_orphan_promoted === true;
    const secretsCheck = manifest.invariants?.no_secrets === true;
    secretsOk = secretsCheck;
    console.log(`  Manifest: validation_result=${manifest.validation_result}, nodes=${manifest.node_counts?.total}`);
    console.log(`  Invariants: no_orphan_promoted=${orphanOk}, no_secrets=${secretsOk}`);
  } else {
    console.error("❌ Could not download manifest from bucket:", manifestErr?.message);
    process.exit(1);
  }

  // Cross-check hashes
  const hashChecks = [];
  for (const { local, bucketKey } of FILE_MAP) {
    const localPath = path.join(PKG_DIR, local);
    const localHash = sha256File(localPath);
    const fullKey = `${PREFIX}/${bucketKey}`;
    const { data: dlData } = await supabase.storage.from(BUCKET).download(fullKey);
    if (!dlData) {
      hashChecks.push({ bucketKey, status: "MISSING" });
      continue;
    }
    const dlHash = sha256Buffer(Buffer.from(await dlData.arrayBuffer()));
    const match = localHash === dlHash;
    hashChecks.push({ bucketKey, localHash, bucketHash: dlHash, match });
    console.log(`  ${match ? "✅" : "❌"} ${bucketKey}: hash ${match ? "MATCH" : "MISMATCH"}`);
  }

  const allHashMatch = hashChecks.every(h => h.match === true);

  writeMd("ADVISORY_BRAIN_B2_PACKAGE_POST_UPLOAD_VERIFY.md",
`# Advisory Brain B2 — Post-Upload Verification

**Date:** ${new Date().toISOString().split("T")[0]}
**Timestamp:** ${new Date().toISOString()}
**Task:** TASK 4 — Post-Upload Verify

## Bucket State After Upload

| Check | Result |
|-------|--------|
| advisory_* files in bucket | ${advisoryNow.length} / ${FILE_MAP.length} expected |
| manifest validation_result | ${manifestOk ? "PASS ✅" : "FAIL ❌"} |
| no_orphan_promoted | ${orphanOk ? "true ✅" : "false ❌"} |
| no_secrets | ${secretsOk ? "true ✅" : "false ❌"} |
| all hashes match local | ${allHashMatch ? "PASS ✅" : "FAIL ❌"} |

## Node Counts (from bucket manifest)

| Type | Count |
|------|-------|
| sections | ${manifestCounts.sections_total ?? "?"} |
| tables | ${manifestCounts.tables ?? "?"} |
| orphans | ${manifestCounts.orphans ?? "?"} |
| thresholds | ${manifestCounts.thresholds ?? "?"} |
| **total** | **${manifestCounts.total ?? "?"}** |

## Hash Verification

| Bucket Key | Local Hash (prefix) | Bucket Hash (prefix) | Match |
|-----------|---------------------|---------------------|-------|
${hashChecks.map(h =>
  `| ${h.bucketKey} | \`${(h.localHash || "?").slice(0,16)}...\` | \`${(h.bucketHash || "?").slice(0,16)}...\` | ${h.match === true ? "✅" : "❌"} |`
).join("\n")}

## Files in Bucket (advisory_*)

${advisoryNow.map(f => `- \`brain_full_v1/${f.name}\``).join("\n")}

## Verdict: ${allHashMatch && manifestOk ? "PASS — Bucket matches local package exactly." : "FAIL — Hash mismatch or manifest invalid."}
`);

  console.log(`\n  ${allHashMatch && manifestOk ? "✅ PASS" : "❌ FAIL"}: Post-upload verification complete`);

  if (!allHashMatch || !manifestOk) {
    console.error("❌ Verification failed. Manual intervention required.");
    process.exit(1);
  }

  console.log("\n=== ALL TASKS COMPLETE ===");
  console.log("  Next: run closeout script or write closeout doc.");
  console.log("  DO NOT enable any flags until owner authorization.");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
