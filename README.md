# Roblox Local Revival (2014-2016)

Local, self-contained Roblox-style website + backend for running legacy clients against your own endpoints.

## Prerequisites (Windows 10 LTSC 2021)
- **Node.js 20 LTS** (includes `npm`)
- **Git**

## Install
Clone your repo (or place these folders in a directory), then install dependencies:

### Backend
```bash
cd backend
npm install
npm run dev
```

Backend will run on `http://localhost:3001`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend will run on `http://localhost:5173`.

### Patcher
```bash
cd patcher
npm install
```

## Getting 2014/2016 client binaries
Use `archive.roblonium.com` to obtain the 2014/2016 client binaries you want to run.

## Running the patcher
The patcher applies byte-pattern patches from `patcher/patches/*.json`.

Example:
```bash
cd patcher
node patch.js --bin "C:\\Path\\To\\RobloxPlayerBeta.exe" --patch patches\\2016.json --hosts
```

Notes:
- The patcher **always creates** a `*.bak` next to the binary before writing.
- It scans the file as a `Buffer` and prints each patch offset in hex.
- If a pattern is not found, it prints a warning (client version may differ).
- `--hosts` edits the Windows hosts file and will prompt for **Administrator** via UAC if needed.

## Starting backend + frontend together
Run:
```bat
start-all.bat
```

Then open `http://localhost:5173`.

Default admin account:
- Username: `admin`
- Password: `admin`

## RCCService.exe setup
You must provide your own `RCCService.exe` (Roblox game server binary).

1. Create a `gameserver.json` on your machine (example below).
2. Use the **Admin panel** to start/stop RCCService and monitor stdout/stderr:
   - `http://localhost:5173/admin`

Example `gameserver.json`:
```json
{
  "Mode": "GameServer",
  "GameId": 1,
  "PlaceId": 1,
  "PlaceFetchUrl": "http://localhost:3001/game/load-place.ashx?placeId=1",
  "BaseUrl": "http://localhost:3001/",
  "GameServerIp": "127.0.0.1",
  "GameServerPort": 53640,
  "MachineAddress": "127.0.0.1",
  "ApiKey": ""
}
```

## Upload your first game
1. Login as `admin` at `http://localhost:5173/login`
2. Go to `http://localhost:5173/admin`
3. Create a game entry
4. Upload a `.rbxl` place file to that game

The backend serves places from `GET /game/load-place.ashx?placeId=...`.

## Launching the 2016 client (command line)

The player does **not** use `-play` / `-placeId`. Use `--play` with join URLs:

```powershell
cd C:\revival
.\launch-play.ps1 -PlaceId 1
```

Or manually from `C:\watfront\clients\Player`:

```powershell
$login = Invoke-RestMethod -Uri "http://localhost:3001/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"admin"}'
.\RobloxPlayerBeta.exe --play -a "http://localhost:3001/Login/Negotiate.ashx" -t $login.ticket -j "http://localhost:3001/Game/Join.ashx?placeId=1&userId=$($login.user.id)&username=$($login.user.username)" -c "C:\watfront\clients\Player"
```

### Join script signatures (important)

`Game/Join.ashx` returns a **signed** join script (`--rbxsig%...%`). On first backend start, RSA keys are created in `backend/src/storage/join_private.pem` and `join_public.pem`.

Your `RobloxPlayerBeta.exe` must trust that public key (watrbx clients use a different key). Options:

1. Use [roblox-auto-patcher](https://github.com/worships/roblox-auto-patcher) to embed `join_public.pem` into the client, or
2. Patch signature verification in the client (see ROBLOX reverse-engineering docs).

Without this, the client may show **infinite loading** and no place name.

## Troubleshooting
- **`npm` not recognized**: install Node.js 20 LTS and reopen the terminal.
- **Client can’t connect**: ensure the client binary was patched to point to `http://localhost:3001/` and that `--hosts` was applied as Administrator.
- **Assets not loading**: backend must be running; check backend console output for upstream fetch errors.
- **Hosts file reset**: some antivirus/VPN tools overwrite hosts; re-run patcher with `--hosts` as Administrator.

