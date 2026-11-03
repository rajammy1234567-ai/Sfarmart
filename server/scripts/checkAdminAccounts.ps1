# checkAdminAccounts.ps1
# -------------------------------------------------------------
# Read-only inspection runner for staging database admin accounts.
# Prompts for staging Atlas credentials via standard Get-Credential,
# binds strictly process-scoped environment variables,
# and executes checkAdminAccounts.js without exposing passwords in logs.
# ZERO writes, ZERO DDL.
# -------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$preserveKeys = @('MONGODB_URI','STAGING_MONGO_URI','STAGING_SETUP_MONGO_URI','STAGING_MODE','NODE_ENV')
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}
$originalDir = Get-Location
$exitCode = 0

try {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "   S-farmart Staging Admin Account Inspection (Read-Only)  " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Host: farmart-staging.gxn3bfw.mongodb.net"
    Write-Host "Database: farmart_test_disposable"
    Write-Host "Target: admins collection (excluding passwords)"
    Write-Host ""

    $cred = Get-Credential -UserName 'farmart_staging_tester' -Message 'Enter credentials for staging Atlas cluster (farmart-staging.gxn3bfw.mongodb.net)'
    if (-not $cred) {
        Write-Error "No credentials supplied."
        exit 1
    }

    $stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
    $database    = 'farmart_test_disposable'
    $userEsc = [System.Uri]::EscapeDataString($cred.UserName)
    $passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
    $stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('MONGODB_URI', $null, 'Process')

    $repoRoot = 'C:/viz/all app/farmart/farm-mart-new'
    Set-Location -Path $repoRoot

    node -e "import('./server/scripts/checkAdminAccounts.js').then(m => m.runAdminAccountCheck(process.env.STAGING_MONGO_URI)).catch(e => { console.error('[ERROR]', e.message); process.exit(1); })"
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    foreach ($k in $preserveKeys) {
        if ($originalEnv.ContainsKey($k)) {
            [Environment]::SetEnvironmentVariable($k, $originalEnv[$k], 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($k, $null, 'Process')
        }
    }
    Set-Location -Path $originalDir
}

exit $exitCode
