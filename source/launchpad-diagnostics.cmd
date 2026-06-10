@echo off
REM ============================================================
REM  ClaudeCode Launchpad CLI - Diagnostics & Problem Report
REM  Run it from the Start Menu ("Diagnostics & Problem Report")
REM  or just double-click this file. NO admin needed. NOTHING is
REM  sent anywhere automatically - this only creates a text file
REM  that YOU choose to email or attach. No PowerShell, no downloads.
REM ============================================================
setlocal enableextensions
set "KDIR=%LOCALAPPDATA%\Kivun"
if not exist "%KDIR%" mkdir "%KDIR%" 2>nul
set "RPT=%KDIR%\Launchpad-Report.txt"
set "WT_ALIAS=%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"
set "CONTACT=noambbb@gmail.com"
set "ISSUES=https://github.com/noambrand/launchpad-cli/issues"

echo Collecting a diagnostic report, please wait...

> "%RPT%" echo ===== CLAUDECODE LAUNCHPAD CLI - PROBLEM REPORT =====
>>"%RPT%" echo.
>>"%RPT%" echo HOW TO SEND THIS REPORT (so we can help you):
>>"%RPT%" echo   1) Email this file to:  %CONTACT%
>>"%RPT%" echo      (a copy is on your Desktop, named Launchpad-Report.txt)
>>"%RPT%" echo   2) Or open an issue and attach it at:
>>"%RPT%" echo      %ISSUES%
>>"%RPT%" echo.
>>"%RPT%" echo Generated: %DATE% %TIME%
>>"%RPT%" echo.

>>"%RPT%" echo ===== [1] Launchpad + Windows version =====
set "LVER=unknown"
if exist "%KDIR%\VERSION" set /p LVER=<"%KDIR%\VERSION"
>>"%RPT%" echo Launchpad version: %LVER%
ver >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [2] Launcher files (a MISSING one usually means antivirus removed it) =====
call :checkfile "%KDIR%\folder-picker.hta"
call :checkfile "%KDIR%\claudecode-launchpad.bat"
call :checkfile "%KDIR%\statusline.mjs"
call :checkfile "%KDIR%\config.txt"
call :checkfile "%KDIR%\claude_icon.ico"

>>"%RPT%" echo.
>>"%RPT%" echo ===== [3] Claude Code (where + version) =====
where claude.cmd >>"%RPT%" 2>&1
where claude >>"%RPT%" 2>&1
cmd /c claude --version >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [4] Node.js (where + version) =====
where node.exe >>"%RPT%" 2>&1
cmd /c node --version >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [5] Windows Terminal + winget =====
where wt.exe >>"%RPT%" 2>&1
if exist "%WT_ALIAS%" (>>"%RPT%" echo wt.exe alias present: %WT_ALIAS%) else (>>"%RPT%" echo wt.exe alias NOT present)
where winget.exe >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [6] Git (optional) =====
where git.exe >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [7] Antivirus / security software running =====
tasklist 2>nul | findstr /i "mcafee mfe MsMpEng windefend avp avgnt egui avastsvc norton symantec" >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [8] Windows Defender quarantine =====
>>"%RPT%" echo If the app will not launch, antivirus may have removed a file. Check manually:
>>"%RPT%" echo   Start ^> Windows Security ^> Virus ^& threat protection ^> Protection history
>>"%RPT%" echo Best-effort quarantine list (may be empty or need admin):
"%ProgramFiles%\Windows Defender\MpCmdRun.exe" -Restore -ListAll >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== [9] Install log =====
if exist "%KDIR%\install-log.txt" (type "%KDIR%\install-log.txt" >>"%RPT%" 2>&1) else (>>"%RPT%" echo (no install-log.txt found yet))

>>"%RPT%" echo.
>>"%RPT%" echo ===== [10] Node MSI log =====
if exist "%KDIR%\node-msi.log" (type "%KDIR%\node-msi.log" >>"%RPT%" 2>&1) else (>>"%RPT%" echo (none - normal unless the Node MSI fallback ran))

>>"%RPT%" echo.
>>"%RPT%" echo ===== [11] Install folder listing =====
dir "%KDIR%" >>"%RPT%" 2>&1

>>"%RPT%" echo.
>>"%RPT%" echo ===== end of report =====

REM Put a copy on the Desktop so it is easy to find and attach.
copy /y "%RPT%" "%USERPROFILE%\Desktop\Launchpad-Report.txt" >nul 2>&1

cls
echo ============================================================
echo   DIAGNOSTIC REPORT CREATED
echo ============================================================
echo.
echo   Saved to your Desktop:  Launchpad-Report.txt
echo   (also at: %RPT%)
echo.
echo   PLEASE SEND IT so we can help:
echo     - Email it to:      %CONTACT%
echo     - or attach it at:  %ISSUES%
echo.
echo   It is opening in Notepad now. Nothing was sent
echo   automatically - you choose what to do with the file.
echo ============================================================
echo.
start "" notepad "%RPT%"
pause
endlocal
goto :eof

:checkfile
if exist "%~1" (>>"%RPT%" echo [OK]      %~1) else (>>"%RPT%" echo [MISSING] %~1)
goto :eof
