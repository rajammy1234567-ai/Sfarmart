# deactivateControlledVendor.ps1
# Secure masked runner to mark Controlled Verification Shop inactive in farmart_production
$ErrorActionPreference = 'Stop'

function Get-MaskedUri {
    $existingUri = [Environment]::GetEnvironmentVariable('PROD_SETUP_MONGO_URI', 'Process')
    if (-not [string]::IsNullOrWhiteSpace($existingUri)) {
        return $existingUri
    }

    if ([System.Environment]::UserInteractive -and [System.Console]::IsInputRedirected -eq $false) {
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "   Deactivate Controlled Verification Shop from Discovery       " -ForegroundColor Cyan
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "Target Host : farmart-staging.gxn3bfw.mongodb.net"
        Write-Host "Database    : farmart_production"
        Write-Host "Vendor ID   : 6aea07db1cf98f83bee27ee4"
        Write-Host ""
        $sec = Read-Host "Enter production MongoDB URI (masked input)" -AsSecureString
        if ($sec) {
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
            $uri = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            return $uri
        }
    }

    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "S-farmart: Deactivate Controlled Shop"
    $form.Size = New-Object System.Drawing.Size(540, 200)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Enter production MongoDB URI (farmart_production):"
    $lbl.Location = New-Object System.Drawing.Point(20, 20)
    $lbl.Size = New-Object System.Drawing.Size(480, 20)
    $form.Controls.Add($lbl)

    $txt = New-Object System.Windows.Forms.TextBox
    $txt.PasswordChar = '*'
    $txt.Location = New-Object System.Drawing.Point(20, 45)
    $txt.Size = New-Object System.Drawing.Size(480, 24)
    $form.Controls.Add($txt)

    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = "Deactivate Test Vendor"
    $btn.Location = New-Object System.Drawing.Point(340, 95)
    $btn.Size = New-Object System.Drawing.Size(160, 32)
    $btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btn)
    $form.AcceptButton = $btn

    if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $txt.Text.Trim()
    }
    return $null
}

$uri = Get-MaskedUri
if ([string]::IsNullOrWhiteSpace($uri)) {
    Write-Error "Production MongoDB URI is required. Operation cancelled."
}

[Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $uri, 'Process')
try {
    node "$PSScriptRoot\deactivateControlledVendor.js"
} finally {
    [Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $null, 'Process')
}

