@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ========================================
REM   ClaudeCode Launchpad CLI v2.1 - Launcher
REM   Runs Claude Code natively on Windows
REM   ANSI color fix: applies #C8E6FF background
REM   regardless of WT profile state
REM ========================================

REM --- Ensure Claude Code's native install dir is on PATH ---
REM Claude's native installer puts claude.exe in %USERPROFILE%\.local\bin and
REM warns it "is not in your PATH" right after install: it updates the persistent
REM user PATH, but Explorer-spawned processes (this shortcut, and the Windows
REM Terminal tab we start below) keep the OLD PATH until the user logs out/in.
REM Without this, the launcher's "where claude" check below would falsely report
REM Claude as missing immediately after a fresh install. Runs in both phases
REM (the WT relaunch re-enters the top of this script before :run_claude).
if exist "%USERPROFILE%\.local\bin\claude.exe" set "PATH=%PATH%;%USERPROFILE%\.local\bin"

REM --- Ensure Node is on PATH too (same stale-PATH problem as Claude above) ---
REM On a fresh PC the installer just added Node, but Explorer-spawned processes
REM keep the OLD PATH until the user logs out/in — so `where node` here would
REM MISS it. That silently skipped the tab de-dupe (-> duplicate tabs) and broke
REM the statusline command Claude runs (`node "...statusline.mjs"` inherits THIS
REM PATH), so the statusline stayed blank until a re-login. Add Node's real dir
REM (winget + official MSI both install to Program Files\nodejs). v2.9.3.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%PATH%;%ProgramFiles%\nodejs"
if defined ProgramW6432 if exist "%ProgramW6432%\nodejs\node.exe" set "PATH=%PATH%;%ProgramW6432%\nodejs"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs"

REM --- Phase 2: inside terminal, apply colors and run Claude ---
if "%~1"=="--run" goto :run_claude

title ClaudeCode Launchpad CLI

REM --- Read configuration ---
set "RESPONSE_LANGUAGE=english"
set "TERMINAL_COLOR=kivun"
set "CLAUDE_FLAGS="
set "STARTUP_CMD="
set "AUTO_CONTINUE=false"
set "SCRIPT_DIR=%~dp0"

if exist "!SCRIPT_DIR!config.txt" (
    for /f "usebackq tokens=1,* delims==" %%A in ("!SCRIPT_DIR!config.txt") do (
        set "LINE=%%A"
        if not "!LINE:~0,1!"=="#" (
            if "%%A"=="RESPONSE_LANGUAGE" set "RESPONSE_LANGUAGE=%%B"
            if "%%A"=="TERMINAL_COLOR" set "TERMINAL_COLOR=%%B"
            if "%%A"=="CLAUDE_FLAGS" set "CLAUDE_FLAGS=%%B"
            if "%%A"=="STARTUP_CMD" set "STARTUP_CMD=%%B"
            if "%%A"=="AUTO_CONTINUE" set "AUTO_CONTINUE=%%B"
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

REM --- One-shot resume flag hygiene -------------------------------------
REM The folder picker writes the conversation choice (--continue / --resume)
REM to kivun-claude-flags.txt, which :run_claude applies to THIS launch then
REM deletes. Only a picker launch (arg READFILE) may carry it. On a right-click
REM "Open with..." or direct launch, clear any stale file left by a picker run
REM that never reached :run_claude, so it can't leak in and crash a no-history
REM folder with "No conversation found to continue".
if /i not "%~1"=="READFILE" del "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt" >nul 2>&1

REM --- Tab title = the project folder name, so multiple tabs are
REM     distinguishable. The WT profile sets suppressApplicationTitle:true,
REM     so Claude can't overwrite this with its own "Claude Code" title.
set "WT_TAB=!WORK_DIR!"
if "!WT_TAB:~-1!"=="\" set "WT_TAB=!WT_TAB:~0,-1!"
for %%I in ("!WT_TAB!") do set "WT_TAB=%%~nxI"
if not defined WT_TAB set "WT_TAB=ClaudeCode Launchpad CLI"

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
    echo Re-run the ClaudeCode Launchpad CLI installer, or install
    echo Claude Code manually from:
    echo   https://claude.ai/download
    echo.
    echo If you just installed it, log out and back in once so the
    echo new PATH entry takes effect, then try again.
    echo.
    pause
    exit /b 1
)

REM --- Auto-continue watcher (opt-in; AUTO_CONTINUE=true) ---
REM After the 5-hour usage limit resets, this detached watcher focuses the
REM Launchpad tab and types "continue" once so idle work resumes unattended.
REM Spawned here (before the WT tab opens) so it outlives this launcher process;
REM it polls for the window, so starting a moment early is fine. It reads the
REM state file the statusline persists, keyed by the WORKING FOLDER passed below
REM (auto-continue.js derives the state-file name the same way statusline.mjs
REM does, since cmd can't compute that hash). See auto-continue.js for caveats.
REM arg#1 = the per-tab title (folder name) = the real WT window title the watcher
REM AppActivates; arg#2 = the working folder (used to derive the state-file name).
if /i "!AUTO_CONTINUE!"=="true" (
    where wscript >nul 2>&1 && start "" /b wscript.exe //nologo "!SCRIPT_DIR!auto-continue.js" "!WT_TAB!" "!WORK_DIR!"
)

REM --- Sync the terminal color from config.txt into the Windows Terminal
REM     fragment + settings.json BEFORE we open the window, so the chosen
REM     TERMINAL_COLOR (kivun / dark / black / white / default / #hex) is live
REM     for this launch. Best-effort: a missing Node or Windows Terminal must
REM     never block the launch (hence the &&, and stderr/stdout swallowed).
where node >nul 2>&1 && node "!SCRIPT_DIR!apply-terminal-color.js" >nul 2>&1

REM --- De-duplicate against Windows Terminal's "reopen tabs on startup" ---
REM     If WT is set to restore tabs, a cold start would reopen THIS project's
REM     saved Launchpad tab AND we would add another below -> two tabs, same
REM     name. This prunes only this project's tab from WT's saved layout so
REM     restore brings back everything else and we supply this one exactly once.
REM     Best-effort and must never block the launch (hence && + swallowed output).
where node >nul 2>&1 && node "!SCRIPT_DIR!dedupe-launch-tab.js" "!WT_TAB!" "!WORK_DIR!" >nul 2>&1

REM --- Try Windows Terminal first ---
where wt.exe >nul 2>&1
if errorlevel 1 goto :fallback_cmd

REM Launch WT calling self with --run (colors applied inside terminal).
REM -w "ClaudeCodeLaunchpad" targets a named Windows Terminal window: the
REM first launch creates it, and every later launch adds a NEW TAB to that
REM same window instead of opening a separate window — so you can work on
REM several projects side by side. --maximized only applies when the window
REM is first created; it's ignored when a tab is added to an existing window.
start "" wt.exe -w "ClaudeCodeLaunchpad" --maximized new-tab --title "!WT_TAB!" -p "ClaudeCode Launchpad CLI" -d "!WORK_DIR!" -- "!SCRIPT_DIR!claudecode-launchpad.bat" --run
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
set "AUTO_CONTINUE=false"
set "SCRIPT_DIR=%~dp0"
if exist "!SCRIPT_DIR!config.txt" (
    for /f "usebackq tokens=1,* delims==" %%A in ("!SCRIPT_DIR!config.txt") do (
        set "LINE=%%A"
        if not "!LINE:~0,1!"=="#" (
            if "%%A"=="RESPONSE_LANGUAGE" set "RESPONSE_LANGUAGE=%%B"
            if "%%A"=="TERMINAL_COLOR" set "TERMINAL_COLOR=%%B"
            if "%%A"=="CLAUDE_FLAGS" set "CLAUDE_FLAGS=%%B"
            if "%%A"=="AUTO_CONTINUE" set "AUTO_CONTINUE=%%B"
        )
    )
)

REM --- Resolve TERMINAL_COLOR into RGB for the instant ANSI paint below.
REM     The authoritative color is the Windows Terminal scheme written by
REM     apply-terminal-color.js in phase 1; this ANSI paint is the immediate
REM     repaint (before the scheme's default-bg fully takes over) and the
REM     conhost/cmd.exe fallback when Windows Terminal isn't in play.
set "BG_RGB="
set "FG_RGB="
if /i "!TERMINAL_COLOR!"=="kivun" ( set "BG_RGB=200;230;255" & set "FG_RGB=12;12;12" )
if /i "!TERMINAL_COLOR!"=="dark"  ( set "BG_RGB=30;30;30"    & set "FG_RGB=242;242;242" )
if /i "!TERMINAL_COLOR!"=="black" ( set "BG_RGB=12;12;12"    & set "FG_RGB=242;242;242" )
if /i "!TERMINAL_COLOR!"=="white" ( set "BG_RGB=255;255;255" & set "FG_RGB=12;12;12" )
if not defined BG_RGB if "!TERMINAL_COLOR:~0,1!"=="#" call :resolve_hex "!TERMINAL_COLOR!"
if not defined BG_RGB if /i not "!TERMINAL_COLOR!"=="default" if not "!TERMINAL_COLOR!"=="" (
    echo [ClaudeCode Launchpad] Unrecognized TERMINAL_COLOR "!TERMINAL_COLOR!" - leaving terminal theme unchanged.
)
if defined BG_RGB (
    REM Generate ESC character for ANSI sequences (Windows 10+)
    for /f %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"
    <nul set /p="!ESC![48;2;!BG_RGB!m!ESC![38;2;!FG_RGB!m"
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

REM --- Read one-time flags (written by the HTA picker on Launch) ---
set "ONE_TIME_FLAGS="
if exist "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt" (
    for /f "usebackq delims=" %%F in ("%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt") do set "ONE_TIME_FLAGS=%%F"
    del "%LOCALAPPDATA%\Kivun\kivun-claude-flags.txt"
)
set "FINAL_FLAGS=!CLAUDE_FLAGS!"
if not "!ONE_TIME_FLAGS!"=="" set "FINAL_FLAGS=!FINAL_FLAGS! !ONE_TIME_FLAGS!"

REM --- Read per-profile env vars from kivun-env.txt (written by HTA picker
REM     on Launch). Each KEY=VAL becomes an env var visible to the claude
REM     process spawned below. Unlike kivun-terminal-wsl, there is NO WSL
REM     boundary here — `set` in cmd is enough; no WSLENV plumbing needed.
REM     Schema: KEY=VAL one per line, # comments allowed. KEY validated by
REM     the picker as ^[A-Za-z_][A-Za-z0-9_]*$ before being written.
set "ENV_FILE=%LOCALAPPDATA%\Kivun\kivun-env.txt"
if exist "!ENV_FILE!" (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in ("!ENV_FILE!") do (
        if not "%%a"=="" set "%%a=%%b"
    )
)

REM --- Apply default STARTUP_CMD from config if no one-time override is queued ---
if not exist "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" (
    if not "!STARTUP_CMD!"=="" (
        cscript //nologo "!SCRIPT_DIR!write-startcmd.js" "!STARTUP_CMD!" >nul 2>&1
    )
)

REM --- Spawn startup-command injector (detached) if a startup command is queued ---
REM (File is written by the HTA picker, by the default-apply above, and cleared
REM  by the launcher.wsf at the top of each run; injector self-deletes after firing.)
if exist "%LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt" (
    start "" /b wscript.exe //nologo "!SCRIPT_DIR!inject-startup-cmd.js"
)

REM --- Launch Claude Code ---
REM Resume-flag safety net (v2.7.6): if FINAL_FLAGS asks to resume a previous
REM conversation (--continue / -c / --resume / -r) but THIS folder has no prior
REM session, Claude prints "No conversation found to continue" and exits at
REM once. Because the whole Windows Terminal tab is this single `claude` call,
REM the tab then closes on its own — to the user it looks like the launcher
REM "didn't open". We detect that FAST non-zero exit (Claude never became an
REM interactive session) and reopen a FRESH session with the resume flag
REM stripped, so the user lands in a working session instead of a vanished tab.
REM The retry runs at most once; a real session the user worked in and quit
REM lasts longer than the 10-second guard and is never retried.
set "RESUMING="
echo " !FINAL_FLAGS! " | findstr /i /r /c:" --continue " /c:" -c " /c:" --resume " /c:" -r " >nul 2>&1 && set "RESUMING=1"

call :now_seconds CC_T0
call :launch_claude "!FINAL_FLAGS!"
set "CC_RC=!ERRORLEVEL!"
call :now_seconds CC_T1
set /a "CC_ELAPSED=CC_T1-CC_T0"
if !CC_ELAPSED! lss 0 set /a "CC_ELAPSED+=86400"

if defined RESUMING if not "!CC_RC!"=="0" if !CC_ELAPSED! lss 10 (
    REM Strip the long-form resume flags by literal substring replacement. This
    REM preserves any quoted flags (e.g. --append-system-prompt "respond in
    REM Hebrew") that a token-rebuild would mangle. The picker and config presets
    REM only ever emit the long forms (--continue / --resume), so this covers the
    REM real cases; a manually-typed short -c / -r is rare and simply isn't
    REM retried (the session just exits, exactly as before this fix).
    set "FRESH_FLAGS=!FINAL_FLAGS!"
    set "FRESH_FLAGS=!FRESH_FLAGS:--continue=!"
    set "FRESH_FLAGS=!FRESH_FLAGS:--resume=!"
    echo.
    echo ===============================================
    echo  No previous conversation found in this folder.
    echo  Starting a fresh Claude session instead...
    echo ===============================================
    echo.
    call :launch_claude "!FRESH_FLAGS!"
)

REM --- Claude has exited. Rather than let the Windows Terminal tab close (what
REM     users hit when they type `exit` to run a quick command and then expect to
REM     come back), drop to a normal command prompt in the SAME tab. Typing
REM     `claude` there re-launches Claude with the SAME language prompt + flags;
REM     `exit` closes the tab. The doskey macro makes `claude` exit the child
REM     cmd with code 42, which this parent batch catches to relaunch — so the
REM     full original behavior (--append-system-prompt language flag and
REM     CLAUDE_FLAGS) is preserved. The macro ignores arguments typed after it.
:interactive_shell
echo.
echo  ------------------------------------------------------------
echo   Claude ended. You're now at a normal command prompt.
echo   Type  claude  to return to Claude, or  exit  to close.
echo  ------------------------------------------------------------
echo.
cmd /k "doskey claude=exit 42"
if !ERRORLEVEL! EQU 42 (
    call :launch_claude "!FINAL_FLAGS!"
    goto :interactive_shell
)
exit /b 0

:resolve_hex
REM %~1 = "#RRGGBB" or "#RGB". On success sets BG_RGB / FG_RGB (semicolon RGB for
REM ANSI) in the caller's scope, choosing dark or light text by luminance; on an
REM invalid value it leaves them empty so the caller warns and skips coloring.
setlocal enabledelayedexpansion
set "HX=%~1"
set "HX=!HX:~1!"
set "LEN="
echo(!HX!| findstr /r /i /x "[0-9a-f][0-9a-f][0-9a-f]" >nul && set "LEN=3"
echo(!HX!| findstr /r /i /x "[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]" >nul && set "LEN=6"
if not defined LEN ( endlocal & exit /b )
if "!LEN!"=="3" set "HX=!HX:~0,1!!HX:~0,1!!HX:~1,1!!HX:~1,1!!HX:~2,1!!HX:~2,1!"
set /a R=0x!HX:~0,2!, G=0x!HX:~2,2!, B=0x!HX:~4,2! 2>nul
set /a L=(299*R+587*G+114*B)/1000
set "FGV=12;12;12"
if !L! lss 128 set "FGV=242;242;242"
endlocal & set "BG_RGB=%R%;%G%;%B%" & set "FG_RGB=%FGV%"
exit /b

:launch_claude
REM %~1 = flag string (may be empty). Expanded BARE (not quoted) so the flags
REM word-split into separate arguments to claude; an empty string adds nothing.
set "_FLAGS=%~1"
if defined LANG_PROMPT (
    claude !_FLAGS! --append-system-prompt "!LANG_PROMPT!"
) else (
    claude !_FLAGS!
)
exit /b !ERRORLEVEL!

:now_seconds
REM %~1 = name of the variable to receive seconds-since-midnight, parsed from
REM %TIME% (HH:MM:SS.cc). `!TIME: =0!` zero-pads the space-padded hour (" 9:05"
REM -> "09:05"); the 1HH-100 trick strips leading zeros without octal errors.
set "_TT=!TIME: =0!"
for /f "tokens=1-3 delims=:.," %%a in ("!_TT!") do set /a "%~1=(((1%%a-100)*60)+(1%%b-100))*60+(1%%c-100)"
exit /b
