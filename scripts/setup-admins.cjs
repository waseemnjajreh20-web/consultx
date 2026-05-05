/**
 * Admin Setup Script — ConsultX
 * Creates/updates admin users with lifetime enterprise subscriptions.
 *
 * Usage: node scripts/setup-admins.cjs
 */

const { createClient } = require("@supabase/supabase-js");

// Security: secrets must be provided via environment variables. The previous
// hardcoded service_role key is removed. The leaked key remains valid in any
// clone of this repo's history until a manual rotation is performed in the
// Supabase Dashboard. See docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md.
//
// NOTE: The ADMINS array below still contains hardcoded reset passwords, which
// is a separate concern flagged in docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md
// and should be addressed in a follow-up task.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://hrnltxmwoaphgejckutk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required.");
  console.error("       Provide it via your shell, a .env loader, or the runtime secret store.");
  console.error("       Do NOT hardcode it in this file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMINS = [
  { email: "waseemnjajreh20@gmail.com", password: "WAsEEm12@" },
  { email: "njajrehwaseem@gmail.com", password: "WAsEEm12@" },
];

async function setupAdmin(admin) {
  console.log(`\n=== Setting up: ${admin.email} ===`);

  // 1. Check if user exists
  const { data: existingUsers, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (listErr) {
    console.error("  ERROR listing users:", listErr.message);
    return;
  }

  let userId;
  const existing = existingUsers.users.find((u) => u.email === admin.email);

  if (existing) {
    userId = existing.id;
    console.log(`  Found existing user: ${userId}`);

    // Update password + confirm email
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: admin.password,
      email_confirm: true,
    });
    if (updateErr) {
      console.error("  ERROR updating user:", updateErr.message);
      return;
    }
    console.log("  Password updated + email confirmed");
  } else {
    // Create new user
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: admin.email,
      password: admin.password,
      email_confirm: true,
    });
    if (createErr) {
      console.error("  ERROR creating user:", createErr.message);
      return;
    }
    userId = newUser.user.id;
    console.log(`  Created new user: ${userId}`);
  }

  // 2. Upsert profile with lifetime enterprise subscription
  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      plan_type: "enterprise",
      subscription_start: new Date().toISOString(),
      subscription_end: "2099-12-31T23:59:59.000Z",
      trial_start: null,
      trial_end: null,
      trial_type: null,
    },
    { onConflict: "user_id" }
  );

  if (profileErr) {
    console.error("  ERROR upserting profile:", profileErr.message);
  } else {
    console.log("  Profile: enterprise plan until 2099-12-31");
  }

  // 3. Upsert subscription in user_subscriptions (if table exists)
  // First get the highest plan (enterprise or any available)
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("id, name_en")
    .order("price_amount", { ascending: false })
    .limit(1);

  if (plans && plans.length > 0) {
    const { error: subErr } = await supabase.from("user_subscriptions").upsert(
      {
        user_id: userId,
        plan_id: plans[0].id,
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: "2099-12-31T23:59:59.000Z",
      },
      { onConflict: "user_id" }
    );

    if (subErr) {
      // Table might not have unique constraint on user_id, try insert
      if (subErr.message.includes("duplicate") || subErr.message.includes("unique")) {
        console.log("  Subscription already exists, updating...");
        const { error: updateSubErr } = await supabase
          .from("user_subscriptions")
          .update({
            plan_id: plans[0].id,
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: "2099-12-31T23:59:59.000Z",
          })
          .eq("user_id", userId);
        if (updateSubErr) console.error("  ERROR updating subscription:", updateSubErr.message);
        else console.log(`  Subscription updated: ${plans[0].name_en} until 2099`);
      } else {
        console.error("  ERROR upserting subscription:", subErr.message);
      }
    } else {
      console.log(`  Subscription: ${plans[0].name_en} until 2099`);
    }
  } else {
    console.log("  No subscription_plans found, skipping user_subscriptions");
  }

  console.log(`  ✅ ${admin.email} — DONE`);
}

async function main() {
  console.log("ConsultX Admin Setup Script");
  console.log("Project: hrnltxmwoaphgejckutk");
  console.log("=".repeat(50));

  for (const admin of ADMINS) {
    await setupAdmin(admin);
  }

  console.log("\n" + "=".repeat(50));
  console.log("All admins configured successfully!");
  console.log("\nAdmin emails (whitelisted in Admin.tsx & check-subscription):");
  ADMINS.forEach((a) => console.log(`  - ${a.email}`));
}

main().catch(console.error);
