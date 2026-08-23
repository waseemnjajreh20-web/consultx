import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecretKey, getPublishableKey } from "../_shared/supabaseKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============================================================================
// delete-account
//
// PDPL (Saudi Personal Data Protection Law) right-to-erasure endpoint.
// Permanently and irreversibly deletes the CALLING user's account and personal
// data. The user id is always derived from the verified JWT — never from the
// request body — so one user can never delete another.
//
// ---------------------------------------------------------------------------
// REFUSAL RULES (all evaluated BEFORE any destructive write)
// ---------------------------------------------------------------------------
//   R1 billing_active
//       A user_subscriptions row exists with status in
//       ("active", "trialing", "past_due"). We refuse, because:
//         - user_subscriptions.user_id has NO foreign key to auth.users, so the
//           row (and its stored card token) SURVIVES deletion of the auth user.
//           process-subscription-renewal would keep charging a card belonging
//           to an account that no longer exists.
//         - deleting mid-period would destroy paid access with no refund path.
//       The user must call cancel-subscription first. If the cancellation is
//       already scheduled (cancel_at_period_end = true) the account becomes
//       deletable once current_period_end has passed; we return that date so
//       the UI can state it exactly.
//       Lawful basis for the (bounded) refusal: PDPL permits retaining and
//       continuing to process personal data where it is necessary to complete
//       a contractual relationship. The delay never exceeds one billing period.
//
//   R2 org_owner
//       The user owns an organization (organizations.owner_user_id). Refused
//       unconditionally, not only when other members exist:
//       organizations.owner_user_id is ON DELETE CASCADE, so deleting the auth
//       user would silently cascade-destroy the whole organization — its
//       members, cases, documents and audit trail — which is data belonging to
//       the office and to its clients, not to the individual. Ownership must be
//       transferred, or the organization closed, by contacting support first.
//
//   R3 org_member
//       The user has an org_members row with status "invited", "active" or
//       "suspended". Their seat, role and audit trail belong to the office; an
//       org owner/admin must remove them first. ("removed" members are NOT
//       blocked here — they fall through to R4.)
//
//   R4 enterprise_records
//       The user authored enterprise records whose foreign keys to auth.users
//       are RESTRICT (no ON DELETE CASCADE) — case notes, reviews, approvals,
//       uploaded documents, audit events, etc. auth.admin.deleteUser() would
//       fail with a foreign-key violation. Because we would already have wiped
//       conversations and profile by then, we detect this UP FRONT and refuse,
//       rather than leaving a half-deleted account. These users are routed to
//       info@consultx.app for an assisted erasure.
//
// ---------------------------------------------------------------------------
// WHAT IS DELETED
// ---------------------------------------------------------------------------
//   storage chat-images/<user_id>/*  uploaded drawings/images (PUBLIC bucket)
//   messages                         via the user's conversation ids
//   conversations
//   mode_daily_usage
//   daily_message_usage
//   user_public_profiles
//   profiles
//   auth.users row                   (admin hard delete — email, identities)
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY RETAINED (and de-identified)
// ---------------------------------------------------------------------------
//   user_subscriptions, payment_transactions, payment_history
//     Retained: Saudi commercial/accounting law requires a merchant to keep
//     transaction records. None of these tables has a foreign key to
//     auth.users, so they survive the auth deletion naturally and keep only an
//     orphaned user_id UUID — a pseudonymous key with no way back to a person
//     once auth.users is gone.
//     De-identified before deletion: every reusable payment credential is
//     nulled (moyasar_card_token, moyasar_given_id, tap_card_id,
//     tap_customer_id, tap_payment_agreement_id) and the subscription is forced
//     to status "cancelled" / cancel_at_period_end = true /
//     next_billing_date = null, so no renewal can ever be attempted against a
//     deleted account.
//     Kept on purpose: amount, currency, dates, card_brand, card_last_four —
//     the minimum needed to reconcile a payment or answer a chargeback.
//
//   admin_audit_log
//     Retained. It records actions taken BY administrators; erasing it would
//     destroy the security audit trail. It holds no content of the user's.
//
// ---------------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------------
//   - Requires an explicit confirmation token in the body ("DELETE") so an
//     accidental POST cannot destroy an account.
//   - All refusal checks run first; the first destructive write only happens
//     once every gate has passed.
//   - The auth user is deleted LAST. If it fails, the caller gets a 500 naming
//     the partial state so support can finish the job.
//   - Every step is logged with the user id and row counts.
// ============================================================================

/** Subscription statuses that represent a live paid or trial obligation. */
const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

/** org_members statuses that still tie a user to an organization. */
const ATTACHED_MEMBER_STATUSES = ["invited", "active", "suspended"] as const;

/**
 * Enterprise columns referencing auth.users(id) WITHOUT ON DELETE CASCADE.
 * Any row here makes auth.admin.deleteUser() fail on a foreign-key violation,
 * so we must detect them before touching anything.
 */
const RESTRICTING_REFERENCES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "org_invitations", column: "created_by" },
  { table: "org_members", column: "invited_by" },
  { table: "org_member_profiles", column: "updated_by" },
  { table: "org_messages", column: "author_id" },
  { table: "organization_branding_settings", column: "updated_by" },
  { table: "enterprise_cases", column: "created_by" },
  { table: "enterprise_cases", column: "assigned_engineer_id" },
  { table: "enterprise_cases", column: "head_reviewer_id" },
  { table: "case_documents", column: "uploaded_by" },
  { table: "case_status_history", column: "actor_user_id" },
  { table: "case_notes", column: "author_id" },
  { table: "case_reviews", column: "reviewer_user_id" },
  { table: "case_approvals", column: "approver_user_id" },
  { table: "case_ai_sessions", column: "created_by" },
  { table: "ai_report_versions", column: "created_by" },
  { table: "ai_report_versions", column: "decided_by" },
  { table: "case_review_ai_reports", column: "linked_by" },
  { table: "case_client_contacts", column: "created_by" },
  { table: "case_public_tracking", column: "created_by" },
  { table: "case_public_updates", column: "published_by" },
  { table: "case_tasks", column: "assigned_to" },
  { table: "case_tasks", column: "created_by" },
  { table: "case_task_events", column: "actor_user_id" },
];

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Standard refusal shape shared by every gate. */
function refuse(
  code: string,
  messageEn: string,
  messageAr: string,
  extra: Json = {},
): Response {
  return jsonResponse(
    { success: false, error: code, message: messageEn, message_ar: messageAr, ...extra },
    409,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  let userId = "unknown";

  try {
    // ── 0. Authenticate ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = getPublishableKey();
    const serviceRoleKey = getSecretKey();

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ success: false, error: "unauthorized" }, 401);
    }
    userId = user.id;

    // ── 0b. Explicit confirmation ────────────────────────────────────────────
    // The body may carry ONLY a confirmation token. Any user id in the body is
    // ignored on purpose — identity comes from the JWT above.
    let body: Json = {};
    try {
      body = (await req.json()) as Json;
    } catch {
      body = {};
    }
    if (body.confirm !== "DELETE") {
      return jsonResponse(
        {
          success: false,
          error: "confirmation_required",
          message: 'Send { "confirm": "DELETE" } to confirm permanent deletion.',
        },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    console.log(`delete-account: request received for user ${userId}`);

    // ── R1. Live billing obligation ──────────────────────────────────────────
    const { data: liveSub, error: liveSubError } = await adminClient
      .from("user_subscriptions")
      .select("id, status, cancel_at_period_end, current_period_end")
      .eq("user_id", userId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (liveSubError) {
      console.error("delete-account: subscription lookup failed", liveSubError);
      return jsonResponse({ success: false, error: "subscription_lookup_failed" }, 500);
    }

    if (liveSub) {
      const periodEnd = liveSub.current_period_end
        ? new Date(liveSub.current_period_end)
        : null;
      const periodOver = periodEnd !== null && periodEnd.getTime() <= Date.now();

      // Only a cancellation that has ALREADY run its course unblocks deletion.
      if (!(liveSub.cancel_at_period_end && periodOver)) {
        console.log(
          `delete-account: refused for ${userId} — live subscription ${liveSub.id} (${liveSub.status})`,
        );
        return refuse(
          "subscription_active",
          "You have a live subscription. Cancel your subscription first, then delete your account.",
          "لديك اشتراك ساري. يرجى إلغاء الاشتراك أولاً ثم حذف الحساب.",
          {
            subscription_status: liveSub.status,
            cancel_at_period_end: liveSub.cancel_at_period_end,
            deletable_after: liveSub.current_period_end,
          },
        );
      }
    }

    // ── R2. Organization ownership ───────────────────────────────────────────
    const { data: ownedOrgs, error: ownedOrgsError } = await adminClient
      .from("organizations")
      .select("id, name")
      .eq("owner_user_id", userId);

    if (ownedOrgsError) {
      console.error("delete-account: organization lookup failed", ownedOrgsError);
      return jsonResponse({ success: false, error: "organization_lookup_failed" }, 500);
    }

    if (ownedOrgs && ownedOrgs.length > 0) {
      // Count other members so the message can be precise, but refuse either
      // way: cascading the org away is never an acceptable side effect of an
      // individual erasure request.
      const orgIds = ownedOrgs.map((o) => o.id);
      const { count: otherMembers } = await adminClient
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .in("org_id", orgIds)
        .in("status", ATTACHED_MEMBER_STATUSES as unknown as string[])
        .neq("user_id", userId);

      console.log(
        `delete-account: refused for ${userId} — owns ${orgIds.length} org(s), ${otherMembers ?? 0} other member(s)`,
      );
      return refuse(
        "organization_owner",
        "You own an organization workspace. Transfer ownership or close the organization with info@consultx.app before deleting your account.",
        "أنت مالك مساحة عمل مؤسسية. يرجى نقل الملكية أو إغلاق المؤسسة بالتواصل مع info@consultx.app قبل حذف حسابك.",
        {
          organization_count: orgIds.length,
          other_member_count: otherMembers ?? 0,
          contact: "info@consultx.app",
        },
      );
    }

    // ── R3. Organization membership ──────────────────────────────────────────
    const { count: attachedMemberships, error: membershipError } = await adminClient
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ATTACHED_MEMBER_STATUSES as unknown as string[]);

    if (membershipError) {
      console.error("delete-account: membership lookup failed", membershipError);
      return jsonResponse({ success: false, error: "membership_lookup_failed" }, 500);
    }

    if ((attachedMemberships ?? 0) > 0) {
      console.log(`delete-account: refused for ${userId} — attached to an organization`);
      return refuse(
        "organization_member",
        "You are a member of an organization workspace. Ask an organization owner or admin to remove you first, or contact info@consultx.app.",
        "أنت عضو في مساحة عمل مؤسسية. يرجى الطلب من مالك المؤسسة أو المشرف إزالتك أولاً، أو التواصل مع info@consultx.app.",
        { contact: "info@consultx.app" },
      );
    }

    // ── R4. Enterprise records that block the auth delete ────────────────────
    const blockedBy: string[] = [];
    for (const ref of RESTRICTING_REFERENCES) {
      const { count, error } = await adminClient
        .from(ref.table)
        .select("*", { count: "exact", head: true })
        .eq(ref.column, userId);

      if (error) {
        // A missing table (schema drift) must not silently pass this gate.
        console.error(
          `delete-account: pre-flight check failed on ${ref.table}.${ref.column}`,
          error,
        );
        return jsonResponse(
          {
            success: false,
            error: "preflight_check_failed",
            message: `Could not verify ${ref.table}. Deletion aborted before any data was changed.`,
          },
          500,
        );
      }
      if ((count ?? 0) > 0) {
        blockedBy.push(`${ref.table}.${ref.column} (${count})`);
      }
    }

    if (blockedBy.length > 0) {
      console.log(
        `delete-account: refused for ${userId} — enterprise records present: ${blockedBy.join(", ")}`,
      );
      return refuse(
        "enterprise_records_present",
        "Your account is linked to enterprise case records that must be handled manually. Contact info@consultx.app and we will complete your erasure request.",
        "حسابك مرتبط بسجلات مشاريع مؤسسية تتطلب معالجة يدوية. يرجى التواصل مع info@consultx.app وسنستكمل طلب الحذف.",
        { contact: "info@consultx.app", blocked_by: blockedBy },
      );
    }

    // ========================================================================
    // Every gate passed. From here on the operation is DESTRUCTIVE.
    // ========================================================================
    const deleted: Record<string, number | string> = {};
    const warnings: string[] = [];

    // ── 1. Uploaded images (public bucket — must go first) ───────────────────
    // Path convention written by ChatInterface: `chat-images/<user_id>/<file>`.
    try {
      const { data: objects, error: listError } = await adminClient.storage
        .from("chat-images")
        .list(userId, { limit: 1000 });

      if (listError) {
        warnings.push(`storage_list_failed: ${listError.message}`);
      } else if (objects && objects.length > 0) {
        const paths = objects.map((o) => `${userId}/${o.name}`);
        const { error: removeError } = await adminClient.storage
          .from("chat-images")
          .remove(paths);
        if (removeError) {
          warnings.push(`storage_remove_failed: ${removeError.message}`);
        } else {
          deleted.chat_images = paths.length;
        }
        if (objects.length === 1000) {
          warnings.push("storage_list_truncated_at_1000");
        }
      } else {
        deleted.chat_images = 0;
      }
    } catch (storageError) {
      warnings.push(`storage_exception: ${String(storageError)}`);
    }

    // ── 2. Messages (no direct user_id — reached via conversations) ──────────
    const { data: conversations, error: convListError } = await adminClient
      .from("conversations")
      .select("id")
      .eq("user_id", userId);

    if (convListError) {
      console.error("delete-account: conversation listing failed", convListError);
      return jsonResponse(
        {
          success: false,
          error: "conversation_lookup_failed",
          message: "Deletion aborted. Uploaded images may already have been removed.",
        },
        500,
      );
    }

    const conversationIds = (conversations ?? []).map((c) => c.id);
    if (conversationIds.length > 0) {
      // Chunked so a very long history cannot overflow the URL length limit.
      const CHUNK = 100;
      for (let i = 0; i < conversationIds.length; i += CHUNK) {
        const chunk = conversationIds.slice(i, i + CHUNK);
        const { error: msgError } = await adminClient
          .from("messages")
          .delete()
          .in("conversation_id", chunk);
        if (msgError) {
          console.error("delete-account: message deletion failed", msgError);
          return jsonResponse(
            {
              success: false,
              error: "message_deletion_failed",
              message:
                "Deletion aborted part-way. Contact info@consultx.app to complete it.",
            },
            500,
          );
        }
      }
      deleted.messages = "all for " + conversationIds.length + " conversations";
    } else {
      deleted.messages = 0;
    }

    // ── 3. Personal tables ───────────────────────────────────────────────────
    // conversations, mode_daily_usage and user_public_profiles also cascade
    // from auth.users, but they are deleted explicitly so that the erasure is
    // complete and logged even if the final auth delete has to be retried.
    const personalTables: ReadonlyArray<{ table: string; column: string }> = [
      { table: "conversations", column: "user_id" },
      { table: "mode_daily_usage", column: "user_id" },
      { table: "daily_message_usage", column: "user_id" },
      { table: "user_public_profiles", column: "user_id" },
      { table: "org_member_presence", column: "user_id" },
      { table: "profiles", column: "user_id" },
    ];

    for (const t of personalTables) {
      const { error } = await adminClient.from(t.table).delete().eq(t.column, userId);
      if (error) {
        console.error(`delete-account: failed to delete from ${t.table}`, error);
        return jsonResponse(
          {
            success: false,
            error: "personal_data_deletion_failed",
            message: `Deletion aborted while clearing ${t.table}. Contact info@consultx.app to complete it.`,
          },
          500,
        );
      }
      deleted[t.table] = "cleared";
    }

    // ── 4. De-identify retained financial records ────────────────────────────
    // RETAINED for legal/accounting reasons, but stripped of every reusable
    // payment credential and hard-stopped so no renewal can ever fire.
    const { error: subScrubError } = await adminClient
      .from("user_subscriptions")
      .update({
        status: "cancelled",
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
        next_billing_date: null,
        moyasar_card_token: null,
        moyasar_given_id: null,
        tap_card_id: null,
        tap_customer_id: null,
        tap_payment_agreement_id: null,
      })
      .eq("user_id", userId);

    if (subScrubError) {
      // Hard failure: leaving a live card token behind is a money risk.
      console.error("delete-account: subscription de-identification failed", subScrubError);
      return jsonResponse(
        {
          success: false,
          error: "billing_deidentification_failed",
          message:
            "Deletion aborted before removing your login. Contact info@consultx.app immediately.",
        },
        500,
      );
    }
    deleted.user_subscriptions = "retained, de-identified, hard-cancelled";
    deleted.payment_transactions = "retained (legal/accounting)";
    deleted.payment_history = "retained (legal/accounting)";

    // ── 5. Delete the auth user (LAST — removes email and identities) ────────
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error("delete-account: auth user deletion failed", authDeleteError);
      return jsonResponse(
        {
          success: false,
          error: "auth_deletion_failed",
          message:
            "Your personal data was removed but your login could not be deleted. Contact info@consultx.app so we can finish.",
          partial: true,
          deleted,
        },
        500,
      );
    }

    console.log(
      `delete-account: COMPLETED for ${userId} — ${JSON.stringify(deleted)}` +
        (warnings.length > 0 ? ` warnings=${JSON.stringify(warnings)}` : ""),
    );

    return jsonResponse(
      {
        success: true,
        deleted,
        retained: [
          "user_subscriptions (de-identified)",
          "payment_transactions",
          "payment_history",
        ],
        warnings,
      },
      200,
    );
  } catch (error) {
    console.error(`delete-account: unhandled error for ${userId}`, error);
    return jsonResponse({ success: false, error: "internal_server_error" }, 500);
  }
});
