# provisionAndVerifyRider.ps1
# Masked prompt runner for controlled OFFLINE rider provisioning & live Delivery App verification
$ErrorActionPreference = 'Stop'

function Get-MaskedRiderInputs {
    $existingUri = [Environment]::GetEnvironmentVariable('PROD_SETUP_MONGO_URI', 'Process')

    if ([System.Environment]::UserInteractive -and [System.Console]::IsInputRedirected -eq $false) {
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "   S-farmart: Controlled OFFLINE Rider Provisioning & Auth       " -ForegroundColor Cyan
        Write-Host "=================================================================" -ForegroundColor Cyan
        Write-Host "Target Host : farmart-staging.gxn3bfw.mongodb.net"
        Write-Host "Database    : farmart_production"
        Write-Host "Duty Status : OFFLINE (controlled, no orders assigned)"
        Write-Host ""

        $uri = $existingUri
        if ([string]::IsNullOrWhiteSpace($uri)) {
            $secUri = Read-Host "Enter production MongoDB URI (masked input)" -AsSecureString
            if ($secUri) {
                $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secUri)
                $uri = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
            }
        }

        $phone = Read-Host "Enter Rider 10-digit Phone number (e.g. 9999900002)"
        $name = Read-Host "Enter Rider Full Name (e.g. Controlled Fleet Rider)"
        $secPw = Read-Host "Enter Rider private password (masked input)" -AsSecureString
        $pw = $null
        if ($secPw) {
            $bstrPw = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPw)
            $pw = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstrPw)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrPw)
        }
        $vehicle = Read-Host "Enter Vehicle Type [bike/cycle/on_foot] (default: bike)"
        if ([string]::IsNullOrWhiteSpace($vehicle)) { $vehicle = 'bike' }

        return @{
            Uri = $uri
            Phone = $phone.Trim()
            Name = if ([string]::IsNullOrWhiteSpace($name)) { 'Controlled Fleet Rider' } else { $name.Trim() }
            Password = $pw
            Vehicle = $vehicle.Trim()
        }
    }

    # Fallback to WinForms dialog if non-interactive console
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "S-farmart: Controlled Rider Provisioning"
    $form.Size = New-Object System.Drawing.Size(560, 360)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true

    # URI
    $lbl1 = New-Object System.Windows.Forms.Label
    $lbl1.Text = "Production MongoDB URI:"
    $lbl1.Location = New-Object System.Drawing.Point(20, 15)
    $lbl1.Size = New-Object System.Drawing.Size(500, 20)
    $form.Controls.Add($lbl1)

    $txtUri = New-Object System.Windows.Forms.TextBox
    $txtUri.PasswordChar = '*'
    $txtUri.Location = New-Object System.Drawing.Point(20, 35)
    $txtUri.Size = New-Object System.Drawing.Size(500, 24)
    if (-not [string]::IsNullOrWhiteSpace($existingUri)) { $txtUri.Text = $existingUri }
    $form.Controls.Add($txtUri)

    # Phone
    $lbl2 = New-Object System.Windows.Forms.Label
    $lbl2.Text = "Rider 10-Digit Phone:"
    $lbl2.Location = New-Object System.Drawing.Point(20, 70)
    $lbl2.Size = New-Object System.Drawing.Size(240, 20)
    $form.Controls.Add($lbl2)

    $txtPhone = New-Object System.Windows.Forms.TextBox
    $txtPhone.Location = New-Object System.Drawing.Point(20, 90)
    $txtPhone.Size = New-Object System.Drawing.Size(240, 24)
    $txtPhone.Text = "9999900002"
    $form.Controls.Add($txtPhone)

    # Name
    $lbl3 = New-Object System.Windows.Forms.Label
    $lbl3.Text = "Rider Name:"
    $lbl3.Location = New-Object System.Drawing.Point(280, 70)
    $lbl3.Size = New-Object System.Drawing.Size(240, 20)
    $form.Controls.Add($lbl3)

    $txtName = New-Object System.Windows.Forms.TextBox
    $txtName.Location = New-Object System.Drawing.Point(280, 90)
    $txtName.Size = New-Object System.Drawing.Size(240, 24)
    $txtName.Text = "Controlled Fleet Rider"
    $form.Controls.Add($txtName)

    # Password
    $lbl4 = New-Object System.Windows.Forms.Label
    $lbl4.Text = "Private Rider Password:"
    $lbl4.Location = New-Object System.Drawing.Point(20, 130)
    $lbl4.Size = New-Object System.Drawing.Size(500, 20)
    $form.Controls.Add($lbl4)

    $txtPw = New-Object System.Windows.Forms.TextBox
    $txtPw.PasswordChar = '*'
    $txtPw.Location = New-Object System.Drawing.Point(20, 150)
    $txtPw.Size = New-Object System.Drawing.Size(500, 24)
    $form.Controls.Add($txtPw)

    # Vehicle
    $lbl5 = New-Object System.Windows.Forms.Label
    $lbl5.Text = "Vehicle Type (bike / cycle / on_foot):"
    $lbl5.Location = New-Object System.Drawing.Point(20, 190)
    $lbl5.Size = New-Object System.Drawing.Size(240, 20)
    $form.Controls.Add($lbl5)

    $txtVeh = New-Object System.Windows.Forms.TextBox
    $txtVeh.Location = New-Object System.Drawing.Point(20, 210)
    $txtVeh.Size = New-Object System.Drawing.Size(240, 24)
    $txtVeh.Text = "bike"
    $form.Controls.Add($txtVeh)

    # Button
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = "Provision & Verify"
    $btn.Location = New-Object System.Drawing.Point(380, 255)
    $btn.Size = New-Object System.Drawing.Size(140, 36)
    $btn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btn)
    $form.AcceptButton = $btn

    if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return @{
            Uri = $txtUri.Text.Trim()
            Phone = $txtPhone.Text.Trim()
            Name = $txtName.Text.Trim()
            Password = $txtPw.Text.Trim()
            Vehicle = $txtVeh.Text.Trim()
        }
    }
    return $null
}

$inputs = Get-MaskedRiderInputs
if ($null -eq $inputs -or [string]::IsNullOrWhiteSpace($inputs.Uri) -or [string]::IsNullOrWhiteSpace($inputs.Phone) -or [string]::IsNullOrWhiteSpace($inputs.Password)) {
    Write-Error "Required rider details or URI were missing. Operation aborted."
}

[Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $inputs.Uri, 'Process')
[Environment]::SetEnvironmentVariable('RIDER_PHONE_INPUT', $inputs.Phone, 'Process')
[Environment]::SetEnvironmentVariable('RIDER_NAME_INPUT', $inputs.Name, 'Process')
[Environment]::SetEnvironmentVariable('RIDER_PASSWORD_INPUT', $inputs.Password, 'Process')
[Environment]::SetEnvironmentVariable('RIDER_VEHICLE_INPUT', $inputs.Vehicle, 'Process')

try {
    node "$PSScriptRoot\provisionAndVerifyRider.js"
} finally {
    [Environment]::SetEnvironmentVariable('PROD_SETUP_MONGO_URI', $null, 'Process')
    [Environment]::SetEnvironmentVariable('RIDER_PHONE_INPUT', $null, 'Process')
    [Environment]::SetEnvironmentVariable('RIDER_NAME_INPUT', $null, 'Process')
    [Environment]::SetEnvironmentVariable('RIDER_PASSWORD_INPUT', $null, 'Process')
    [Environment]::SetEnvironmentVariable('RIDER_VEHICLE_INPUT', $null, 'Process')
}

