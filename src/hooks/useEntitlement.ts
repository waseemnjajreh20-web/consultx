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
  canAccessChat: boolean;     // hasActiveAccess || isAdmin — single gate for workspace entry
  isReturningUser: boolean;   // expired or cancelled (used by Subscribe page)

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
}

export function useEntitlement(): UseEntitlementResult {
  const { user, session, signOut, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, refetch } = useSubscription();

  const isLoading = authLoading || (!!user && subLoading);
  const isAnonymous = !authLoading && !user;
  const isAdmin = !!(user?.email && ADMIN_EMAILS.includes(user.email));

  const rawAccessState: string = subscription?.access_state ?? "none";

  const isPaidActive =
    rawAccessState === "paid_active" || subscription?.status === "active";
  const isTrialActive =
    rawAccessState === "trial_active" || subscription?.status === "trialing";
  const isTrialExpired = rawAccessState === "trial_expired";
  const hasActiveAccess = isPaidActive || isTrialActive;
  const canAccessChat = hasActiveAccess || isAdmin;
  const isReturningUser =
    subscription?.status === "expired" || subscription?.status === "cancelled";

  const trialDaysRemaining = subscription?.launch_trial_days_remaining ?? 0;
  const trialHoursRemaining = subscription?.launch_trial_hours_remaining ?? 0;

  const state: EntitlementState = (() => {
    if (isLoading)                                       return "loading";
    if (!user)                                           return "anonymous";
    if (isAdmin)                                         return "admin";
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
  };
}
