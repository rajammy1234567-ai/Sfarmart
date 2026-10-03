# validateRunSameRiderConcurrency.ps1
$target = 'server/scripts/runSameRiderConcurrency.ps1'
if (-not (Test-Path $target)) {
    Write-Error "Target script not found: $target"
    exit 1
}
$errors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$errors)
if ($errors.Count -eq 0) {
    Write-Host "PowerShell syntax valid (0 parse errors)"
    exit 0
} else {
    $errors | ForEach-Object { Write-Error $_.Message }
    exit 1
}
