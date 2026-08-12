@echo off
rem 윈도우에서 매칭 웹 서버를 띄우고 브라우저를 여는 스크립트
rem 위치가 scripts/ 이므로 상위의 matching/ 으로 이동해서 실행한다
cd /d "%~dp0..\matching"

set PORT=8000
echo Checking EasyOCR...
python -c "import easyocr" > nul 2>&1
if errorlevel 1 (
  echo EasyOCR is not installed.
  echo Installing EasyOCR. This can take several minutes on first run.
  python -m pip install easyocr
  if errorlevel 1 (
    echo EasyOCR installation failed.
    echo Please check your internet connection and Python pip settings.
    pause
    exit /b 1
  )
)

echo Starting matching.py web server...
start "matching-web-server" /min python matching.py --serve --port %PORT%
timeout /t 1 /nobreak > nul
start "" "http://127.0.0.1:%PORT%/index.html"

echo Web test page opened.
echo URL: http://127.0.0.1:%PORT%/index.html
echo Close this window when you are done testing.
pause
