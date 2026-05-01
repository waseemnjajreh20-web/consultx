Local rescue package — profiles preference columns

Purpose
-------
This package contains the minimal, production-safe artifacts required to
recover from a PostgREST 42703 error caused by missing preference columns on
`public.profiles` (ai_memory_level, output_format, preferred_standards).

Files included
--------------
- `rescue/add_user_prefs_prod.sql` — idempotent ALTER TABLE statements
- `rescue/run_verification.sh` — helper shell script to verify column presence and do a PostgREST smoke test (edit placeholders)
- `rescue/run_verification.ps1` — PowerShell equivalent

Safe usage notes
----------------
- Do NOT run any backfill UPDATE on the live DB during rescue unless you
  schedule a maintenance window. Backfills may cause high write load and
  locking on the `profiles` table.
- The tracked migration `supabase/migrations/20260419083000_add_user_preferences_if_missing.sql`
  contains both the `ADD COLUMN IF NOT EXISTS` statements and UPDATE backfill.
  For immediate rescue, use `rescue/add_user_prefs_prod.sql` (it omits updates).

Exact command to apply (example)
------------------------------
Create a one-off SQL file (already added here) and run as a user with ALTER TABLE rights:

psql "<PROD_DATABASE_URL>" -v ON_ERROR_STOP=1 -f rescue/add_user_prefs_prod.sql

Replace `<PROD_DATABASE_URL>` with your production connection string.

Quick verification (SQL)
-----------------------
psql "<PROD_DATABASE_URL>" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('ai_memory_level','output_format','preferred_standards');"

PostgREST smoke test (example)
------------------------------
curl -i -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/profiles?select=ai_memory_level,output_format,preferred_standards&user_id=eq.<TEST_USER_ID>"

Local tests you can run now
---------------------------
- `npm run build` — confirm the frontend compiles locally (we ran this already).
- `npx vitest` — run unit tests if you use Vitest locally (project has tests under `src/__tests__`).
- Run the verification scripts below with correct environment variables to confirm expected behavior once DB access is restored.

Notes
-----
- Keep defensive frontend guards in place (they are in `src/hooks/usePreferences.ts` and `src/hooks/useProfile.ts`) — they avoid crashes if the DB is still unavailable.
- Only run any UPDATE/backfill in a controlled maintenance window.
