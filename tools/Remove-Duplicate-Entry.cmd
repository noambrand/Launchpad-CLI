@echo off
setlocal enableextensions
title Remove duplicate "ClaudeCode Launchpad CLI" entry

REM ============================================================================
REM  Removes the LEFTOVER (duplicate) "ClaudeCode Launchpad CLI" row from
REM  Add/Remove Programs.
REM
REM  Why it exists: the very first releases (pre-v2.6.4) installed system-wide and
REM  wrote their uninstall entry to HKLM (admin). From v2.6.4 on the installer is
REM  per-user and writes to HKCU, so the old HKLM row was orphaned and shows as a
REM  SECOND listing (e.g. an old 2.4.1 next to your current one). Deleting an HKLM
REM  key needs administrator rights, which the per-user installer doesn't have -
REM  hence this one-click helper.
REM
REM  100% safe: it ONLY deletes the old system-wide (HKLM) ClaudeCodeLaunchpad
REM  entry. It NEVER touches your current per-user install (HKCU), and NEVER the
REM  separate "Kivun Terminal" product.
REM ============================================================================

REM --- Am I elevated? `net session` only succeeds as administrator. ---
net session >nul 2>&1
if %errorlevel% equ 0 goto :elevated

echo.
echo  Administrator approval is needed to remove the old entry.
echo  A Windows approval box will appear in a moment - please click "Yes".
echo.
REM Self-elevate WITHOUT PowerShell: a tiny VBScript relaunches this file "runas".
set "_VBS=%TEMP%\cc_dedupe_elevate.vbs"
> "%_VBS%" echo Set U = CreateObject("Shell.Application")
>> "%_VBS%" echo U.ShellExecute "%~f0", "", "", "runas", 1
cscript //nologo "%_VBS%" >nul 2>&1
del "%_VBS%" >nul 2>&1
exit /b

:elevated
echo.
echo  Looking for a leftover system-wide "ClaudeCode Launchpad CLI" entry...
echo.
set "FOUND=0"

REM 32-bit view (where a 32-bit installer's HKLM entry lives on 64-bit Windows)
reg query "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" >nul 2>&1 && (
    reg delete "HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" /f >nul 2>&1 && set "FOUND=1"
)
REM 64-bit view (just in case)
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" >nul 2>&1 && (
    reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" /f >nul 2>&1 && set "FOUND=1"
)

echo.
if "%FOUND%"=="1" (
    echo  Done - the duplicate entry has been removed.
    echo  Close and reopen "Apps ^& Features" / "Add or Remove Programs":
    echo  you should now see just ONE "ClaudeCode Launchpad CLI".
) else (
    echo  No leftover system-wide entry was found - nothing to remove.
    echo  Your current install is untouched.
)
echo.
echo  You can close this window.
pause >nul
