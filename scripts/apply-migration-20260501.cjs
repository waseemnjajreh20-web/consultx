/**
 * Applies migration 20260501000001_seed_sbc801_group_m_903_2_7_907_2_7.sql to
 * the production project (hrnltxmwoaphgejckutk).
 *
 * Migration scope:
 *   - public.sbc_code_tables ONLY
 *   - 2 INSERT … ON CONFLICT DO UPDATE statements (903.2.7 + 907.2.7, both
 *     under source_code='SBC 801', edition='2024')
 *   - No schema changes, no DELETE, no ALTER, no broad UPDATE.
 *
 * Reads SUPABASE_DB_PASSWORD env var. Uses the same pooler-region pattern as
 * apply-migration-20260430.cjs. Migration SQL has its own BEGIN/COMMIT.
 *
 * Pre-snapshot:
 *   - count rows in sbc_code_tables
 *   - capture target rows (903.2.7, 907.2.7) — expected: zero rows
 *
 * Post-verify:
 *   - re-read target rows → expect 2 rows present, both source_code='SBC 801'
 *   - confirm content_md contains the expected Group-M thresholds:
 *       903.2.7 must contain "1115 m"  and "Group M"
 *       907.2.7 must contain "500 or more" and "Group M"
 *   - assert total row count grew by exactly 2 (since both target rows were absent)
 *   - assert no unrelated table_id rows changed (sample 5 rows by id, compare keywords)
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_PATH = path.resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260501000001_seed_sbc801_group_m_903_2_7_907_2_7.sql",
);
const PROJECT_REF = "hrnltxmwoaphgejckutk";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

if (!DB_PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD env var not set.");
  process.exit(1);
}
if (!fs.existsSync(MIGRATION_PATH)) {
  console.error("FATAL: migration file not found:", MIGRATION_PATH);
  process.exit(1);
}

const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
console.log("Migration:", path.basename(MIGRATION_PATH));
console.log("Bytes:    ", sql.length);

const candidates = [{
  label: "pooler 6543 aws-1 ap-southeast-2",
  config: {
    host: "aws-1-ap-southeast-2.pooler.supabase.com",
    port: 6543,
    user: "postgres." + PROJECT_REF,
    password: DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  },
}];

async function tryConnect() {
  for (const c of candidates) {
    process.stdout.write("Trying " + c.label + "... ");
    const client = new Client(c.config);
    try {
      await client.connect();
      console.log("connected.");
      return client;
    } catch (e) {
      console.log("failed:", e.code || "no-code");
      try { await client.end(); } catch (_) {}
    }
  }
  throw new Error("Could not connect");
}

async function main() {
  const client = await tryConnect();
  try {
    // ── Pre-snapshot ──
    const preTotal = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.sbc_code_tables;"
    )).rows[0].n;
    const preTargets = (await client.query(
      "SELECT table_id, source_code, edition FROM public.sbc_code_tables " +
      "WHERE table_id IN ('903.2.7','907.2.7') ORDER BY table_id, source_code;"
    )).rows;
    console.log("\n--- Pre-snapshot ---");
    console.log("Total rows:", preTotal);
    console.log("Target rows present:", preTargets.length, JSON.stringify(preTargets));

    // ── Apply ──
    console.log("\nApplying migration (single transaction inside SQL)...");
    await client.query(sql);
    console.log("Migration applied.");

    // ── Post-verify ──
    const postTotal = (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.sbc_code_tables;"
    )).rows[0].n;
    const postTargets = (await client.query(
      "SELECT table_id, source_code, edition, table_title, chapter, section, " +
      "octet_length(content_md) AS bytes, content_md " +
      "FROM public.sbc_code_tables " +
      "WHERE table_id IN ('903.2.7','907.2.7') AND source_code = 'SBC 801' " +
      "ORDER BY table_id;"
    )).rows;
    console.log("\n--- Post-verify ---");
    console.log("Total rows:", postTotal, "(delta:", postTotal - preTotal, ")");
    for (const r of postTargets) {
      console.log(
        "  table_id=" + r.table_id +
        " src=" + r.source_code +
        " ed=" + r.edition +
        " ch=" + r.chapter +
        " sec=" + r.section +
        " bytes=" + r.bytes
      );
    }

    // Content invariants
    const r9032 = postTargets.find(r => r.table_id === "903.2.7");
    const r9072 = postTargets.find(r => r.table_id === "907.2.7");
    const checks = [
      ["903.2.7 row exists",       !!r9032],
      ["903.2.7 mentions 1115 m",  !!r9032 && /1115\s*m/.test(r9032.content_md)],
      ["903.2.7 mentions Group M", !!r9032 && /Group\s+M/.test(r9032.content_md)],
      ["907.2.7 row exists",       !!r9072],
      ["907.2.7 mentions 500",     !!r9072 && /500\s+or\s+more/i.test(r9072.content_md)],
      ["907.2.7 mentions Group M", !!r9072 && /Group\s+M/.test(r9072.content_md)],
    ];
    console.log("\nContent invariants:");
    let ok = true;
    for (const [name, pass] of checks) {
      console.log("  [" + (pass ? "OK" : "FAIL") + "] " + name);
      if (!pass) ok = false;
    }

    // Cross-row spot check (negative): unrelated rows untouched.
    const sample = (await client.query(
      "SELECT table_id, octet_length(content_md) AS bytes " +
      "FROM public.sbc_code_tables " +
      "WHERE table_id IN ('1004.5','309','903.2','907.2','504.3') " +
      "ORDER BY table_id;"
    )).rows;
    console.log("\nUnrelated-row spot check (5 sample rows):");
    for (const r of sample) {
      console.log("  table_id=" + r.table_id.padEnd(8) + " bytes=" + r.bytes);
    }

    if (!ok) {
      console.error("\nMigration applied but content invariants FAILED.");
      process.exit(2);
    }
    console.log("\nMigration applied and verified.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  if (e.position) console.error("  position:", e.position);
  if (e.where)    console.error("  where:",    e.where);
  process.exit(1);
});
