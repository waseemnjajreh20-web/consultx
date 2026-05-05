# Required environment variables

This document lists every environment variable that ConsultX scripts and edge functions read. Replace `<placeholder>` values with the real ones in your local environment, your Supabase Dashboard secrets store, or your CI secret manager — **never** commit them into the repo.

The repo's `.gitignore` already blocks `.env`, `.env.local`, and `.env.production`. The Claude Code hook at `.claude/hooks/guard-migrations.js` additionally blocks any file path matching `\.env`. This is a deliberate guard, not a bug.

After any rotation (Supabase Dashboard "Reset service_role key", Google Cloud Console "Regenerate", etc.), update your local `.env` and any CI/Vercel/Supabase secret stores. The repo never holds the value.

---

## Server-side (admin scripts and orchestrator)

Used by `scripts/setup-admins.cjs`, `scripts/list-models.mjs`, `scripts/test-gemini.mjs`, `scripts/test-embeddings.mjs`. **Each script now fails fast (exit 1) if the corresponding env var is missing.**

| Variable | Required by | Notes |
|----------|-------------|-------|
| `SUPABASE_URL` | `setup-admins.cjs` | Optional — defaults to `https://hrnltxmwoaphgejckutk.supabase.co`. Override only if pointing at a different project. |
| `SUPABASE_SERVICE_ROLE_KEY` | `setup-admins.cjs` | **Secret.** Bypasses RLS. Rotate immediately on any leak. |
| `SUPABASE_DB_PASSWORD` | `orchestrator.cjs` (when extended) and any direct-`psql` work | **Secret.** Distinct from the JWT above. |
| `GEMINI_API_KEY` | `list-models.mjs`, `test-gemini.mjs`, `test-embeddings.mjs` | **Secret.** Paid usage. Rotate from Google Cloud Console on any leak. |

---

## Frontend build-time (Vite)

Read by `src/integrations/supabase/client.ts`. Vite injects them at build time; they end up in the deployed bundle and are visible to every browser visitor — by design.

| Variable | Required by | Notes |
|----------|-------------|-------|
| `VITE_SUPABASE_URL` | frontend | Public — embedded in the browser bundle. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | The **anon** JWT. Public by Supabase convention. Not a secret. |
| `VITE_TAP_PUBLISHABLE_KEY` (when payment is enabled) | `src/pages/Subscribe.tsx` | Public by Tap convention. |

These three values being visible in the deployed bundle is **intentional**. RLS and the auth gate on edge functions are what enforce access; the anon key on its own grants nothing without a user JWT.

---

## Edge function runtime (Supabase Secrets)

These are configured in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** and read by edge functions via `Deno.env.get("...")`. They are **not** in any file in this repo and **must not** be added to `.env` (they are server-side runtime secrets, not local dev secrets).

| Variable | Read by |
|----------|---------|
| `SUPABASE_URL` | every edge function |
| `SUPABASE_SERVICE_ROLE_KEY` | every edge function (bypasses RLS for service-side reads) |
| `SUPABASE_ANON_KEY` | every auth-gated edge function (used to validate user JWTs) |
| `GEMINI_API_KEY` | `fire-safety-chat`, `fire-safety-chat-v2` |
| `MOYASAR_SECRET_KEY` | `moyasar-create-subscription`, `moyasar-initiate-token-payment`, `moyasar-webhook` |
| `MOYASAR_WEBHOOK_SECRET` | `moyasar-webhook` |
| `TAP_SECRET_KEY` | `tap-create-subscription`, `tap-charge-subscription`, `tap-webhook`, `verify-payment` |
| `TAP_WEBHOOK_SECRET` | `tap-webhook` |

**Operators never paste these into the repo.** They live in the Supabase secret store only.

---

## Optional (smoke / eval helpers)

Used by `evals/run_advisory_benchmark.ts` in live mode.

| Variable | Notes |
|----------|-------|
| `CONSULTX_EVAL_LIVE` | set to `1` to enable live calls; default is dry-run |
| `CONSULTX_EDGE_URL` | full URL to `/functions/v1/fire-safety-chat` |
| `CONSULTX_SERVICE_KEY` | service-role JWT (same value as `SUPABASE_SERVICE_ROLE_KEY` — separate name kept for backwards compat) |
| `SMOKE_USER_ID` | UUID of the smoke test user |

---

## Cleanup checklist after a rotation

1. Update the Supabase Dashboard secret (server-side) **or** the Vercel project env vars (build-side) **or** the developer's `.env` (local).
2. Redeploy any edge function that reads the rotated value.
3. Confirm the rotation by:
   - Running `node scripts/setup-admins.cjs` (will exit 1 if env missing; will succeed only with a valid key).
   - Calling one auth-gated edge function with the new value.
4. Audit Supabase API logs for any unexpected calls during the leak window.
