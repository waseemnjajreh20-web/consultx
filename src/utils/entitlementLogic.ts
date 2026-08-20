/**
 * Entitlement logic utilities for ConsultX.
 * Pure functions for determining plan state, free of React hooks.
 */

export interface ComputeFreePlanInput {
  isLoading: boolean;
  hasUser: boolean;
  isAdmin: boolean;
  isPaidActive: boolean;
  isTrialActive: boolean;
}

export function computeIsFreePlan(input: ComputeFreePlanInput): boolean {
  if (input.isLoading) return false;
  if (!input.hasUser) return false;
  if (input.isAdmin) return false;
  if (input.isPaidActive) return false;
  if (input.isTrialActive) return false;
  return true;
}
