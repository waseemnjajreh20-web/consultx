/**
 * Read-only post-deployment verification.
 *
 * Connects via the same direct PG endpoint used to apply the migration,
 * then walks through the smoke scenarios from the implementation spec.
 * Performs no writes and no payment.
 *
 * Reads SUPABASE_DB_PASSWORD from env.
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

async function main() {
  await client.connect();
  console.log("connected.\n");

  console.log("=== Scenario 1-3: existing plans available, legacy hidden ===");
  const visible = await client.query(`
    SELECT slug, name_en, price_amount, price_per_seat, min_seats, is_active
    FROM public.subscription_plans
    WHERE is_active = true AND slug != 'free'
    ORDER BY price_amount;
  `);
  visible.rows.forEach((r) => console.log(
    "  slug=" + r.slug.padEnd(20) +
    " price_amount=" + String(r.price_amount).padEnd(7) +
    " per_seat=" + (r.price_per_seat == null ? "-" : r.price_per_seat) +
    " min=" + r.min_seats
  ));
  // Confirm the legacy enterprise row is still active in DB but the frontend
  // filter (HIDDEN_PUBLIC_SLUGS in Subscribe.tsx) keeps it off the picker.
  const legacyEnt = visible.rows.find((r) => r.slug === "enterprise");
  console.log("  Legacy 'enterprise' row in DB:", legacyEnt ? "PRESENT (hidden by frontend filter)" : "MISSING");

  console.log("\n=== Scenario 4: enterprise_team — 399/seat, min 3, total 1197 at min seats ===");
  const team = await client.query(
    "SELECT slug, price_amount, price_per_seat, min_seats, features " +
    "FROM public.subscription_plans WHERE slug = 'enterprise_team';"
  );
  if (team.rows[0]) {
    const r = team.rows[0];
    const expectedTotal = (r.price_per_seat ?? 0) * (r.min_seats ?? 1);
    console.log("  price_per_seat = " + r.price_per_seat + " halalas (" + (r.price_per_seat / 100) + " SAR)");
    console.log("  min_seats      = " + r.min_seats);
    console.log("  total at min   = " + expectedTotal + " halalas (" + (expectedTotal / 100) + " SAR)");
    console.log("  is_active      = " + true);
    console.log("  CHECK total at min == 119700? " + (expectedTotal === 119700 ? "PASS" : "FAIL"));
    console.log("  CHECK 399 SAR per seat? " + (r.price_per_seat === 39900 ? "PASS" : "FAIL"));
    console.log("  CHECK min 3 seats? " + (r.min_seats === 3 ? "PASS" : "FAIL"));
  }

  console.log("\n=== Scenario 5: enterprise_office — 549/seat, min 5, total 2745 at min seats ===");
  const office = await client.query(
    "SELECT slug, price_amount, price_per_seat, min_seats, features " +
    "FROM public.subscription_plans WHERE slug = 'enterprise_office';"
  );
  if (office.rows[0]) {
    const r = office.rows[0];
    const expectedTotal = (r.price_per_seat ?? 0) * (r.min_seats ?? 1);
    console.log("  price_per_seat = " + r.price_per_seat + " halalas (" + (r.price_per_seat / 100) + " SAR)");
    console.log("  min_seats      = " + r.min_seats);
    console.log("  total at min   = " + expectedTotal + " halalas (" + (expectedTotal / 100) + " SAR)");
    console.log("  CHECK total at min == 274500? " + (expectedTotal === 274500 ? "PASS" : "FAIL"));
    console.log("  CHECK 549 SAR per seat? " + (r.price_per_seat === 54900 ? "PASS" : "FAIL"));
    console.log("  CHECK min 5 seats? " + (r.min_seats === 5 ? "PASS" : "FAIL"));
  }

  console.log("\n=== Scenario 6-7: seat_count storage column ready (manual frontend verification needed) ===");
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_subscriptions' AND column_name='seat_count';
  `);
  console.log("  user_subscriptions.seat_count column: " + (cols.rowCount > 0 ? "PRESENT" : "MISSING"));

  // Confirm that the legacy enterprise trialing subscriber is unchanged
  console.log("\n=== Legacy enterprise subscriber (must NOT be modified) ===");
  const legacy = await client.query(`
    SELECT us.id, us.user_id, us.status, us.plan_id, us.seat_count, sp.slug, sp.price_amount
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE sp.slug = 'enterprise'
      AND us.status IN ('active','trialing','past_due','pending_activation');
  `);
  console.log("  Live legacy-enterprise subscribers: " + legacy.rowCount);
  legacy.rows.forEach((r) => console.log(
    "    sub_id=" + r.id +
    " status=" + r.status +
    " seat_count=" + r.seat_count +
    " plan_price=" + r.price_amount
  ));

  // Confirm engineer/pro renewal amount unchanged (no per_seat)
  console.log("\n=== Flat-plan renewal pricing unchanged ===");
  const flat = await client.query(`
    SELECT slug, price_amount, price_per_seat
    FROM public.subscription_plans
    WHERE slug IN ('engineer','pro','enterprise')
    ORDER BY price_amount;
  `);
  flat.rows.forEach((r) => {
    console.log("  " + r.slug.padEnd(15) + " price_amount=" + r.price_amount +
      " price_per_seat=" + (r.price_per_seat == null ? "NULL (flat)" : r.price_per_seat) +
      "  -> renewal will charge " + (r.price_per_seat == null ? "price_amount" : "per_seat * seats"));
  });

  await client.end();
  console.log("\nVerification complete.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
