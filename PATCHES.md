# Binary patches

The Roblox executables are not in this repository. This file records every change made to
them so they can be rebuilt from the originals. Addresses are virtual addresses (image base
0x400000) unless marked "file offset". Replacement strings must keep the original length:
the engine often compares strings with hard-coded lengths (it inlines `strlen`).

All local hostnames rely on the `*.localhost` hosts entries from
`tools/add-localhost-hosts.ps1`.

## RCCService.exe 0.256.0.83059 (`rcc/`)

Original saved as `rcc/RCCService.exe.orig`.

| Address | Original | Patched | Why |
|---|---|---|---|
| 0xf8e144 | `%s://%sapi.roblox.com/%s/?apiKey=%s` | `%s://127.0.0.1/%s%s/?apiKey=%s` | API calls go to the backend; it strips the leading `subdomain.` path segment |
| 0xc08860 | function start | `mov al,1; ret 4` | Client exe hash check always passes (fixes kick ID=148) |
| 0x6a45f0 | function start | `mov al,1; ret` (cdecl) | Http trust check always passes |
| 0xf6f8c0 | `roblox.com` | `localhost` | Trusted domain list |
| 0xf8e0fc | `.roblox.com` (11) | `w.localhost` | Must be a substring of BaseUrl, otherwise RCC uses the test environment `https://api.<x>.robloxlabs.com` |
| 0xf8fa9c | `assetgame.roblox.com` (20) | `assetgame.localhost.` | Asset URL rewrite host (exact length) |
| 0xf8fab4 | `www.roblox.com` (14) | `www.localhost.` | Asset URL rewrite host. A shorter string here empties the request path (`GET /`) |
| 0x10149c8 | `roblox.com/` (11) | `/localhost/` | Trusted script URL check |

Lua feature patches copied from the Kanvas 2016M RCC (conditional jumps NOP'd):
0x919b4d, 0x919c4d, 0x919d3d, 0x91be6d (6 bytes each: Color3.fromRGB / fromHSV and related
checks) and 0xb5280c, 0xb52ab7 (2 bytes each: capitalized `Connect` / `Disconnect`).

Also needed: `AppSettings.xml` with `BaseUrl` `http://www.localhost` and CRLF line endings,
and `content/scripts` from the matching 2016M build.

## RobloxPlayerBeta.exe 0.256.0.83059 (2016M player)

Copied from the Kanvas launcher (`clients/2016M/player`) to `C:\watfront\clients\Player2016M`,
original kept as `RobloxPlayerBeta.exe.kanvas`. It must be the same build as RCC: the watrbx
player was a different build and got "Error while processing packet" with no character.

| Address | Original | Patched | Why |
|---|---|---|---|
| 0x117c270 | join script public key blob | our key from `backend/src/storage/join_public.pem` as a CryptoAPI PUBLICKEYBLOB (base64) | Accept join scripts signed by the backend |
| 0x1078900 | `www.roblox.com` (14) | `www.localhost.` | Asset URL rewrite host |
| 0x10788d4 | `assetgame.roblox.com` (20) | `assetgame.localhost.` | Asset URL rewrite host |
| 0x1088ef8 | `roblox.com` | `localhost` | Trusted domain list |
| 0x10883b8 | `.roblox.com` (11) | `w.localhost` | Environment detection (see RCC) |
| 0x1120e4c | `roblox.com/` (11) | `/localhost/` | Trusted script URL check |
| 0x10883fc | `%s://%sapi.roblox.com/%s/?apiKey=%s` | `%s://127.0.0.1/%s%s/?apiKey=%s` | API calls to the backend |
| 0x67ad70 | function start | `mov al,1; ret` (cdecl) | Http trust check (sounds and images failed without it) |

Folder setup: copy `content`, `PlatformContent` and `shaders` from Kanvas `clients/2016M/rcc`
(without PlatformContent the player shows a hidden error box and exits). Rename
`openvr_api.dll` to `openvr_api.dll.disabled`, otherwise SteamVR starts. `AppSettings.xml`:
`ContentFolder` `content`, `BaseUrl` `http://www.localhost`, CRLF line endings.
Console print function (used by `tools/clientlog.js`): 0x59bc60.

## Older watrbx player (`C:\watfront\clients\Player`, no longer used)

File offsets. Join key blob swapped. Domain strings changed to localhost, then the rewrite
slots fixed: 0xf9db38 `assetgame.localhost.`, 0xf9db64 `www.localhost.`, 0xf9db74
`.roblox.com`. Trusted script strings (VA 0x1433448 / 0x1433454) must be `/localhost/` (11)
and `//localhost/` (12). Anti-tamper check at VA 0x481f00 patched to `ret`. Print function
0x5691d0.

## Engine quirks

- The 2016 XML readers (AppSettings, .rbxm, BodyColors) need CRLF line endings. Git Bash
  `sed -i` strips CR, so write these files from Python or PowerShell.
- Restarting the backend (`node --watch` reloads on file changes) also kills the RCC it started.
- Place-specific fixes ("rescripts") live in `backend/src/rcc/gameserver.lua`, e.g. the legacy
  `HealthGUI` that Flood Escape waits for.
