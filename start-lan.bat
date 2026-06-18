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
echo  Agent Review Platform - LAN launcher - Python only
echo ==========================================================
echo.

rem Use goto-style checks (no parenthesised blocks) so error text can contain
rem any characters without tripping cmd's block parser.
if not exist "backend\app\main.py" goto :no_backend
if not exist "dist\index.html" goto :no_dist

echo Detecting your LAN IPv4 address...
set "LAN_IP="
set "IPFILE=%TEMP%\start-lan-ip.txt"
powershell -NoProfile -Command "(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.DefaultIPGateway } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' } | Select-Object -First 1)" > "%IPFILE%" 2>nul
if exist "%IPFILE%" set /p LAN_IP=<"%IPFILE%"
del "%IPFILE%" >nul 2>nul
if "%LAN_IP%"=="" set "LAN_IP=YOUR-PC-IP"

echo.
echo ==========================================================
echo  Starting the server. Open in a browser:
echo    This PC:      http://localhost:8010
echo    Colleagues:   http://%LAN_IP%:8010
echo ==========================================================
echo.
echo Keep this window open while in use. Close it to stop the server.
echo If you see "No module named uvicorn", run first:
echo     pip install -r backend\requirements.txt
echo.

cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
goto :end

:no_backend
echo [Error] Cannot find backend\app\main.py
echo This file must be in the project root, next to the backend folder.
echo Current folder: %CD%
goto :end

:no_dist
echo [Error] Cannot find dist\index.html - the prebuilt frontend is missing.
echo Please download the latest ZIP again; it now ships the built frontend.
goto :end

:end
echo.
pause
