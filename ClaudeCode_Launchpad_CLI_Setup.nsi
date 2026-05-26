; ClaudeCode Launchpad CLI v2.0.0 - Professional Installer
; Claude Code installer for Windows
; Encoding: UTF-8

Unicode True

!define PRODUCT_NAME "ClaudeCode Launchpad CLI"
!define PRODUCT_VERSION "2.6.10"
!define PRODUCT_PUBLISHER "Noam Brand"
!define PRODUCT_WEB_SITE "https://github.com"
!define PRODUCT_DESCRIPTION "Claude Code installer for Windows"
!define PRODUCT_SUBTITLE "Automatic installation, light blue terminal, folder shortcuts"
!define INSTALL_DIR "$LOCALAPPDATA\Kivun"

; Modern UI
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"


; Per-user install — no admin needed. Everything lands under
; %LOCALAPPDATA%\Kivun, HKCU registry, and the user's desktop.
; Previous releases requested admin and wrote to HKLM/HKCR; that broke
; under "over-the-shoulder" UAC because $LOCALAPPDATA then resolved to
; the elevating admin's profile, not the invoking user's. Fixed v2.6.4.
RequestExecutionLevel user

; Installer settings
Name "${PRODUCT_NAME}"
OutFile "ClaudeCode_Launchpad_CLI_Setup.exe"
InstallDir "${INSTALL_DIR}"
ShowInstDetails show

; Version info
VIProductVersion "2.6.10.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_DESCRIPTION}"
VIAddVersionKey "FileVersion" "2.6.10.0"
VIAddVersionKey "LegalCopyright" "(C) 2026 ${PRODUCT_PUBLISHER}"

; Modern UI Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "source\claude_icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH

; Welcome page
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "This installer will set up ${PRODUCT_NAME} on your computer.$\r$\n$\r$\n${PRODUCT_DESCRIPTION}$\r$\n$\r$\nWhat will be installed:$\r$\n  - Claude Code (via Anthropic native installer)$\r$\n  - Node.js (for statusline display)$\r$\n  - Windows Terminal (recommended)$\r$\n  - Git (optional)$\r$\n$\r$\nFeatures:$\r$\n  - Light blue terminal color scheme$\r$\n  - Folder shortcuts and right-click integration$\r$\n  - One-click launch from desktop$\r$\n$\r$\nClick Next to continue."
!insertmacro MUI_PAGE_WELCOME

; Configuration page
Page custom ConfigPage ConfigPageLeave

; Components page
!insertmacro MUI_PAGE_COMPONENTS

; Directory page
!insertmacro MUI_PAGE_DIRECTORY

; Installation page
!insertmacro MUI_PAGE_INSTFILES

; Finish page
!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} Installation Complete!"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been installed successfully.$\r$\n$\r$\n${PRODUCT_DESCRIPTION}$\r$\n$\r$\nTIP: Pin it to your taskbar for one-click access — click Start, type '${PRODUCT_NAME}', right-click the result and choose 'Pin to taskbar'. No need to hunt for the desktop icon.$\r$\n$\r$\nYou will need an Anthropic API key to use Claude Code.$\r$\nGet one at: https://console.anthropic.com/"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Create Desktop Shortcut"
!define MUI_FINISHPAGE_RUN_FUNCTION CreateDesktopShortcut
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\QUICK_START.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "View Quick Start Guide"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Variables
Var ConfigLanguage
Var ConfigUsername
Var ConfigTerminalColor

; Pre-install warning: remind users to finish active CLI sessions
Function .onInit
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
    "Before installing ${PRODUCT_NAME}:$\r$\n$\r$\nIf you have any active Claude Code or terminal (CLI) sessions running, it is strongly advised to finish your work and close them now.$\r$\n$\r$\nThe installer may update Claude Code, Node.js, or Windows Terminal, which can interrupt running sessions and close terminal windows.$\r$\n$\r$\n  - Click OK to continue the installation.$\r$\n  - Click Cancel to abort so you can save your work first." \
    /SD IDOK IDOK continueInstall
  Abort
  continueInstall:
FunctionEnd

; Configuration page
Function ConfigPage
  !insertmacro MUI_HEADER_TEXT "Configuration" "Choose your display name and language preference"

nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Display name
  ${NSD_CreateLabel} 0 0 100% 12u "Your name (for display purposes):"
  Pop $0
  ${NSD_CreateText} 0 15u 100% 12u ""
  Pop $ConfigUsername

  ; Language selection
  ${NSD_CreateLabel} 0 40u 100% 12u "Claude Code response language:"
  Pop $0

  ${NSD_CreateDropList} 0 55u 100% 200u ""
  Pop $ConfigLanguage
  ${NSD_CB_AddString} $ConfigLanguage "English"
  ${NSD_CB_AddString} $ConfigLanguage "Hebrew"
  ${NSD_CB_AddString} $ConfigLanguage "Arabic"
  ${NSD_CB_AddString} $ConfigLanguage "Persian"
  ${NSD_CB_AddString} $ConfigLanguage "Urdu"
  ${NSD_CB_AddString} $ConfigLanguage "Kurdish"
  ${NSD_CB_AddString} $ConfigLanguage "Pashto"
  ${NSD_CB_AddString} $ConfigLanguage "Sindhi"
  ${NSD_CB_AddString} $ConfigLanguage "Yiddish"
  ${NSD_CB_AddString} $ConfigLanguage "Syriac"
  ${NSD_CB_AddString} $ConfigLanguage "Dhivehi"
  ${NSD_CB_AddString} $ConfigLanguage "NKo"
  ${NSD_CB_AddString} $ConfigLanguage "Adlam"
  ${NSD_CB_AddString} $ConfigLanguage "Mandaic"
  ${NSD_CB_AddString} $ConfigLanguage "Samaritan"
  ${NSD_CB_AddString} $ConfigLanguage "Dari"
  ${NSD_CB_AddString} $ConfigLanguage "Uyghur"
  ${NSD_CB_AddString} $ConfigLanguage "Balochi"
  ${NSD_CB_AddString} $ConfigLanguage "Kashmiri"
  ${NSD_CB_AddString} $ConfigLanguage "Shahmukhi"
  ${NSD_CB_AddString} $ConfigLanguage "Azeri South"
  ${NSD_CB_AddString} $ConfigLanguage "Jawi"
  ${NSD_CB_AddString} $ConfigLanguage "Hausa Ajami"
  ${NSD_CB_AddString} $ConfigLanguage "Rohingya"
  ${NSD_CB_AddString} $ConfigLanguage "Turoyo"
  ${NSD_CB_SelectString} $ConfigLanguage "English"

  ; Terminal color theme checkbox
  ${NSD_CreateCheckbox} 0 95u 100% 12u "Apply Kivun light-blue terminal theme (recommended)"
  Pop $ConfigTerminalColor
  ${NSD_Check} $ConfigTerminalColor

nsDialogs::Show
FunctionEnd

Function ConfigPageLeave
  ${NSD_GetText} $ConfigLanguage $ConfigLanguage
  ${NSD_GetText} $ConfigUsername $ConfigUsername
  ${NSD_GetState} $ConfigTerminalColor $ConfigTerminalColor
FunctionEnd

; Installation sections
Section "!Core Components (Required)" SecCore
  SectionIn RO  ; Read-only, cannot be deselected

  ; Hardening (v2.6.8): close any launcher window left running from a previous
  ; build BEFORE we overwrite files. An open mshta window only runs its update
  ; check once at load, so without this an upgraded user keeps seeing the OLD
  ; build's "update available" banner until they happen to relaunch. Extract
  ; the closer to the temp plugins dir so it runs even on a first install (and
  ; before $INSTDIR is touched); it is best-effort and never blocks the install.
  InitPluginsDir
  File "/oname=$PLUGINSDIR\close-launchers.js" "source\close-launchers.js"
  nsExec::Exec 'cscript.exe //B //Nologo "$PLUGINSDIR\close-launchers.js"'
  Pop $0

  SetOutPath "$INSTDIR"

  ; Copy essential files from source/
  File "source\claude_icon.ico"
  File "source\config.txt"
  File "source\claudecode-launchpad.bat"
  File "source\folder-picker-launcher.wsf"
  File "source\folder-picker.hta"
  File "source\write-path.js"
  File "source\write-startcmd.js"
  File "source\inject-startup-cmd.js"
  File "source\save-defaults.js"
  File "source\post-install.bat"
  File "source\claudecode-launchpad-wt-fragment.json"
  File "source\claudecode-launchpad-wt-fragment-nocolor.json"
  File "source\apply-wt-settings.js"
  File "source\statusline.mjs"
  File "source\configure-statusline.js"
  File "source\install.cmd"
  File "source\fix-wt-icon.hta"
  File "source\close-launchers.js"

  ; Copy documentation
  File "source\FIX_WT_ICON_README.txt"
  File "README.md"
  File "docs\QUICK_START.md"
  File "docs\CHANGELOG.md"

  ; Create config.txt with user preferences
  Delete "$INSTDIR\config.txt"
  FileOpen $0 "$INSTDIR\config.txt" w
  FileWrite $0 "# ClaudeCode Launchpad CLI Configuration$\r$\n"
  FileWrite $0 "# Claude Code response language$\r$\n"
  FileWrite $0 "#$\r$\n"
  FileWrite $0 "# Options: english, hebrew, arabic, persian, urdu, kurdish, pashto, sindhi, yiddish, syriac, dhivehi, nko, adlam, mandaic, samaritan, dari, uyghur, balochi, kashmiri, shahmukhi, azeri_south, jawi, hausa_ajami, rohingya, turoyo$\r$\n"
  FileWrite $0 "# Default: english$\r$\n"

  ${If} $ConfigLanguage == "Hebrew"
    FileWrite $0 "RESPONSE_LANGUAGE=hebrew$\r$\n"
  ${ElseIf} $ConfigLanguage == "Arabic"
    FileWrite $0 "RESPONSE_LANGUAGE=arabic$\r$\n"
  ${ElseIf} $ConfigLanguage == "Persian"
    FileWrite $0 "RESPONSE_LANGUAGE=persian$\r$\n"
  ${ElseIf} $ConfigLanguage == "Urdu"
    FileWrite $0 "RESPONSE_LANGUAGE=urdu$\r$\n"
  ${ElseIf} $ConfigLanguage == "Kurdish"
    FileWrite $0 "RESPONSE_LANGUAGE=kurdish$\r$\n"
  ${ElseIf} $ConfigLanguage == "Pashto"
    FileWrite $0 "RESPONSE_LANGUAGE=pashto$\r$\n"
  ${ElseIf} $ConfigLanguage == "Sindhi"
    FileWrite $0 "RESPONSE_LANGUAGE=sindhi$\r$\n"
  ${ElseIf} $ConfigLanguage == "Yiddish"
    FileWrite $0 "RESPONSE_LANGUAGE=yiddish$\r$\n"
  ${ElseIf} $ConfigLanguage == "Syriac"
    FileWrite $0 "RESPONSE_LANGUAGE=syriac$\r$\n"
  ${ElseIf} $ConfigLanguage == "Dhivehi"
    FileWrite $0 "RESPONSE_LANGUAGE=dhivehi$\r$\n"
  ${ElseIf} $ConfigLanguage == "NKo"
    FileWrite $0 "RESPONSE_LANGUAGE=nko$\r$\n"
  ${ElseIf} $ConfigLanguage == "Adlam"
    FileWrite $0 "RESPONSE_LANGUAGE=adlam$\r$\n"
  ${ElseIf} $ConfigLanguage == "Mandaic"
    FileWrite $0 "RESPONSE_LANGUAGE=mandaic$\r$\n"
  ${ElseIf} $ConfigLanguage == "Samaritan"
    FileWrite $0 "RESPONSE_LANGUAGE=samaritan$\r$\n"
  ${ElseIf} $ConfigLanguage == "Dari"
    FileWrite $0 "RESPONSE_LANGUAGE=dari$\r$\n"
  ${ElseIf} $ConfigLanguage == "Uyghur"
    FileWrite $0 "RESPONSE_LANGUAGE=uyghur$\r$\n"
  ${ElseIf} $ConfigLanguage == "Balochi"
    FileWrite $0 "RESPONSE_LANGUAGE=balochi$\r$\n"
  ${ElseIf} $ConfigLanguage == "Kashmiri"
    FileWrite $0 "RESPONSE_LANGUAGE=kashmiri$\r$\n"
  ${ElseIf} $ConfigLanguage == "Shahmukhi"
    FileWrite $0 "RESPONSE_LANGUAGE=shahmukhi$\r$\n"
  ${ElseIf} $ConfigLanguage == "Azeri South"
    FileWrite $0 "RESPONSE_LANGUAGE=azeri_south$\r$\n"
  ${ElseIf} $ConfigLanguage == "Jawi"
    FileWrite $0 "RESPONSE_LANGUAGE=jawi$\r$\n"
  ${ElseIf} $ConfigLanguage == "Hausa Ajami"
    FileWrite $0 "RESPONSE_LANGUAGE=hausa_ajami$\r$\n"
  ${ElseIf} $ConfigLanguage == "Rohingya"
    FileWrite $0 "RESPONSE_LANGUAGE=rohingya$\r$\n"
  ${ElseIf} $ConfigLanguage == "Turoyo"
    FileWrite $0 "RESPONSE_LANGUAGE=turoyo$\r$\n"
  ${Else}
    FileWrite $0 "RESPONSE_LANGUAGE=english$\r$\n"
  ${EndIf}

  FileWrite $0 "# Terminal color theme$\r$\n"
  FileWrite $0 "# Options: kivun (light-blue), default (keep your terminal theme)$\r$\n"
  ${If} $ConfigTerminalColor == ${BST_CHECKED}
    FileWrite $0 "TERMINAL_COLOR=kivun$\r$\n"
  ${Else}
    FileWrite $0 "TERMINAL_COLOR=default$\r$\n"
  ${EndIf}

  FileWrite $0 "# Claude startup flags (optional, applied on every launch)$\r$\n"
  FileWrite $0 "# Example: CLAUDE_FLAGS=--continue --model opus --enable-auto-mode$\r$\n"
  FileWrite $0 "CLAUDE_FLAGS=$\r$\n"

  FileWrite $0 "# Default startup command auto-typed into Claude after the TUI loads$\r$\n"
  FileWrite $0 "# Example: STARTUP_CMD=/voicemode:converse$\r$\n"
  FileWrite $0 "# Leave empty to skip. Do NOT put passwords here (typed visibly).$\r$\n"
  FileWrite $0 "STARTUP_CMD=$\r$\n"

  FileClose $0

  ; Single source of truth for the self-reported version (v2.6.8). The launcher
  ; HTA reads this file first and only falls back to its hardcoded
  ; FALLBACK_VERSION when the file is absent, so the "you have vX" banner figure
  ; always matches what was actually installed - even if the HTA constant is
  ; ever left un-bumped. No trailing newline; readInstalledVersion() trims.
  Delete "$INSTDIR\VERSION"
  FileOpen $0 "$INSTDIR\VERSION" w
  FileWrite $0 "${PRODUCT_VERSION}"
  FileClose $0

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "wscript.exe" '"$INSTDIR\folder-picker-launcher.wsf"' "$INSTDIR\claude_icon.ico" 0 SW_SHOWNORMAL "" "${PRODUCT_DESCRIPTION}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Configuration.lnk" "notepad.exe" "$INSTDIR\config.txt" "" 0 SW_SHOWNORMAL "" "Configure language settings"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "" 0 SW_SHOWNORMAL "" "Uninstall ${PRODUCT_NAME}"

  ; Clean up THIS product's own old-name ("Kivun") ARP entry + legacy
  ; Windows Terminal fragment. HKCU keys clean reliably under user-level
  ; execution; HKLM is best-effort and will silently no-op without admin.
  ;
  ; IMPORTANT: do NOT touch "Kivun Terminal" / "KivunTerminal" entries.
  ; Those now belong to a SEPARATE, still-installed product (the WSL-based
  ; Kivun Terminal in ../kivun-terminal-wsl), which legitimately creates
  ; "$DESKTOP\Kivun Terminal.lnk" and the HKCU "...Directory\shell\KivunTerminal"
  ; right-click keys. Deleting them here was wiping that product's desktop
  ; shortcut and context menu whenever this installer ran. The two products
  ; coexist: this one uses the "ClaudeCodeLaunchpad" namespace, that one uses
  ; "KivunTerminal". Keep them strictly separate.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kivun"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kivun"
  RMDir /r "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\KivunTerminal"

  ; Create Desktop shortcut
  CreateShortCut "$DESKTOP\ClaudeCode Launchpad CLI.lnk" "wscript.exe" '"$INSTDIR\folder-picker-launcher.wsf"' "$INSTDIR\claude_icon.ico" 0 SW_SHOWNORMAL "" "${PRODUCT_DESCRIPTION}"

  ; Create SendTo shortcut
  CreateShortCut "$SENDTO\ClaudeCode Launchpad CLI.lnk" "$INSTDIR\claudecode-launchpad.bat" "" "$INSTDIR\claude_icon.ico" 0 SW_SHOWNORMAL "" "Open with ClaudeCode Launchpad CLI"

  ; Write registry for Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "DisplayIcon" "$INSTDIR\claude_icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "HelpLink" "${PRODUCT_WEB_SITE}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad" "NoRepair" 1

  ; Add right-click context menu for folders: "Open with ClaudeCode Launchpad CLI"
  WriteRegStr HKCU "Software\Classes\Directory\shell\ClaudeCodeLaunchpad" "" "Open with ClaudeCode Launchpad CLI"
  WriteRegStr HKCU "Software\Classes\Directory\shell\ClaudeCodeLaunchpad" "Icon" "$INSTDIR\claude_icon.ico"
  WriteRegStr HKCR "Directory\shell\ClaudeCodeLaunchpad\command" "" '"$INSTDIR\claudecode-launchpad.bat" "%1"'

  ; Also add to directory background (right-click inside a folder)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\ClaudeCodeLaunchpad" "" "Open ClaudeCode Launchpad CLI here"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\ClaudeCodeLaunchpad" "Icon" "$INSTDIR\claude_icon.ico"
  WriteRegStr HKCR "Directory\Background\shell\ClaudeCodeLaunchpad\command" "" '"$INSTDIR\claudecode-launchpad.bat" "%V"'

  ; Install Windows Terminal fragment
  CreateDirectory "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\ClaudeCodeLaunchpad"
  ${If} $ConfigTerminalColor == ${BST_CHECKED}
    CopyFiles /SILENT "$INSTDIR\claudecode-launchpad-wt-fragment.json" "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\ClaudeCodeLaunchpad\claudecode-launchpad-wt-fragment.json"
  ${Else}
    CopyFiles /SILENT "$INSTDIR\claudecode-launchpad-wt-fragment-nocolor.json" "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\ClaudeCodeLaunchpad\claudecode-launchpad-wt-fragment.json"
  ${EndIf}

  ; Set CLAUDE_CODE_STATUSLINE environment variable (per-user, persists)
  ; Per-user (HKCU\Environment) instead of system-wide (HKLM) since we no
  ; longer require admin and the install dir is in the user's profile.
  DetailPrint "Setting CLAUDE_CODE_STATUSLINE environment variable..."
  WriteRegExpandStr HKCU "Environment" "CLAUDE_CODE_STATUSLINE" "$INSTDIR\statusline.mjs"
  ; Broadcast WM_SETTINGCHANGE so running processes pick it up
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

SectionEnd

Section "!Install Node.js (Required)" SecNodeJS
  SectionIn RO  ; Read-only, cannot be deselected

  DetailPrint "Installing Node.js via install.cmd (curl + winget fallback)..."
  ExecWait 'cmd /c "$INSTDIR\install.cmd" /node' $0
  DetailPrint "install.cmd /node exit code: $0"

  ${If} $0 == 10
    MessageBox MB_OK "Node.js could not be installed: neither curl nor winget available.$\n$\nPlease install Node.js manually from https://nodejs.org/"
  ${ElseIf} $0 != 0
    MessageBox MB_OK "Node.js installation may have failed (exit code: $0).$\n$\nYou can install Node.js manually from https://nodejs.org/"
  ${EndIf}

  ; Verify
  nsExec::ExecToStack 'where node.exe'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Node.js verified in PATH"
  ${Else}
    DetailPrint "WARNING: node.exe not found in PATH after install - may need restart"
  ${EndIf}
SectionEnd

Section "!Install Claude Code (Required)" SecClaudeCode
  SectionIn RO  ; Read-only, cannot be deselected

  DetailPrint "Installing Claude Code via install.cmd..."
  ExecWait 'cmd /c "$INSTDIR\install.cmd" /claude' $0
  DetailPrint "install.cmd /claude exit code: $0"

  ${If} $0 != 0
    DetailPrint "WARNING: Claude Code installation may have failed"
    MessageBox MB_OK "Claude Code installation may have failed.$\n$\nYou can install it manually from:$\nhttps://claude.ai/download"
  ${Else}
    DetailPrint "Claude Code installed successfully"
  ${EndIf}

  ; Verify
  nsExec::ExecToStack 'where claude.cmd'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Claude Code verified: claude command found"
  ${Else}
    nsExec::ExecToStack 'where claude'
    Pop $0
    ${If} $0 == 0
      DetailPrint "Claude Code verified: claude command found"
    ${Else}
      DetailPrint "WARNING: claude command not found in PATH - may need restart"
    ${EndIf}
  ${EndIf}

  ; Configure statusline in Claude Code settings.json
  DetailPrint "Configuring Claude Code statusline..."
  nsExec::ExecToLog 'node "$INSTDIR\configure-statusline.js" "$INSTDIR\statusline.mjs"'
  Pop $0
  ${If} $0 == 0
    DetailPrint "Statusline configured in Claude Code settings"
  ${Else}
    DetailPrint "WARNING: Could not configure statusline in settings (exit code: $0)"
  ${EndIf}

  ; Apply Noam color scheme directly to WT settings (only when theme is enabled)
  ${If} $ConfigTerminalColor == ${BST_CHECKED}
    DetailPrint "Applying Windows Terminal color scheme..."
    nsExec::ExecToLog 'node "$INSTDIR\apply-wt-settings.js"'
    Pop $0
  ${EndIf}
SectionEnd

Section "Install Windows Terminal (Recommended)" SecWindowsTerminal
  DetailPrint "Installing Windows Terminal via install.cmd..."
  ExecWait 'cmd /c "$INSTDIR\install.cmd" /wt' $0
  DetailPrint "install.cmd /wt exit code: $0"

  ${If} $0 == 4
    MessageBox MB_OK "Could not install Windows Terminal automatically.$\n$\nPlease install it from the Microsoft Store:$\nSearch for 'Windows Terminal'$\n$\nClaudeCode Launchpad CLI will fall back to cmd.exe until Windows Terminal is installed."
  ${EndIf}
SectionEnd

Section "Install Git (Optional)" SecGit
  DetailPrint "Installing Git via install.cmd..."
  ExecWait 'cmd /c "$INSTDIR\install.cmd" /git' $0
  DetailPrint "install.cmd /git exit code: $0"

  ${If} $0 == 10
    MessageBox MB_OK "Git could not be installed: neither curl nor winget available.$\n$\nPlease install Git manually from https://git-scm.com/"
  ${ElseIf} $0 != 0
    DetailPrint "Git installation issue (exit code: $0)"
  ${EndIf}
SectionEnd

; Section descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore} "Core files: launcher scripts, shortcuts, configuration, and Windows Terminal profile."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecNodeJS} "Node.js runtime (required for statusline display). Skipped if already installed."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecClaudeCode} "Claude Code CLI tool (installed via Anthropic native installer)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecWindowsTerminal} "Windows Terminal with light blue color scheme. Falls back to cmd.exe if not installed."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecGit} "Git version control (optional, for development workflows)."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; Desktop shortcut creation function (called from finish page)
Function CreateDesktopShortcut
  ; Do NOT delete "$DESKTOP\Kivun Terminal.lnk" — that belongs to the
  ; separate WSL Kivun Terminal product. Only create our own shortcut.
  CreateShortCut "$DESKTOP\ClaudeCode Launchpad CLI.lnk" "wscript.exe" '"$INSTDIR\folder-picker-launcher.wsf"' "$INSTDIR\claude_icon.ico" 0 SW_SHOWNORMAL "" "${PRODUCT_DESCRIPTION}"
FunctionEnd

; Uninstaller
Section "Uninstall"
  ; Close any running launcher window first so its files aren't held open
  ; while we delete $INSTDIR (best-effort; the closer is still present here,
  ; it is removed by the RMDir below). See CHANGELOG v2.6.8.
  nsExec::Exec 'cscript.exe //B //Nologo "$INSTDIR\close-launchers.js"'
  Pop $0

  ; Remove install directory
  RMDir /r "$INSTDIR"

  ; Remove Start Menu shortcuts
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

  ; Remove Desktop shortcut. Only this product's own shortcut — NOT
  ; "Kivun Terminal.lnk", which belongs to the separate WSL Kivun Terminal
  ; product and must survive uninstalling this one.
  Delete "$DESKTOP\ClaudeCode Launchpad CLI.lnk"

  ; Remove SendTo shortcut (this product only)
  Delete "$SENDTO\ClaudeCode Launchpad CLI.lnk"

  ; Remove this product's own old-name ("Kivun") ARP entry + legacy WT
  ; fragment. Do NOT delete "KivunTerminal" / "Kivun Terminal" entries —
  ; they belong to the separate, still-installed WSL Kivun Terminal product.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kivun"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kivun"
  RMDir /r "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\KivunTerminal"

  ; Remove registry entries - Add/Remove Programs
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeCodeLaunchpad"

  ; Remove context menu entries
  DeleteRegKey HKCU "Software\Classes\Directory\shell\ClaudeCodeLaunchpad"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\ClaudeCodeLaunchpad"
  DeleteRegKey HKCR "Directory\shell\ClaudeCodeLaunchpad"
  DeleteRegKey HKCR "Directory\Background\shell\ClaudeCodeLaunchpad"

  ; Remove Windows Terminal fragment
  RMDir /r "$LOCALAPPDATA\Microsoft\Windows Terminal\Fragments\ClaudeCodeLaunchpad"

  ; Remove CLAUDE_CODE_STATUSLINE environment variable (HKCU first; the
  ; legacy HKLM SYSTEM-wide value from v2.6.3-and-older requires admin).
  DeleteRegValue HKCU "Environment" "CLAUDE_CODE_STATUSLINE"
  DeleteRegValue HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "CLAUDE_CODE_STATUSLINE"
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

SectionEnd
