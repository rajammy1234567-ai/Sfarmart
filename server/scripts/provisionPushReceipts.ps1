# provisionPushReceipts.ps1
# -----------------------------------
# Dedicated private-credential launcher for provisioning pushreceipts and required indexes.
# Preconditions:
# - Uses existing staging setup user: officialfarmmart_db_user
# - Strictly pins host: farmart-staging.gxn3bfw.mongodb.net and db: farmart_test_disposable
# - Pre-validates staging host/database using shared validator BEFORE connecting
# - Sets STAGING_SETUP_MONGO_URI strictly process-scoped
# - Preserves and restores existing environment values in finally block
# - Never falls back to production .env or defaults
# -----------------------------------

$ErrorActionPreference = 'Stop'

$preserveKeys = @(
    'STAGING_SETUP_MONGO_URI','MONGODB_URI','STAGING_MONGO_URI','STAGING_MODE','NODE_ENV'
)
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}
$originalDir = Get-Location

$exitCode = 0

try {
    # 1. Prompt for staging credentials (setup account)
    $cred = Get-Credential -UserName 'officialfarmmart_db_user' -Message 'Enter password for staging setup user officialfarmmart_db_user'
    if (-not $cred) { Write-Error 'No credentials supplied.'; exit 1 }

    # 2. Pin approved staging host and database strictly
    $stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
    $database    = 'farmart_test_disposable'
    $userEsc = [System.Uri]::EscapeDataString($cred.UserName)
    $passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
    $stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

    # 3. Set process-scoped setup URI variable (clearing any MONGODB_URI to avoid fallback)
    [Environment]::SetEnvironmentVariable('STAGING_SETUP_MONGO_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('MONGODB_URI', $null, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $null, 'Process')

    # 4. Change to repository root
    $repoRoot = 'C:/viz/all app/farmart/farm-mart-new'
    Set-Location -Path $repoRoot

    # 5. Pre-validate staging host AND database using shared validator BEFORE connecting
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
        Write-Error 'Staging URI validation failed. Aborting before database connection.'
        exit $LASTEXITCODE
    }

    Write-Host "`n[STAGING PROVISION LAUNCHER] Verified host and database pinning."
    Write-Host "[STAGING PROVISION LAUNCHER] Target Host: $stagingHost"
    Write-Host "[STAGING PROVISION LAUNCHER] Target DB:   $database"
    Write-Host "[STAGING PROVISION LAUNCHER] Running provisionStagingDb.js..."

    # 6. Execute provisioning script
    $nodeProc = Start-Process -FilePath 'node' -ArgumentList 'server/scripts/provisionStagingDb.js' -NoNewWindow -PassThru -Wait
    $exitCode = $nodeProc.ExitCode

    if ($exitCode -eq 0) {
        Write-Host "`n[STAGING PROVISION LAUNCHER] Provisioning completed successfully."
    } else {
        Write-Error "`n[STAGING PROVISION LAUNCHER] Provisioning failed with exit code $exitCode."
    }
} finally {
    # 7. Restore original environment values
    foreach ($k in $preserveKeys) {
        if ($originalEnv.ContainsKey($k)) {
            [Environment]::SetEnvironmentVariable($k, $originalEnv[$k], 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($k, $null, 'Process')
        }
    }
    Set-Location -Path $originalDir
    Write-Host "[STAGING PROVISION LAUNCHER] Environment and working directory restored."
}

if ($exitCode -ne 0) {
    exit $exitCode
}
