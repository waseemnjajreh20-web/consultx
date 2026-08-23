Param(
  [string]$ProdDbUrl = $env:PROD_DB_URL,
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$ServiceKey = $env:SERVICE_KEY,
  [string]$TestUserId = $env:TEST_USER_ID
)

if (-not $ProdDbUrl) { Write-Error "Set PROD_DB_URL"; exit 1 }
if (-not $SupabaseUrl) { Write-Error "Set SUPABASE_URL"; exit 1 }
if (-not $ServiceKey) { Write-Error "Set SERVICE_KEY"; exit 1 }

Write-Host "Verifying profile columns exist..."
powershell -Command "psql '$ProdDbUrl' -At -c \"SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('ai_memory_level','output_format','preferred_standards');\""

Write-Host "PostgREST smoke test (HTTP code):"
$status = curl -s -o $null -w "%{http_code}" -H "apikey: $ServiceKey" -H "Authorization: Bearer $ServiceKey" "$SupabaseUrl/rest/v1/profiles?select=ai_memory_level,output_format,preferred_standards&user_id=eq.$TestUserId"
Write-Host $status

Write-Host "Running local build"
npm run build

Write-Host "Done"
