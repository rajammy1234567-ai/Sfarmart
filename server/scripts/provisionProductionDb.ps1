# provisionProductionDb.ps1
# Safe operator script to inspect and provision collections/indexes in farmart_production.
#
# Usage:
#   Dry Run (Read-only inspection):
#     .\server\scripts\provisionProductionDb.ps1 -MongoUri "mongodb+srv://farmart_prod_app:<password>@farmart-staging.gxn3bfw.mongodb.net/farmart_production"
#
#   Execute Provisioning:
#     .\server\scripts\provisionProductionDb.ps1 -MongoUri "mongodb+srv://farmart_prod_app:<password>@farmart-staging.gxn3bfw.mongodb.net/farmart_production" -Execute

param(
  [Parameter(Mandatory=$false)]
  [string]$MongoUri,

  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$targetHost = "farmart-staging.gxn3bfw.mongodb.net"
$targetDb = "farmart_production"

if (-not $MongoUri) {
  $MongoUri = $env:PROD_SETUP_MONGO_URI
  if (-not $MongoUri) {
    $MongoUri = $env:MONGODB_URI
  }
}

if (-not $MongoUri) {
  Write-Host "[ERROR] Missing connection URI. Pass -MongoUri or set PROD_SETUP_MONGO_URI." -ForegroundColor Red
  exit 1
}

# Pre-execution fail-closed checks
if (-not ($MongoUri -match "farmart_production")) {
  Write-Host "[ERROR] FAIL-CLOSED: Target URI must explicitly specify database 'farmart_production'." -ForegroundColor Red
  exit 1
}

if ($MongoUri -match "farmart_test_disposable" -or $MongoUri -match "/test(\?|$)") {
  Write-Host "[ERROR] FAIL-CLOSED: Refusing to provision against staging or default test database." -ForegroundColor Red
  exit 1
}

$argsList = @("server/scripts/provisionProductionDb.js")
if ($Execute) {
  $argsList += "--provision-production-db"
}

$env:PROD_SETUP_MONGO_URI = $MongoUri
$env:NODE_ENV = "production"

try {
  Write-Host "================ PRODUCTION DATABASE PROVISIONING ================" -ForegroundColor Cyan
  Write-Host "Target Cluster : $targetHost" -ForegroundColor White
  Write-Host "Target Database: $targetDb" -ForegroundColor White
  Write-Host "Execution Mode : $(if ($Execute) { 'LIVE PROVISIONING' } else { 'DRY RUN INSPECTION' })" -ForegroundColor Yellow
  Write-Host "=================================================================" -ForegroundColor Cyan

  & node @argsList
} finally {
  $env:PROD_SETUP_MONGO_URI = $null
}
