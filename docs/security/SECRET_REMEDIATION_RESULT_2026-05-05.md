# Secret Remediation Result — 2026-05-05

Companion: [docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md](docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md)

---

## 1. Files changed

| File | Change |
|------|--------|
| `scripts/setup-admins.cjs` | Removed hardcoded `service_role` JWT. Now reads from `process.env.SUPABASE_SERVICE_ROLE_KEY`. Fails fast (exit 1) with a no-value-printed error if the env var is missing. `SUPABASE_URL` is also env-driven (with the project URL as a documented default). Functional behavior of the script (admin upsert flow) is unchanged when env is provided. |
| `scripts/list-models.mjs` | Removed hardcoded Gemini API key. Now reads from `process.env.GEMINI_API_KEY`. Fails fast on missing. |
| `scripts/test-gemini.mjs` | Same. |
| `scripts/test-embeddings.mjs` | Same, with `process.argv[2]` as a per-run override that takes precedence over env. The previous hardcoded fallback is removed. |
| `docs/security/ENV_REQUIRED_KEYS.md` | NEW. Documents every env var the project reads, classifies each as public-by-design vs secret, and explains where each secret lives (local `.env` vs Supabase Dashboard secret store). |
| `docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md` | NEW (committed in this round). |
| `docs/security/SECRET_REMEDIATION_RESULT_2026-05-05.md` | NEW (this file). |

A `.env.example` file was attempted but blocked by the project's `.claude/hooks/guard-migrations.js` hook, which guards against accidental `.env*` writes. The hook is correct; the documentation file under `docs/security/ENV_REQUIRED_KEYS.md` serves the same purpose without tripping the guard.

## 2. Secrets removed from code

| Secret type | Files | Status |
|-------------|-------|--------|
| Supabase `service_role` JWT | `scripts/setup-admins.cjs` | ✅ Removed |
| Gemini API key | `scripts/list-models.mjs`, `scripts/test-gemini.mjs`, `scripts/test-embeddings.mjs` | ✅ Removed (3 occurrences) |

**Verification** (re-scan after edits, with values redacted):

```
$ grep -rln 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+' --include='*.cjs' --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git .
  ./.claude/settings.local.json   # role=anon (public — by design)
  ./orchestrator.cjs              # role=anon (public — by design)

$ grep -rln 'AIza[A-Za-z0-9_\-]{30,}' --include='*.cjs' --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=.git .
  (no matches)
```

Only `role=anon` JWTs remain in the code. These are designed to be public (every browser visiting the deployed app holds them).

## 3. Env vars now required

| Variable | Used by | Severity if missing |
|----------|---------|---------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/setup-admins.cjs` | Script fails fast — admin setup cannot run |
| `SUPABASE_URL` | `scripts/setup-admins.cjs` (optional — has a default) | Script uses default project URL |
| `GEMINI_API_KEY` | `scripts/list-models.mjs`, `scripts/test-gemini.mjs`, `scripts/test-embeddings.mjs` | Each script fails fast |

All four scripts have been verified to:
- Pass `node --check` syntax validation.
- Print a clear error and `process.exit(1)` when the required env var is missing.
- Never print the env-var value (verified by inspecting the error messages).

## 4. Manual rotation still required

**YES.** Removing the literal from the repo HEAD does not invalidate the value. Anyone who cloned the repo, ran a CI job that checked it out, or saw it in a code-search index still holds the keys. The keys remain valid until rotated at the upstream provider.

### 4.1 Supabase service_role key

> **Supabase service role key must be rotated manually from Supabase Dashboard.**

Steps (operator):
1. Sign in to https://supabase.com/dashboard
2. Open project `hrnltxmwoaphgejckutk`
3. Go to **Project Settings → API**
4. Click **"Reset"** next to **service_role secret**
5. Copy the new key immediately. Old key will stop working within seconds.
6. Update every place the key is consumed:
   - Any developer's local `.env` (in their copy of the repo)
   - CI workflow secret (if any) — currently no GitHub Actions workflows are present in this repo, but verify
   - Vercel project env (if any deploy uses it server-side) — frontend uses anon key only, so likely unused there
   - **Supabase Edge Functions runtime**: open **Project Settings → Edge Functions → Secrets**, replace `SUPABASE_SERVICE_ROLE_KEY` value, redeploy any function that reads it (every edge function does — they all use service-role for admin reads).
7. Audit Supabase API logs for any anomalous service-role-level requests during the leak window. Filter logs by JWT issuer.

### 4.2 Gemini API key

Steps (operator):
1. Sign in to https://console.cloud.google.com/
2. Navigate to **APIs & Services → Credentials**
3. Find the API key labeled for ConsultX (or matching the leaked prefix)
4. Click **Regenerate key** (or delete and create a new one if the dashboard doesn't offer regenerate for this key type)
5. Copy the new key
6. Update consumers:
   - Local `.env` for any developer who runs the test scripts
   - Supabase Edge Functions secrets: `GEMINI_API_KEY` (used by `fire-safety-chat`, `fire-safety-chat-v2`)
   - Redeploy the affected edge functions
7. Inspect Google Cloud billing for unexpected usage during the leak window.

## 5. What this commit does NOT remediate

The repo still contains `ADMINS` array with hardcoded reset passwords inside `scripts/setup-admins.cjs` (lines 19-20 of the unchanged section). These are **production user passwords** for the two `ADMIN_EMAILS` accounts. They are flagged in the audit as a separate concern.

The instruction "لا تغيّر وظيفة السكربت غير ذلك" was interpreted as: minimal change for the explicit `SERVICE_ROLE_KEY` directive. The admin-password issue is documented in:
- [docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md](docs/security/SECRET_EXPOSURE_AUDIT_2026-05-05.md) Section 2.5 (implicit — the hardcoded passwords are visible in the file).
- The new comment block at the top of `scripts/setup-admins.cjs` calls them out explicitly.

**Recommended follow-up** (separate task, not in this commit):
- Rotate the two admin user passwords via the Supabase Dashboard's password-reset flow.
- Refactor `setup-admins.cjs` to read passwords from a one-shot env var or prompt the operator interactively, rather than hardcoding.

## 6. Next operator steps (in order)

1. **Rotate Supabase service_role key** — most urgent. The key has 10+ years of validity remaining and grants full DB powers.
2. **Rotate Gemini API key** — second most urgent. Paid usage exposure.
3. **Rotate the two admin user passwords** for the accounts in `ADMINS` array.
4. **Audit Supabase API logs** and Google Cloud billing for any anomalies during the exposure window.
5. After rotations: re-run `scripts/setup-admins.cjs` with the new env-driven values, verify that the admin accounts function with the new credentials.

These steps are operator-side and out of scope for this autonomous session. The code-side remediation (this commit) is the necessary precondition for the rotation to be durable — without it, the next clone of the repo would leak the new keys all over again.
