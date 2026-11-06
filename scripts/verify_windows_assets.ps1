param([string]$Dist = "dist")
$ErrorActionPreference = "Stop"
$version = (Get-Content -Raw (Join-Path $PSScriptRoot "../package.json") | ConvertFrom-Json).version
$app = Join-Path $Dist "win-unpacked/VXChat.exe"
$installers = @(Get-ChildItem -Path $Dist -Filter "vxchat_${version}_windows_x64_setup.exe" -File)
if (!(Test-Path -LiteralPath $app) -or $installers.Count -ne 1) { throw "Expected signed app and exactly one x64 installer" }
$expectedThumbprint = $null
foreach ($file in @($app, $installers[0].FullName)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne "Valid" -or !$signature.SignerCertificate) { throw "Invalid Authenticode signature" }
  $thumbprint = $signature.SignerCertificate.Thumbprint
  if ($expectedThumbprint -and $thumbprint -ne $expectedThumbprint) { throw "Installer/app signer mismatch" }
  $expectedThumbprint = $thumbprint
}
$metadata = (Get-Item -LiteralPath $app).VersionInfo
if ($metadata.ProductName -ne "VXChat" -or $metadata.ProductVersion -ne $version) { throw "App metadata mismatch" }
$updateConfig = Join-Path $Dist "win-unpacked/resources/app-update.yml"
if (!(Test-Path -LiteralPath $updateConfig) -or !(Select-String -LiteralPath $updateConfig -Pattern "^publisherName:" -Quiet)) { throw "Missing pinned updater publisher" }
@{result="PASS"; version=$version; signed_app_and_installer=$true; publisher_pin_present=$true; installed=$false} | ConvertTo-Json
