$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'ConsultX\MCP'
if (-not (Test-Path -LiteralPath (Join-Path $target 'gateway.mjs'))) { throw 'Install ConsultX MCP with Setup.cmd first.' }
$tokenFile = Join-Path $target 'ddc-token.dpapi'
$registryFile = Join-Path $target 'connections.local.json'
$choice = Read-Host 'Connect OpenConstructionDesign [C] or remove existing connection [R]'
if ($choice -eq 'R') {
    Remove-Item -LiteralPath $tokenFile,$registryFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Connection removed. Restart your MCP client.'
    exit 0
}
if ($choice -ne 'C') { throw 'Choose C or R.' }
Write-Host 'Start OpenConstructionDesign, enable its MCP server and copy the bearer token. Do not paste a ConsultX token.'
$secure = Read-Host 'OpenConstructionDesign local token' -AsSecureString
$token = [Net.NetworkCredential]::new('', $secure).Password
if (-not $token -or $token -match '\s' -or $token.Length -gt 8192) { throw 'Invalid connection token.' }
$allowPreview = (Read-Host 'Enable creation of design previews (not Apply)? [y/N]') -eq 'y'
$tools = @('get_context','query_elements','run_checks')
if ($allowPreview) { $tools += 'create_elements' }
$registry = @{connections=@(@{id='openconstructiondesign';url='http://127.0.0.1:47621/mcp';tokenEnv='CONSULTX_CONNECTION_DDC_TOKEN';enabled=$true;allowPreview=$allowPreview;tools=$tools})}
$temp = "$registryFile.tmp"
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($temp,($registry | ConvertTo-Json -Depth 6),$utf8)
try {
    $env:CONSULTX_CONNECTION_DDC_TOKEN = $token
    $result = & node.exe (Join-Path $target 'client.mjs') $temp probe openconstructiondesign
    if ($LASTEXITCODE -ne 0) { throw 'MCP probe failed. Existing configuration was not replaced.' }
    $discovered = ($result -join "`n") | ConvertFrom-Json
    $found = @($discovered | ForEach-Object { $_.name })
    if (@($tools | Where-Object { $_ -notin $found }).Count -gt 0) { throw 'The editor did not expose every requested tool. Existing configuration was not replaced.' }
    [IO.File]::WriteAllText("$tokenFile.tmp",($secure | ConvertFrom-SecureString),$utf8)
    Move-Item -LiteralPath "$tokenFile.tmp" -Destination $tokenFile -Force
    Move-Item -LiteralPath $temp -Destination $registryFile -Force
    Write-Host 'Connection saved. Restart your MCP client to load the local integration.'
} finally {
    Remove-Item Env:CONSULTX_CONNECTION_DDC_TOKEN -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $temp,"$tokenFile.tmp" -Force -ErrorAction SilentlyContinue
    $token = $null; $secure.Dispose()
}
