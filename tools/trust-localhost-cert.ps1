# Create a self-signed TLS cert for localhost / *.localhost, trust it for the current user,
# and export it for the backend's HTTPS listener (port 443).
# RCC sends some requests over https (ownership/hasasset, validate-place-join); WinHttp
# rejects untrusted certs (0x2F8F), so the cert must be in CurrentUser\Root.
# No admin needed; Windows shows one confirmation popup for the Root import.
$ErrorActionPreference = "Stop"
$out = Join-Path $PSScriptRoot "..\backend\src\storage\tls"
New-Item -ItemType Directory -Force $out | Out-Null

$names = "localhost", "*.localhost", "www.localhost", "api.localhost", "assetgame.localhost"
$cert = New-SelfSignedCertificate -DnsName $names -FriendlyName "Roblox revival localhost" `
  -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(10) `
  -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 2048 `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

$pass = ConvertTo-SecureString -String "revival" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $out "localhost.pfx") -Password $pass | Out-Null
$cer = Join-Path $out "localhost.cer"
Export-Certificate -Cert $cert -FilePath $cer | Out-Null

Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Write-Host "Trusted $($cert.Thumbprint) for localhost; files in $out"
