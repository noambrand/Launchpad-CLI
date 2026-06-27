@echo off
cd /d "%~dp0"
echo Playing the four alert sounds in the current mode...
echo.
echo 1/4  done        (Claude finished a turn)
node play.js done
timeout /t 3 /nobreak >nul
echo 2/4  permission  (numbered Yes/No confirm)
node play.js permission
timeout /t 3 /nobreak >nul
echo 3/4  waiting     (Claude is waiting on you)
node play.js waiting
timeout /t 3 /nobreak >nul
echo 4/4  save        (act by hand)
node play.js save
timeout /t 3 /nobreak >nul
echo.
node voice.js status
echo.
pause
