/**
 * featureFlags.ts — tiny VITE_-env flag reader for UI-only features that
 * must default OFF (no env var set => byte-identical to pre-flag behavior).
 * No React, no Supabase, no side effects — safe to import anywhere,
 * including from tests.
 *
 * Convention matches the "1"-string flags already used elsewhere in this
 * codebase (VITE_ADVISORY_CITATION_DRIFT_HONESTY_ENABLED,
 * VITE_ADVISORY_AUDIENCE_LAYER_ENABLED in src/components/ChatInterface.tsx):
 * a flag is ON only when the env var is the exact string "1". Unset,
 * empty, "true", "0", etc. are all OFF.
 */

/** UI feature flags introduced for the Building Profile wave (C1a/C1b). */
export type FeatureFlagName =
  | "BUILDING_PROFILE_UI"
  | "COMPLIANCE_REPORT_UI"
  | "ANSWER_FEEDBACK_UI";

/**
 * true only when import.meta.env[`VITE_${name}`] === "1". Never throws —
 * an unusual/missing import.meta.env shape (e.g. a non-Vite test runner)
 * resolves to OFF, not a crash.
 */
export function isFlagOn(name: FeatureFlagName): boolean {
  try {
    const env = import.meta.env as unknown as Record<string, unknown> | undefined;
    return env?.[`VITE_${name}`] === "1";
  } catch {
    return false;
  }
}
