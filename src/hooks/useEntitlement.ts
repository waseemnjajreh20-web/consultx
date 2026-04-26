/**
 * useEntitlement — single source of truth for access/entitlement state.
 *
 * Composes useAuth + useSubscription (no new network calls).
 * All pages that need access gating should consume this hook instead of calling
 * useAuth + useSubscription individually and re-deriving the same booleans.
 */
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, type SubscriptionStatus } from "@/hooks/useSubscription";

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

/**
 * Discriminant access state — one value, unambiguous.
 *
 * "loading"          → auth or subscription still resolving
 * "anonymous"        → no authenticated user
 * "admin"            → hardcoded admin email (full access, no subscription required)
 * "subscribed"       → active paid subscription
 * "trial_active"     → free launch trial currently in progress
 * "trial_pending"    → existing user eligible for launch trial but not yet activated
 * "trial_expired"    → trial ended, not subscribed
 * "free"             → authenticated, no active access
 */
export type EntitlementState =
  | "loading"
  | "anonymous"
  | "admin"
  | "enterprise"
  | "subscribed"
  | "trial_active"
  | "trial_pending"
  | "trial_expired"
  | "free";

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
}

export function useEntitlement(): UseEntitlementResult {
  const { user, session, signOut, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, refetch } = useSubscription();

  const isLoading = authLoading || (!!user && subLoading);
  const isAnonymous = !authLoading && !user;
  const isAdmin = !!(user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));

  const rawAccessState: string = subscription?.access_state ?? "none";

  const isPaidActive =
    rawAccessState === "paid_active" || subscription?.status === "active";
  const isTrialActive =
    rawAccessState === "trial_active" || subscription?.status === "trialing";
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

  const hasActiveAccess = isPaidActive || isTrialActive || hasEnterpriseAccess;
  // isFreeLoggedIn: authenticated user with no active paid/trial/enterprise access.
  const isFreeLoggedIn = !isLoading && !!user && !isAdmin && !hasActiveAccess;
  // canAccessChat: any authenticated user may enter the workspace.
  const canAccessChat = hasActiveAccess || isAdmin || isFreeLoggedIn;
  // isReturningUser: covers paid-subscription lapsers AND launch-trial-expired users.
  const isReturningUser =
    subscription?.status === "expired" ||
    subscription?.status === "cancelled" ||
    rawAccessState === "trial_expired";

  const trialDaysRemaining = subscription?.launch_trial_days_remaining ?? 0;
  const trialHoursRemaining = subscription?.launch_trial_hours_remaining ?? 0;

  const state: EntitlementState = (() => {
    if (isLoading)                                       return "loading";
    if (!user)                                           return "anonymous";
    if (isAdmin)                                         return "admin";
    if (hasEnterpriseAccess)                             return "enterprise";
    if (isPaidActive)                                    return "subscribed";
    if (isTrialActive)                                   return "trial_active";
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
  };
}
