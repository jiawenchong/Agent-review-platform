@echo off
rem 一鍵啟動：自動偵測本機內網 IP，開兩個視窗跑後端 + 前端，
rem 並印出同事要在瀏覽器打開的網址。請在 repo 根目錄(本檔案所在位置)執行。
setlocal enabledelayedexpansion

echo 偵測內網 IP...
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command ^
  "try { $idx = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | Sort-Object -Property RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceIndex); (Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1 -ExpandProperty IPAddress) } catch { '' }"`) do set "LAN_IP=%%i"

if "%LAN_IP%"=="" (
    echo.
    echo [偵測失敗] 無法自動取得內網 IP。
    echo 請手動執行 ipconfig 找到 IPv4 位址(通常是 10.x.x.x 或 192.168.x.x)。
    set /p LAN_IP="請貼上你的 IPv4 位址後按 Enter: "
)

if "%LAN_IP%"=="" (
    echo 未輸入 IP，已取消。
    pause
    exit /b 1
)

echo.
echo 偵測到內網 IP：%LAN_IP%
echo.

if not exist "backend\app\main.py" (
    echo [錯誤] 找不到 backend\app\main.py，請確認此檔案放在 repo 根目錄。
    pause
    exit /b 1
)

echo 啟動後端 (FastAPI, port 8010)...
start "Backend (8010)" cmd /k "cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8010"

echo 啟動前端 (Vite, port 5173)...
start "Frontend (5173)" cmd /k "set VITE_API_BASE=http://%LAN_IP%:8010&& npm run dev"

echo.
echo ============================================
echo  同事請在瀏覽器打開以下網址：
echo    http://%LAN_IP%:5173
echo ============================================
echo.
echo (兩個新視窗分別是後端 / 前端的 log，關閉視窗即停止對應的服務)
pause
