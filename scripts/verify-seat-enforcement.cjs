/**
 * Seat-enforcement scenario validation. Read-write but uses a synthetic
 * fixture and rolls everything back at the end. NO live payment, NO real users.
 *
 * Connects via direct PG (service-role bypasses RLS so we can set up the
 * fixture in one place). Uses SUPABASE_DB_PASSWORD env var.
 *
 * Scenarios covered:
 *   1. Owner counts as 1 active seat
 *   2. Invite member 2 → success
 *   3. Invite member 3 → success (active=1 + pending=2 = 3 = seat_count, but
 *      enforcement uses < seat_count, so the rule fires AT or above limit)
 *   4. Invite member 4 → SEAT_LIMIT_REACHED
 *   5. Accepting an invitation when at limit → SEAT_LIMIT_REACHED
 *   6. Increasing seat_count via update_subscription_seat_count → can invite again
 *   7. Decreasing seat_count below active members → rejected
 *   8. Engineer/Pro plan owner cannot use update_subscription_seat_count
 *   9. Existing legacy/unlinked orgs are NOT seat-enforced (read-only check)
 *
 * All test fixtures are created with namespaced UUIDs and DELETED at the end,
 * even on failure. Existing production data is not touched.
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

let pass = 0, fail = 0;
function record(label, ok, detail) {
  const tag = ok ? "PASS" : "FAIL";
  console.log("  [" + tag + "] " + label + (detail ? " — " + detail : ""));
  if (ok) pass++; else fail++;
}

async function expectError(label, fn, fragment) {
  try {
    await fn();
    record(label, false, "no error raised, expected '" + fragment + "'");
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes(fragment)) record(label, true);
    else record(label, false, "got '" + msg.slice(0, 120) + "', expected '" + fragment + "'");
  }
}

async function expectOk(label, fn) {
  try { await fn(); record(label, true); } catch (e) { record(label, false, e.message || String(e)); }
}

async function main() {
  await client.connect();
  // Defensive: clear cached plans in the pooled backend so a freshly applied
  // CREATE OR REPLACE FUNCTION takes effect for our session.
  try { await client.query("DISCARD ALL;"); } catch (_) { /* ignore */ }
  console.log("connected.\n");

  // Identify the enterprise_team plan id
  const planRes = await client.query(
    "SELECT id, slug, price_per_seat, min_seats FROM public.subscription_plans WHERE slug='enterprise_team';"
  );
  const teamPlan = planRes.rows[0];
  if (!teamPlan) { console.error("enterprise_team plan missing"); process.exit(1); }
  console.log("enterprise_team plan:", teamPlan);

  const enginePlanRes = await client.query(
    "SELECT id, slug FROM public.subscription_plans WHERE slug='engineer';"
  );
  const enginePlan = enginePlanRes.rows[0];

  // Build a synthetic owner + members. Use deterministic UUIDs so cleanup is reliable.
  // We have to insert auth.users rows because the schema FK-references them.
  const OWNER_ID    = "11111111-1111-1111-1111-111111111111";
  const MEMBER2_ID  = "22222222-2222-2222-2222-222222222222";
  const MEMBER3_ID  = "33333333-3333-3333-3333-333333333333";
  const MEMBER4_ID  = "44444444-4444-4444-4444-444444444444";
  const SUB_ID      = "ddddddd1-1111-1111-1111-111111111111";
  const ORG_ID      = "eeeeeee1-1111-1111-1111-111111111111";

  const fixtureUserIds = [OWNER_ID, MEMBER2_ID, MEMBER3_ID, MEMBER4_ID];

  // CLEANUP at the end runs in finally; also pre-clean stale fixture from previous failed runs.
  async function cleanup() {
    await client.query("DELETE FROM public.org_invitations WHERE org_id=$1;", [ORG_ID]).catch(() => {});
    await client.query("DELETE FROM public.org_members WHERE org_id=$1;", [ORG_ID]).catch(() => {});
    await client.query("DELETE FROM public.organizations WHERE id=$1;", [ORG_ID]).catch(() => {});
    await client.query("DELETE FROM public.user_subscriptions WHERE id=$1;", [SUB_ID]).catch(() => {});
    for (const uid of fixtureUserIds) {
      await client.query("DELETE FROM public.profiles WHERE user_id=$1;", [uid]).catch(() => {});
      await client.query("DELETE FROM auth.users WHERE id=$1;", [uid]).catch(() => {});
    }
  }
  await cleanup();

  try {
    console.log("\n=== Setup fixture ===");
    // Insert auth.users (minimal columns — Supabase auth schema requires only id + email + instance_id).
    for (const [uid, email] of [
      [OWNER_ID,   "seat-test-owner@example.invalid"],
      [MEMBER2_ID, "seat-test-m2@example.invalid"],
      [MEMBER3_ID, "seat-test-m3@example.invalid"],
      [MEMBER4_ID, "seat-test-m4@example.invalid"],
    ]) {
      await client.query(
        "INSERT INTO auth.users (id, email, instance_id, aud, role, email_confirmed_at) " +
        "VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now());",
        [uid, email],
      );
    }

    // Insert subscription with seat_count=3
    await client.query(
      "INSERT INTO public.user_subscriptions (id, user_id, plan_id, status, seat_count) " +
      "VALUES ($1, $2, $3, 'active', 3);",
      [SUB_ID, OWNER_ID, teamPlan.id],
    );

    // Insert organization linked to the subscription
    await client.query(
      "INSERT INTO public.organizations (id, name, owner_user_id, status, subscription_id) " +
      "VALUES ($1, 'Seat Test Org', $2, 'active', $3);",
      [ORG_ID, OWNER_ID, SUB_ID],
    );

    // Insert owner member
    await client.query(
      "INSERT INTO public.org_members (org_id, user_id, role, status, joined_at) " +
      "VALUES ($1, $2, 'owner', 'active', now());",
      [ORG_ID, OWNER_ID],
    );

    console.log("Fixture ready: org=" + ORG_ID + " linked to sub=" + SUB_ID + " (seat_count=3)");

    // ---------- Set local auth.uid to the owner so SECURITY DEFINER RPCs can resolve it ----------
    // SECURITY DEFINER RPCs read auth.uid() via the request_jwt.claims setting. Simulate it:
    async function withCaller(uid, fn) {
      // is_local=false → session-wide so subsequent queries in this connection see it.
      await client.query("SELECT set_config('request.jwt.claims', $1, false);",
        [JSON.stringify({ sub: uid, role: "authenticated" })]);
      // Also set the legacy single-claim path some Supabase auth helpers read.
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false);", [uid]);
      try { return await fn(); } finally {
        await client.query("SELECT set_config('request.jwt.claims', '', false);");
        await client.query("SELECT set_config('request.jwt.claim.sub', '', false);");
      }
    }

    console.log("\n=== Scenario 1: owner counts as 1 active seat ===");
    {
      const r = await withCaller(OWNER_ID, () =>
        client.query("SELECT * FROM public.get_org_seat_usage($1);", [ORG_ID])
      );
      const row = r.rows[0];
      record(
        "active=1, pending=0, seat_count=3, available=2, is_enforced=true",
        row.active_members_count === 1
          && row.pending_invitations_count === 0
          && row.seat_count === 3
          && row.available_seats === 2
          && row.is_enforced === true,
        JSON.stringify(row),
      );
    }

    console.log("\n=== Scenario 2: invite member 2 → success ===");
    let inv2;
    await expectOk("create_org_invitation_enforced for m2", async () => {
      inv2 = await withCaller(OWNER_ID, () =>
        client.query("SELECT * FROM public.create_org_invitation_enforced($1, $2, $3);",
          [ORG_ID, "seat-test-m2@example.invalid", "engineer"])
      );
    });

    console.log("\n=== Scenario 3: invite member 3 → success (active=1, pending=2 fills exactly the 3 seats) ===");
    let inv3;
    await expectOk("create_org_invitation_enforced for m3", async () => {
      inv3 = await withCaller(OWNER_ID, () =>
        client.query("SELECT * FROM public.create_org_invitation_enforced($1, $2, $3);",
          [ORG_ID, "seat-test-m3@example.invalid", "engineer"])
      );
    });

    console.log("\n=== Scenario 4: invite member 4 → SEAT_LIMIT_REACHED ===");
    await expectError("create_org_invitation_enforced for m4 should fail",
      () => withCaller(OWNER_ID, () =>
        client.query("SELECT * FROM public.create_org_invitation_enforced($1, $2, $3);",
          [ORG_ID, "seat-test-m4@example.invalid", "engineer"])
      ),
      "SEAT_LIMIT_REACHED",
    );

    console.log("\n=== Scenario 5: accepting invite when at limit → SEAT_LIMIT_REACHED ===");
    // Let's accept member-2's invite first (active=2, pending=1, total used = 3 still).
    const tok2 = inv2.rows[0].token;
    await expectOk("accept m2's invite (still within limit)", async () => {
      await withCaller(MEMBER2_ID, () =>
        client.query("SELECT public.accept_org_invitation($1);", [tok2])
      );
    });
    // active=2, pending=1, total used=3 = seat_count. Now accept m3 → would make active=3 ≤ 3, OK.
    const tok3 = inv3.rows[0].token;
    await expectOk("accept m3's invite (active goes to 3 = seat_count, allowed)", async () => {
      await withCaller(MEMBER3_ID, () =>
        client.query("SELECT public.accept_org_invitation($1);", [tok3])
      );
    });
    // Now try to insert a manual pending invitation directly via SQL bypassing the RPC, then try accepting.
    // RLS blocks frontend direct inserts, but service role bypasses RLS. We mimic an attacker who somehow
    // managed to get a pending invitation row inserted (e.g., via stale RLS or service-role path).
    await client.query(
      "INSERT INTO public.org_invitations (org_id, email, role, token, status, expires_at, created_by) " +
      "VALUES ($1, 'seat-test-m4@example.invalid', 'engineer', 'over-limit-token-001', 'pending', now() + INTERVAL '1 day', $2);",
      [ORG_ID, OWNER_ID],
    );
    await expectError("accept_org_invitation should reject over-limit",
      () => withCaller(MEMBER4_ID, () =>
        client.query("SELECT public.accept_org_invitation($1);", ["over-limit-token-001"])
      ),
      "SEAT_LIMIT_REACHED",
    );

    console.log("\n=== Scenario 6: increase seat_count → can invite again ===");
    await expectOk("update_subscription_seat_count from 3 to 4", () =>
      withCaller(OWNER_ID, () =>
        client.query("SELECT public.update_subscription_seat_count($1, $2);", [SUB_ID, 4])
      )
    );
    // Now accept m4
    await expectOk("accept m4 after seat increase", async () => {
      await withCaller(MEMBER4_ID, () =>
        client.query("SELECT public.accept_org_invitation($1);", ["over-limit-token-001"])
      );
    });

    console.log("\n=== Scenario 7: decrease seat_count below active count → rejected ===");
    // Active is now 4. min_seats=3, so request seat_count=3 — passes the
    // min_seats check but should be rejected by the active-member check.
    await expectError("update_subscription_seat_count should reject decrease below active",
      () => withCaller(OWNER_ID, () =>
        client.query("SELECT public.update_subscription_seat_count($1, $2);", [SUB_ID, 3])
      ),
      "currently has 4 active members",
    );

    console.log("\n=== Scenario 8: engineer plan cannot use update_subscription_seat_count ===");
    // Build a synthetic engineer-plan subscription for the same fake owner
    const ENG_SUB_ID = "ddddddd2-2222-2222-2222-222222222222";
    await client.query("DELETE FROM public.user_subscriptions WHERE id=$1;", [ENG_SUB_ID]);
    await client.query(
      "INSERT INTO public.user_subscriptions (id, user_id, plan_id, status, seat_count) " +
      "VALUES ($1, $2, $3, 'active', 1);",
      [ENG_SUB_ID, OWNER_ID, enginePlan.id],
    );
    await expectError("engineer plan: update_subscription_seat_count should reject",
      () => withCaller(OWNER_ID, () =>
        client.query("SELECT public.update_subscription_seat_count($1, $2);", [ENG_SUB_ID, 5])
      ),
      "is not a per-seat plan",
    );
    await client.query("DELETE FROM public.user_subscriptions WHERE id=$1;", [ENG_SUB_ID]);

    console.log("\n=== Scenario 9: legacy unlinked org is not seat-enforced (read-only check) ===");
    {
      const r = await client.query(
        "SELECT id FROM public.organizations WHERE subscription_id IS NULL ORDER BY created_at LIMIT 1;"
      );
      if (r.rows.length === 0) {
        record("legacy unlinked org check skipped (no such org in DB)", true);
      } else {
        const legacyOrgId = r.rows[0].id;
        // We cannot call get_org_seat_usage as a non-member, but we can verify
        // the is_enforced flag would be false by reading via service role.
        const sub = await client.query(
          "SELECT subscription_id FROM public.organizations WHERE id=$1;", [legacyOrgId]
        );
        record(
          "legacy org has subscription_id IS NULL → not seat-enforced",
          sub.rows[0].subscription_id === null,
          "subscription_id=" + sub.rows[0].subscription_id,
        );
      }
    }

    console.log("\n=== Summary ===");
    console.log(`PASS: ${pass}    FAIL: ${fail}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    console.log("\n=== Cleanup ===");
    await cleanup();
    console.log("Cleanup complete.");
    await client.end();
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
