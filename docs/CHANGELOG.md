# Changelog

## [2.6.3] - 2026-05-08

### Doc/version consistency sweep across bundled .txt files

User feedback: *"the txt has the old version noted, all txt should have the updated txt version number to prevent confusion. every release needs to check consistency for all documents and github notes on read me and release notes."*

- **`START_HERE.txt`** — header banner bumped from `ClaudeCode Launchpad CLI v2.0.1` to `v2.6.3`. The file ships inside the installer (visible to first-time users opening the install dir), so a stale "v2.0.1" header was misleading them.
- **`README.md`** — version cachebust query `cb=v2.6.2` → `v2.6.3` so shields.io re-fetches version + downloads badges.
- **`source/folder-picker.hta`** — `FALLBACK_VERSION = "2.6.2"` → `"2.6.3"`.
- **`ClaudeCode_Launchpad_CLI_Setup.nsi`** — `PRODUCT_VERSION` 2.6.2 → 2.6.3; `VIProductVersion` and `FileVersion` → 2.6.3.0.

### Process change

Going forward: every release scans `git ls-files` for stale version refs (any `v2.X.Y` older than the upcoming tag) in `*.txt` and `*.md` files BEFORE the tag is pushed. CI doesn't enforce this yet — it's a manual checklist item until a workflow validates it. The reason this slipped on v2.6.2: I bumped `.nsi PRODUCT_VERSION` and `docs/CHANGELOG.md` at release time but never grep'd the rest of the tree.


## [2.6.2] - 2026-05-08

### Update-available banner in the picker + table fixes + bigger collapsed window

User feedback after v2.6.1: comparison-table parenthetical in the README was missing `+ startup slash-commands` (the WSL sister repo had the full feature list, this one was clipped), and the picker should detect when a newer release is available and offer one-click download.

- **`source/folder-picker.hta`** — new yellow banner at the top of the picker (above the profile chip row) that reads *"🆕 Update available: vX.Y.Z (you have vA.B.C) — release notes — [Download vX.Y.Z]"*. Banner appears only when `compareVersions(latestTag, installed) > 0`. Hidden by default; rendered only after a successful API check. Has a `✕` dismiss button (hides until next launch) and a "release notes" link to the GitHub release page. The `Download` button shells out via `WSHShell.Run` to the asset URL — opens in the user's default browser, which starts downloading `ClaudeCode_Launchpad_CLI_Setup.exe` immediately.
- **`source/folder-picker.hta`** — new helpers: `readInstalledVersion()` (reads `installDir\VERSION`, falls back to a hardcoded `FALLBACK_VERSION = "2.6.2"` since this repo's `.nsi` doesn't yet write the file at install time); `compareVersions(a, b)` (numeric tuple compare); `checkForUpdate()` (synchronous `WinHttp.WinHttpRequest.5.1` GET against `https://api.github.com/repos/noambrand/kivun-terminal/releases/latest` with 5 s timeouts, picks the asset matching `/^ClaudeCode_Launchpad_CLI_Setup\.exe$/i`). All errors swallowed silently. The check is deferred via `setTimeout(checkForUpdate, 100)` from `init()` so the picker renders before the sync HTTP call blocks the UI thread.
- **`source/folder-picker.hta`** — collapsed-window height bumped from 615 px to 690 px so the optional update-banner fits without triggering scrollbars when shown.
- **`README.md`** — comparison table parentheticals at lines 48 and 61 updated from `(folder + model + flags + env vars)` to `(folder + model + flags + env vars + startup slash-commands)` to match the actual feature list and the WSL sister repo's table.
- **`ClaudeCode_Launchpad_CLI_Setup.nsi`** — `PRODUCT_VERSION` 2.6.1 → 2.6.2; `VIProductVersion` and `FileVersion` → 2.6.2.0.

### Why FALLBACK_VERSION exists

The picker reads `VERSION` from `installDir` to know what's installed. This `.nsi` doesn't currently write a `VERSION` file at install time (unlike the kivun-terminal-wsl sister), so on every install `readInstalledVersion()` falls back to the constant baked into the HTA. That means the "you have vX.Y.Z" line in the banner reflects the **picker's** version, not the original installer's — close enough until the .nsi grows a `FileWrite "${INSTDIR}\VERSION" "${PRODUCT_VERSION}"` line in a follow-up.


## [2.6.1] - 2026-05-07

### Collapse Advanced section in picker + fix sticky `--continue` bug

User feedback after v2.6.0: the picker's five-section layout (model / flags / startup-cmds / env-vars on top of folder selection) was overwhelming for first-time users, and a separate report that right-clicking a folder via the desktop shortcut crashed Claude with `No conversation found to continue` even when the user hadn't asked for `--continue`.

- **`source/folder-picker.hta`** — sections 3 (Claude flags), 4 (startup slash commands), 5 (environment variables) wrapped in a collapsible `<div id="advanced-body">` toggled by a single button labelled `▶ Advanced options — click to show model, flags, startup slash commands, env vars`. Default state is collapsed regardless of profile content. Window opens at a compact 615 px and grows to fit content when the toggle is clicked (`autoSizeToContent` switches between fixed 615 px collapsed and dynamic `scrollHeight + 60` expanded; HTA's scrollHeight measurement is unreliable when content is `display:none`, so the collapsed branch hardcodes the value rather than measuring).
- **`source/folder-picker.hta`** — new `composeFlagsForConfig()` helper used in the `writeFlagsToConfig` call. It excludes `--continue` and `--resume` (the two values from the `flag-conv` radio group). `composeFlags()` still includes them for the live preview and the actual launch. The reason: right-click "Open with ClaudeCode Launchpad CLI" reads `CLAUDE_FLAGS` from `config.txt` and runs `claude` with those flags in the chosen folder; if a previous picker session set `flag-conv=Continue last`, the resulting `CLAUDE_FLAGS=--continue` line poisoned every right-click launch on a folder with no prior session. Conversation flags are now per-launch only — they affect the current click but never become sticky.
- **`ClaudeCode_Launchpad_CLI_Setup.nsi`** — `PRODUCT_VERSION` 2.6.0 → 2.6.1; `VIProductVersion` and `FileVersion` → 2.6.1.0.


## [2.6.0] - 2026-05-06

### Named profiles + per-profile env vars (parity with kivun-terminal-wsl v1.4.x)

The picker dialog grows a **profile bar** (chip row) at the top so users with multiple projects can save folder + model + flags + startup commands + env vars as named combos and switch between them with one click. Direct port of the v1.4.x feature from the kivun-terminal-wsl sibling, adapted for Launchpad CLI's no-WSL-boundary architecture.

#### Added

- **`source/folder-picker.hta`** — top-of-dialog profile chip row (one chip per saved profile, active highlighted blue). `+ New` saves the current dialog state as a new named profile; `Rename` and `Delete` manage existing ones (Default is undeletable, auto-rebuilds from `config.txt` if `profiles.json` is missing). New §5 for `KEY=VAL` environment variables (one per line, `#` comments allowed, KEY validated as `[A-Za-z_][A-Za-z0-9_]*`). Resolved-command preview rebuilt: shows the full `$ claude <flags>` line plus secondary lines for startup-cmds and env-vars (`↳ then types: …`, `↳ with env (masked): KEY=…(set), …`). Env values **masked by default** for screenshot safety; `👁 show values` toggle reveals them. Profiles persist to `%LOCALAPPDATA%\Kivun\profiles.json`.
- **`source/claudecode-launchpad.bat`** — env-var loading block before the `claude` invocation. Reads `%LOCALAPPDATA%\Kivun\kivun-env.txt` (written by the picker on Launch) and `set`s each `KEY=VAL` in cmd scope. Unlike kivun-terminal-wsl, **no `WSLENV` plumbing needed** — Launchpad CLI runs natively on Windows so cmd-set env vars reach the spawned `claude` process directly.

#### Changed

- **`source/folder-picker.hta`** — chip rendering uses `innerHTML` with inline `onclick` attributes instead of `createElement + .onclick` (the latter is unreliable for dynamically-created HTA elements; the former works because IE parses the attribute string into a real handler at render time).
- **`source/folder-picker.hta`** — `+ Low effort` chip removed from the flag-chip palette. `+ High effort` remains. Existing profiles get `--effort low` auto-scrubbed from `customFlags` on load via `scrubDeprecatedFlags()` (persisted so the scrub runs once).
- **`source/folder-picker.hta`** — Custom flags textbox `placeholder` attribute emptied per user feedback.
- **`README.md`** — both compare tables get a new "Named profiles per project" row. Picker bullet copy updated to lead with profiles. Version + downloads badge URLs gain `&cb=v2.6.0` cachebust so GitHub camo refetches fresh SVGs immediately.
- **`ClaudeCode_Launchpad_CLI_Setup.nsi`** — `PRODUCT_VERSION` 2.5.0 → 2.6.0; `VIProductVersion` and `FileVersion` → 2.6.0.0.

#### Compatibility

- `profiles.json` is created on first run from the existing `CLAUDE_FLAGS=` line in `config.txt`. No data lost; existing pinned flags become the Default profile.
- macOS port of the profile feature is not in v2.6.0; the .pkg installer continues to ship the v2.5.0-equivalent picker. Mac parity is on the v2.7.x roadmap.

## [2.5.0] - 2026-05-06

### Folder picker dialog overhaul

Replaces the old single-purpose BrowseForFolder picker with a unified HTA dialog that combines path selection, model + flag selection, and startup commands into one window — parity with the kivun-terminal-wsl sibling.

#### Added

- **`source/folder-picker.hta`** — single dialog with four sections:
  1. Type or paste a Windows path
  2. Browse Folder Tree (native dialog still available)
  3. Claude flags (optional): model radio buttons (Opus default / Sonnet / Haiku / Let Claude decide), conversation radios (Start fresh / `--continue` / `--resume`), 10 simple-user chip buttons (Respond in Hebrew, Low effort, High effort, Concise responses, Step-by-step reasoning, Always include tests, Auto-accept file edits, Read-only, Don't fail if Opus is busy, Confirm before changes), free-text Custom field, live "Effective:" preview
  4. Startup slash commands textarea — multi-line support, each line typed into Claude after the TUI loads
- **`source/folder-picker-launcher.wsf`** rewritten — invokes `mshta.exe` on the HTA, terminates cleanly if the user cancels (no `%USERPROFILE%` fallback that looks like a phantom launch).
- **`source/inject-startup-cmd.js`** — handles multi-line startup commands; types each line + Enter with an inter-command delay so Claude registers each as a separate slash command.
- **`source/save-defaults.js`**, **`source/write-startcmd.js`** — UTF-8-safe helpers; `save-defaults.js` rewrites `config.txt` in place, preserving comments and other keys.
- **`STARTUP_CMD`** in `config.txt` for persistent default.

#### Removed

- **`source/folder-picker.wsf`** — superseded by the HTA, which has Browse, type-path, and flag selection in one window. The native `BrowseForFolder` dialog is still callable from inside the HTA via the **Browse Folder Tree** button.
- **`source/claudecode-launchpad-choose-folder.bat`** — the text-input + flag-prompts + save-as-default flow it implemented now lives inside the HTA, with no cmd-window prompts.

#### Changed

- **`source/claudecode-launchpad.bat`** — reads `STARTUP_CMD` from `config.txt`, spawns `inject-startup-cmd.js` when a startcmd file is queued, comments updated to reference the HTA picker.
- **NSI installer** — ships the HTA + helpers, no longer the deleted `folder-picker.wsf` or `choose-folder.bat`. Pre-install dialog warns users to close active CLI sessions before upgrading.
- **README.md** — `picker.png` screenshot at top showing the new dialog.

---

## [2.4.1] - 2026-04-12

### Security Fixes - IMPORTANT UPDATE

**macOS users should update immediately.** This release fixes critical security vulnerabilities in the macOS installer.

#### Fixed Vulnerabilities

1. **Command Injection via Configuration File** (Critical - CVE pending)
   - **Risk**: Malicious code execution if config.txt is modified
   - **Fix**: Removed `eval` usage, implemented proper argument passing
   - **Affected**: macOS installer v2.4.0 only
   - **Impact**: Desktop shortcut and Finder Quick Action now safely handle user-provided flags

2. **Privilege Escalation via Temporary Sudo** (High)
   - **Risk**: Passwordless sudo could persist if installer is interrupted
   - **Fix**: Added trap handler to ensure cleanup even on crash/Ctrl+C
   - **Affected**: macOS installer v2.4.0 only
   - **Impact**: `/etc/sudoers.d/` cleanup now guaranteed

3. **Unquoted Variable Expansion** (Medium)
   - **Risk**: Malformed paths or flags could break execution
   - **Fix**: Proper quoting throughout macOS scripts
   - **Affected**: macOS installer v2.4.0 only

#### Recommendation

If you installed v2.4.0 on macOS:
1. **Download and install v2.4.1** to get security fixes
2. **Verify no leftover sudo files**: `ls /etc/sudoers.d/kivun-brew-temp` (should not exist)
3. **Review your config.txt** if you edited it manually

Windows installer is **not affected** by these vulnerabilities.

See `SECURITY_REVIEW_v2.4.0.md` for full technical details.

---

## [2.4.0] - 2026-04-12

### Changed - Windows & macOS
- **Claude Code native installer**: Migrated from deprecated `npm install -g @anthropic-ai/claude-code` to Anthropic's official native installer
  - **Windows**: `curl -fsSL https://claude.ai/install.cmd` (CMD)
  - **macOS**: `curl -fsSL https://claude.ai/install.sh` (Bash)
  - **Why**: npm package is deprecated; native installer is the official supported method
  - **Benefits**: Works on Windows Server and LTSC builds where winget is unavailable; avoids PowerShell execution policy restrictions
  - **Node.js still required**: Only for statusline display (`statusline.mjs`, `configure-statusline.js`, `apply-wt-settings.js`)

### Changed - Windows Only
- **Dependency installation via `install.cmd`**: Replaced bundled MSI/EXE installers with a new `install.cmd` script that downloads Node.js and Git via `curl.exe` (built-in on Windows 10 1803+), with automatic winget fallback if curl is unavailable
- **No PowerShell dependency**: The entire install chain is now pure CMD - works in environments where PowerShell execution policy is restricted
- **Smaller installer**: No bundled binaries; Node.js and Git are downloaded at install time from official sources
- **NSIS sections simplified**: SecNodeJS, SecGit, SecWindowsTerminal, and SecClaudeCode now delegate to `install.cmd` with `/node`, `/git`, `/wt`, `/claude` flags
- **PATH refresh**: `install.cmd` re-reads PATH from the registry after each install, so subsequent steps see newly installed tools without requiring a restart
- **Installer messaging updated**: Welcome page, error messages, and section descriptions now reference the native installer instead of npm

### Added - macOS Feature Parity
- **Folder picker dialog**: Desktop shortcut now shows native macOS folder picker (AppleScript `choose folder`) before launching Claude - matches Windows folder picker experience
- **Right-click context menu**: Finder Quick Action adds "Open with ClaudeCode Launchpad" to right-click menu on any folder (appears in Services menu)
- **Language configuration**: `~/Library/Application Support/ClaudeCode-Launchpad/config.txt` with same options as Windows (24+ languages including Hebrew, Arabic, Persian, etc.)
- **Configuration file**: macOS now supports `config.txt` with `RESPONSE_LANGUAGE`, `TERMINAL_COLOR`, and `CLAUDE_FLAGS` settings - full feature parity with Windows

### Added - Windows Only
- `source/install.cmd`: Standalone dependency installer - can also be run outside the NSIS wizard to repair or reinstall components
- `TROUBLESHOOTING.md`: Added "Download failed during installation" section

## [2.3.0] - 2026-04-04

### Added
- **Optional color theme**: Installer checkbox (checked by default) - uncheck to keep your existing terminal colors instead of applying the Kivun light-blue theme
- **New no-color WT fragment** (`claudecode-launchpad-wt-fragment-nocolor.json`): registers the WT profile without overriding the color scheme
- **One-time Claude flags**: After typing a folder path in the text-input fallback, a prompt asks for optional Claude flags (e.g. `--continue`). Flags are written to `kivun-claude-flags.txt`, read at launch, then deleted
- **Persistent Claude flags**: `CLAUDE_FLAGS=` key in `config.txt` - set once, applied on every launch
- `docs/RELEASING.md`: Release checklist documenting required assets and build steps for every release

### Changed
- `claudecode-launchpad.bat`: Phase 2 config re-read moved before ANSI color block so `TERMINAL_COLOR` is available when Windows Terminal launches via `--run`
- `apply-wt-settings.js` is now only executed when the color theme checkbox is checked
- WT fragment copy is now conditional: color fragment for checked, no-color fragment for unchecked

## [2.2.0] - 2026-04-01

### Changed
- **VBS → JScript migration**: All `.vbs` scripts replaced with `.js` for better compatibility
- **Statusline fix**: Second line now shows on session start (configures `lines: 2` by default)
- **Folder picker paste support**: Cancelling the folder picker now falls through to a text input prompt where users can paste or type a folder path
- Icon renamed to `claude_icon.ico`
- NSIS installer updated for all file changes

## [2.1.0] - 2026-03-31

### Changed
- **Renamed product** from "Kivun Terminal" to "ClaudeCode Launchpad CLI" (v2.0+; v1.x keeps original name)
- Fixed WT color fallback: self-invoking ANSI pattern (`--run` flag) replaces profile dependency
  - WT path now calls `claudecode-launchpad.bat --run` instead of `cmd /c claude`
  - Phase 2 applies ANSI RGB escape sequences (#C8E6FF) directly inside the terminal
  - Colors work regardless of whether the WT profile/fragment is loaded
- Removed `color B0` fallback (replaced by 24-bit ANSI RGB)
- CMD fallback reuses the same ANSI color logic via `goto :run_claude`

## [2.0.2] - 2026-03-14

### Added
- Integrated `statusline.mjs` into both Windows (NSIS) and macOS (.pkg) installers
- Windows installer sets `CLAUDE_CODE_STATUSLINE` system environment variable and broadcasts change
- macOS installer copies statusline to `/usr/local/share/kivun/` and adds export to shell profile
- Uninstaller cleans up the environment variable on both platforms

### Changed
- Updated `START_HERE.txt` for v2.0.1 (removed v1.x references)
- Updated `SECURITY.md` with real policy and v2.0.x support
- Updated `LICENSE` third-party section (removed WSL/Ubuntu/Konsole/Hebrew Fonts, added Windows Terminal)
- Updated `.gitignore` to exclude `bundled/` directory
- Updated macOS build workflow to include `statusline.mjs` in .pkg payload

## [2.0.1] - 2026-03-13

### Fixed
- Fixed apply-wt-settings.vbs corrupting Windows Terminal settings.json when adding properties to the Kivun Terminal profile. The insertion point landed inside the opening `{` of the profile object, splitting the `"guid"` value and duplicating properties. The script now inserts after the first newline following the brace so existing fields stay intact.
- Fixed folder-picker.vbs writing a UTF-8 BOM to kivun-workdir.txt. The BOM prefix made the path appear relative, so Windows Terminal concatenated it with the install directory (e.g. `C:\...\Kivun\﻿C:\Users\...`), causing error 0x8007010b "directory name is invalid". The file is now written without BOM, matching write-path.vbs.

## [2.0.0] - 2026-03-13

### Major Release - Windows + macOS

Complete rewrite removing WSL/Ubuntu/Konsole dependency. Claude Code now runs natively on Windows. Added macOS installer.

### Changed
- Architecture: NSIS -> Node.js -> Claude Code -> Windows Terminal (was: NSIS -> WSL -> Ubuntu -> Konsole -> VcXsrv -> Claude Code)
- Launcher scripts rewritten as pure Windows batch files (no more bash/WSL)
- Config simplified to single setting: RESPONSE_LANGUAGE (english + 24 RTL languages)
- Installer simplified: Node.js + Claude Code + Windows Terminal (recommended) + Git (optional)

### Added
- macOS installer (.pkg) via pkgbuild - installs Homebrew, Node.js, Git, and Claude Code
- GitHub Actions workflows for building and testing macOS installer
- Windows Terminal integration with "Kivun Terminal" profile and Noam color scheme (light blue)
- Windows Terminal auto-installation via winget
- cmd.exe fallback with light blue color scheme when Windows Terminal is not available
- post-install.bat for Windows-native Claude Code installation

### Removed
- WSL and Ubuntu installation (no longer needed)
- Konsole terminal (replaced by Windows Terminal)
- VcXsrv X server (no longer needed)
- RTL-specific infrastructure (keyboard switching, Hebrew fonts, xkb, X11)
- Diagnostic/debug scripts (kivun-terminal-debug.bat, diagnose-shortcut.bat, fix-shortcuts.bat, COLLECT_LOGS.bat, etc.)
- Konsole profiles and color scheme files (replaced by Windows Terminal fragment)
- Ubuntu credentials configuration
- PRIMARY_LANGUAGE and USE_VCXSRV config options

## [1.0.5] - 2026-03-09

### Initial Public Release

RTL language support for Claude Code on Windows via Konsole terminal (WSL + Ubuntu).

### Features
- Smart installer - auto-detects existing components, skips what's installed, resumes after restart
- 10 RTL languages: Hebrew, Arabic, Persian, Urdu, Pashto, Kurdish, Dari, Uyghur, Sindhi, Azerbaijani
- Alt+Shift keyboard switching (via VcXsrv)
- Konsole terminal with custom profile, blue cursor, light blue color scheme
- Window auto-maximizes with "Kivun Terminal" title
- Desktop shortcuts: "Kivun Terminal" and "Kivun Terminal (Choose Folder)"
- Right-click context menu: "Open with Kivun Terminal"
- Send To integration
- Comprehensive diagnostic logging (Windows + Bash logs)
- Configurable response language (English/Hebrew)
