@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title ClaudeCode Launchpad CLI - Choose Folder

REM --- Clear any stale startup-command from a prior aborted run ---
if exist "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" del "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" >nul 2>&1

echo ========================================
echo   ClaudeCode Launchpad CLI - Folder Selector
echo ========================================
echo.

REM Skip folder picker if --text-only flag is passed
if "%~1"=="--text-only" goto :textinput

echo Opening folder picker...
echo.

REM Folder picker writes path to file (Unicode-safe) and echoes OK/CANCELLED
for /f "delims=" %%i in ('cscript //nologo "%~dp0folder-picker.wsf" 2^>nul') do set "PICKER_RESULT=%%i"

if "!PICKER_RESULT!"=="OK" (
    echo Folder selected.
    echo.
    goto :ask_flags
)

REM Cancelled or picker failed - fall through to text input
:textinput
echo.
echo ========================================
echo   Type or paste a folder path
echo ========================================
echo.
echo Examples:
echo   C:\Users\noam\Documents\MyProject
echo   C:\Projects\WebApp
echo.
echo ========================================
echo.
set /p "CHOSEN_FOLDER=Enter path: "

REM Remove quotes
set "CHOSEN_FOLDER=!CHOSEN_FOLDER:"=!"

REM Check if empty
if "!CHOSEN_FOLDER!"=="" (
    echo.
    echo No path entered!
    timeout /t 2 >nul
    exit /b 1
)

REM Check if folder exists
if not exist "!CHOSEN_FOLDER!" (
    echo.
    echo ERROR: Folder does not exist!
    echo Path: !CHOSEN_FOLDER!
    echo.
    pause
    exit /b 1
)

REM Write typed path via JScript (preserves Unicode)
cscript //nologo "%~dp0write-path.js" "!CHOSEN_FOLDER!" 2>nul

REM --- Optional one-time Claude flags ---
:ask_flags
echo.
echo ========================================
echo   Optional Claude flags for this session
echo ========================================
echo.
echo   --continue              Resume your last conversation
echo   --resume my-session     Resume a named session
echo   --model sonnet          Use Sonnet (faster, cheaper)
echo   --model opus            Use Opus (strongest reasoning)
echo   --model haiku           Use Haiku (fastest, lightest)
echo   --print                 One-off answer, no interactive chat
echo   --add-dir C:\full\path  Give Claude access to extra folder
echo   --enable-auto-mode      Skip permission prompts (auto-approve)
echo.
echo   Combine: --continue --model opus --enable-auto-mode
echo   (Then add /voicemode:converse at the next "startup command" prompt)
echo.
echo ========================================
echo.
set "ONE_TIME_FLAGS="
set /p "ONE_TIME_FLAGS=Claude flags (Enter to skip): "
if not "!ONE_TIME_FLAGS!"=="" (
    echo !ONE_TIME_FLAGS!> "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt"
)

REM --- Optional one-time startup command (auto-typed into Claude after TUI loads) ---
echo.
echo ========================================
echo   Optional startup command (auto-run after Claude opens)
echo ========================================
echo.
echo   /voicemode:converse      Start voice mode (if plugin installed)
echo   /help                    Show slash command list
echo   /model opus              Switch model mid-session
echo.
echo   Do NOT paste passwords here - this will be typed visibly.
echo   (Press Enter to skip)
echo.
set "STARTUP_CMD="
set /p "STARTUP_CMD=Command: "
if not "!STARTUP_CMD!"=="" (
    cscript //nologo "%~dp0write-startcmd.js" "!STARTUP_CMD!" 2>nul
)

REM --- Offer to save flags + startup command as defaults for future launches ---
if not "!ONE_TIME_FLAGS!!STARTUP_CMD!"=="" (
    echo.
    echo ========================================
    echo   Save these as defaults for future launches?
    echo ========================================
    echo.
    echo   Flags   (-- before flag name, e.g. --continue): !ONE_TIME_FLAGS!
    echo   Command (/ before command name, e.g. /help):    !STARTUP_CMD!
    echo.
    echo   Y = write to config.txt (applies on every launch from now on)
    echo   N = use them just for this session (default)
    echo.
    set "SAVE_DEFAULT="
    set /p "SAVE_DEFAULT=Save as default? (y/N): "
    if /i "!SAVE_DEFAULT!"=="y" (
        cscript //nologo "%~dp0save-defaults.js" "!ONE_TIME_FLAGS!" "!STARTUP_CMD!" 2>nul
        echo Saved. Edit config.txt via Start Menu ^> ClaudeCode Launchpad CLI ^> Configuration to change later.
        timeout /t 2 >nul
    )
)

call "%~dp0claudecode-launchpad.bat" "READFILE"
