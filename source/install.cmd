@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ============================================
REM   ClaudeCode Launchpad CLI - Dependency Installer
REM   Uses curl.exe (built-in Windows 10 1803+)
REM   Falls back to winget / certutil if curl is unavailable or blocked
REM ============================================

REM --- Version Pins (update these for new releases) ---
set "NODE_VERSION=22.15.0"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x64.msi"
set "GIT_VERSION=2.49.0"
set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v%GIT_VERSION%.windows.1/Git-%GIT_VERSION%-64-bit.exe"
set "TEMP_DIR=%TEMP%\ClaudeCodeSetup"
set "EXIT_CODE=0"

REM --- Persistent logs (per-user, survive the run so a failed install leaves
REM     evidence on disk). KIVUN_LOG gets this script's own output; NODE_MSI_LOG
REM     gets msiexec's verbose log when Node.js is installed. ---
set "KIVUN_DIR=%LOCALAPPDATA%\Kivun"
set "KIVUN_LOG=%KIVUN_DIR%\install-log.txt"
set "NODE_MSI_LOG=%KIVUN_DIR%\node-msi.log"
if not exist "%KIVUN_DIR%" mkdir "%KIVUN_DIR%" 2>nul

REM --- Robust curl config (ROOT-CAUSE FIX for the "installation may have failed"
REM     dialog). Windows' built-in curl uses the schannel TLS backend, which
REM     aborts large HTTPS downloads from CDNs (Cloudflare / HTTP-2) with
REM     "(56) schannel: server closed abruptly (missing close_notify)" or
REM     "(35) Send failure: Connection was reset" — schannel has no HTTP
REM     termination point for the stream and treats the missing TLS close as a
REM     possible truncation attack. Forcing HTTP/1.1 gives every response a
REM     Content-Length terminator (so curl never depends on close_notify), and
REM     the retries ride out transient resets.
REM
REM     We publish this through CURL_HOME, which curl reads a .curlrc from. That
REM     means not only OUR curl calls but ALSO Anthropic's bootstrap.cmd — which
REM     fetches the ~50 MB claude.exe with a bare `curl -fsSL` and has NO retry
REM     of its own — inherit the same resilience, because child processes
REM     inherit CURL_HOME. This is the difference between the native Claude
REM     install stalling mid-download and completing cleanly. CURL_HOME is only
REM     set inside this script's process (setlocal), so the user's own curl is
REM     unaffected after install.
set "CURL_HOME=%KIVUN_DIR%"
> "%KIVUN_DIR%\.curlrc" (
    echo http1.1
    echo retry = 5
    echo retry-all-errors
    echo retry-delay = 2
    echo ssl-no-revoke
    echo connect-timeout = 30
)

REM --- Parse Arguments ---
set "DO_NODE=0"
set "DO_GIT=0"
set "DO_CLAUDE=0"
set "DO_WT=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="/node"   set "DO_NODE=1"
if /i "%~1"=="/git"    set "DO_GIT=1"
if /i "%~1"=="/claude" set "DO_CLAUDE=1"
if /i "%~1"=="/wt"     set "DO_WT=1"
if /i "%~1"=="/all"    set "DO_NODE=1" & set "DO_GIT=1" & set "DO_CLAUDE=1" & set "DO_WT=1"
shift
goto :parse_args
:args_done

REM --- Check for curl.exe ---
set "USE_CURL=0"
where curl.exe >nul 2>&1 && set "USE_CURL=1"
if "!USE_CURL!"=="0" call :say "[INFO] curl.exe not found. Will use winget / certutil as fallback."

REM --- Create temp directory ---
mkdir "%TEMP_DIR%" 2>nul

REM --- Header line in the persistent log ---
echo.>> "%KIVUN_LOG%"
echo ===== %DATE% %TIME% :: install.cmd %* =====>> "%KIVUN_LOG%"

REM --- Dispatch to subroutines. Each subroutine prints clean, user-facing
REM     milestones to the screen via :say while sending the noisy command
REM     output (curl meters, winget spinners, msiexec) only to the log, so the
REM     installer console never looks like a frozen black window. ---
if "!DO_NODE!"=="1" call :install_node
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_GIT!"=="1" call :install_git
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_CLAUDE!"=="1" call :install_claude
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_WT!"=="1" call :install_wt

:cleanup
rmdir /s /q "%TEMP_DIR%" 2>nul
exit /b !EXIT_CODE!

REM ============================================
REM   SUBROUTINES
REM ============================================

REM --- :say "message" — echo to the screen AND append to the log, so the user
REM     sees progress live and the same line is preserved for diagnostics. The
REM     leading-redirect form avoids a trailing digit in the message being
REM     mistaken for a stream handle. ---
:say
echo %~1
>>"%KIVUN_LOG%" echo %~1
goto :eof

:install_node
where node.exe >nul 2>&1
if not errorlevel 1 (
    call :say "[Node.js] Already installed - skipping."
    goto :eof
)
if "!USE_CURL!"=="1" (
    call :say "[Node.js] Downloading v%NODE_VERSION% (~30 MB), please wait..."
    curl.exe -L -o "%TEMP_DIR%\node-setup.msi" "%NODE_URL%" >> "%KIVUN_LOG%" 2>&1
    if not errorlevel 1 (
        call :say "[Node.js] Installing - a Windows admin prompt will appear, please approve it..."
        REM Node's MSI is per-machine and needs admin. This installer runs
        REM per-user, so a plain "msiexec /qn" returns 1603 (Error 1925).
        REM install-node-elevated.js triggers a single UAC prompt for msiexec
        REM and writes a verbose MSI log to NODE_MSI_LOG.
        cscript.exe //Nologo //B "%~dp0install-node-elevated.js" "%TEMP_DIR%\node-setup.msi" "%NODE_MSI_LOG%" >> "%KIVUN_LOG%" 2>&1
        set "MSI_RC=!errorlevel!"
        if not "!MSI_RC!"=="0" (
            call :say "[Node.js] ERROR: install failed (code !MSI_RC!). Log: %NODE_MSI_LOG%"
            if "!MSI_RC!"=="1223" call :say "[Node.js] You declined the administrator prompt. Node.js needs admin to install."
            set "EXIT_CODE=1"
            goto :eof
        )
        call :refresh_path
        call :say "[Node.js] Installed."
        goto :eof
    )
    call :say "[Node.js] Direct download failed. Trying winget..."
)
where winget.exe >nul 2>&1
if errorlevel 1 (
    call :say "[Node.js] ERROR: neither curl nor winget available. Install manually from https://nodejs.org/"
    set "EXIT_CODE=10"
    goto :eof
)
call :say "[Node.js] Installing via winget, please wait..."
cmd /c winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements >> "%KIVUN_LOG%" 2>&1
call :refresh_path
where node.exe >nul 2>&1
if errorlevel 1 (
    call :say "[Node.js] WARNING: not found in PATH yet - a restart may be needed."
) else (
    call :say "[Node.js] Installed."
)
goto :eof

:install_git
where git.exe >nul 2>&1
if not errorlevel 1 (
    call :say "[Git] Already installed - skipping."
    goto :eof
)
if "!USE_CURL!"=="1" (
    call :say "[Git] Downloading v%GIT_VERSION% (~60 MB), please wait..."
    curl.exe -L -o "%TEMP_DIR%\git-setup.exe" "%GIT_URL%" >> "%KIVUN_LOG%" 2>&1
    if not errorlevel 1 (
        call :say "[Git] Installing silently, please wait..."
        "%TEMP_DIR%\git-setup.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh" >> "%KIVUN_LOG%" 2>&1
        if errorlevel 1 (
            call :say "[Git] ERROR: installer failed. See %KIVUN_LOG%"
            set "EXIT_CODE=2"
            goto :eof
        )
        call :refresh_path
        call :say "[Git] Installed."
        goto :eof
    )
    call :say "[Git] Direct download failed. Trying winget..."
)
where winget.exe >nul 2>&1
if errorlevel 1 (
    call :say "[Git] ERROR: neither curl nor winget available. Install manually from https://git-scm.com/"
    set "EXIT_CODE=10"
    goto :eof
)
call :say "[Git] Installing via winget, please wait..."
cmd /c winget install Git.Git --accept-package-agreements --accept-source-agreements >> "%KIVUN_LOG%" 2>&1
call :refresh_path
where git.exe >nul 2>&1
if errorlevel 1 (
    call :say "[Git] WARNING: not found in PATH yet - a restart may be needed."
) else (
    call :say "[Git] Installed."
)
goto :eof

:install_claude
call :refresh_path
where claude.cmd >nul 2>&1
if not errorlevel 1 (
    call :say "[Claude Code] Already installed - skipping."
    goto :eof
)
where claude >nul 2>&1
if not errorlevel 1 (
    call :say "[Claude Code] Already installed - skipping."
    goto :eof
)

set "CLAUDE_INSTALLER=%TEMP_DIR%\claude-install.cmd"
set "GOT_INSTALLER=0"
call :say "[Claude Code] Fetching the official installer..."

REM Step 1 - download Anthropic's small installer script. curl first (now with
REM the robust .curlrc applied via CURL_HOME), then certutil via the OS HTTP
REM stack as a backstop if curl is missing or blocked.
if "!USE_CURL!"=="1" (
    curl.exe -fsSL -o "!CLAUDE_INSTALLER!" "https://claude.ai/install.cmd" >> "%KIVUN_LOG%" 2>&1
    if not errorlevel 1 if exist "!CLAUDE_INSTALLER!" set "GOT_INSTALLER=1"
)
if "!GOT_INSTALLER!"=="0" (
    call :say "[Claude Code] Primary download failed. Trying the built-in OS downloader..."
    del "!CLAUDE_INSTALLER!" 2>nul
    certutil.exe -urlcache -split -f "https://claude.ai/install.cmd" "!CLAUDE_INSTALLER!" >> "%KIVUN_LOG%" 2>&1
    if not errorlevel 1 if exist "!CLAUDE_INSTALLER!" set "GOT_INSTALLER=1"
)
if "!GOT_INSTALLER!"=="0" (
    call :say "[Claude Code] ERROR: could not download the installer."
    call :say "[Claude Code] Check your internet connection, then install manually from https://claude.ai/download"
    set "EXIT_CODE=3"
    goto :eof
)

REM Step 2 - run it. This is the long part: Anthropic's bootstrap downloads the
REM ~50 MB native claude.exe. Its own curl inherits our robust .curlrc via
REM CURL_HOME, so the schannel reset that used to stall this is now retried /
REM avoided. Tell the user clearly that it takes a moment so a quiet pause never
REM reads as a freeze.
call :say "[Claude Code] Downloading and installing Claude (~50 MB)."
call :say "[Claude Code] This can take a minute or two - please don't close this window..."
cmd /c "!CLAUDE_INSTALLER!" >> "%KIVUN_LOG%" 2>&1
if errorlevel 1 (
    call :say "[Claude Code] ERROR: installation failed. See %KIVUN_LOG%"
    call :say "[Claude Code] You can install manually from https://claude.ai/download"
    set "EXIT_CODE=3"
    goto :eof
)
call :refresh_path
call :say "[Claude Code] Installed."
goto :eof

:install_wt
where wt.exe >nul 2>&1
if not errorlevel 1 (
    call :say "[Windows Terminal] Already installed - skipping."
    goto :eof
)
REM WT is an MSIX/Store package - winget is the only automated method
where winget.exe >nul 2>&1
if errorlevel 1 (
    call :say "[Windows Terminal] winget not available. Install it from the Microsoft Store."
    set "EXIT_CODE=4"
    goto :eof
)
call :say "[Windows Terminal] Installing via winget, please wait..."
cmd /c winget install Microsoft.WindowsTerminal --accept-package-agreements --accept-source-agreements >> "%KIVUN_LOG%" 2>&1
if errorlevel 1 (
    call :say "[Windows Terminal] winget install failed. Install it from the Microsoft Store."
    set "EXIT_CODE=4"
) else (
    call :say "[Windows Terminal] Installed."
)
goto :eof

REM ============================================
REM   Refresh PATH from registry (picks up
REM   changes made by MSI/EXE installers)
REM ============================================
:refresh_path
REM APPEND the registry Path values to the EXISTING PATH rather than replacing
REM it. The registry system Path is a REG_EXPAND_SZ, and "reg query" returns it
REM UNEXPANDED (literal %SystemRoot%\system32 ...). Replacing PATH with that
REM dropped C:\Windows\System32 off the search path, so curl.exe / where.exe
REM stopped working after the first refresh (broke the Claude Code step).
REM Keeping the current PATH first preserves System32; the appended registry
REM entries bring in newly-installed dirs (e.g. C:\Program Files\nodejs, which
REM is stored literally so it resolves fine).
set "SYS_PATH="
set "USR_PATH="
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH set "PATH=!PATH!;!SYS_PATH!"
if defined USR_PATH set "PATH=!PATH!;!USR_PATH!"
goto :eof
