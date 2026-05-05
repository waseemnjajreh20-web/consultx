# Secret Exposure Audit — 2026-05-05

Branch: `claude/affectionate-solomon-f5e304`
Scope: full repo scan for hardcoded secrets. **No secret values printed** in this report; classifications are by JWT-payload role, file-name pattern, and key-prefix shape only.

---

## 1. Summary

| Severity | Count | Action required |
|----------|------:|-----------------|
| **CRITICAL** | 1 | Rotate Supabase service-role key + remove from code |
| **HIGH** | 3 | Rotate Gemini API key + remove from code |
| **LOW (public-by-design)** | 3 | Document as public; keep but flag |
| **NONE** | n/a | n/a |

The repo is currently leaking **one Supabase service_role JWT** (full DB powers, RLS bypass) and **one Gemini API key** (paid usage). Both must be rotated even after this commit removes them, because git history retains the values and the repo may have been cloned, viewed, or indexed by parties beyond the project owner.

---

## 2. Findings

### 2.1 CRITICAL — Supabase service_role key

| Field | Value |
|-------|-------|
| File | `scripts/setup-admins.cjs` |
| Line | 12 |
| Secret type | Supabase JWT — `role=service_role`, `iss=supabase`, `ref=hrnltxmwoaphgejckutk`, `exp=` year 2036 |
| Production-sensitive? | **YES — full DB powers, bypasses RLS, can read/write any table, can sign storage URLs for any object** |
| Detection method | regex match on `eyJhbGc...` JWT shape; payload decoded server-side; only role/iss/ref printed |
| Already-on-disk effects | Anyone with read access to this branch (or any branch where the key was committed) has held service-role power on the production project for the full validity window. |

**Action**:
1. Replace the literal with `process.env.SUPABASE_SERVICE_ROLE_KEY`. Fail-fast if env var is missing — do not print the value in the error.
2. **Manually rotate the service_role key from the Supabase Dashboard → Project Settings → API → "Reset service_role key"**. The old key remains valid until reset; this remediation is therefore *not complete* until a human operator clicks the rotate button.
3. After rotation: any environment that needs the new key (CI, local dev, deploy pipeline) must be updated separately.

### 2.2 HIGH — Gemini (Google AI) API key, hardcoded in 3 scripts

| File | Line | Pattern | Production-sensitive? |
|------|------|---------|------------------------|
| `scripts/list-models.mjs` | 1 | `const API_KEY = "AIza..."` | **YES** — Google Gen AI billing |
| `scripts/test-gemini.mjs` | 1 | `const API_KEY = "AIza..."` | **YES** — same |
| `scripts/test-embeddings.mjs` | 1 | `const API_KEY = process.argv[2] || "AIza..."` (fallback hardcoded) | **YES** — same |

All three appear to use the same `AIza`-prefixed key. Anyone with repo access can use this key to bill arbitrary Gemini API requests against the project owner's Google Cloud account.

**Action**:
1. Replace literals with `process.env.GEMINI_API_KEY`. Fail-fast if missing.
2. **Manually rotate the Gemini key from the Google Cloud Console → APIs & Services → Credentials → "Regenerate"**.
3. Update CI/dev environments with the new key.

### 2.3 LOW — Supabase anon key (public by design)

| File | Line | Note |
|------|------|------|
| `orchestrator.cjs` | 10 | `role=anon` — **public by Supabase convention**. Anon keys are designed to be embedded in browsers and read by every visitor. Not a leak. |
| `.claude/settings.local.json` | 4 | Same anon key, embedded in a Claude Code permission rule. Not a leak. |

**Action**: Document that this is public — no rotation needed. Optionally move to env var for cleanliness, but the security risk is zero.

### 2.4 LOW — Tap publishable key (public by design)

| File | Line | Note |
|------|------|------|
| `.lovable/plan.md` | 19 | `TAP_PUBLISHABLE_KEY = "pk_test_..."` — Tap's publishable keys are public by their convention (they are embedded in the browser checkout form). The associated `TAP_SECRET_KEY` is correctly NOT in the repo (the same plan file at line 30-77 confirms it must be added to Supabase Secrets, not hardcoded). |

**Action**: No action needed. Document as public.

### 2.5 Verified clean — edge functions

23 Supabase edge functions correctly read all secrets from `Deno.env.get(...)` — none of them hardcode keys. This includes `check-subscription`, `moyasar-*`, `tap-*`, `payment-webhook`, `process-subscription-renewal`, `admin-*`, etc. Spot-checked: no `eyJhbGc` JWT-shaped strings found anywhere under `supabase/functions/`.

### 2.6 Verified clean — frontend

`src/integrations/supabase/client.ts` reads `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` (Vite-injected at build time). No keys embedded in source. Frontend is correctly configured.

### 2.7 Verified clean — other patterns

| Pattern searched | Files matched | Result |
|------------------|--------------:|--------|
| `sbp_...` / `sbs_...` (Supabase admin tokens) | 0 | Clean |
| `sk_live_...` / `sk_test_...` Stripe-style | 0 | Clean (the `.lovable/plan.md` mention is `pk_test_` — public) |
| `sk-ant-...` Anthropic key | 0 | Clean |
| `postgres(ql)?://user:password@` | 0 | Clean |
| `Bearer eyJh...` in code (vs in docs) | 0 in `.ts`, `.cjs`, `.tsx` | Clean — only in docs/runbooks |

---

## 3. Affected files (consolidated)

Files that need code changes in Task 2 (this round):

```
scripts/setup-admins.cjs           — service_role hardcoded → migrate to env
scripts/list-models.mjs            — gemini key hardcoded → migrate to env
scripts/test-gemini.mjs            — gemini key hardcoded → migrate to env
scripts/test-embeddings.mjs        — gemini key fallback hardcoded → remove fallback, env-only
```

Files that document publicly-safe values, unchanged in Task 2:

```
orchestrator.cjs                   — anon key (public by design) — keep, add comment
.claude/settings.local.json        — anon key in permission rule — leave; harness file
.lovable/plan.md                   — Tap publishable key (public by design) — leave
```

---

## 4. Required remediation steps

### Code-side (this stabilization round, Task 2 + Task 3)
1. Migrate the 4 hardcoded-key scripts to `process.env.<NAME>`.
2. Add `.env.example` documenting which env vars are required.
3. Commit with message `chore(security): remove hardcoded service role secret`.

### Operator-side (manual, outside this session)
1. **Rotate Supabase service_role key** from the Supabase Dashboard. Until this is done, the leaked key remains valid for any party who saw the repo.
2. **Rotate Gemini API key** from the Google Cloud Console. Until this is done, the leaked key remains valid for paid usage.
3. **Update environments** that need the rotated keys: developer machines, any CI workflow, any Vercel/Supabase secret stores.
4. **Audit Supabase access logs** for the period the service_role key was committed (since at least the start of this branch's history) for any suspicious activity. The Supabase dashboard exposes API logs filtered by JWT-issuer.

### Repo-history note
Removing the keys from HEAD does **not** remove them from git history. Anyone who has cloned the repo (including any prior CI run, any GitHub Actions cache, or any third-party indexing) retains the keys until rotation invalidates them. The rotation step is **load-bearing** — code edits alone are not sufficient.

---

## 5. Decision

Proceed to Task 2 (code remediation) for the 4 affected scripts. After that, Task 3 commits the change with a security commit message. The operator-side rotation steps remain owner work and are explicitly called out in the result report.
