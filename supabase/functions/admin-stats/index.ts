import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user || !user.email || !ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries for all stats + billing observability
    const [
      usersResult,
      activeSubsResult,
      totalSubsResult,
      revenueResult,
      kgNodesResult,
      kgEdgesResult,
      kgCommunitiesResult,
      kgStatusResult,
      // ── Billing observability ──────────────────────────────────────────────
      pastDueResult,
      softCancelResult,
      pendingActivationResult,
      deadLettersResult,
      failedTxResult,
      deadLetters24hResult,
    ] = await Promise.all([
      // Total users from auth
      supabase.auth.admin.listUsers({ perPage: 1 }),
      // Active subscriptions
      supabase.from("user_subscriptions").select("*", { count: "exact", head: true }).in("status", ["active", "trialing"]),
      // All subscriptions
      supabase.from("user_subscriptions").select("*", { count: "exact", head: true }),
      // Captured transactions with payment_type for revenue split
      supabase.from("payment_transactions").select("amount, payment_type").eq("status", "captured"),
      // KG nodes
      supabase.from("graph_nodes").select("*", { count: "exact", head: true }),
      // KG edges
      supabase.from("graph_edges").select("*", { count: "exact", head: true }),
      // KG communities
      supabase.from("community_summaries").select("*", { count: "exact", head: true }),
      // KG indexing status
      supabase.from("graph_indexing_status").select("*").order("created_at", { ascending: false }),
      // Past-due subscriptions (oldest first so most urgent is top)
      supabase.from("user_subscriptions")
        .select("id, user_id, past_due_since, dunning_notified_at, current_period_end")
        .not("past_due_since", "is", null)
        .order("past_due_since", { ascending: true })
        .limit(20),
      // Soft-cancel count: active subscriptions that will not renew
      supabase.from("user_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("cancel_at_period_end", true)
        .eq("status", "active"),
      // Pending activation count: returning-user payments awaiting webhook confirmation
      supabase.from("user_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_activation"),
      // Recent webhook dead letters (last 10)
      supabase.from("webhook_dead_letters")
        .select("id, charge_id, reason, tap_status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      // Recent failed payment transactions (last 10)
      supabase.from("payment_transactions")
        .select("id, user_id, tap_charge_id, payment_type, failure_code, failure_message, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(10),
      // Dead letters in the last 24 hours (count only, for alert badge)
      supabase.from("webhook_dead_letters")
        .select("*", { count: "exact", head: true })
        .gte("created_at", twentyFourHoursAgo),
    ]);

    // ── Revenue split ─────────────────────────────────────────────────────────
    const allCaptured = (revenueResult.data || []) as Array<{ amount: number; payment_type: string }>;
    const totalRevenue = allCaptured.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const renewalRevenue = allCaptured
      .filter(t => t.payment_type === "renewal")
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const renewalCount = allCaptured.filter(t => t.payment_type === "renewal").length;
    const verificationCount = allCaptured.filter(t => t.payment_type === "verification").length;

    // ── Subscription breakdown by status ─────────────────────────────────────
    const { data: subsByStatus } = await supabase
      .from("user_subscriptions")
      .select("status");

    const statusBreakdown = (subsByStatus || []).reduce((acc: Record<string, number>, sub: any) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1;
      return acc;
    }, {});

    // ── Recent users (last 7 days) ────────────────────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentUsersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const recentUsers = (recentUsersData?.users || []).filter(
      (u: any) => u.created_at && u.created_at > sevenDaysAgo
    ).length;

    return new Response(JSON.stringify({
      users: {
        total: usersResult.data?.total || 0,
        recent7Days: recentUsers,
      },
      subscriptions: {
        active: activeSubsResult.count || 0,
        total: totalSubsResult.count || 0,
        breakdown: statusBreakdown,
      },
      revenue: {
        totalHalala: totalRevenue,
        totalSAR: (totalRevenue / 100).toFixed(2),
        transactions: allCaptured.length,
        renewalHalala: renewalRevenue,
        renewalSAR: (renewalRevenue / 100).toFixed(2),
        renewalCount,
        verificationCount,
      },
      billing: {
        pastDue: pastDueResult.data || [],
        softCancelCount: softCancelResult.count || 0,
        pendingActivationCount: pendingActivationResult.count || 0,
        deadLetters: deadLettersResult.data || [],
        deadLetters24hCount: deadLetters24hResult.count || 0,
        failedTransactions: failedTxResult.data || [],
      },
      knowledgeGraph: {
        nodes: kgNodesResult.count || 0,
        edges: kgEdgesResult.count || 0,
        communities: kgCommunitiesResult.count || 0,
        files: kgStatusResult.data || [],
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Admin stats error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
