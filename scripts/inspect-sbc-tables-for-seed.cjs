/**
 * Read-only inspection of public.sbc_code_tables for the rows the
 * Group-M structured-evidence seed will target.
 *
 * Usage: node scripts/inspect-sbc-tables-for-seed.cjs
 *   Requires SUPABASE_DB_PASSWORD env var.
 *
 * Performs zero writes. Safe to run any number of times.
 */
const { Client } = require("pg");

const PROJECT_REF = "hrnltxmwoaphgejckutk";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!DB_PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD env var not set.");
  process.exit(1);
}

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
    const totalRes = await client.query(
      "SELECT COUNT(*)::int AS n FROM public.sbc_code_tables;"
    );
    console.log("Total rows in sbc_code_tables:", totalRes.rows[0].n);

    const targetRes = await client.query(
      "SELECT table_id, source_code, edition, table_title, chapter, section, " +
      "octet_length(content_md) AS content_bytes " +
      "FROM public.sbc_code_tables " +
      "WHERE table_id IN ('903.2', '903.2.7', '907.2', '907.2.7', '309') " +
      "ORDER BY source_code, table_id;"
    );
    console.log("\nTarget-row snapshot (903.2, 903.2.7, 907.2, 907.2.7, 309):");
    if (targetRes.rows.length === 0) {
      console.log("  (none — all four target rows are absent)");
    } else {
      for (const r of targetRes.rows) {
        console.log(
          "  " + (r.table_id || "<null>").padEnd(10) +
          " src=" + (r.source_code || "<null>").padEnd(8) +
          " ed=" + (r.edition || "-").padEnd(6) +
          " ch=" + (r.chapter == null ? "-" : r.chapter) +
          " sec=" + (r.section || "-").padEnd(6) +
          " bytes=" + r.content_bytes
        );
      }
    }

    const distinctRes = await client.query(
      "SELECT DISTINCT table_id FROM public.sbc_code_tables ORDER BY table_id;"
    );
    console.log("\nAll existing table_id values:");
    console.log("  " + distinctRes.rows.map(r => r.table_id).join(", "));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nInspection failed:", e.message);
  process.exit(1);
});
