/**
 * ConsultX — SBC Files Upload Script
 * رفع ملفات JSON الخاصة بكود البناء السعودي إلى Supabase Storage
 *
 * Usage: node scripts/upload-sbc-files.js <SERVICE_ROLE_KEY>
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const BUCKET_NAME = "ssss";
const SOURCE_DIR = "C:\\Users\\TOSHIBA\\Downloads\\قاعدة بيانات الكود السعودي\\قاعدة بيانات الكود السعودي PDF\\output_processed";

async function main() {
  const serviceRoleKey = process.argv[2];

  if (!serviceRoleKey) {
    console.error("❌ Usage: node scripts/upload-sbc-files.js <SERVICE_ROLE_KEY>");
    console.error("   Get your key from: Supabase Dashboard → Project Settings → API → service_role");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, serviceRoleKey);

  // Verify directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error("❌ Source directory not found:", SOURCE_DIR);
    process.exit(1);
  }

  // Get all JSON files
  const allFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith(".json"));
  console.log(`\n📁 Found ${allFiles.length} JSON files in source directory`);
  console.log(`📦 Target bucket: "${BUCKET_NAME}"\n`);

  // Separate chunks and extracted files
  const chunkFiles = allFiles.filter(f => f.includes("_chunks"));
  const extractedFiles = allFiles.filter(f => !f.includes("_chunks"));

  console.log(`   🔹 Chunk files: ${chunkFiles.length}`);
  console.log(`   🔹 Extracted files: ${extractedFiles.length}\n`);

  // Ensure bucket exists (create if not)
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!bucketExists) {
    console.log(`📦 Bucket "${BUCKET_NAME}" not found — creating it...`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 52428800, // 50 MB
    });
    if (createError) {
      console.error("❌ Failed to create bucket:", createError.message);
      process.exit(1);
    }
    console.log(`✅ Bucket "${BUCKET_NAME}" created successfully!\n`);
  } else {
    console.log(`✅ Bucket "${BUCKET_NAME}" already exists\n`);
  }

  // Check existing files in bucket
  const { data: existingFiles, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list("", { limit: 200 });

  if (listError) {
    console.error("❌ Cannot list bucket:", listError.message);
    process.exit(1);
  }

  const existingNames = new Set((existingFiles || []).map(f => f.name));
  console.log(`📋 Existing files in bucket: ${existingNames.size}\n`);

  // Upload files
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const filePath = path.join(SOURCE_DIR, file);
    const fileSize = fs.statSync(filePath).size;
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    process.stdout.write(`[${i + 1}/${allFiles.length}] ${file} (${sizeMB} MB)... `);

    try {
      const content = fs.readFileSync(filePath);

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(file, content, {
          contentType: "application/json",
          upsert: true,
        });

      if (error) {
        console.log(`❌ ${error.message}`);
        failed++;
      } else {
        console.log(`✅`);
        uploaded++;
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }
  }

  // Final report
  console.log("\n" + "=".repeat(60));
  console.log("📊 Upload Report:");
  console.log(`   ✅ Uploaded: ${uploaded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Total: ${allFiles.length}`);
  console.log("=".repeat(60));

  // Verify
  const { data: finalList } = await supabase.storage
    .from(BUCKET_NAME)
    .list("", { limit: 200 });

  console.log(`\n📦 Files now in bucket "${BUCKET_NAME}": ${finalList?.length || 0}`);

  if (finalList) {
    const chunks = finalList.filter(f => f.name.includes("_chunks"));
    const extracted = finalList.filter(f => f.name.includes("_extracted") && !f.name.includes("_chunks"));
    console.log(`   🔹 Chunk files: ${chunks.length}`);
    console.log(`   🔹 Extracted files: ${extracted.length}`);
  }
}

main().catch(err => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
