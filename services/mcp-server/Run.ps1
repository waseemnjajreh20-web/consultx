$ErrorActionPreference = 'Stop'
$profilePath = Join-Path $PSScriptRoot 'profile.json'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ConsultX-MCP-Session-v1')
$locked = $false
function Unprotect([string]$value) {
    return [Net.NetworkCredential]::new('', (ConvertTo-SecureString $value)).Password
}
function Protect([string]$value) {
    return (ConvertTo-SecureString $value -AsPlainText -Force) | ConvertFrom-SecureString
}
try {
    try { $locked = $mutex.WaitOne(30000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Session lock timeout.' }
    $p = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
    $uri = [Uri]$p.url
    if ($uri.Scheme -ne 'https' -or $uri.Host -notmatch '^[a-z0-9-]+\.supabase\.co$' -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Invalid profile origin.' }
    $key = Unprotect $p.key
    if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -ge ([int64]$p.expires - 120)) {
        $refresh = Unprotect $p.refresh
        $payload = @{refresh_token=$refresh} | ConvertTo-Json -Compress
        $s = Invoke-RestMethod -Uri "$($p.url)/auth/v1/token?grant_type=refresh_token" -Method Post -Headers @{apikey=$key} -ContentType 'application/json' -Body $payload -MaximumRedirection 0 -TimeoutSec 30
        if (-not $s.access_token -or -not $s.refresh_token) { throw 'Refresh failed; rerun Setup.ps1.' }
        $p.access = Protect $s.access_token
        $p.refresh = Protect $s.refresh_token
        $p.expires = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+[int64]$s.expires_in
        $tmp = "$profilePath.tmp"
        $p | ConvertTo-Json | Set-Content -LiteralPath $tmp -Encoding UTF8
        [IO.File]::Replace($tmp,$profilePath,$null)
        $refresh=$null; $payload=$null; $s=$null
    }
    $env:CONSULTX_SUPABASE_URL = $p.url
    $env:CONSULTX_SUPABASE_KEY = $key
    $env:CONSULTX_ACCESS_TOKEN = Unprotect $p.access
} catch {
    [Console]::Error.WriteLine('ConsultX MCP session setup failed. Rerun Setup.ps1 if your login expired.')
    exit 1
} finally { if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
try { & node.exe (Join-Path $PSScriptRoot 'server.mjs'); $exitCode=$LASTEXITCODE } finally {
    Remove-Item Env:CONSULTX_SUPABASE_KEY,Env:CONSULTX_ACCESS_TOKEN,Env:CONSULTX_SUPABASE_URL -ErrorAction SilentlyContinue
}
exit $exitCode
