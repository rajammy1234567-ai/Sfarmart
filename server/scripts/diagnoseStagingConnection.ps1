# diagnoseStagingConnection.ps1
# -----------------------------------
# Dedicated private-credential diagnostic launcher for staging database connectivity.
# Prompts for credentials, pre-validates host and DB, runs read-only diagnostic probe,
# and outputs sanitized classification (AUTHENTICATION, DNS, NETWORK_TIMEOUT, TLS, ATLAS_IP_ACCESS).
# ZERO writes, ZERO DDL.
# -----------------------------------

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
    # 1. Prompt for staging credentials (defaults to officialfarmmart_db_user)
    $cred = Get-Credential -UserName 'officialfarmmart_db_user' -Message 'Enter password for staging user officialfarmmart_db_user'
    if (-not $cred) { Write-Error 'No credentials supplied.'; exit 1 }

    $stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
    $database    = 'farmart_test_disposable'
    $userEsc = [System.Uri]::EscapeDataString($cred.UserName)
    $passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
    $stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_SETUP_MONGO_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('MONGODB_URI', $null, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $null, 'Process')

    $repoRoot = 'C:/viz/all app/farmart/farm-mart-new'
    Set-Location -Path $repoRoot

    # 2. Pre-validate host AND database using shared validator BEFORE connecting
    $validatorScript = @"
import { validateStagingUri } from './server/config/db.js';
try {
  validateStagingUri(process.env.STAGING_SETUP_MONGO_URI);
  process.exit(0);
} catch (e) {
  console.error('Staging URI pre-validation failed:', e.message);
  process.exit(1);
}
"@
    node --input-type=module -e $validatorScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Staging URI validation failed. Aborting.'
        exit $LASTEXITCODE
    }

    # 3. Execute diagnostic probe
    $diagProc = Start-Process -FilePath 'node' -ArgumentList 'server/scripts/diagnoseStagingConnection.js' -NoNewWindow -PassThru -Wait
    $exitCode = $diagProc.ExitCode

} finally {
    # 4. Always restore environment in finally
    foreach ($k in $preserveKeys) {
        if ($originalEnv.ContainsKey($k)) {
            [Environment]::SetEnvironmentVariable($k, $originalEnv[$k], 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($k, $null, 'Process')
        }
    }
    Set-Location -Path $originalDir
    Write-Host "Environment and working directory restored."
}

if ($exitCode -ne 0) {
    exit $exitCode
}
