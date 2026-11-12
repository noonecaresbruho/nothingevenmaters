# Launch Roblox 2016 player against local revival backend.
param(
  [int]$PlaceId = 1,
  [string]$Username = "admin",
  [string]$Password = "admin",
  [string]$PlayerExe = "C:\watfront\clients\Player2016M\RobloxPlayerBeta.exe"
)

$ErrorActionPreference = "Stop"
$base = "http://localhost"

Write-Host "Logging in as $Username..."
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body (@{ username = $Username; password = $Password } | ConvertTo-Json)
if (-not $login.ok) { throw "Login failed: $($login.error)" }

$ticket = $login.ticket
$uid = $login.user.id
$user = $login.user.username
$joinUrl = "$base/Game/PlaceLauncher.ashx?request=RequestGame&placeId=$PlaceId&userId=$uid&username=$user"
$playerDir = Split-Path -Parent $PlayerExe

Write-Host "Join URL: $joinUrl"
Write-Host "Starting player..."

Set-Location $playerDir
& $PlayerExe --play `
  -a "$base/Login/Negotiate.ashx" `
  -t $ticket `
  -j $joinUrl `
  -c $playerDir
