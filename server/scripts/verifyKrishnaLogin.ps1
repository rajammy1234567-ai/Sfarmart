# verifyKrishnaLogin.ps1
# Secure masked prompt runner to verify Krishna Partner login without exposing credentials
$ErrorActionPreference = 'Stop'

function Get-MaskedPassword {
    if ([System.Environment]::UserInteractive -and [System.Console]::IsInputRedirected -eq $false) {
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "   Krishna Partner Login Verification: Secure Password Input     " -ForegroundColor Cyan
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "Store : Krishna's shop (KRISHNA jha)"
        Write-Host "Phone : 7323000894"
        Write-Host "Target: https://farmart-backend-staging.onrender.com/api"
        Write-Host ""
        $sec = Read-Host "Enter Krishna's Partner password (masked input)" -AsSecureString
        if ($sec) {
            $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
            $pw = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            return $pw
        }
    }

    Add-Type -AssemblyName System.Windows.Forms
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "S-farmart: Krishna Partner Password"
    $form.Size = New-Object System.Drawing.Size(520, 200)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "Enter private password for Krishna's shop (Phone: 7323000894):"
    $lbl.Location = New-Object System.Drawing.Point(20, 20)
    $lbl.Size = New-Object System.Drawing.Size(460, 24)
    $form.Controls.Add($lbl)
    $txt = New-Object System.Windows.Forms.TextBox
    $txt.PasswordChar = '*'
    $txt.Location = New-Object System.Drawing.Point(20, 50)
    $txt.Size = New-Object System.Drawing.Size(460, 24)
    $form.Controls.Add($txt)
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = 'Verify Login'
    $btn.Location = New-Object System.Drawing.Point(360, 95)
    $btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btn)
    $form.AcceptButton = $btn

    if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $txt.Text.Trim()
    }
    return $null
}

$pw = Get-MaskedPassword
if ([string]::IsNullOrWhiteSpace($pw)) {
    Write-Error "Password input was empty. Verification aborted."
}

$env:KRISHNA_PASSWORD_INPUT = $pw
try {
    node "$PSScriptRoot\verifyKrishnaLogin.js"
} finally {
    Remove-Item Env:\KRISHNA_PASSWORD_INPUT -ErrorAction SilentlyContinue
}

