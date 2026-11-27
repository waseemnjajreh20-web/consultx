$ErrorActionPreference = 'Stop'
$node = Get-Command node.exe -ErrorAction Stop
if ([int]((& $node.Source --version).TrimStart('v').Split('.')[0]) -lt 20) { throw 'Node.js 20+ required.' }
$target = Join-Path $env:LOCALAPPDATA 'ConsultX\MCP'
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($file in @('server.mjs','Run.ps1','package.json')) {
    $source = Join-Path $PSScriptRoot $file
    if ($source -ne (Join-Path $target $file)) { Copy-Item -LiteralPath $source -Destination $target -Force }
}
$url = (Read-Host 'Supabase project URL (https://YOUR-PROJECT.supabase.co)').TrimEnd('/')
$uri = [Uri]$url
if ($uri.Scheme -ne 'https' -or $uri.Host -notmatch '^[a-z0-9-]+\.supabase\.co$' -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Use the trusted Supabase project HTTPS origin.' }
$keySecure = Read-Host 'Supabase publishable/anon key (not service_role)' -AsSecureString
$key = [Net.NetworkCredential]::new('', $keySecure).Password
if (-not $key -or $key.StartsWith('sb_secret_')) { throw 'A publishable/anon key is required.' }
if ($key.Split('.').Count -eq 3) {
    $segment = $key.Split('.')[1].Replace('-', '+').Replace('_', '/')
    while ($segment.Length % 4 -ne 0) { $segment += '=' }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($segment)) | ConvertFrom-Json
    if ($claims.role -ne 'anon') { throw 'Only an anon JWT key is accepted.' }
}
$email = Read-Host 'ConsultX account email'
$pwSecure = Read-Host 'ConsultX account password (not stored)' -AsSecureString
$pw = [Net.NetworkCredential]::new('', $pwSecure).Password
try {
    $payload = @{email=$email;password=$pw} | ConvertTo-Json -Compress
    $session = Invoke-RestMethod -Uri "$url/auth/v1/token?grant_type=password" -Method Post -Headers @{apikey=$key} -ContentType 'application/json' -Body $payload -MaximumRedirection 0 -TimeoutSec 30
} finally { $pw=$null; $payload=$null; $pwSecure.Dispose() }
if (-not $session.access_token -or -not $session.refresh_token) { throw 'No valid session returned.' }
$profile = @{url=$url;key=($keySecure | ConvertFrom-SecureString);refresh=((ConvertTo-SecureString $session.refresh_token -AsPlainText -Force) | ConvertFrom-SecureString);access=((ConvertTo-SecureString $session.access_token -AsPlainText -Force) | ConvertFrom-SecureString);expires=([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+[int64]$session.expires_in)}
$profile | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'profile.json') -Encoding UTF8
$session=$null; $key=$null; $keySecure.Dispose()
$client = @{mcpServers=@{consultx=@{command='powershell.exe';args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $target 'Run.ps1'))}}}
$client | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target 'mcp-client-config.json') -Encoding UTF8
Write-Host "Installed: $target"
Write-Host 'MCP client configuration (no credentials):'
$client | ConvertTo-Json -Depth 6
Write-Host 'Merge this entry into your MCP client configuration; do not overwrite other servers.'
