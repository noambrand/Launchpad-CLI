@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ============================================
REM   ClaudeCode Launchpad CLI - Dependency Installer
REM   Uses curl.exe (built-in Windows 10 1803+)
REM   Falls back to winget if curl unavailable
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
if "!USE_CURL!"=="0" echo [INFO] curl.exe not found. Will use winget as fallback.

REM --- Create temp directory ---
mkdir "%TEMP_DIR%" 2>nul

REM --- Dispatch to subroutines (each phase's output is appended to KIVUN_LOG
REM     so a failure always leaves a log on disk; NSI runs this with a hidden
REM     console, so nothing useful was visible before). ---
echo.>> "%KIVUN_LOG%"
echo ===== %DATE% %TIME% :: install.cmd %* =====>> "%KIVUN_LOG%"
if "!DO_NODE!"=="1" call :install_node >> "%KIVUN_LOG%" 2>&1
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_GIT!"=="1" call :install_git >> "%KIVUN_LOG%" 2>&1
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_CLAUDE!"=="1" call :install_claude >> "%KIVUN_LOG%" 2>&1
if not "!EXIT_CODE!"=="0" goto :cleanup
if "!DO_WT!"=="1" call :install_wt >> "%KIVUN_LOG%" 2>&1

:cleanup
rmdir /s /q "%TEMP_DIR%" 2>nul
exit /b !EXIT_CODE!

REM ============================================
REM   SUBROUTINES
REM ============================================

:install_node
where node.exe >nul 2>&1
if not errorlevel 1 (
    echo [SKIP] Node.js already installed.
    goto :eof
)
if "!USE_CURL!"=="1" (
    echo [DOWNLOAD] Node.js v%NODE_VERSION%...
    curl.exe -L -o "%TEMP_DIR%\node-setup.msi" "%NODE_URL%" --progress-bar
    if not errorlevel 1 (
        echo [INSTALL] Node.js v%NODE_VERSION% ^(elevated, silent^)...
        REM Node's MSI is per-machine and needs admin. This installer runs
        REM per-user, so a plain "msiexec /qn" returns 1603 (Error 1925).
        REM install-node-elevated.js triggers a single UAC prompt for msiexec
        REM and writes a verbose MSI log to NODE_MSI_LOG.
        cscript.exe //Nologo //B "%~dp0install-node-elevated.js" "%TEMP_DIR%\node-setup.msi" "%NODE_MSI_LOG%"
        set "MSI_RC=!errorlevel!"
        if not "!MSI_RC!"=="0" (
            echo [ERROR] Node.js MSI install failed ^(code !MSI_RC!^). Log: "%NODE_MSI_LOG%"
            if "!MSI_RC!"=="1223" echo         You declined the administrator ^(UAC^) prompt. Node.js needs admin to install.
            set "EXIT_CODE=1"
            goto :eof
        )
        call :refresh_path
        echo [OK] Node.js installed.
        goto :eof
    )
    echo [WARN] curl download failed. Trying winget...
)
where winget.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Neither curl nor winget available. Cannot install Node.js.
    echo         Install manually from https://nodejs.org/
    set "EXIT_CODE=10"
    goto :eof
)
echo [INSTALL] Node.js via winget...
cmd /c winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
call :refresh_path
where node.exe >nul 2>&1
if errorlevel 1 (
    echo [WARN] node.exe not found in PATH after install. May need restart.
) else (
    echo [OK] Node.js installed.
)
goto :eof

:install_git
where git.exe >nul 2>&1
if not errorlevel 1 (
    echo [SKIP] Git already installed.
    goto :eof
)
if "!USE_CURL!"=="1" (
    echo [DOWNLOAD] Git v%GIT_VERSION%...
    curl.exe -L -o "%TEMP_DIR%\git-setup.exe" "%GIT_URL%" --progress-bar
    if not errorlevel 1 (
        echo [INSTALL] Git v%GIT_VERSION% ^(silent^)...
        "%TEMP_DIR%\git-setup.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
        if errorlevel 1 (
            echo [ERROR] Git installer failed.
            set "EXIT_CODE=2"
            goto :eof
        )
        call :refresh_path
        echo [OK] Git installed.
        goto :eof
    )
    echo [WARN] curl download failed. Trying winget...
)
where winget.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Neither curl nor winget available. Cannot install Git.
    echo         Install manually from https://git-scm.com/
    set "EXIT_CODE=10"
    goto :eof
)
echo [INSTALL] Git via winget...
cmd /c winget install Git.Git --accept-package-agreements --accept-source-agreements
call :refresh_path
where git.exe >nul 2>&1
if errorlevel 1 (
    echo [WARN] git.exe not found in PATH after install. May need restart.
) else (
    echo [OK] Git installed.
)
goto :eof

:install_claude
call :refresh_path
where claude.cmd >nul 2>&1
if not errorlevel 1 (
    echo [SKIP] Claude Code already installed.
    goto :eof
)
where claude >nul 2>&1
if not errorlevel 1 (
    echo [SKIP] Claude Code already installed.
    goto :eof
)
set "CLAUDE_INSTALLER=%TEMP_DIR%\claude-install.cmd"
set "GOT_INSTALLER=0"
echo [INSTALL] Claude Code via Anthropic native installer...

REM Attempt 1: curl with retries + revocation tolerance. The bare download died
REM on real PCs behind a TLS-inspecting proxy/AV with schannel errors (curl 35
REM "Connection was reset" / 56 "missing close_notify"). --retry-all-errors
REM rides out transient resets; --ssl-no-revoke skips the CRL/OCSP checks such
REM proxies frequently break.
if "!USE_CURL!"=="1" (
    curl.exe -fsSL --retry 3 --retry-all-errors --retry-delay 2 --ssl-no-revoke -o "!CLAUDE_INSTALLER!" "https://claude.ai/install.cmd"
    if not errorlevel 1 if exist "!CLAUDE_INSTALLER!" set "GOT_INSTALLER=1"
)

REM Attempt 2: certutil — uses the OS HTTP stack (WinINET / system proxy), the
REM same path winget used successfully when curl was being reset on this network
REM (see :install_node fallback). Built into every Windows; no PowerShell, no
REM extra prerequisites.
if "!GOT_INSTALLER!"=="0" (
    echo [WARN] curl download failed. Trying certutil ^(OS HTTP stack^)...
    del "!CLAUDE_INSTALLER!" 2>nul
    certutil.exe -urlcache -split -f "https://claude.ai/install.cmd" "!CLAUDE_INSTALLER!" >nul 2>&1
    if not errorlevel 1 if exist "!CLAUDE_INSTALLER!" set "GOT_INSTALLER=1"
)

if "!GOT_INSTALLER!"=="0" (
    echo [ERROR] Could not download Claude Code installer ^(curl + certutil both failed^).
    echo         A proxy, firewall, or antivirus may be blocking the connection.
    echo         Install manually from https://claude.ai/download
    set "EXIT_CODE=3"
    goto :eof
)
cmd /c "!CLAUDE_INSTALLER!"
if errorlevel 1 (
    echo [ERROR] Claude Code installation failed.
    set "EXIT_CODE=3"
    goto :eof
)
call :refresh_path
echo [OK] Claude Code installed.
goto :eof

:install_wt
where wt.exe >nul 2>&1
if not errorlevel 1 (
    echo [SKIP] Windows Terminal already installed.
    goto :eof
)
REM WT is an MSIX/Store package — winget is the only automated method
where winget.exe >nul 2>&1
if errorlevel 1 (
    echo [WARN] winget not available. Install Windows Terminal from the Microsoft Store.
    set "EXIT_CODE=4"
    goto :eof
)
echo [INSTALL] Windows Terminal via winget...
cmd /c winget install Microsoft.WindowsTerminal --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo [WARN] winget install failed. Install Windows Terminal from the Microsoft Store.
    set "EXIT_CODE=4"
) else (
    echo [OK] Windows Terminal installed.
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
