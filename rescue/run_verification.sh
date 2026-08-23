#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   export PROD_DB_URL="postgres://..."
#   export SUPABASE_URL="https://xyz.supabase.co"
#   export SERVICE_KEY="<service_role_or_anon_key>"
#   ./rescue/run_verification.sh

: ${PROD_DB_URL:?Please set PROD_DB_URL}
: ${SUPABASE_URL:?Please set SUPABASE_URL}
: ${SERVICE_KEY:?Please set SERVICE_KEY}
TEST_USER_ID=${TEST_USER_ID:-"<TEST_USER_ID>"}

echo "Verifying profile columns exist..."
psql "$PROD_DB_URL" -At -c "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('ai_memory_level','output_format','preferred_standards');"

echo "PostgREST smoke test (may return 200/204 depending on data)..."
curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "$SUPABASE_URL/rest/v1/profiles?select=ai_memory_level,output_format,preferred_standards&user_id=eq.$TEST_USER_ID"

echo "Local build check"
npm run build

echo "Done"
