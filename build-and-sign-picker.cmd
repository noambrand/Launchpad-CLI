@echo off
setlocal enabledelayedexpansion
title Build ^& Sign the Launchpad Picker (replaces mshta)

REM ============================================================
REM  Builds the NEW signed folder-picker program (LaunchpadPicker.exe)
REM  that replaces the old mshta.exe + folder-picker.hta combo Windows
REM  Defender kept false-flagging. It:
REM    1. compiles the .NET WebView2 host,
REM    2. rebuilds folder-picker.html from the canonical folder-picker.hta,
REM    3. signs LaunchpadPicker.exe with your Certum cloud certificate,
REM    4. stages the signed exe + its support files into source\ so the
REM       installer (ClaudeCode_Launchpad_CLI_Setup.nsi) packs them.
REM
REM  BEFORE double-clicking: open SimplySign Desktop and log in (enter the
REM  6-digit code from your phone) - same as sign-and-release.cmd. The
REM  private key lives in Certum's cloud, so signing only works while that
REM  app is logged in.
REM ============================================================

cd /d "%~dp0"
set "APP=picker-app"
set "OUT=%APP%\bin\Release"
set "SRC=source"

echo(
echo ============================================================
echo   Build ^& sign the Launchpad Picker
echo ============================================================
echo(

REM ---- 1. Build the .NET WebView2 host ----------------------------------
echo [1/5] Compiling LaunchpadPicker.exe ...
where dotnet >nul 2>nul || (echo ERROR: dotnet SDK not found. Install the .NET SDK. & goto :fail)
dotnet build "%APP%\LaunchpadPicker.csproj" -c Release -v m
if errorlevel 1 (echo BUILD FAILED. & goto :fail)
if not exist "%OUT%\LaunchpadPicker.exe" (echo ERROR: LaunchpadPicker.exe was not produced. & goto :fail)

REM ---- 2. Rebuild the HTML from the canonical .hta ----------------------
echo [2/5] Rebuilding folder-picker.html from folder-picker.hta ...
where node >nul 2>nul || (echo ERROR: node not found. & goto :fail)
node "%APP%\build-picker.js" "%SRC%\folder-picker.hta" "%SRC%\folder-picker.html"
if errorlevel 1 (echo HTML TRANSFORM FAILED (folder-picker). & goto :fail)
node "%APP%\build-picker.js" "%SRC%\fix-wt-icon.hta" "%SRC%\fix-wt-icon.html"
if errorlevel 1 (echo HTML TRANSFORM FAILED (fix-wt-icon). & goto :fail)

REM ---- 3. Locate signtool (newest x64) ----------------------------------
echo [3/5] Locating signtool ...
set "SIGNTOOL="
for /f "delims=" %%s in ('dir /b /s "C:\Program Files (x86)\Windows Kits\10\bin\signtool.exe" 2^>nul ^| findstr /i /c:"\x64\signtool"') do set "SIGNTOOL=%%s"
if not defined SIGNTOOL for /f "delims=" %%s in ('dir /b /s "C:\Program Files (x86)\Windows Kits\10\bin\signtool.exe" 2^>nul') do set "SIGNTOOL=%%s"
if not defined SIGNTOOL (echo ERROR: signtool.exe not found ^(Windows SDK missing^). & goto :fail)
echo       Using: !SIGNTOOL!

REM ---- 4. Sign LaunchpadPicker.exe --------------------------------------
echo [4/5] Signing LaunchpadPicker.exe ^(approve on your phone if asked^) ...
"!SIGNTOOL!" sign /n "Noam Brand" /fd sha256 /tr "http://time.certum.pl" /td sha256 /v "%OUT%\LaunchpadPicker.exe"
if errorlevel 1 (
  echo(
  echo SIGNING FAILED. Most common cause: SimplySign Desktop is not logged in.
  echo Open it, enter the 6-digit code from your phone, then run this file again.
  goto :fail
)
"!SIGNTOOL!" verify /pa /v "%OUT%\LaunchpadPicker.exe"
if errorlevel 1 (echo VERIFY FAILED. & goto :fail)

REM ---- 5. Stage signed exe + support files into source\ -----------------
echo [5/5] Staging signed picker + support files into source\ ...
copy /y "%OUT%\LaunchpadPicker.exe"                        "%SRC%\LaunchpadPicker.exe" >nul || goto :fail
copy /y "%OUT%\Microsoft.Web.WebView2.Core.dll"           "%SRC%\Microsoft.Web.WebView2.Core.dll" >nul || goto :fail
copy /y "%OUT%\Microsoft.Web.WebView2.WinForms.dll"       "%SRC%\Microsoft.Web.WebView2.WinForms.dll" >nul || goto :fail
copy /y "%OUT%\WebView2Loader.dll"                         "%SRC%\WebView2Loader.dll" >nul || goto :fail
copy /y "%APP%\webview-shim.js"                            "%SRC%\webview-shim.js" >nul || goto :fail

echo(
echo ============================================================
echo   DONE. Signed picker + support files are staged in source\.
echo   Next: commit source\ and build/publish the installer as usual.
echo ============================================================
echo(
pause
exit /b 0

:fail
echo(
echo *** Stopped. See messages above. Nothing was published. ***
echo(
pause
exit /b 1
