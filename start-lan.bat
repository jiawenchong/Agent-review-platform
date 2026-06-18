@echo off
rem Re-launch ourselves inside a cmd /k window the first time, so the window
rem STAYS OPEN even if something fails (double-clicking a .bat normally closes
rem the window the instant it ends or errors, hiding the message).
if not defined STARTLAN_KEEP (
    set "STARTLAN_KEEP=1"
    "%COMSPEC%" /k ""%~f0""
    exit /b
)

rem Always work from the folder this script lives in (handles spaces in path).
cd /d "%~dp0"

echo ==========================================================
echo  Agent Review Platform - LAN launcher
echo ==========================================================
echo.
echo Detecting your LAN IPv4 address...

set "LAN_IP="
set "IPFILE=%TEMP%\start-lan-ip.txt"
powershell -NoProfile -Command "(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.DefaultIPGateway } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' } | Select-Object -First 1)" > "%IPFILE%" 2>nul
if exist "%IPFILE%" set /p LAN_IP=<"%IPFILE%"
del "%IPFILE%" >nul 2>nul

if "%LAN_IP%"=="" (
    echo.
    echo Could not detect your LAN IP automatically.
    echo Open a new cmd window, run:  ipconfig
    echo and copy the "IPv4 Address" line ^(usually starts with 10. / 192.168. / 172.^).
    echo.
    set /p LAN_IP="Paste your IPv4 address here and press Enter: "
)

if "%LAN_IP%"=="" (
    echo No IP provided. Aborting.
    goto :end
)

echo.
echo Using LAN IP: %LAN_IP%
echo.

if not exist "backend\app\main.py" (
    echo [Error] Cannot find backend\app\main.py
    echo This .bat must sit in the project root, next to the "backend" folder.
    echo Current folder: %CD%
    goto :end
)

echo Launching backend  ^(http://%LAN_IP%:8010^) ...
start "Backend 8010" cmd /k "cd /d ""%~dp0backend"" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8010"

echo Launching frontend ^(http://%LAN_IP%:5173^) ...
start "Frontend 5173" cmd /k "cd /d ""%~dp0"" && set VITE_API_BASE=http://%LAN_IP%:8010 && npm run dev"

echo.
echo ==========================================================
echo  Share this address with your colleagues:
echo      http://%LAN_IP%:5173
echo ==========================================================
echo.
echo Two new windows opened (backend / frontend). Close them to stop the servers.

:end
echo.
pause
