# runRestartAndRecovery.ps1
# -----------------------------------
# Dedicated private-credential launcher for backend restart and rider-offer recovery test (staging only).
# Uses process-scoped environment variables, strictly pins approved staging host/database,
# ensures external notifications remain disabled, checks port 6001 (no fallback to port 5000),
# executes the restart & recovery live test, and restores environment.
# -----------------------------------

$ErrorActionPreference = 'Stop'

# Save original environment values and current directory
$preserveKeys = @(
    'PORT','STAGING_MODE','NODE_ENV','DISABLE_EXTERNAL_NOTIFICATIONS',
    'MONGODB_URI','STAGING_MONGO_URI','API_BASE',
    'ALLOW_LIVE_STAGING_TEST','ALLOW_STAGING_ATLAS_TEST',
    'JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'
)
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}
$originalDir = Get-Location

try {
    # Prompt for staging credentials (fixed user)
    $cred = Get-Credential -UserName 'farmart_staging_tester' -Message 'Enter password for staging user farmart_staging_tester'
    if (-not $cred) { Write-Error 'No credentials supplied.'; exit 1 }

    # Build approved staging URI (pinned host/database)
    $stagingHost = 'farmart-staging.gxn3bfw.mongodb.net'
    $database    = 'farmart_test_disposable'
    $userEsc = [System.Uri]::EscapeDataString($cred.UserName)
    $passEsc = [System.Uri]::EscapeDataString($cred.GetNetworkCredential().Password)
    $stagingUri = "mongodb+srv://${userEsc}:${passEsc}@${stagingHost}/${database}?retryWrites=true&w=majority"

    # Set required environment variables (process scope, strictly isolated)
    $port = 6001
    [Environment]::SetEnvironmentVariable('PORT', "$port", 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'staging', 'Process')
    [Environment]::SetEnvironmentVariable('DISABLE_EXTERNAL_NOTIFICATIONS', 'true', 'Process')
    [Environment]::SetEnvironmentVariable('MONGODB_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MONGO_URI', $stagingUri, 'Process')
    [Environment]::SetEnvironmentVariable('API_BASE', "http://localhost:$port/api", 'Process')
    # Clear live-test flags before validation
    [Environment]::SetEnvironmentVariable('ALLOW_LIVE_STAGING_TEST', $null, 'Process')
    [Environment]::SetEnvironmentVariable('ALLOW_STAGING_ATLAS_TEST', $null, 'Process')

    # Generate JWT secrets (32-byte hex strings)
    $jwtAccess  = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    $jwtRefresh = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    [Environment]::SetEnvironmentVariable('JWT_ACCESS_SECRET',  $jwtAccess,  'Process')
    [Environment]::SetEnvironmentVariable('JWT_REFRESH_SECRET', $jwtRefresh, 'Process')

    # Change to repository root
    $repoRoot = 'C:/viz/all app/farmart/farm-mart-new'
    Set-Location -Path $repoRoot

    # Validate staging URI using the real validator module
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
    if ($LASTEXITCODE -ne 0) { Write-Error 'Staging URI validation failed.'; exit $LASTEXITCODE }

    # Ensure port 6001 is free (no fallback to port 5000)
    $maxWaitMs = 5000
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $portFree = $false
    while ($stopwatch.ElapsedMilliseconds -lt $maxWaitMs) {
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            $tcp.Connect('localhost', $port)
            $tcp.Close()
            Start-Sleep -Milliseconds 500
        } catch {
            $tcp.Close()
            $portFree = $true
            break
        }
    }
    if (-not $portFree) { Write-Error "Port $port is in use. No fallback permitted."; exit 2 }

    # Enable live-test flag only for the authorized test runner
    [Environment]::SetEnvironmentVariable('ALLOW_LIVE_STAGING_TEST', 'true', 'Process')
    Write-Host "Running backend restart and rider-offer recovery test on port $port..."
    $testProc = Start-Process -FilePath 'node' -ArgumentList '--test','server/tests/restartAndRecovery.liveStaging.test.js' -NoNewWindow -PassThru -Wait
    $testExitCode = $testProc.ExitCode

} finally {
    # Restore environment and working directory
    foreach ($k in $preserveKeys) {
        if ($originalEnv.ContainsKey($k)) {
            [Environment]::SetEnvironmentVariable($k, $originalEnv[$k], 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($k, $null, 'Process')
        }
    }
    Set-Location -Path $originalDir
    Write-Host "Environment restored."
}

# Exit with test result or non-zero if no test ran
if ($null -ne $testExitCode) {
    exit $testExitCode
} else {
    exit 1
}
