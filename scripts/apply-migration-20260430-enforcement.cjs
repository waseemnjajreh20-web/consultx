/**
 * Applies migration 20260430000002_enterprise_seat_enforcement.sql to
 * production project (hrnltxmwoaphgejckutk). Idempotent.
 * Reads SUPABASE_DB_PASSWORD from env.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_PATH = path.resolve(
  __dirname, "..", "supabase", "migrations",
  "20260430000002_enterprise_seat_enforcement.sql",
);
const PROJECT_REF = "hrnltxmwoaphgejckutk";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!DB_PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
console.log("Migration file:", MIGRATION_PATH);
console.log("Migration size:", sql.length, "bytes");

const client = new Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com",
  port: 6543,
  user: "postgres." + PROJECT_REF,
  password: DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  await client.connect();
  console.log("connected.");

  console.log("\nApplying migration...");
  await client.query(sql);
  console.log("Migration applied.");

  console.log("\n--- Post-apply verification ---");

  const col = await client.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name='organizations' AND column_name='subscription_id';"
  );
  console.log("organizations.subscription_id:", col.rows[0] ?? "MISSING");

  const idx = await client.query(
    "SELECT indexname FROM pg_indexes " +
    "WHERE schemaname='public' AND tablename='organizations' " +
    "  AND indexname='organizations_subscription_id_unique_idx';"
  );
  console.log("Unique partial index present:", idx.rowCount > 0);

  const rpcs = await client.query(
    "SELECT routine_name FROM information_schema.routines " +
    "WHERE routine_schema='public' AND routine_name IN " +
    "('get_org_seat_usage','create_org_invitation_enforced','update_subscription_seat_count','accept_org_invitation') " +
    "ORDER BY routine_name;"
  );
  console.log("RPCs present:");
  rpcs.rows.forEach((r) => console.log("  " + r.routine_name));

  const policies = await client.query(
    "SELECT tablename, policyname, cmd FROM pg_policies " +
    "WHERE schemaname='public' AND tablename IN ('org_invitations','org_members') " +
    "  AND cmd='INSERT' ORDER BY tablename, policyname;"
  );
  console.log("\nRemaining INSERT RLS policies (should be empty):");
  if (policies.rowCount === 0) console.log("  (none — direct inserts are blocked, as designed)");
  else policies.rows.forEach((r) => console.log("  " + r.tablename + " / " + r.policyname));

  const orgRows = await client.query(
    "SELECT id, name, status, subscription_id FROM public.organizations ORDER BY created_at DESC LIMIT 10;"
  );
  console.log("\nOrgs after migration:");
  orgRows.rows.forEach((r) => console.log(
    "  id=" + r.id + " name=" + r.name + " status=" + r.status + " subscription_id=" + (r.subscription_id ?? "NULL")
  ));

  await client.end();
  console.log("\nMigration applied and verified.");
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  if (e.position) console.error("  position:", e.position);
  if (e.where) console.error("  where:", e.where);
  process.exit(1);
});
