/**
 * Admin Setup Script — ConsultX
 * Creates/updates admin users with lifetime enterprise subscriptions.
 *
 * Usage: node scripts/setup-admins.cjs
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhybmx0eG13b2FwaGdlamNrdXRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyMjUwNiwiZXhwIjoyMDg1Njk4NTA2fQ.RQWe-ZbIKR6wAnWb7Ag1vzMXBJsSiN4v2NSb4uZ5c3o";

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
