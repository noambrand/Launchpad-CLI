@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Fix Claude Code on this server

echo(
echo   ============================================================
echo     Repair Claude Code on an older Windows server
echo     (Windows Server 2012 R2 / 8.1, which is missing 'curl')
echo   ============================================================
echo(

set "KDIR=%LOCALAPPDATA%\Kivun"
set "BIN=%KDIR%\bin"
set "LOG=%KDIR%\server-recovery-log.txt"
if not exist "%KDIR%" mkdir "%KDIR%" 2>nul
if not exist "%BIN%"  mkdir "%BIN%"  2>nul
echo ===== %DATE% %TIME% :: server recovery =====> "%LOG%"

REM --- 1) Node.js must be present (we use it as our downloader) --------------
where node.exe >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js is not installed on this server.
  echo       Please install Node.js 18 or newer from https://nodejs.org/
  echo       then double-click this file again.
  echo(
  pause
  exit /b 1
)
echo   [1/4] Node.js found.

REM --- 2) Make sure a working 'curl' exists (fetch one if this old OS lacks it)
set "CURL=curl.exe"
where curl.exe >nul 2>&1
if not errorlevel 1 (
  echo   [2/4] Download tool 'curl' is already present.
  goto :have_curl
)
if exist "%BIN%\curl.exe" (
  set "CURL=%BIN%\curl.exe"
  set "PATH=%BIN%;%PATH%"
  echo   [2/4] Using the curl we installed earlier.
  goto :have_curl
)

echo   [2/4] 'curl' is missing on this old Windows - fetching an official copy...
node "%~dp0get.js" "https://curl.se/windows/latest.cgi?p=win64-mingw.zip" "%TEMP%\curl.zip" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   [X] Could not download curl. Check this server's internet connection.
  echo       Details were saved to: %LOG%
  echo(
  pause
  exit /b 1
)
if exist "%TEMP%\curlx" rmdir /s /q "%TEMP%\curlx" 2>nul
cscript //nologo "%~dp0unzip.vbs" "%TEMP%\curl.zip" "%TEMP%\curlx" >> "%LOG%" 2>&1
REM Locate the extracted curl.exe. Use `dir /s /b`, which lists only files that
REM ACTUALLY exist - unlike `for /r ... in (curl.exe)`, which (with a literal,
REM wildcard-free name) yields a path in EVERY folder whether the file is there
REM or not, and so pointed at the wrong directory on the first attempt.
set "CURLDIR="
for /f "delims=" %%F in ('dir /s /b "%TEMP%\curlx\curl.exe" 2^>nul') do set "CURLDIR=%%~dpF"
if not defined CURLDIR (
  echo   [X] Could not find curl.exe after unpacking.
  echo       Details were saved to: %LOG%
  echo(
  pause
  exit /b 1
)
REM Copy curl.exe with its sibling DLLs and CA bundle (they live together in \bin).
copy /y "!CURLDIR!*.exe" "%BIN%\" >> "%LOG%" 2>&1
copy /y "!CURLDIR!*.dll" "%BIN%\" >> "%LOG%" 2>&1
copy /y "!CURLDIR!*.crt" "%BIN%\" >> "%LOG%" 2>&1
set "CURL=%BIN%\curl.exe"
set "PATH=%BIN%;%PATH%"
if not exist "%BIN%\curl.exe" (
  echo   [X] Could not place curl.exe.
  echo       Details were saved to: %LOG%
  echo(
  pause
  exit /b 1
)
REM Prove curl actually runs on this Windows before we rely on it.
"%CURL%" --version >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   [X] The downloaded curl did not run on this old Windows.
  echo       Details were saved to: %LOG%
  echo(
  pause
  exit /b 1
)
echo   [2/4] curl installed.
:have_curl

REM --- 3) Download and run Anthropic's official Claude Code installer --------
echo   [3/4] Downloading and installing Claude Code (about 50 MB, please wait)...
"%CURL%" -fsSL --http1.1 --retry 5 --retry-all-errors --ssl-no-revoke -o "%TEMP%\claude-install.cmd" "https://claude.ai/install.cmd" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo   [X] Could not reach claude.ai to download the installer.
  echo       If antivirus web protection is on, allow claude.ai, then retry.
  echo       Details were saved to: %LOG%
  echo(
  pause
  exit /b 1
)
cmd /c "%TEMP%\claude-install.cmd" >> "%LOG%" 2>&1

REM --- 4) Verify Claude actually installed AND runs on this old OS ----------
call :refresh_path
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
echo   [4/4] Checking that Claude runs...
set "CLAUDE_OK=0"
cmd /c claude --version >> "%LOG%" 2>&1 && set "CLAUDE_OK=1"
if "!CLAUDE_OK!"=="0" cmd /c "%USERPROFILE%\.local\bin\claude.exe" --version >> "%LOG%" 2>&1 && set "CLAUDE_OK=1"

echo(
if "!CLAUDE_OK!"=="1" (
  echo   ============================================================
  echo     SUCCESS - Claude Code is installed and runs on this server.
  echo   ============================================================
  echo(
  echo   How to use it on a server ^(no picker window needed^):
  echo     1. Open a Command Prompt.
  echo     2. Change to your project folder, e.g.  cd C:\CNAAN
  echo     3. Type:  claude
  echo(
  echo   If 'claude' is not recognised in a brand-new window, close and
  echo   reopen the Command Prompt once so Windows picks up the new PATH.
) else (
  echo   ============================================================
  echo     Claude was fetched, but it did NOT run on this server.
  echo   ============================================================
  echo(
  echo   This almost always means the operating system is simply too old:
  echo   Claude Code needs Windows 10/11 or Windows Server 2016 or newer.
  echo   The reliable fix is to run Claude on one of those systems.
  echo(
  echo   The full technical log is here if you want to check it:
  echo     %LOG%
)
echo(
pause
exit /b 0

REM ------------------------------------------------------------------------
:refresh_path
REM Re-read PATH from the registry so a just-installed tool is visible without
REM reopening the window. Keep the current PATH first (preserves System32).
set "SYS_PATH="
set "USR_PATH="
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH set "PATH=!PATH!;!SYS_PATH!"
if defined USR_PATH set "PATH=!PATH!;!USR_PATH!"
goto :eof
