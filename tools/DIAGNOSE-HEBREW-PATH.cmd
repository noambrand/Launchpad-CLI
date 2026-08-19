@echo off
REM ============================================================================
REM  Hebrew / non-English project path - diagnostic
REM
REM  WHY: on one PC, picking a project folder whose path contains Hebrew ends
REM  with "path not found" in the terminal and Claude never starts. The same
REM  flow works on another PC. This collects the evidence needed to tell those
REM  two machines apart, WITHOUT changing anything on this one.
REM
REM  HOW TO USE: double-click this file. It writes a report to your Desktop and
REM  opens it. Send that file back.
REM
REM  Best evidence: FIRST run Launchpad and pick the Hebrew folder so it fails,
REM  THEN double-click this - it inspects the exact path that just failed.
REM ============================================================================
setlocal enabledelayedexpansion

set "OUT=%USERPROFILE%\Desktop\LAUNCHPAD-HEBREW-PATH-REPORT.txt"
set "PATHFILE=%LOCALAPPDATA%\Kivun\kivun-workdir.txt"
set "TMPD=%TEMP%\lp-hebtest"

REM --- capture the codepage BEFORE we touch it (this is the machine default) ---
for /f "tokens=* delims=" %%C in ('chcp') do set "CP_BEFORE=%%C"

> "%OUT%" echo ClaudeCode Launchpad CLI - Hebrew path diagnostic
>>"%OUT%" echo Generated: %DATE% %TIME%
>>"%OUT%" echo ============================================================
>>"%OUT%" echo.
>>"%OUT%" echo [1] MACHINE
>>"%OUT%" echo     Computer      : %COMPUTERNAME%
>>"%OUT%" echo     User          : %USERNAME%
>>"%OUT%" echo     User profile  : %USERPROFILE%
for /f "tokens=* delims=" %%V in ('ver') do >>"%OUT%" echo     Windows       : %%V
>>"%OUT%" echo     Codepage now  : !CP_BEFORE!

REM --- does chcp 65001 actually take on this machine? ---
chcp 65001 >nul 2>&1
for /f "tokens=* delims=" %%C in ('chcp') do set "CP_AFTER=%%C"
>>"%OUT%" echo     After chcp 65001: !CP_AFTER!
>>"%OUT%" echo     ^(if that still does not say 65001, THAT is the bug on this PC^)
>>"%OUT%" echo.

>>"%OUT%" echo [2] TOOLS
where wt.exe   >nul 2>&1 && (>>"%OUT%" echo     Windows Terminal: found) || (>>"%OUT%" echo     Windows Terminal: NOT FOUND - launcher falls back to plain cmd)
where node     >nul 2>&1 && (>>"%OUT%" echo     Node.js         : found) || (>>"%OUT%" echo     Node.js         : NOT FOUND)
where claude   >nul 2>&1 && (>>"%OUT%" echo     claude          : found) || (where claude.cmd >nul 2>&1 && (>>"%OUT%" echo     claude          : found ^(claude.cmd^)) || (>>"%OUT%" echo     claude          : NOT FOUND))
if exist "%LOCALAPPDATA%\Kivun\VERSION" (
    for /f "usebackq delims=" %%V in ("%LOCALAPPDATA%\Kivun\VERSION") do >>"%OUT%" echo     Launchpad ver   : %%V
) else (
    >>"%OUT%" echo     Launchpad ver   : no VERSION file
)
>>"%OUT%" echo     Launcher has the UTF-8 line?
findstr /i /c:"chcp 65001" "%LOCALAPPDATA%\Kivun\claudecode-launchpad.bat" >nul 2>&1 && (>>"%OUT%" echo         YES - claudecode-launchpad.bat sets chcp 65001) || (>>"%OUT%" echo         NO  - claudecode-launchpad.bat is MISSING chcp 65001  ^<== likely cause)
>>"%OUT%" echo.

>>"%OUT%" echo [3] THE PATH THAT WAS LAST PICKED
if not exist "%PATHFILE%" (
    >>"%OUT%" echo     %PATHFILE%
    >>"%OUT%" echo     NOT PRESENT. Run Launchpad, pick the Hebrew folder, let it fail,
    >>"%OUT%" echo     then run this diagnostic again.
) else (
    for %%S in ("%PATHFILE%") do >>"%OUT%" echo     File size: %%~zS bytes
    set "PICKED="
    for /f "usebackq delims=" %%P in ("%PATHFILE%") do set "PICKED=%%P"
    >>"%OUT%" echo     Read back as : !PICKED!
    if exist "!PICKED!" (>>"%OUT%" echo     Folder exists: YES) else (>>"%OUT%" echo     Folder exists: NO  ^<== the path is being mangled)
    REM The single most useful line in this whole report.
    if "!PICKED:~-1!"=="\" (
        >>"%OUT%" echo     Ends with a backslash: YES   ^<== THIS IS THE BUG. A path ending
        >>"%OUT%" echo         in a backslash escapes the closing quote, so Windows Terminal
        >>"%OUT%" echo         is handed a broken command line and reports the path as not
        >>"%OUT%" echo         found. Happens when the picked folder is a drive root such as
        >>"%OUT%" echo         Y:\ or the path was typed with a trailing slash. Already fixed
        >>"%OUT%" echo         in the launcher; this PC needs the updated build.
    ) else (
        >>"%OUT%" echo     Ends with a backslash: no    ^(good - not the trailing-slash bug^)
    )
    >>"%OUT%" echo.
    >>"%OUT%" echo     Raw bytes of the file ^(UTF-8 would show d7/d6 pairs for Hebrew^):
    certutil -encodehex "%PATHFILE%" "%TEMP%\lp-hex.txt" >nul 2>&1
    if exist "%TEMP%\lp-hex.txt" (
        type "%TEMP%\lp-hex.txt" >> "%OUT%"
        del "%TEMP%\lp-hex.txt" >nul 2>&1
    ) else (
        >>"%OUT%" echo     ^(certutil unavailable - byte dump skipped^)
    )
)
>>"%OUT%" echo.

>>"%OUT%" echo [4] LIVE ROUND-TRIP TEST ^(creates a Hebrew-named folder in TEMP^)
REM Build the Hebrew name from raw UTF-8 bytes so this file itself stays ASCII
REM and cannot be corrupted by whatever encoding it is copied around with.
if not exist "%TMPD%" mkdir "%TMPD%" >nul 2>&1
> "%TMPD%\name.hex" echo d7 91 d7 93 d7 99 d7 a7 d7 94 20 d7 a2 d7 91 d7 a8 d7 99 d7 aa
certutil -decodehex "%TMPD%\name.hex" "%TMPD%\name.txt" >nul 2>&1
if not exist "%TMPD%\name.txt" (
    >>"%OUT%" echo     certutil unavailable - live test skipped
    goto :finish
)
set "HEBNAME="
for /f "usebackq delims=" %%N in ("%TMPD%\name.txt") do set "HEBNAME=%%N"
>>"%OUT%" echo     Test folder name read from UTF-8: !HEBNAME!
if not exist "%TMPD%\!HEBNAME!" mkdir "%TMPD%\!HEBNAME!" >nul 2>&1
if exist "%TMPD%\!HEBNAME!" (
    >>"%OUT%" echo     Created + found the folder   : YES  ^(cmd handles the name correctly^)
) else (
    >>"%OUT%" echo     Created + found the folder   : NO   ^<== cmd is mangling UTF-8 here
)

REM Now the exact launcher hand-off: does Windows Terminal accept it as -d ?
where wt.exe >nul 2>&1
if errorlevel 1 (
    >>"%OUT%" echo     Windows Terminal test        : skipped, wt.exe not installed
) else (
    REM The tab drops a marker using a RELATIVE name, so it lands in whatever
    REM folder Windows Terminal actually started in. Checking for that marker
    REM from out here proves the directory WITHOUT printing any Hebrew through
    REM a second codepage - printing it would blank the Hebrew and prove nothing.
    del "%TMPD%\!HEBNAME!\wt-was-here.txt" >nul 2>&1
    start "" wt.exe -w "LPHebTest" new-tab -d "%TMPD%\!HEBNAME!" -- cmd /c "echo marker> wt-was-here.txt"
    REM give Windows Terminal a moment to open the tab and run the command
    ping -n 6 127.0.0.1 >nul 2>&1
    if exist "%TMPD%\!HEBNAME!\wt-was-here.txt" (
        >>"%OUT%" echo     Windows Terminal test        : PASS - it started inside the
        >>"%OUT%" echo                                    Hebrew-named folder correctly.
    ) else (
        >>"%OUT%" echo     Windows Terminal test        : FAIL - wt.exe did NOT start in
        >>"%OUT%" echo                                    that folder. THIS reproduces the
        >>"%OUT%" echo                                    failure.               ^<== key finding
    )
)

REM Same round-trip, but with a TRAILING BACKSLASH on the folder - the exact
REM shape that escapes the closing quote and mangles the whole command line.
where wt.exe >nul 2>&1
if errorlevel 1 (
    >>"%OUT%" echo     Trailing-backslash test      : skipped, wt.exe not installed
) else (
    echo.
    echo   NOTE: the next test deliberately uses a BROKEN path, so Windows Terminal
    echo   will show a red error such as:
    echo       [error 2147942402 ^(0x80070002^) when launching `marker^> wt-slash.txt']
    echo   That error is the POINT of the test - it is the exact failure being chased.
    echo   Nothing is wrong with your PC. Close that tab when it appears.
    echo.
    del "%TMPD%\!HEBNAME!\wt-slash.txt" >nul 2>&1
    start "" wt.exe -w "LPHebTest" new-tab -d "%TMPD%\!HEBNAME!\" -- cmd /c "echo marker> wt-slash.txt"
    ping -n 6 127.0.0.1 >nul 2>&1
    if exist "%TMPD%\!HEBNAME!\wt-slash.txt" (
        >>"%OUT%" echo     Trailing-backslash behaviour : tolerated on this Windows
    ) else (
        >>"%OUT%" echo     Trailing-backslash behaviour : CONFIRMED - a folder path ending
        >>"%OUT%" echo                                    in a backslash breaks the launch.
        >>"%OUT%" echo                                    Windows Terminal shows
        >>"%OUT%" echo                                    "error 0x80070002 ... cannot find
        >>"%OUT%" echo                                    the file specified" - it swallowed
        >>"%OUT%" echo                                    the rest of the command line and
        >>"%OUT%" echo                                    tried to launch the wrong thing.
        >>"%OUT%" echo                                    Seeing that red error here is
        >>"%OUT%" echo                                    EXPECTED and means the test worked.
        >>"%OUT%" echo                                    This is the Windows quoting rule,
        >>"%OUT%" echo                                    NOT a fault of this PC - expect it
        >>"%OUT%" echo                                    on every machine. It only HURTS if
        >>"%OUT%" echo                                    section [3] shows a picked path
        >>"%OUT%" echo                                    that ends in a backslash.
    )
)

:finish
>>"%OUT%" echo.
>>"%OUT%" echo ============================================================
>>"%OUT%" echo Please also paste the EXACT error text you saw in the terminal.
>>"%OUT%" echo Nothing on this PC was changed by this diagnostic.
>>"%OUT%" echo ============================================================

start "" notepad.exe "%OUT%"
endlocal
