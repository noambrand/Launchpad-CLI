@echo off
cd /d "%~dp0"
echo Playing the five alert sounds in the current mode...
echo.
echo 1/5  done        (finished successfully)
node play.js done
timeout /t 3 /nobreak >nul
echo 2/5  error       (finished with an error)
node play.js error
timeout /t 3 /nobreak >nul
echo 3/5  permission  (numbered Yes/No confirm)
node play.js permission
timeout /t 3 /nobreak >nul
echo 4/5  waiting     (Claude is waiting on you)
node play.js waiting
timeout /t 3 /nobreak >nul
echo 5/5  save        (act by hand)
node play.js save
timeout /t 3 /nobreak >nul
echo.
node voice.js status
echo.
pause
