# Signs the extension with Mozilla (unlisted channel) and opens the signed
# .xpi in Firefox so it can be installed permanently.
#
# Needs AMO API credentials from:
#   https://addons.mozilla.org/developers/addon/api/key/
#
# Run:  powershell -ExecutionPolicy Bypass -File sign.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Read-Secret($prompt) {
    $s = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Write-Host ""
Write-Host "Signing Netflix Controller Navigator v$version (unlisted)" -ForegroundColor Cyan
Write-Host "Get your keys at https://addons.mozilla.org/developers/addon/api/key/"
Write-Host "(input is hidden)"
Write-Host ""

$env:WEB_EXT_API_KEY = Read-Secret "JWT issuer"
$env:WEB_EXT_API_SECRET = Read-Secret "JWT secret"

New-Item -ItemType Directory -Force signed | Out-Null
try {
    npx --yes web-ext@8 sign --channel=unlisted --source-dir . --artifacts-dir signed `
        --ignore-files "dist/**" "signed/**" "sign.ps1" "TODO.md"
    if ($LASTEXITCODE -ne 0) { throw "web-ext sign failed (exit code $LASTEXITCODE)" }
}
finally {
    Remove-Item Env:WEB_EXT_API_KEY, Env:WEB_EXT_API_SECRET -ErrorAction SilentlyContinue
}

$xpi = Get-ChildItem signed -Filter *.xpi | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $xpi) { throw "No signed .xpi was downloaded." }
Write-Host ""
Write-Host "Signed add-on: $($xpi.FullName)" -ForegroundColor Green
Write-Host "Opening it in Firefox - click 'Add' to install."

$firefox = "C:\Program Files\Mozilla Firefox\firefox.exe"
if (Test-Path $firefox) { & $firefox $xpi.FullName } else { Start-Process $xpi.FullName }
