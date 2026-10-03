# validateRunIsolatedLifecycle.ps1
# This helper script parses runIsolatedLifecycle.ps1 to ensure PowerShell syntax is valid.
$target = 'c:/viz/all app/farmart/farm-mart-new/server/scripts/runIsolatedLifecycle.ps1'
if (-not (Test-Path $target)) {
    Write-Error "Target script not found: $target"
    exit 1
}
$script = Get-Content -Raw $target
try {
    [void][System.Management.Automation.PSParser]::Tokenize($script, [ref]$null)
    exit 0
} catch {
    Write-Error "Parse error: $_"
    exit 1
}
