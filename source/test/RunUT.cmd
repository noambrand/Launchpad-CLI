@echo off
REM ============================================================
REM  RunUT.cmd - unit tests for auto-continue.js (v2.9.0)
REM  Double-click to run, or run from a terminal. Uses cscript
REM  (WSH) so the tests exercise the SAME JScript engine that
REM  runs auto-continue.js in production.
REM
REM  NOTE: these cover the pure helper functions. The real
REM  SendKeys / AppActivate focus-steal + "continue" typing can
REM  only be smoke-tested live on a Windows machine.
REM ============================================================
setlocal
cscript //nologo "%~dp0RunUT.wsf"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
    echo ALL TESTS PASSED
) else (
    echo TESTS FAILED ^(exit %RC%^)
)
REM Pause only when launched by double-click (not from a CI/terminal run).
if "%~1"=="" if /i "%CMDCMDLINE:~0,4%"=="cmd " pause
exit /b %RC%
