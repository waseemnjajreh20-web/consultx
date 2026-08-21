# Owner Action Items — ConsultX

Tasks that require the project owner. The agent cannot perform these because they
need dashboard access, billing authority, or a human decision.

Status legend: `[ ]` pending · `[x]` done

---

## 🔴 URGENT — Credential rotation

These secrets were committed to the git repository and must be assumed compromised.
The code no longer contains them (commit `34fbeb5`), but the old values are still
readable in git history and must be revoked at the source.

| # | Task | Where | Why | Status |
|---|---|---|---|---|
| 1 | **Rotate Supabase `service_role` key** | Supabase Dashboard → Project Settings → API → *Reset service_role key* | Full read/write bypass of all RLS on the production database. Was hardcoded in `scripts/setup-admins.cjs`, valid until 2036. | `[ ]` |
| 2 | Update the new key everywhere it is consumed | Supabase Edge Function secrets + Vercel env vars + local `.env.local` | Rotating without updating consumers will break edge functions. Do steps 1 and 2 together. | `[ ]` |
| 3 | **Rotate Google Gemini API key** | Google AI Studio / Google Cloud Console → delete old key, create new | Was hardcoded in three scripts. Billable, and it is the AI engine for the whole product. | `[ ]` |
| 4 | **Change admin account passwords** | ConsultX app or Supabase Auth dashboard | Plaintext passwords for `waseemnjajreh20@gmail.com` and `njajrehwaseem@gmail.com` were committed. | `[ ]` |
| 5 | Rotate TestSprite API key *(low priority)* | TestSprite dashboard | Present in `opencode.json`. Now gitignored, and the service is currently returning 500s. | `[ ]` |

No action needed: the Vercel OIDC token expired on its own, and the Supabase
**anon** key is public by design.

---

## 🟠 Required to unblock development

| # | Task | Detail | Blocks | Status |
|---|---|---|---|---|
| 6 | Provide a working **Gemini API key** locally | Put it in `.env.local` as `GOOGLE_GEMINI_API_KEY` | Cannot run or debug the advisory chat end-to-end | `[ ]` |
| 7 | Grant **Supabase dashboard access** or supply service-role credentials | Invite, or `SUPABASE_SERVICE_ROLE_KEY` + DB password in `.env.local` | Cannot inspect real schema/RLS, run migrations, or read edge function logs | `[ ]` |
| 8 | Grant **Vercel project access** | Team invite | Cannot verify production env vars or deployment state | `[ ]` |

---

## 🟡 Business / configuration decisions

| # | Task | Detail | Status |
|---|---|---|---|
| 9 | **Configure Moyasar production keys** | `VITE_MOYASAR_PUBLISHABLE_KEY` is empty in the saved production env. Live payments cannot complete without it. Also set `MOYASAR_SECRET_KEY` and `MOYASAR_WEBHOOK_SECRET` as Supabase secrets. | `[ ]` |
| 10 | **~~Decide: is Tap Payments still used?~~** | Tap Payments is retired. Source edge functions (`tap-webhook`, `tap-create-subscription`, `tap-charge-subscription`, `create-checkout`, `verify-payment`) and the unsafe `payment-webhook` were removed; `TAP_SECRET_KEY` was rotated/deleted from Supabase secrets. | `[x]` |
| 11 | **Decide: is Lovable Cloud still used?** | `README.md` still describes a Lovable AI Gateway architecture, but the code migrated to Gemini directly in March 2026. Confirm so the docs can be corrected. | `[ ]` |
| 12 | **~~Decommission the `fire-safety-chat-v2` edge function~~** | Deployed instance deleted from the project; no source references remain. See `docs/ARCHIVE_INDEX.md`. | `[x]` |
| 13 | **Decide on error monitoring** | No Sentry or equivalent is installed. Approve a provider and supply a DSN if you want production error visibility. | `[ ]` |
| 14 | **Decide on product analytics** | No analytics installed. Approve a provider (PostHog, etc.) if wanted. | `[ ]` |
| 18 | **Decide the free-trial policy** | Who gets the 7-day Engineer trial: every new signup, or only corporate-email signups? The code currently does both at once through two different tables, so the two answers contradict each other and the UI locks out most trial users. Details and options in `docs/TRIAL_POLICY_DECISION.md`. **Blocks the fix.** | `[ ]` |

---

## 🟢 Optional / lower priority

| # | Task | Detail | Status |
|---|---|---|---|
| 15 | Consider scrubbing git history | The rotated secrets remain readable in old commits. `git filter-repo` would erase them but rewrites all commit hashes and breaks existing clones. **Recommendation: skip** — rotation (tasks 1–5) is sufficient. | `[ ]` |
| 16 | Restore TestSprite or replace it | The MCP service returns HTTP 500, so automated E2E coverage is currently unavailable. | `[ ]` |
| 17 | Enable branch protection on `main` | Prevents direct pushes and accidental history rewrites. | `[ ]` |

---

## Reference

- What was deleted during cleanup and how to recover it: `docs/ARCHIVE_INDEX.md`
- Environment variables required by the project: `.env.example`
