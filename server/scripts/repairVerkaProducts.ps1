# repairVerkaProducts.ps1
# Safe operator script to repair invalid local device image paths for Verka products in farmart_production.
#
# Usage:
#   Dry Run (Read-only inspection):
#     .\server\scripts\repairVerkaProducts.ps1
#
#   Execute Repair:
#     .\server\scripts\repairVerkaProducts.ps1 -Execute

param(
  [Parameter(Mandatory=$false)]
  [string]$MongoUri,

  [switch]$Execute
)

$ErrorActionPreference = "Stop"

function Get-MaskedUri {
  $uri = $null
  if ($MongoUri) { return $MongoUri }

  $envUri = [Environment]::GetEnvironmentVariable('PROD_SETUP_MONGO_URI', 'Process')
  if (-not [string]::IsNullOrWhiteSpace($envUri)) { return $envUri }

  if ([System.Environment]::UserInteractive -and [System.Console]::IsInputRedirected -eq $false) {
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "   S-farmart: Repair Verka Product Image URLs                    " -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "Target: Pinned database (farmart_production / farmart_test_disposable)"
    Write-Host ""
    $sec = Read-Host "Enter MongoDB URI (input is masked)" -AsSecureString
    if ($sec) {
      $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
      $uri = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  if ([string]::IsNullOrWhiteSpace($uri)) {
    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "S-farmart: MongoDB URI Input"
    $form.Size = New-Object System.Drawing.Size(560, 200)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Enter MongoDB connection URI:"
    $lbl.Location = New-Object System.Drawing.Point(20, 20)
    $lbl.Size = New-Object System.Drawing.Size(500, 24)
    $form.Controls.Add($lbl)

    $txt = New-Object System.Windows.Forms.TextBox
    $txt.PasswordChar = '*'
    $txt.Location = New-Object System.Drawing.Point(20, 50)
    $txt.Size = New-Object System.Drawing.Size(500, 24)
    $form.Controls.Add($txt)

    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = 'Proceed'
    $btn.Location = New-Object System.Drawing.Point(400, 95)
    $btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btn)
    $form.AcceptButton = $btn

    if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $uri = $txt.Text.Trim()
    }
  }

  return $uri
}

$targetUri = Get-MaskedUri
if (-not $targetUri) {
  Write-Host "[ERROR] Missing MongoDB connection URI." -ForegroundColor Red
  exit 1
}

$preserveKeys = @('PROD_SETUP_MONGO_URI', 'NODE_ENV')
$originalEnv = @{}
foreach ($k in $preserveKeys) {
  $v = [Environment]::GetEnvironmentVariable($k, 'Process')
  if ($null -ne $v) { $originalEnv[$k] = $v }
}

try {
  [Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $targetUri, 'Process')

  $argsList = @("server/scripts/repairVerkaProducts.js")
  if ($Execute) {
    $argsList += "--execute"
  }

  Write-Host "================ PRODUCT IMAGE REPAIR ================" -ForegroundColor Cyan
  Write-Host "Mode: $(if ($Execute) { 'LIVE EXECUTION' } else { 'DRY RUN' })" -ForegroundColor Yellow
  Write-Host "=======================================================" -ForegroundColor Cyan

  & node @argsList
} finally {
  foreach ($k in $preserveKeys) {
    $v = if ($originalEnv.ContainsKey($k)) { $originalEnv[$k] } else { $null }
    [Environment]::SetEnvironmentVariable($k, $v, 'Process')
  }
}
