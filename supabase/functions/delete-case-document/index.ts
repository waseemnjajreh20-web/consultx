import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── 1. Authenticate caller ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Parse input ─────────────────────────────────────────────────────
    let body: { document_id?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { document_id } = body;
    if (!document_id || typeof document_id !== "string") {
      return json({ error: "document_id required" }, 400);
    }

    // ── 3. Load document row via service role ──────────────────────────────
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: doc, error: docError } = await serviceClient
      .from("case_documents")
      .select("id, org_id, case_id, storage_path")
      .eq("id", document_id)
      .maybeSingle();

    if (docError || !doc) return json({ error: "Document not found" }, 404);

    // ── 4. Authorization: owner or admin only ──────────────────────────────
    const { data: isAdmin, error: adminError } = await serviceClient
      .rpc("is_org_owner_or_admin", { p_org_id: doc.org_id, p_user_id: user.id });

    if (adminError || !isAdmin) {
      return json({ error: "Access denied: owner or admin required" }, 403);
    }

    // ── 5. Remove storage object (service role bypasses storage RLS) ───────
    const { error: storageError } = await serviceClient.storage
      .from("enterprise-case-documents")
      .remove([doc.storage_path]);

    if (storageError) {
      console.error("Storage remove error:", storageError.message);
      return json({ error: "Storage deletion failed" }, 500);
    }

    // ── 6. Delete DB row ────────────────────────────────────────────────────
    const { error: dbError } = await serviceClient
      .from("case_documents")
      .delete()
      .eq("id", document_id);

    if (dbError) {
      console.error("DB delete error:", dbError.message);
      return json({ error: "Database deletion failed after storage removal" }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Unhandled:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
