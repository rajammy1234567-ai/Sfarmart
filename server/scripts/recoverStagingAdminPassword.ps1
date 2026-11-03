# recoverStagingAdminPassword.ps1
# -------------------------------------------------------------
# Targeted Staging Administrator Password Recovery Utility
# - Strictly pins host: farmart-staging.gxn3bfw.mongodb.net
# - Strictly pins database: farmart_test_disposable
# - Prompts for staging Atlas credentials privately via Get-Credential
# - Prompts for new administrator password with masked input
# - Zero passwords, hashes, or connection strings logged or written to disk.
# -------------------------------------------------------------

$ErrorActionPreference = 'Stop'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   S-farmart Staging Admin Password Recovery Utility      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Pinned Host    : farmart-staging.gxn3bfw.mongodb.net"
Write-Host "Pinned Database: farmart_test_disposable"
Write-Host ""

$targetUsername = Read-Host "Enter target administrator username to recover (e.g. superadmin)"
if ([string]::IsNullOrWhiteSpace($targetUsername)) {
    Write-Error "Target username cannot be empty."
    exit 1
}

$cred = Get-Credential -UserName 'farmart_staging_tester' -Message 'Enter credentials for staging Atlas cluster (farmart-staging.gxn3bfw.mongodb.net)'
if (-not $cred) {
    Write-Error "No credentials supplied."
    exit 1
}

$p1Secure = Read-Host "Enter new password for $targetUsername (minimum 8 characters)" -AsSecureString
if (-not $p1Secure) {
    Write-Error "No password entered."
    exit 1
}

$p2Secure = Read-Host "Confirm new password" -AsSecureString
if (-not $p2Secure) {
    Write-Error "No confirmation password entered."
    exit 1
}

$bstr1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1Secure)
$pass1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr1)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1)

$bstr2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2Secure)
$pass2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2)

if ($pass1 -ne $pass2) {
    Write-Host "[ERROR] Passwords do not match. Aborting." -ForegroundColor Red
    exit 1
}

if ($pass1.Length -lt 8) {
    Write-Host "[ERROR] Password must be at least 8 characters long. Aborting." -ForegroundColor Red
    exit 1
}

$stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
$database    = 'farmart_test_disposable'
$userEsc = [System.Uri]::EscapeDataString($cred.UserName)
$passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
$stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

$preserveKeys = @('STAGING_MONGO_URI','STAGING_ADMIN_TARGET_USERNAME','STAGING_ADMIN_NEW_PASSWORD','STAGING_MODE','NODE_ENV')
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}

try {
    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_ADMIN_TARGET_USERNAME', $targetUsername.Trim(), 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_ADMIN_NEW_PASSWORD', $pass1, 'Process')

    node server/scripts/recoverStagingAdminPassword.js
}
finally {
    foreach ($k in $preserveKeys) {
        $v = if ($originalEnv.ContainsKey($k)) { $originalEnv[$k] } else { $null }
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}
