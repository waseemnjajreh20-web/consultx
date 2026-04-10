import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Immutable super-admin anchors — normalized to lowercase.
// These two accounts always have super_admin access regardless of the DB role column.
const SUPER_ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── 1. Authenticate caller ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user?.email) return json({ error: "Unauthorized" }, 401);

    // ── 2. Authorize: must be super_admin email ─────────────────────────────
    // Super-admin status is determined by email (immutable, server-side).
    // The DB role column reflects this but the email list is the authoritative gate.
    const callerEmail = user.email.toLowerCase();
    if (!SUPER_ADMIN_EMAILS.includes(callerEmail)) {
      return json({ error: "Forbidden" }, 403);
    }

    // ── 3. Service-role client for all mutations ────────────────────────────
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, target_user_id, payload = {} } = body as {
      action: string;
      target_user_id?: string;
      payload?: Record<string, unknown>;
    };

    if (!action) return json({ error: "action is required" }, 400);

    // Helper: write audit log entry (fire-and-forget; don't fail the action)
    const audit = async (tid: string, data: Record<string, unknown>) => {
      await adminClient.from("admin_audit_log").insert({
        admin_user_id: user.id,
        admin_email: callerEmail,
        target_user_id: tid,
        action,
        payload: data,
      }).then(({ error: e }) => {
        if (e) console.warn("audit log write failed:", e.message);
      });
    };

    // ── 4. Route actions ────────────────────────────────────────────────────

    // ── list_users ──────────────────────────────────────────────────────────
    if (action === "list_users") {
      const { data: authData, error: authErr } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });
      if (authErr) throw authErr;

      const { data: profiles } = await adminClient
        .from("profiles")
        .select("user_id, plan_type, trial_type, trial_end, subscription_end, launch_trial_status, launch_trial_end, role");

      const { data: subs } = await adminClient
        .from("user_subscriptions")
        .select("user_id, id, status, trial_start, trial_end, current_period_end")
        .not("status", "in", '("expired","cancelled")');

      const profileMap: Record<string, typeof profiles extends (infer T)[] | null ? T : never> = {};
      for (const p of profiles ?? []) profileMap[p.user_id] = p;

      const subMap: Record<string, typeof subs extends (infer T)[] | null ? T : never> = {};
      for (const s of subs ?? []) subMap[s.user_id] = s;

      const users = authData.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: (u as Record<string, unknown>).banned_until ?? null,
        profile: profileMap[u.id] ?? null,
        subscription: subMap[u.id] ?? null,
      }));

      return json({ users });
    }

    // All remaining actions require target_user_id
    if (!target_user_id) return json({ error: "target_user_id is required" }, 400);

    // ── set_plan ────────────────────────────────────────────────────────────
    if (action === "set_plan") {
      const validPlans = ["free", "engineer", "enterprise"];
      const plan_type = payload.plan_type as string;
      if (!validPlans.includes(plan_type)) return json({ error: `Invalid plan_type. Must be one of: ${validPlans.join(", ")}` }, 400);

      // 1. Capture old plan for the audit trail before mutating anything.
      const { data: currentProfile } = await adminClient
        .from("profiles")
        .select("plan_type")
        .eq("user_id", target_user_id)
        .single();
      const old_plan = currentProfile?.plan_type ?? "unknown";

      // 2. Update profiles.plan_type — entitlement source for per-mode limits.
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update({ plan_type, updated_at: new Date().toISOString() })
        .eq("user_id", target_user_id);
      if (profileErr) throw profileErr;

      // 3. Align user_subscriptions so check-subscription reflects the change
      //    immediately. Without this, check-subscription silently syncs
      //    profiles.plan_type back to "free" on the next call whenever the
      //    subscription row is "expired" or "cancelled" — overwriting the admin
      //    change. We own the subscription row here as an admin grant.
      const now = new Date();

      if (plan_type === "free") {
        // Revoke: cancel any active / trialing / past_due subscription rows.
        await adminClient
          .from("user_subscriptions")
          .update({ status: "cancelled", updated_at: now.toISOString() })
          .eq("user_id", target_user_id)
          .in("status", ["active", "trialing", "past_due"]);
      } else {
        // Grant: upsert an admin-issued subscription — active, 1-year period.
        const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

        const { data: existingSub } = await adminClient
          .from("user_subscriptions")
          .select("id")
          .eq("user_id", target_user_id)
          .limit(1)
          .maybeSingle();

        if (existingSub) {
          await adminClient
            .from("user_subscriptions")
            .update({
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              cancel_at_period_end: false,
              updated_at: now.toISOString(),
            })
            .eq("id", existingSub.id);
        } else {
          await adminClient
            .from("user_subscriptions")
            .insert({
              user_id: target_user_id,
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            });
        }
      }

      // 4. Write in-app notification via auth app_metadata.
      //    PlanChangeNotifier.tsx reads this on the next session token refresh
      //    and shows a one-time toast to the affected user.
      //    Fire-and-forget — never blocks the plan change itself.
      adminClient.auth.admin.updateUserById(target_user_id, {
        app_metadata: {
          plan_notification: {
            new_plan: plan_type,
            old_plan,
            changed_at: now.toISOString(),
            changed_by: callerEmail,
          },
        },
      }).catch((e: Error) => console.warn("plan_notification write failed:", e.message));

      // 5. Audit with full before/after context.
      await audit(target_user_id, { old_plan, new_plan: plan_type });
      return json({ ok: true });
    }

    // ── set_role ────────────────────────────────────────────────────────────
    if (action === "set_role") {
      const validRoles = ["user", "admin", "super_admin"];
      const role = payload.role as string;
      if (!validRoles.includes(role)) return json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, 400);

      // Capture old role so the audit log has full before/after context.
      const { data: currentRoleProfile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("user_id", target_user_id)
        .single();
      const old_role = currentRoleProfile?.role ?? "unknown";

      const { error } = await adminClient
        .from("profiles")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { old_role, new_role: role });
      return json({ ok: true });
    }

    // ── set_subscription_status ─────────────────────────────────────────────
    if (action === "set_subscription_status") {
      const validStatuses = ["active", "trialing", "cancelled", "expired", "suspended"];
      const status = payload.status as string;
      if (!validStatuses.includes(status)) return json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);

      // Fetch the most recent subscription row — need full state for:
      //   a) old_status audit field
      //   b) date repair to prevent check-subscription from auto-reverting the change
      const { data: existing } = await adminClient
        .from("user_subscriptions")
        .select("id, status, current_period_end, trial_end")
        .eq("user_id", target_user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existing) return json({ error: "No subscription found for this user" }, 404);
      const old_status = existing.status;

      const now = new Date();
      const subUpdates: Record<string, unknown> = { status, updated_at: now.toISOString() };

      // ── Date repair ──────────────────────────────────────────────────────────
      // check-subscription immediately re-expires a row whose date field is null
      // or in the past, even if the admin just set the status to "active" or
      // "trialing". Fix the date field here so the change survives the next
      // check-subscription call.
      //
      //  "active"   → current_period_end must be in the future
      //  "trialing" → trial_end must be in the future
      //  Other statuses have no date gate in check-subscription.
      if (status === "active") {
        const periodEnd = existing.current_period_end
          ? new Date(existing.current_period_end)
          : null;
        if (!periodEnd || now >= periodEnd) {
          // Admin-granted active period: 1 year from today.
          subUpdates.current_period_end = new Date(
            now.getTime() + 365 * 24 * 60 * 60 * 1000
          ).toISOString();
        }
        subUpdates.cancel_at_period_end = false;
      } else if (status === "trialing") {
        const trialEnd = existing.trial_end ? new Date(existing.trial_end) : null;
        if (!trialEnd || now >= trialEnd) {
          // Admin-granted trial: 7 days from today.
          subUpdates.trial_end = new Date(
            now.getTime() + 7 * 24 * 60 * 60 * 1000
          ).toISOString();
        }
      }

      const { error: subErr } = await adminClient
        .from("user_subscriptions")
        .update(subUpdates)
        .eq("id", existing.id);
      if (subErr) throw subErr;

      // ── profiles.plan_type sync ──────────────────────────────────────────────
      // check-subscription lazily syncs plan_type to "free" when a subscription
      // is cancelled/expired. Do it explicitly here so the admin UI reflects the
      // correct plan immediately on the next loadUsers() call, and to prevent any
      // race where the user loads the app before check-subscription runs.
      //
      //  cancelled / expired → "free" (access revoked)
      //  active / trialing   → keep existing paid plan, or default to "engineer"
      //                        if the profile is still on "free" (otherwise the
      //                        user gets active subscription access with free limits)
      //  suspended           → no change (plan preserved for future reinstatement)
      if (status === "cancelled" || status === "expired") {
        await adminClient
          .from("profiles")
          .update({ plan_type: "free", updated_at: now.toISOString() })
          .eq("user_id", target_user_id);
      } else if (status === "active" || status === "trialing") {
        const { data: profileForSync } = await adminClient
          .from("profiles")
          .select("plan_type")
          .eq("user_id", target_user_id)
          .single();
        if (!profileForSync?.plan_type || profileForSync.plan_type === "free") {
          await adminClient
            .from("profiles")
            .update({ plan_type: "engineer", updated_at: now.toISOString() })
            .eq("user_id", target_user_id);
        }
      }

      await audit(target_user_id, { old_status, new_status: status });
      return json({ ok: true });
    }

    // ── start_trial ─────────────────────────────────────────────────────────
    if (action === "start_trial") {
      const days = typeof payload.days === "number" ? payload.days : 7;
      const plan_type = (payload.plan_type as string) || "engineer";
      const now = new Date();
      const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const trialEndIso = trialEnd.toISOString();

      const { error: trialProfileErr } = await adminClient
        .from("profiles")
        .update({
          plan_type,
          trial_start: now.toISOString(),
          trial_end: trialEndIso,
          launch_trial_status: "trial_active",
          launch_trial_start: now.toISOString(),
          launch_trial_end: trialEndIso,
          updated_at: now.toISOString(),
        })
        .eq("user_id", target_user_id);
      if (trialProfileErr) throw trialProfileErr;

      // ── Prevent check-subscription from overwriting plan_type ────────────────
      // check-subscription evaluates subscription rows BEFORE the launch-trial
      // section. If the user has an existing "expired" or "cancelled" subscription,
      // that branch syncs profiles.plan_type back to "free" (lines 181-183 of
      // check-subscription) — silently undoing the plan_type we just set above.
      //
      // Fix: transition that subscription row to "trialing" with the same end
      // date. check-subscription's trialing branch sets active=true, dailyLimit=20
      // and does NOT reset plan_type, so the admin-granted plan_type sticks.
      const { data: existingSubForTrial } = await adminClient
        .from("user_subscriptions")
        .select("id, status")
        .eq("user_id", target_user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSubForTrial && ["expired", "cancelled"].includes(existingSubForTrial.status)) {
        await adminClient
          .from("user_subscriptions")
          .update({
            status: "trialing",
            trial_start: now.toISOString(),
            trial_end: trialEndIso,
            updated_at: now.toISOString(),
          })
          .eq("id", existingSubForTrial.id);
      }

      await audit(target_user_id, { days, plan_type, trial_end: trialEndIso });
      return json({ ok: true, trial_end: trialEndIso });
    }

    // ── extend_trial ────────────────────────────────────────────────────────
    if (action === "extend_trial") {
      const days = typeof payload.days === "number" ? payload.days : 7;

      const { data: profile } = await adminClient
        .from("profiles")
        .select("launch_trial_end, trial_end")
        .eq("user_id", target_user_id)
        .single();

      // Extend from the later of: current end or now
      const currentEnd = new Date(
        profile?.launch_trial_end ?? profile?.trial_end ?? Date.now()
      );
      const base = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

      const { error } = await adminClient
        .from("profiles")
        .update({
          launch_trial_end: newEnd.toISOString(),
          trial_end: newEnd.toISOString(),
          launch_trial_status: "trial_active",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { days, new_end: newEnd.toISOString() });
      return json({ ok: true, trial_end: newEnd.toISOString() });
    }

    // ── expire_trial ────────────────────────────────────────────────────────
    if (action === "expire_trial") {
      const past = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      const { error } = await adminClient
        .from("profiles")
        .update({
          launch_trial_end: past,
          trial_end: past,
          launch_trial_status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { expired_at: past });
      return json({ ok: true });
    }

    // ── disable_account ─────────────────────────────────────────────────────
    if (action === "disable_account") {
      // Guard: super_admins cannot be disabled
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("user_id", target_user_id)
        .single();

      if (targetProfile?.role === "super_admin") {
        return json({ error: "Cannot disable a super_admin account" }, 403);
      }

      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "876000h", // ~100 years
      });
      if (error) throw error;

      await audit(target_user_id, { disabled: true });
      return json({ ok: true });
    }

    // ── enable_account ──────────────────────────────────────────────────────
    if (action === "enable_account") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "none",
      });
      if (error) throw error;

      await audit(target_user_id, { disabled: false });
      return json({ ok: true });
    }

    // ── invite_user ─────────────────────────────────────────────────────────
    if (action === "invite_user") {
      const email = (payload.email as string)?.toLowerCase();
      if (!email) return json({ error: "email is required" }, 400);
      const invitedPlanType = (payload.plan_type as string) || "free";

      const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        { data: { plan_type: invitedPlanType } },
      );
      if (inviteErr) throw inviteErr;

      // inviteUserByEmail puts plan_type in raw_user_meta_data only. The DB
      // trigger that creates the profiles row may not read it, leaving the
      // profile with the default "free" plan regardless of what was requested.
      // Upsert explicitly here so the invited user starts with the correct
      // entitlement from their very first login.
      await adminClient
        .from("profiles")
        .upsert(
          {
            user_id: invited.user.id,
            plan_type: invitedPlanType,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .then(({ error: e }) => {
          if (e) console.warn("invite_user profile upsert failed:", e.message);
        });

      await audit(invited.user.id, { email, plan_type: invitedPlanType });
      return json({ ok: true, user_id: invited.user.id });
    }

    // ── get_audit_log ───────────────────────────────────────────────────────
    if (action === "get_audit_log") {
      const { data, error } = await adminClient
        .from("admin_audit_log")
        .select("*")
        .eq("target_user_id", target_user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return json({ log: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("admin-manage-user error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
