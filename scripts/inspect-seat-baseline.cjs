/**
 * Read-only baseline for the seat-enforcement work.
 * Reports schema state + production counts.
 * Uses SUPABASE_DB_PASSWORD env var.
 */
const { Client } = require("pg");

const PROJECT_REF = "hrnltxmwoaphgejckutk";
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!DB_PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const client = new Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com",
  port: 6543,
  user: "postgres." + PROJECT_REF,
  password: DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function dump(title, query) {
  console.log("\n=== " + title + " ===");
  const r = await client.query(query);
  if (r.rows.length === 0) { console.log("  (no rows)"); return r; }
  for (const row of r.rows) {
    console.log("  " + Object.entries(row).map(([k, v]) => `${k}=${v}`).join("  "));
  }
  return r;
}

async function main() {
  await client.connect();
  console.log("connected.");

  await dump("organizations columns",
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name='organizations' ORDER BY ordinal_position;");

  await dump("organizations subscription_id present?",
    "SELECT EXISTS (SELECT 1 FROM information_schema.columns " +
    "  WHERE table_schema='public' AND table_name='organizations' AND column_name='subscription_id') AS present;");

  await dump("RLS policies on org_invitations",
    "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies " +
    "WHERE schemaname='public' AND tablename='org_invitations' ORDER BY policyname;");

  await dump("RLS policies on org_members",
    "SELECT policyname, cmd, roles, qual, with_check FROM pg_policies " +
    "WHERE schemaname='public' AND tablename='org_members' ORDER BY policyname;");

  await dump("Existing org-related RPCs",
    "SELECT routine_name, routine_type, security_type FROM information_schema.routines " +
    "WHERE routine_schema='public' AND " +
    "(routine_name ILIKE '%org%' OR routine_name ILIKE '%invitation%' OR routine_name ILIKE '%seat%') " +
    "ORDER BY routine_name;");

  await dump("enterprise_team subscriptions count by status",
    "SELECT us.status, COUNT(*) AS n FROM public.user_subscriptions us " +
    "JOIN public.subscription_plans sp ON sp.id = us.plan_id " +
    "WHERE sp.slug = 'enterprise_team' GROUP BY us.status ORDER BY us.status;");

  await dump("enterprise_office subscriptions count by status",
    "SELECT us.status, COUNT(*) AS n FROM public.user_subscriptions us " +
    "JOIN public.subscription_plans sp ON sp.id = us.plan_id " +
    "WHERE sp.slug = 'enterprise_office' GROUP BY us.status ORDER BY us.status;");

  await dump("organizations summary",
    "SELECT status, COUNT(*) AS n FROM public.organizations GROUP BY status ORDER BY status;");

  await dump("orgs with member counts (top 10)",
    "SELECT o.id, o.name, o.status, " +
    "  (SELECT COUNT(*) FROM public.org_members m WHERE m.org_id = o.id AND m.status='active') AS active_members, " +
    "  (SELECT COUNT(*) FROM public.org_invitations i WHERE i.org_id = o.id AND i.status='pending') AS pending_invitations " +
    "FROM public.organizations o ORDER BY o.created_at DESC LIMIT 10;");

  await dump("Distinct organization status values",
    "SELECT DISTINCT status FROM public.organizations ORDER BY status;");

  await dump("Are there owners of enterprise_team/office without an org?",
    "SELECT us.user_id, sp.slug, us.status, us.seat_count " +
    "FROM public.user_subscriptions us " +
    "JOIN public.subscription_plans sp ON sp.id = us.plan_id " +
    "WHERE sp.slug IN ('enterprise_team','enterprise_office') " +
    "  AND us.status IN ('active','trialing','past_due','pending_activation') " +
    "  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_user_id = us.user_id);");

  await client.end();
  console.log("\ndone.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
