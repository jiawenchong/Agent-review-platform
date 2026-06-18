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
echo  Agent Review Platform - LAN launcher (Python only)
echo ==========================================================
echo.

if not exist "backend\app\main.py" (
    echo [Error] Cannot find backend\app\main.py
    echo This .bat must sit in the project root, next to the "backend" folder.
    echo Current folder: %CD%
    goto :end
)

if not exist "dist\index.html" (
    echo [Error] Cannot find dist\index.html (the built frontend).
    echo You are probably on an older copy. Download the latest ZIP again
    echo - it now ships the prebuilt frontend so no Node.js is needed.
    goto :end
)

echo Detecting your LAN IPv4 address...
set "LAN_IP="
set "IPFILE=%TEMP%\start-lan-ip.txt"
powershell -NoProfile -Command "(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.DefaultIPGateway } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' } | Select-Object -First 1)" > "%IPFILE%" 2>nul
if exist "%IPFILE%" set /p LAN_IP=<"%IPFILE%"
del "%IPFILE%" >nul 2>nul
if "%LAN_IP%"=="" set "LAN_IP=<your-ip>"

echo.
echo ==========================================================
echo  Starting the server. Open these in a browser:
echo    This PC:      http://localhost:8010
echo    Colleagues:   http://%LAN_IP%:8010
echo ==========================================================
echo.
echo (Keep this window open - it runs the server. Close it to stop.)
echo (If you see "uvicorn is not recognized", run: pip install -r backend\requirements.txt)
echo.

cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010

:end
echo.
pause
