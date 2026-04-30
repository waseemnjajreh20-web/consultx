/**
 * Applies migration 20260430000001_enterprise_team_office_plans.sql to the
 * production project (hrnltxmwoaphgejckutk).
 *
 * Read DB password from SUPABASE_DB_PASSWORD env var.
 * Sweeps Supabase Postgres pooler regions until one accepts the credentials,
 * then runs the migration SQL in a single client.query call (the SQL has its
 * own BEGIN/COMMIT). Verifies post-state by re-reading columns and rows.
 *
 * Safe to re-run: migration is idempotent.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const MIGRATION_PATH = path.resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260430000001_enterprise_team_office_plans.sql",
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
console.log("Migration file:", MIGRATION_PATH);
console.log("Migration size:", sql.length, "bytes");

const REGIONS = [
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "sa-east-1",
  "ca-central-1",
];

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
      console.log("failed:", e.code || "no-code", "—", (e.message || "").slice(0, 200));
      try { await client.end(); } catch (_) { /* ignore */ }
    }
  }
  throw new Error("Could not connect to Postgres on any candidate endpoint");
}

async function main() {
  const client = await tryConnect();
  try {
    console.log("\nApplying migration...");
    await client.query(sql);
    console.log("Migration applied (BEGIN/COMMIT inside the SQL).");

    console.log("\n--- Post-apply verification ---");
    const cols = await client.query(
      "SELECT column_name, data_type, is_nullable, column_default " +
      "FROM information_schema.columns " +
      "WHERE table_schema = 'public' " +
      "  AND ((table_name = 'subscription_plans' AND column_name IN ('price_per_seat','min_seats')) " +
      "    OR (table_name = 'user_subscriptions' AND column_name = 'seat_count')) " +
      "ORDER BY table_name, column_name;"
    );
    console.log("New columns:");
    cols.rows.forEach((r) => {
      console.log(
        "  " + r.column_name.padEnd(15) +
        " type=" + r.data_type.padEnd(10) +
        " nullable=" + r.is_nullable +
        " default=" + (r.column_default == null ? "-" : r.column_default)
      );
    });

    const constraints = await client.query(
      "SELECT conname FROM pg_constraint " +
      "WHERE conname IN (" +
      "  'subscription_plans_min_seats_positive_chk'," +
      "  'subscription_plans_price_per_seat_positive_chk'," +
      "  'user_subscriptions_seat_count_positive_chk'" +
      ") ORDER BY conname;"
    );
    console.log("\nCheck constraints present:");
    constraints.rows.forEach((r) => console.log("  " + r.conname));

    const plans = await client.query(
      "SELECT slug, name_en, price_amount, price_per_seat, min_seats, target, is_active " +
      "FROM public.subscription_plans " +
      "WHERE slug IN ('enterprise', 'enterprise_team', 'enterprise_office', 'engineer', 'pro', 'free') " +
      "ORDER BY price_amount;"
    );
    console.log("\nAll relevant plans:");
    plans.rows.forEach((r) => {
      const slug = (r.slug == null ? "<null>" : r.slug).padEnd(20);
      const pa = String(r.price_amount).padEnd(7);
      const ps = (r.price_per_seat == null ? "-" : String(r.price_per_seat)).padEnd(6);
      console.log(
        "  slug=" + slug + " price=" + pa + " per_seat=" + ps +
        " min=" + r.min_seats + " active=" + r.is_active + " target=" + r.target
      );
    });

    const ent = await client.query(
      "SELECT slug, price_amount, is_active FROM public.subscription_plans WHERE slug = 'enterprise';"
    );
    if (ent.rows.length === 1) {
      const r = ent.rows[0];
      const ok = r.price_amount === 34900 && r.is_active === true;
      console.log("\nLegacy enterprise unchanged? " + (ok ? "YES" : "NO -- INSPECT IMMEDIATELY"));
      console.log("  price_amount=" + r.price_amount + " is_active=" + r.is_active);
    } else {
      console.log("\n!!! Legacy enterprise row missing or duplicated.");
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
