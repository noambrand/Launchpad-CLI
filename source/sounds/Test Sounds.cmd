@echo off
cd /d "%~dp0"
echo Playing the three voice clips...
echo.
echo 1/3  "done"  (Claude finished)
node play.js done
timeout /t 3 /nobreak >nul
echo 2/3  "stuck" (Claude needs you)
node play.js stuck
timeout /t 3 /nobreak >nul
echo 3/3  "save"  (your turn - act by hand)
node play.js save
timeout /t 3 /nobreak >nul
echo.
node voice.js status
echo.
pause
