@echo off
setlocal

echo ==========================================================
echo Roblox Revival - Start All
echo ==========================================================
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo NOTE: You need Node.js 20 LTS installed (includes npm).
echo.

start "Roblox Revival Backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "Roblox Revival Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Open your browser at http://localhost:5173
echo Default admin: admin / admin
echo.
pause

