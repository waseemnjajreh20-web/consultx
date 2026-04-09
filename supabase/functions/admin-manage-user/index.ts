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

      const { error } = await adminClient
        .from("profiles")
        .update({ plan_type, updated_at: new Date().toISOString() })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { plan_type });
      return json({ ok: true });
    }

    // ── set_role ────────────────────────────────────────────────────────────
    if (action === "set_role") {
      const validRoles = ["user", "admin", "super_admin"];
      const role = payload.role as string;
      if (!validRoles.includes(role)) return json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, 400);

      const { error } = await adminClient
        .from("profiles")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { role });
      return json({ ok: true });
    }

    // ── set_subscription_status ─────────────────────────────────────────────
    if (action === "set_subscription_status") {
      const validStatuses = ["active", "trialing", "cancelled", "expired", "suspended"];
      const status = payload.status as string;
      if (!validStatuses.includes(status)) return json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);

      const { data: existing } = await adminClient
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", target_user_id)
        .limit(1)
        .single();

      if (!existing) return json({ error: "No subscription found for this user" }, 404);

      const { error } = await adminClient
        .from("user_subscriptions")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { status });
      return json({ ok: true });
    }

    // ── start_trial ─────────────────────────────────────────────────────────
    if (action === "start_trial") {
      const days = typeof payload.days === "number" ? payload.days : 7;
      const plan_type = (payload.plan_type as string) || "engineer";
      const now = new Date();
      const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const { error } = await adminClient
        .from("profiles")
        .update({
          plan_type,
          trial_start: now.toISOString(),
          trial_end: trialEnd.toISOString(),
          launch_trial_status: "trial_active",
          launch_trial_start: now.toISOString(),
          launch_trial_end: trialEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("user_id", target_user_id);
      if (error) throw error;

      await audit(target_user_id, { days, plan_type, trial_end: trialEnd.toISOString() });
      return json({ ok: true, trial_end: trialEnd.toISOString() });
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

      const { data: invited, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { plan_type: (payload.plan_type as string) || "free" },
      });
      if (error) throw error;

      // Audit with the newly created user's ID
      await audit(invited.user.id, {
        email,
        plan_type: (payload.plan_type as string) || "free",
      });
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
