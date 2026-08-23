/**
 * useEntitlement — single source of truth for access/entitlement state.
 *
 * Composes useAuth + useSubscription (no new network calls).
 * All pages that need access gating should consume this hook instead of calling
 * useAuth + useSubscription individually and re-deriving the same booleans.
 */
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, type SubscriptionStatus } from "@/hooks/useSubscription";
import { isAdminEmail } from "@/config/auth";
import { SUBSCRIPTION_CONFIG } from "@/config/subscription";

/**
 * Discriminant access state — one value, unambiguous.
 *
 * "loading"          → auth or subscription still resolving
 * "anonymous"        → no authenticated user
 * "admin"            → hardcoded admin email (full access, no subscription required)
 * "subscribed"       → active paid subscription
 * "trial_active"     → free launch trial currently in progress
 * "trial_pending"    → existing user eligible for launch trial but not yet activated
 * "trial_conversion_pending"
 *                    → trial window closed WITH a card on file: not active, and a
 *                      first charge is armed. Must never be presented as plain "free".
 * "trial_expired"    → trial ended, not subscribed
 * "free"             → authenticated, no active access
 */
export type EntitlementState =
  | "loading"
  | "anonymous"
  | "owner"         // admin + owner_mode override active
  | "admin"
  | "enterprise"
  | "subscribed"
  | "trial_active"
  | "trial_pending"
  | "trial_conversion_pending"
  | "trial_expired"
  | "free";

/**
 * Copy for the `trial_conversion_pending` state (finding H5).
 *
 * Defined here rather than in src/lib/translations.ts so this state can be
 * surfaced without touching the shared translation table. Account.tsx should
 * render `TRIAL_CONVERSION_PENDING_COPY[language]` next to the cancel button.
 */
export const TRIAL_CONVERSION_PENDING_COPY = {
  ar: {
    title: "انتهت تجربتك المجانية وبطاقتك مسجلة لدينا",
    body: "اشتراكك لم يُفعّل بعد، وأول فاتورة مجدولة على بطاقتك. إذا لم ترغب في المتابعة، ألغِ الآن قبل تنفيذ الخصم.",
  },
  en: {
    title: "Your free trial has ended and your card is on file",
    body: "Your subscription is not active yet, and the first invoice is scheduled against your card. If you do not want to continue, cancel now before it is charged.",
  },
} as const;

export interface UseEntitlementResult {
  // Discriminant state — prefer switching on this
  state: EntitlementState;

  // Boolean shortcuts for common gates
  isLoading: boolean;
  isAnonymous: boolean;
  isAdmin: boolean;
  isPaidActive: boolean;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  hasActiveAccess: boolean;   // isPaidActive || isTrialActive
  isFreeLoggedIn: boolean;    // authenticated, no active paid/trial access — free logged-in tier
  canAccessChat: boolean;     // any authenticated user (free-tier included); backend enforces mode/limit
  isReturningUser: boolean;   // expired or cancelled (used by Subscribe page UI copy)

  // Trial timing
  trialDaysRemaining: number;
  trialHoursRemaining: number;

  // Raw access_state string — for conditions that need the exact server-returned value
  rawAccessState: string;

  // Auth pass-throughs (context — no cost)
  user: ReturnType<typeof useAuth>["user"];
  session: ReturnType<typeof useAuth>["session"];
  signOut: ReturnType<typeof useAuth>["signOut"];
  authLoading: boolean;

  // Subscription pass-throughs
  subscription: SubscriptionStatus | null;
  subLoading: boolean;
  refetch: () => void;

  // E6: Enterprise org access
  isOrgMember: boolean;          // has active org seat (any role)
  orgRole: string | null;        // member's role in the org
  orgId: string | null;
  orgName: string | null;
  hasEnterpriseAccess: boolean;  // active seat with AI-access role
  effectiveAccess: string;       // "enterprise" | access_state values
  effectiveAccessSource: string; // "organization" | "individual_subscription" | "launch_trial" | "free" | "admin"
  effectivePlanSlug: string;     // "enterprise" | individual plan slug

  // E7.1: Admin override
  isOwnerMode: boolean;          // admin + owner_mode override active
  adminOverrideMode: string | null; // current override slug if active, else null

  // Billing contract 2026-08-23: card-required-for-trial gating.
  // See docs/launch/billing-contract-20260823.md Sections 4-5.
  cardOnFile: boolean;           // subscription?.card_on_file (defaults false while loading)
  cardVerifiedAt: string | null; // subscription?.card_verified_at — null-safe, may lag card_on_file
  needsTrialCard: boolean;       // trialing AND no card on file — must block chat (UX state 5.1)
  hasTrialCard: boolean;         // trialing AND card on file — non-blocking banner (UX state 5.2)
  // status === "trialing", trial_end has passed, card on file: not active, and
  // the hourly renewal job still owes this user the post-trial first charge.
  isTrialConversionPending: boolean;
  // Whether the "cancel my subscription" affordance must be offered.
  // MUST include isTrialConversionPending: that user is not active, so a gate of
  // `isTrialActive || isPaidActive` hides the cancel button at exactly the moment
  // a charge is armed against their card (finding H5). Gate the cancel UI on this
  // flag, never on active-access booleans.
  canCancelSubscription: boolean;
}

export function useEntitlement(): UseEntitlementResult {
  const { user, session, signOut, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, refetch } = useSubscription();

  const isLoading = authLoading || (!!user && subLoading);
  const isAnonymous = !authLoading && !user;
  const isAdmin = isAdminEmail(user?.email);

  const rawAccessState: string = subscription?.access_state ?? "none";

  const isPaidActive =
    rawAccessState === "paid_active" || subscription?.status === "active";
  // A `trialing` subscription row is only in trial while trial_end is still in
  // the future. Status alone is NOT enough: check-subscription deliberately
  // leaves a lapsed `trialing` row untouched when a card is on file so the
  // hourly renewal job can convert it, so the row sits in status "trialing"
  // with a past trial_end. Treating that as an active trial made the checkout
  // render "SAR 1.00" while the server computed the full post_trial_first_charge.
  //
  // This mirrors isInTrial() in supabase/functions/_shared/billing.ts — the two
  // definitions must stay identical.
  //
  // Fallback: when trial_end is absent from the response (older deployed
  // check-subscription), fall back to the server's own `active` flag, which is
  // already gated on trial_end > now for the trialing branch. Never fall back
  // to status alone.
  const subTrialEndMs = subscription?.trial_end ? Date.parse(subscription.trial_end) : NaN;
  const subTrialLive =
    subscription?.status === "trialing" &&
    (Number.isFinite(subTrialEndMs)
      ? subTrialEndMs > Date.now()
      : subscription?.active === true);
  const isTrialActive = rawAccessState === "trial_active" || subTrialLive;
  // status === "trialing" but the window has closed and a card is on file:
  // the renewal cron still owes this user their first real invoice.
  const isTrialConversionPending = subscription?.trial_conversion_pending === true;
  const isTrialExpired = rawAccessState === "trial_expired";

  // E6: Enterprise org access — derived from check-subscription response
  const orgAccess           = subscription?.org_access ?? null;
  const isOrgMember         = !!orgAccess;
  const orgRole             = orgAccess?.role ?? null;
  const orgId               = orgAccess?.org_id ?? null;
  const orgName             = orgAccess?.org_name ?? null;
  const hasEnterpriseAccess = !!(orgAccess?.ai_access);
  const effectiveAccess     = subscription?.effective_access ?? rawAccessState;
  const effectiveAccessSource = subscription?.effective_access_source ?? "free";
  const effectivePlanSlug   = subscription?.effective_plan_slug ?? (subscription?.plan_slug ?? "free");

  // E7.1: Admin override fields
  const isOwnerMode      = isAdmin && !!(subscription?.owner_mode);
  const adminOverrideMode = (isAdmin && subscription?.effective_access_source === "admin_override")
    ? (subscription?.effective_plan_slug ?? null)
    : null;

  const hasActiveAccess = isPaidActive || isTrialActive || hasEnterpriseAccess;
  // H5: a trial_conversion_pending user has NO active access but DOES have a
  // charge armed against a stored card, so they must still be able to cancel.
  const canCancelSubscription = isPaidActive || isTrialActive || isTrialConversionPending;
  // isFreeLoggedIn: authenticated user with no active paid/trial/enterprise access.
  const isFreeLoggedIn = !isLoading && !!user && !isAdmin && !hasActiveAccess;
  // canAccessChat: any authenticated user may enter the workspace.
  const canAccessChat = hasActiveAccess || isAdmin || isFreeLoggedIn;
  // isReturningUser: covers paid-subscription lapsers AND launch-trial-expired users.
  const isReturningUser =
    subscription?.status === "expired" ||
    subscription?.status === "cancelled" ||
    rawAccessState === "trial_expired";

  // ── Trial countdown (finding M11) ────────────────────────────────────────
  // These two numbers feed every trial countdown in the product: AppShell's
  // header pill, TrialCardBanner (which renders them right next to "we will
  // charge SAR X when it ends"), Account and Subscribe.
  //
  // They used to read ONLY `launch_trial_*`, which is the LAUNCH CAMPAIGN
  // counter (profiles.launch_trial_end, campaign closed 2026-04-28). For a
  // paid-plan trial — the only kind that exists now — check-subscription
  // returns 0 in those fields, so every trialing user was told
  // "0 hrs remaining" beside a promise to charge their card.
  //
  // `trial_days_remaining` is the paid-subscription counter: check-subscription
  // computes it as ceil((trial_end - now) / 1 day) and it is > 0 for the whole
  // live trial window. Prefer it; fall back to the launch field so any surviving
  // launch-trial user still sees a real number.
  //
  // check-subscription returns no hours field for the paid trial, so derive it
  // locally from trial_end — the same source it uses for trial_days_remaining.
  const launchTrialDaysRemaining = subscription?.launch_trial_days_remaining ?? 0;
  const launchTrialHoursRemaining = subscription?.launch_trial_hours_remaining ?? 0;

  const subTrialMsRemaining =
    subTrialLive && Number.isFinite(subTrialEndMs) ? subTrialEndMs - Date.now() : 0;
  const paidTrialDaysRemaining = subscription?.trial_days_remaining ?? 0;
  const paidTrialHoursRemaining =
    subTrialMsRemaining > 0 ? Math.floor(subTrialMsRemaining / 3_600_000) : 0;

  const trialDaysRemaining =
    paidTrialDaysRemaining > 0 ? paidTrialDaysRemaining : launchTrialDaysRemaining;
  const trialHoursRemaining =
    paidTrialHoursRemaining > 0 ? paidTrialHoursRemaining : launchTrialHoursRemaining;

  // Billing contract 2026-08-23 (docs/launch/billing-contract-20260823.md Sections 4-5):
  // a card is required to start/keep any trial. Gate strictly on card_on_file — never on
  // card_verified_at alone (it stays null until the DB migration in Section 8 is applied).
  const cardOnFile = subscription?.card_on_file ?? false;
  const cardVerifiedAt = subscription?.card_verified_at ?? null;
  const needsTrialCard = isTrialActive && !isAdmin && !cardOnFile;
  const hasTrialCard = isTrialActive && cardOnFile;

  const state: EntitlementState = (() => {
    if (isLoading)                                       return "loading";
    if (!user)                                           return "anonymous";
    if (isAdmin && isOwnerMode)                          return "owner";
    if (isAdmin)                                         return "admin";
    if (hasEnterpriseAccess)                             return "enterprise";
    if (isPaidActive)                                    return "subscribed";
    if (isTrialActive)                                   return "trial_active";
    // Before trial_expired on purpose: a lapsed trial WITH a card on file is a
    // different (and more urgent) fact than a lapsed trial without one.
    if (isTrialConversionPending)                        return "trial_conversion_pending";
    if (isTrialExpired)                                  return "trial_expired";
    if (rawAccessState === "eligible_existing_pending")  return "trial_pending";
    return "free";
  })();

  return {
    state,
    isLoading,
    isAnonymous,
    isAdmin,
    isPaidActive,
    isTrialActive,
    isTrialExpired,
    hasActiveAccess,
    isFreeLoggedIn,
    canAccessChat,
    isReturningUser,
    trialDaysRemaining,
    trialHoursRemaining,
    rawAccessState,
    user,
    session,
    signOut,
    authLoading,
    subscription,
    subLoading,
    refetch,
    // E6: Enterprise org access
    isOrgMember,
    orgRole,
    orgId,
    orgName,
    hasEnterpriseAccess,
    effectiveAccess,
    effectiveAccessSource,
    effectivePlanSlug,
    // E7.1: Admin override
    isOwnerMode,
    adminOverrideMode,
    // Billing contract 2026-08-23
    cardOnFile,
    cardVerifiedAt,
    needsTrialCard,
    hasTrialCard,
    isTrialConversionPending,
    canCancelSubscription,
  };
}
