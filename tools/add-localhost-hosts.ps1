# Adds *.localhost names to the Windows hosts file so the 2016 RCC can reach the revival backend.
# RCC derives its service URLs from BaseUrl http://www.localhost by swapping "www" for other
# subdomains (assetgame., data., clientsettings.api., ...). Windows does not resolve *.localhost
# by default, so each name gets a 127.0.0.1 entry. Only *.localhost names are added: real
# roblox.com is NOT touched. A backup is saved as hosts.pre-revival.
#
# Run from an ADMIN PowerShell:   powershell -ExecutionPolicy Bypass -File C:\revival\tools\add-localhost-hosts.ps1
# Undo: delete the block between the ">>> revival" and "<<< revival" lines in the hosts file.

$hosts = "$env:WINDIR\System32\drivers\etc\hosts"
if (Select-String -Path $hosts -Pattern '>>> revival' -Quiet) { Write-Host "Already added."; exit 0 }

$names = 'www','data','assetgame','api','clientsettings.api','versioncompatibility.api','ephemeralcounters.api',
         'gamepersistence','ecsv2','public.ecs','test.public.ecs','logging.service','avatar','users','chat',
         'friends','presence','thumbnails','economy','inventory','badges','games','catalog','groups','auth',
         'apis','setup','develop'

Copy-Item $hosts "$hosts.pre-revival" -Force
$block = "`r`n# >>> revival (*.localhost for 2016 RCC) >>>`r`n" +
         (($names | ForEach-Object { "127.0.0.1 $_.localhost" }) -join "`r`n") +
         "`r`n# <<< revival <<<`r`n"
Add-Content -Path $hosts -Value $block -Encoding ASCII
ipconfig /flushdns | Out-Null
Write-Host "Added $($names.Count) *.localhost entries. Backup: $hosts.pre-revival"
