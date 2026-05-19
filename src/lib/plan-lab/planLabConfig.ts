/**
 * Plan Lab — runtime feature-flag resolver.
 *
 * Reads `import.meta.env.VITE_PLAN_LAB_ENABLED` and
 * `import.meta.env.VITE_PLAN_LAB_IFRAME_URL` once at module load and exposes a
 * frozen `planLabConfig` object. No side effects beyond environment reads.
 *
 * The flag uses strict `=== "true"` equality so that any unset, empty, or
 * mis-typed value is interpreted as disabled. `iframeOrigin` is computed from
 * `iframeUrl` via `new URL(...).origin`; a malformed URL degrades both
 * `iframeUrl` and `iframeOrigin` to null so the page falls back to the
 * empty state instead of rendering a broken iframe.
 */
import type { PlanLabFeatureFlag } from "@/types/planLab";

function resolveEnabled(): boolean {
  return import.meta.env.VITE_PLAN_LAB_ENABLED === "true";
}

function resolveIframeUrl(): string | null {
  const raw = import.meta.env.VITE_PLAN_LAB_IFRAME_URL;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function resolveIframeOrigin(iframeUrl: string | null): string | null {
  if (iframeUrl === null) return null;
  try {
    return new URL(iframeUrl).origin;
  } catch {
    return null;
  }
}

function resolveDevLogging(): boolean {
  return import.meta.env.DEV === true;
}

const iframeUrl = resolveIframeUrl();
const iframeOrigin = resolveIframeOrigin(iframeUrl);
// If the URL is unparseable, drop iframeUrl too so the UI does not render
// a broken iframe pointing at a malformed value.
const effectiveIframeUrl = iframeOrigin === null ? null : iframeUrl;

export const planLabConfig: Readonly<PlanLabFeatureFlag> = Object.freeze({
  enabled: resolveEnabled(),
  iframeUrl: effectiveIframeUrl,
  iframeOrigin,
  devLogging: resolveDevLogging(),
});
