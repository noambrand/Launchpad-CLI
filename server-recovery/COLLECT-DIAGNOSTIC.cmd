@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Collect Claude diagnostic

REM Gathers the real facts from THIS server into one text file on the Desktop,
REM so the failure can be understood instead of guessed at. Sends nothing
REM anywhere - it only writes a local file and opens it in Notepad.

set "OUT=%USERPROFILE%\Desktop\CLAUDE-DIAGNOSTIC.txt"

> "%OUT%"  echo ===== Claude Code server diagnostic =====
>> "%OUT%" echo Date: %DATE% %TIME%
>> "%OUT%" echo(
>> "%OUT%" echo --- Windows version ---
ver >> "%OUT%" 2>&1
>> "%OUT%" echo(

>> "%OUT%" echo --- Node.js ---
where node >> "%OUT%" 2>&1
node -v >> "%OUT%" 2>&1
>> "%OUT%" echo(

>> "%OUT%" echo --- curl ---
where curl >> "%OUT%" 2>&1
if exist "%LOCALAPPDATA%\Kivun\bin\curl.exe" (echo Recovery curl present: %LOCALAPPDATA%\Kivun\bin\curl.exe >> "%OUT%") else (echo Recovery curl NOT present >> "%OUT%")
>> "%OUT%" echo(

>> "%OUT%" echo --- Where Claude should be ---
where claude >> "%OUT%" 2>&1
where claude.cmd >> "%OUT%" 2>&1
if exist "%USERPROFILE%\.local\bin\claude.exe" (echo FOUND: %USERPROFILE%\.local\bin\claude.exe >> "%OUT%") else (echo NOT FOUND: %USERPROFILE%\.local\bin\claude.exe >> "%OUT%")
>> "%OUT%" echo(
>> "%OUT%" echo --- Contents of %USERPROFILE%\.local\bin ---
dir "%USERPROFILE%\.local\bin" >> "%OUT%" 2>&1
>> "%OUT%" echo(

>> "%OUT%" echo --- Try to RUN claude (this is the key test) ---
if exist "%USERPROFILE%\.local\bin\claude.exe" (
  cmd /c ""%USERPROFILE%\.local\bin\claude.exe" --version" >> "%OUT%" 2>&1
  echo run exit code: !errorlevel! >> "%OUT%"
) else (
  echo claude.exe was never installed, so nothing to run. >> "%OUT%"
)
>> "%OUT%" echo(

>> "%OUT%" echo --- Full recovery log ---
if exist "%LOCALAPPDATA%\Kivun\server-recovery-log.txt" (
  type "%LOCALAPPDATA%\Kivun\server-recovery-log.txt" >> "%OUT%" 2>&1
) else (
  echo No recovery log found - the fix file may not have run. >> "%OUT%"
)
>> "%OUT%" echo(
>> "%OUT%" echo ===== end of diagnostic =====

echo(
echo   Saved a diagnostic to your Desktop:
echo     %OUT%
echo(
echo   It is opening in Notepad now. Please send that file to Noam / Claude.
echo(
start "" notepad "%OUT%"
pause
