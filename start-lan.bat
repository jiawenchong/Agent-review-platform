@echo off
setlocal

echo Detecting your LAN IPv4 address...
set "LAN_IP="
set "IPFILE=%TEMP%\start-lan-ip.txt"
type nul > "%IPFILE%"
powershell -NoProfile -Command "try { $idx = (Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction Stop | Sort-Object -Property RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceIndex); (Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1 -ExpandProperty IPAddress) } catch { '' }" > "%IPFILE%" 2>nul
set /p LAN_IP=<"%IPFILE%"
del "%IPFILE%" >nul 2>nul

if "%LAN_IP%"=="" (
    echo.
    echo [Auto-detect failed] Could not find your LAN IPv4 automatically.
    echo Run "ipconfig" in a new cmd window, find the IPv4 Address line
    echo (usually 10.x.x.x or 192.168.x.x), then paste it below.
    set /p LAN_IP="Paste your IPv4 address and press Enter: "
)

if "%LAN_IP%"=="" (
    echo No IP entered, cancelled.
    pause
    exit /b 1
)

echo.
echo Detected LAN IP: %LAN_IP%
echo.

if not exist "backend\app\main.py" (
    echo [Error] backend\app\main.py not found.
    echo Make sure this file is in the repo root folder.
    pause
    exit /b 1
)

echo Starting backend (FastAPI, port 8010)...
start "Backend (8010)" cmd /k "cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8010"

echo Starting frontend (Vite, port 5173)...
start "Frontend (5173)" cmd /k "set VITE_API_BASE=http://%LAN_IP%:8010 && npm run dev"

echo.
echo ============================================
echo  Share this URL with your colleagues:
echo    http://%LAN_IP%:5173
echo ============================================
echo.
echo (Two new windows opened for backend / frontend logs. Close a window to stop that service.)
pause
