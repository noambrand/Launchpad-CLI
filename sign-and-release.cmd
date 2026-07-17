@echo off
setlocal enabledelayedexpansion
title Sign and Release - ClaudeCode Launchpad CLI

REM ============================================================
REM  Signs the Windows installer with your Certum "Code Signing
REM  Individual in Cloud" certificate and uploads the SIGNED copy
REM  onto the GitHub release (replacing the unsigned one GitHub built).
REM
REM  BEFORE double-clicking: open SimplySign Desktop and log in
REM  (enter the 6-digit code from your phone). The private key lives
REM  in Certum's cloud, so signing only works while that app is
REM  logged in. See ..\..\Certification\SIGNING_GUIDE.md
REM ============================================================

set "REPO=noambrand/Launchpad-CLI"
set "EXE=ClaudeCode_Launchpad_CLI_Setup.exe"
set "TS=http://time.certum.pl"

cd /d "%~dp0"

echo(
echo ============================================================
echo   Sign ^& publish the Windows installer  (Launchpad CLI)
echo ============================================================
echo(
echo STEP 1: Make sure SimplySign Desktop is OPEN and LOGGED IN
echo         (you entered the 6-digit code from your phone).
echo(
pause

REM ---- locate the newest signtool.exe from the Windows SDK ----
set "SIGNTOOL="
for /f "delims=" %%s in ('dir /b /s /a-d "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" 2^>nul') do set "SIGNTOOL=%%s"
if "%SIGNTOOL%"=="" (
  echo ERROR: signtool.exe not found ^(Windows SDK missing^).
  goto :fail
)
echo Using signtool: %SIGNTOOL%
echo(

REM ---- find which release to sign (default: latest) ----
set "TAG="
for /f "delims=" %%t in ('gh release view -R %REPO% --json tagName -q ".tagName" 2^>nul') do set "TAG=%%t"
if "%TAG%"=="" (
  echo ERROR: could not read the latest release. Is 'gh' logged in?
  goto :fail
)
echo Latest release is: %TAG%
set "INPUT="
set /p "INPUT=Press ENTER to sign this one, or type a different tag: "
if not "%INPUT%"=="" set "TAG=%INPUT%"
echo Signing release: %TAG%
echo(

REM ---- work in a clean temp folder (keeps the repo tidy) ----
set "WORK=%TEMP%\ccl-signing"
if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%"

echo Downloading the built installer from release %TAG% ...
gh release download "%TAG%" -R %REPO% -p "%EXE%" -D "%WORK%"
if not exist "%WORK%\%EXE%" (
  echo ERROR: could not download %EXE% from release %TAG%.
  goto :fail
)

echo(
echo Signing... approve the request on your phone if it asks.
"%SIGNTOOL%" sign /n "Noam Brand" /fd sha256 /tr "%TS%" /td sha256 /v "%WORK%\%EXE%"
if errorlevel 1 (
  echo(
  echo SIGNING FAILED. Most common cause: SimplySign Desktop is not
  echo logged in. Log in and run this file again.
  goto :fail
)

echo(
echo Verifying the signature...
"%SIGNTOOL%" verify /pa /v "%WORK%\%EXE%"
if errorlevel 1 (
  echo VERIFY FAILED - the signed file did not pass verification.
  goto :fail
)

echo(
echo Uploading the SIGNED installer to release %TAG% (replacing the unsigned one)...
gh release upload "%TAG%" "%WORK%\%EXE%" -R %REPO% --clobber
if errorlevel 1 (
  echo UPLOAD FAILED.
  goto :fail
)

REM ---- tidy up ----
rmdir /s /q "%WORK%" 2>nul

echo(
echo ============================================================
echo   DONE. %EXE% is signed and live on release %TAG%.
echo ============================================================
echo(
pause
exit /b 0

:fail
echo(
echo *** Stopped. Nothing on GitHub was changed. See messages above. ***
echo(
pause
exit /b 1
