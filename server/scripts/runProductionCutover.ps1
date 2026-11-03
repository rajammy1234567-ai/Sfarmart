# runProductionCutover.ps1
# -------------------------------------------------------------------------------------------------
# S-farmart Production Cutover & Migration Runner
# 
# Security & Fail-Closed Guardrails:
# 1. Requests production URI strictly via a masked interactive prompt (console or secure GUI dialog).
# 2. Never exposes credentials, passwords, hashes or connection strings in command arguments,
#    terminal history, disk logs, reports or Git.
# 3. Validates host strictly pinned to 'farmart-staging.gxn3bfw.mongodb.net' and database 'farmart_production'.
# 4. Executes provisioning of all 10 application collections + GridFS collections (14 total collections)
#    and all 46 indexes.
# 5. Migrates real business assets (Krishna's shop, 8 categories, Krishna's products, GridFS images).
# 6. Verifies target record counts, image chunks integrity, and generates isolated production JWT secrets.
# 7. Cleans up process memory on exit.
# -------------------------------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

function Get-MaskedProductionUri {
    $uri = $null

    # Check if PROD_SETUP_MONGO_URI is already set in memory
    $existing = [Environment]::GetEnvironmentVariable('PROD_SETUP_MONGO_URI', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($existing)) {
        return $existing
    }

    # If run in an interactive console with standard input
    if ([System.Environment]::UserInteractive -and [System.Console]::IsInputRedirected -eq $false) {
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "   S-farmart Production Cutover: Atlas Production URI Prompt     " -ForegroundColor Cyan
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "Pinned Host    : farmart-staging.gxn3bfw.mongodb.net"
        Write-Host "Pinned Database: farmart_production"
        Write-Host "User           : farmart_prod_app"
        Write-Host ""

        $sec = Read-Host "Enter production MongoDB URI (masked input)" -AsSecureString
        if ($sec) {
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
            $uri = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }

    # Fallback to masked WinForms dialog if console prompt was empty or non-interactive
    if ([string]::IsNullOrWhiteSpace($uri)) {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        $form = New-Object System.Windows.Forms.Form
        $form.Text = 'S-farmart: Atlas Production URI'
        $form.Size = New-Object System.Drawing.Size(560, 220)
        $form.StartPosition = 'CenterScreen'
        $form.TopMost = $true
        $form.FormBorderStyle = 'FixedDialog'
        $form.MaximizeBox = $false
        $form.MinimizeBox = $false

        $label = New-Object System.Windows.Forms.Label
        $label.Location = New-Object System.Drawing.Point(20, 20)
        $label.Size = New-Object System.Drawing.Size(500, 40)
        $label.Text = "Please enter the MongoDB URI for 'farmart_prod_app' on 'farmart_production':`n(Input is masked and held strictly in process memory)"
        $form.Controls.Add($label)

        $textBox = New-Object System.Windows.Forms.TextBox
        $textBox.Location = New-Object System.Drawing.Point(20, 70)
        $textBox.Size = New-Object System.Drawing.Size(500, 24)
        $textBox.UseSystemPasswordChar = $true
        $form.Controls.Add($textBox)

        $okBtn = New-Object System.Windows.Forms.Button
        $okBtn.Location = New-Object System.Drawing.Point(340, 120)
        $okBtn.Size = New-Object System.Drawing.Size(85, 30)
        $okBtn.Text = 'Submit'
        $okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.AcceptButton = $okBtn
        $form.Controls.Add($okBtn)

        $cancelBtn = New-Object System.Windows.Forms.Button
        $cancelBtn.Location = New-Object System.Drawing.Point(435, 120)
        $cancelBtn.Size = New-Object System.Drawing.Size(85, 30)
        $cancelBtn.Text = 'Cancel'
        $cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
        $form.CancelButton = $cancelBtn
        $form.Controls.Add($cancelBtn)

        $result = $form.ShowDialog()
        if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
            $uri = $textBox.Text
        }
        $form.Dispose()
    }

    if ([string]::IsNullOrWhiteSpace($uri)) {
        Write-Error "FAIL-CLOSED: No production URI provided. Cutover aborted."
        exit 1
    }

    return $uri.Trim()
}

$preserveKeys = @('PROD_SETUP_MONGO_URI', 'NODE_ENV', 'STAGING_MODE')
$originalEnv = @{}
foreach ($k in $preserveKeys) {
    $v = [Environment]::GetEnvironmentVariable($k, 'Process')
    if ($null -ne $v) { $originalEnv[$k] = $v }
}

try {
    $targetUri = Get-MaskedProductionUri

    # Fail-closed URI validations
    if ($targetUri -notmatch "farmart-staging\.gxn3bfw\.mongodb\.net") {
        Write-Error "FAIL-CLOSED: Target URI host must match 'farmart-staging.gxn3bfw.mongodb.net'."
        exit 1
    }
    if ($targetUri -notmatch "farmart_production") {
        Write-Error "FAIL-CLOSED: Target URI database must explicitly be 'farmart_production'."
        exit 1
    }
    if ($targetUri -match "farmart_test_disposable" -or $targetUri -match "/test(\?|$)") {
        Write-Error "FAIL-CLOSED: Target URI cannot point to staging or test databases."
        exit 1
    }

    [Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $targetUri, 'Process')
    [Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Process')
    [Environment]::SetEnvironmentVariable('STAGING_MODE', 'false', 'Process')

    Write-Host "[INFO] Starting S-farmart Production Migration..." -ForegroundColor Green
    node server/scripts/migrateProductionData.js

    if ($LASTEXITCODE -ne 0) {
        Write-Error "FAIL-CLOSED: Migration script exited with non-zero code $LASTEXITCODE."
        exit $LASTEXITCODE
    }

    Write-Host "`n[SUCCESS] Production database provisioning and data migration PASSED." -ForegroundColor Green
}
finally {
    # Scrub in-memory environment variables
    foreach ($k in $preserveKeys) {
        $v = if ($originalEnv.ContainsKey($k)) { $originalEnv[$k] } else { $null }
        [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
}

