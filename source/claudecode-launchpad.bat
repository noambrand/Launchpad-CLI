@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ========================================
REM   ClaudeCode Launchpad CLI v2.1 - Launcher
REM   Runs Claude Code natively on Windows
REM   ANSI color fix: applies #C8E6FF background
REM   regardless of WT profile state
REM ========================================

REM --- Phase 2: inside terminal, apply colors and run Claude ---
if "%~1"=="--run" goto :run_claude

title ClaudeCode Launchpad CLI

REM --- Read configuration ---
set "RESPONSE_LANGUAGE=english"
set "TERMINAL_COLOR=kivun"
set "CLAUDE_FLAGS="
set "STARTUP_CMD="
set "SCRIPT_DIR=%~dp0"

if exist "!SCRIPT_DIR!config.txt" (
    for /f "usebackq tokens=1,* delims==" %%A in ("!SCRIPT_DIR!config.txt") do (
        set "LINE=%%A"
        if not "!LINE:~0,1!"=="#" (
            if "%%A"=="RESPONSE_LANGUAGE" set "RESPONSE_LANGUAGE=%%B"
            if "%%A"=="TERMINAL_COLOR" set "TERMINAL_COLOR=%%B"
            if "%%A"=="CLAUDE_FLAGS" set "CLAUDE_FLAGS=%%B"
            if "%%A"=="STARTUP_CMD" set "STARTUP_CMD=%%B"
        )
    )
)

REM --- Determine work directory ---
set "WORK_DIR=%USERPROFILE%"

if "%~1"=="" goto :work_dir_done
if /i "%~1"=="READFILE" (
    set "PATHFILE=%LOCALAPPDATA%\Kivun\kivun-workdir.txt"
    if exist "!PATHFILE!" (
        for /f "usebackq delims=" %%P in ("!PATHFILE!") do set "WORK_DIR=%%P"
    )
    goto :work_dir_done
)

if exist "%~1" (
    set "WORK_DIR=%~1"
)

:work_dir_done

REM --- Verify Claude Code is installed ---
set "CLAUDE_FOUND=0"
where claude.cmd >nul 2>&1 && set "CLAUDE_FOUND=1"
if "!CLAUDE_FOUND!"=="0" (
    where claude >nul 2>&1 && set "CLAUDE_FOUND=1"
)
if "!CLAUDE_FOUND!"=="0" (
    echo.
    echo ========================================
    echo   ERROR: Claude Code not found
    echo ========================================
    echo.
    echo Claude Code is not installed or not in PATH.
    echo.
    echo To install, run:
    echo   npm install -g @anthropic-ai/claude-code
    echo.
    pause
    exit /b 1
)

REM --- Try Windows Terminal first ---
where wt.exe >nul 2>&1
if errorlevel 1 goto :fallback_cmd

REM Launch WT calling self with --run (colors applied inside terminal)
start "" wt.exe --maximized -p "ClaudeCode Launchpad CLI" -d "!WORK_DIR!" -- "!SCRIPT_DIR!claudecode-launchpad.bat" --run
exit /b 0

:fallback_cmd
REM Fallback: run in current CMD window
cd /d "!WORK_DIR!"
goto :run_claude

REM ========================================
REM   Phase 2: Apply colors + launch Claude
REM ========================================
:run_claude
title ClaudeCode Launchpad CLI

REM Re-read config (needed when launched via --run inside Windows Terminal)
set "RESPONSE_LANGUAGE=english"
set "TERMINAL_COLOR=kivun"
set "CLAUDE_FLAGS="
set "SCRIPT_DIR=%~dp0"
if exist "!SCRIPT_DIR!config.txt" (
    for /f "usebackq tokens=1,* delims==" %%A in ("!SCRIPT_DIR!config.txt") do (
        set "LINE=%%A"
        if not "!LINE:~0,1!"=="#" (
            if "%%A"=="RESPONSE_LANGUAGE" set "RESPONSE_LANGUAGE=%%B"
            if "%%A"=="TERMINAL_COLOR" set "TERMINAL_COLOR=%%B"
            if "%%A"=="CLAUDE_FLAGS" set "CLAUDE_FLAGS=%%B"
        )
    )
)

if /i "!TERMINAL_COLOR!"=="kivun" (
    REM Generate ESC character for ANSI sequences (Windows 10+)
    for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
    REM Apply Kivun light-blue background #C8E6FF (200,230,255) + dark text #0C0C0C (12,12,12)
    <nul set /p="!ESC![48;2;200;230;255m!ESC![38;2;12;12;12m"
    cls
)

REM --- Set language prompt ---
set "LANG_PROMPT="
if /i "!RESPONSE_LANGUAGE!"=="hebrew" set "LANG_PROMPT=Always respond in Hebrew."
if /i "!RESPONSE_LANGUAGE!"=="arabic" set "LANG_PROMPT=Always respond in Arabic."
if /i "!RESPONSE_LANGUAGE!"=="persian" set "LANG_PROMPT=Always respond in Persian (Farsi)."
if /i "!RESPONSE_LANGUAGE!"=="urdu" set "LANG_PROMPT=Always respond in Urdu."
if /i "!RESPONSE_LANGUAGE!"=="kurdish" set "LANG_PROMPT=Always respond in Kurdish."
if /i "!RESPONSE_LANGUAGE!"=="pashto" set "LANG_PROMPT=Always respond in Pashto."
if /i "!RESPONSE_LANGUAGE!"=="sindhi" set "LANG_PROMPT=Always respond in Sindhi."
if /i "!RESPONSE_LANGUAGE!"=="yiddish" set "LANG_PROMPT=Always respond in Yiddish."
if /i "!RESPONSE_LANGUAGE!"=="syriac" set "LANG_PROMPT=Always respond in Syriac."
if /i "!RESPONSE_LANGUAGE!"=="dhivehi" set "LANG_PROMPT=Always respond in Dhivehi."
if /i "!RESPONSE_LANGUAGE!"=="nko" set "LANG_PROMPT=Always respond in N'Ko."
if /i "!RESPONSE_LANGUAGE!"=="adlam" set "LANG_PROMPT=Always respond in Fulani (Adlam script)."
if /i "!RESPONSE_LANGUAGE!"=="mandaic" set "LANG_PROMPT=Always respond in Mandaic."
if /i "!RESPONSE_LANGUAGE!"=="samaritan" set "LANG_PROMPT=Always respond in Samaritan."
if /i "!RESPONSE_LANGUAGE!"=="dari" set "LANG_PROMPT=Always respond in Dari (Afghan Persian)."
if /i "!RESPONSE_LANGUAGE!"=="uyghur" set "LANG_PROMPT=Always respond in Uyghur."
if /i "!RESPONSE_LANGUAGE!"=="balochi" set "LANG_PROMPT=Always respond in Balochi."
if /i "!RESPONSE_LANGUAGE!"=="kashmiri" set "LANG_PROMPT=Always respond in Kashmiri."
if /i "!RESPONSE_LANGUAGE!"=="shahmukhi" set "LANG_PROMPT=Always respond in Punjabi (Shahmukhi)."
if /i "!RESPONSE_LANGUAGE!"=="azeri_south" set "LANG_PROMPT=Always respond in South Azerbaijani."
if /i "!RESPONSE_LANGUAGE!"=="jawi" set "LANG_PROMPT=Always respond in Malay (Jawi script)."
if /i "!RESPONSE_LANGUAGE!"=="hausa_ajami" set "LANG_PROMPT=Always respond in Hausa (Ajami script)."
if /i "!RESPONSE_LANGUAGE!"=="rohingya" set "LANG_PROMPT=Always respond in Rohingya."
if /i "!RESPONSE_LANGUAGE!"=="turoyo" set "LANG_PROMPT=Always respond in Turoyo (Neo-Aramaic)."

REM --- Read one-time flags (written by choose-folder on text-input path) ---
set "ONE_TIME_FLAGS="
if exist "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt" (
    for /f "usebackq delims=" %%F in ("%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt") do set "ONE_TIME_FLAGS=%%F"
    del "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt"
)
set "FINAL_FLAGS=!CLAUDE_FLAGS!"
if not "!ONE_TIME_FLAGS!"=="" set "FINAL_FLAGS=!FINAL_FLAGS! !ONE_TIME_FLAGS!"

REM --- Apply default STARTUP_CMD from config if no one-time override is queued ---
if not exist "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" (
    if not "!STARTUP_CMD!"=="" (
        cscript //nologo "!SCRIPT_DIR!write-startcmd.js" "!STARTUP_CMD!" >nul 2>&1
    )
)

REM --- Spawn startup-command injector (detached) if a startup command is queued ---
REM (File is written by choose-folder.bat, by the default-apply above, and cleared at
REM  the top of each choose-folder run; injector self-deletes after firing.)
if exist "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" (
    start "" /b wscript.exe //nologo "!SCRIPT_DIR!inject-startup-cmd.js"
)

REM --- Launch Claude Code ---
if defined LANG_PROMPT (
    claude !FINAL_FLAGS! --append-system-prompt "!LANG_PROMPT!"
) else (
    claude !FINAL_FLAGS!
)
exit /b 0
