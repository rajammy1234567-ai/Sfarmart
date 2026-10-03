# inspectStagingFixtures.ps1
# -----------------------------------
# Read-only inspection runner for staging database fixtures.
# Prompts for staging credentials, validates staging URI with shared staging validator,
# executes inspectStagingFixtures.js, and propagates non-zero exit codes on failure/UNKNOWN.
# ZERO writes, ZERO deletes, ZERO DDL.
# -----------------------------------

$ErrorActionPreference = 'Stop'

$preserveKeys = @('MONGODB_URI','STAGING_MONGO_URI','STAGING_MODE','NODE_ENV')
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}
$originalDir = Get-Location

$exitCode = 0

try {
    # 1. Prompt for staging credentials (fixed runtime test user)
    $cred = Get-Credential -UserName 'farmart_staging_tester' -Message 'Enter password for staging user farmart_staging_tester'
    if (-not $cred) { Write-Error 'No credentials supplied.'; exit 1 }

    $stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
    $database    = 'farmart_test_disposable'
    $userEsc = [System.Uri]::EscapeDataString($cred.UserName)
    $passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
    $stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('MONGODB_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $stagingUri, 'Process')

    $repoRoot = 'C:/viz/all app/farmart/farm-mart-new'
    Set-Location -Path $repoRoot

    # 2. Validate host AND database using shared staging validator BEFORE connecting
    $validatorScript = @"
import { validateStagingUri } from './server/config/db.js';
try {
  validateStagingUri(process.env.MONGODB_URI);
  process.exit(0);
} catch (e) {
  console.error('Staging URI validation failed:', e.message);
  process.exit(1);
}
"@
    node --input-type=module -e $validatorScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Staging URI validation failed. Aborting.'
        exit $LASTEXITCODE
    }

    # 3. Execute inspectStagingFixtures.js and capture exit code
    $inspectProc = Start-Process -FilePath 'node' -ArgumentList 'server/scripts/inspectStagingFixtures.js' -NoNewWindow -PassThru -Wait
    $exitCode = $inspectProc.ExitCode

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
