# Changelog

## [2.6.9] - 2026-05-26

### Added — open new projects as tabs in one window, named by project

Launching ClaudeCode Launchpad always opened a brand-new Windows Terminal
window. Now a second (and every later) launch opens a **new tab** in the same
window, so you can work on multiple projects side by side.

- `source/claudecode-launchpad.bat`: the Windows Terminal launch now targets a
  named window — `wt.exe -w "ClaudeCodeLaunchpad" --maximized new-tab …` — so
  the first launch creates the window and subsequent launches add tabs to it.
  (`--maximized` only applies when the window is first created.)
- **Each tab is named by its project folder** (e.g. `gvSIG`). The launcher
  computes the folder basename and passes it as `--title`.
- `suppressApplicationTitle: true` is now set on the `ClaudeCode Launchpad CLI`
  Windows Terminal profile so Claude can't overwrite the tab title with its own
  "Claude Code". Applied in both WT fragments and `source/apply-wt-settings.js`,
  which also removes the old static `tabTitle` so the per-tab `--title` wins.

### Release sweep

- `ClaudeCode_Launchpad_CLI_Setup.nsi` — `PRODUCT_VERSION` 2.6.8 → 2.6.9;
  `VIProductVersion` / `FileVersion` → 2.6.9.0.
- `source/folder-picker.hta` — `FALLBACK_VERSION` → 2.6.9.
- `README.md` — badge cachebusts `v2.6.8` → `v2.6.9`; picker.png alt-text bump.
- `START_HERE.txt` — version bumped.

## [2.6.8] - 2026-05-25

### Hardened — upgrades no longer leave a stale "update available" banner

After installing a new build, a launcher window left open from the *previous*
build kept showing the old version's `🆕 Update available` banner (e.g. "you
have v2.6.6" right after installing v2.6.7). The launcher is an HTA hosted by
`mshta.exe`; it loads into memory and runs its GitHub update check only **once**
at window load, so an already-open window never re-checks against the newly
installed files. The on-disk install was correct — the open window was just
running old code.

Two belt-and-suspenders fixes:

- **Installer now closes running launcher windows before overwriting files.**
  New `source/close-launchers.js` (pure WSH + WMI, no PowerShell) terminates
  any `mshta.exe` whose command line references `folder-picker.hta` — targeted,
  so unrelated mshta windows and this product's own `fix-wt-icon.hta` are left
  alone. Run from the temp plugins dir at the start of `SecCore` (so it works
  even before `$INSTDIR` is touched, and on first installs) and again at the
  start of uninstall so `RMDir` isn't blocked by an open window. Best-effort:
  any failure is swallowed and never blocks the install.
- **Installer now writes `$INSTDIR\VERSION` as the single source of truth.**
  `readInstalledVersion()` already preferred this file and only fell back to the
  HTA's hardcoded `FALLBACK_VERSION` when it was absent — but nothing ever wrote
  it, so the self-reported "you have vX" figure depended entirely on the HTA
  constant being bumped. The figure now always matches what was actually
  installed.

### Docs

- `docs/QUICK_START.md` — added a "Pin it to your taskbar (Windows)" section, mirroring the installer finish-page tip, so the one-click blue icon is discoverable.

### Release sweep

- `ClaudeCode_Launchpad_CLI_Setup.nsi` — `PRODUCT_VERSION` 2.6.7 → 2.6.8;
  `VIProductVersion` / `FileVersion` → 2.6.8.0; ships `close-launchers.js`;
  writes `VERSION`; closes launchers on install + uninstall.
- `source/folder-picker.hta` — `FALLBACK_VERSION` → 2.6.8.
- `README.md` — badge cachebusts `v2.6.7` → `v2.6.8`; picker.png alt-text bump.
- `START_HERE.txt` — version bumped.

## [2.6.7] - 2026-05-25

### Fixed — Launchpad profile could open a bare cmd.exe instead of Claude

On a machine where the ClaudeCode Launchpad profile had been *materialized* into Windows Terminal's `settings.json` (`source: ClaudeCodeLaunchpad`), the materialized entry could end up with **no `commandline` key**. Windows Terminal then fell back to the global `defaultProfile` (Command Prompt), so the window opened a bare `cmd` shell **without Claude**. The same profile had also had its keys **duplicated 4×** by the legacy string-splicing `apply-wt-settings.js` (the duplication noted in the v2.6.6 follow-ups below).

- Repair: a materialized `ClaudeCodeLaunchpad` profile now always carries `"commandline": "cmd /c claude"`, and duplicate keys are collapsed to a single set.
- A leftover window restored by `"firstWindowPreference": "persistedWindowLayout"` can make this present as *"two windows open, one without Claude"* — closing all Windows Terminal windows once clears the restored layout.

### Changed — `source/apply-wt-settings.js` rewritten to parse real JSON (was string-splicing)

The previous version edited `settings.json` by raw string insertion. Its only idempotency guard was a text search for `"colorScheme"`, so repeated installs appended the same keys again and again (the 4× duplication above) and it never wrote a `commandline`. Rewritten to:

- `JSON.parse` → mutate the object → `JSON.stringify` — inherently idempotent, and collapses any pre-existing duplicate keys;
- always set `"commandline": "cmd /c claude"` on the materialized profile;
- strip a UTF-8 BOM before parsing and write UTF-8 (no BOM), the encoding Windows Terminal expects;
- back up `settings.json` first and **bail without writing** if the file can't be parsed (e.g. hand-edited JSONC), so a malformed file is never clobbered.

### Note — `fix-wt-icon.hta` tooling now actually committed

The v2.6.6 entry described `source/fix-wt-icon.hta` + `source/FIX_WT_ICON_README.txt`, but those files were never committed with that release. They are included here.

### Release sweep

- `ClaudeCode_Launchpad_CLI_Setup.nsi` — `PRODUCT_VERSION` 2.6.6 → 2.6.7; `VIProductVersion` / `FileVersion` → 2.6.7.0.
- `README.md` — badge cachebust `v2.6.6` → `v2.6.7`; picker.png alt-text version bump.
- `START_HERE.txt`, `source/folder-picker.hta` (`FALLBACK_VERSION`) — version bumped.

## [2.6.6] - 2026-05-24

### Fixed — Windows Terminal tab/taskbar icon (broken since v2.2.0)

The Windows Terminal profile pointed its `icon` at `%LOCALAPPDATA%\Kivun\claude_code.ico`, but v2.2.0 renamed the shipped icon to `claude_icon.ico` and updated everything **except** the two WT fragment files. Since then Windows Terminal has been pointing at a non-existent file, so the Launchpad profile showed the wrong/stale icon on the tab and no Kivun icon on the taskbar when minimized (on machines upgraded from a pre-v2.2.0 install, a leftover `claude_code.ico` made the tab show the *old* icon).

- `source/claudecode-launchpad-wt-fragment.json` and `source/claudecode-launchpad-wt-fragment-nocolor.json`: `icon` now references `claude_icon.ico` (the file the installer actually ships), matching the shortcut, Add/Remove Programs, and context-menu entries which were already correct.

No other behavior change. Users upgrading should close all Windows Terminal windows and relaunch so WT reloads the fragment; a leftover `claude_code.ico` from a very old install can be deleted.

> **Follow-up (2026-05-24): the fragment fix alone does not repair already-customized machines.** On a machine where the Launchpad profile was customized, WT materializes it into `settings.json` (`source: ClaudeCodeLaunchpad`) and that entry can shadow the fragment. On at least one upgraded machine the materialized profile also had its keys duplicated 4× (legacy `apply-wt-settings.js` appending on every install) and **no explicit `icon` key**, so the icon fell back to the generic WT icon. First manual fix: open `%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`, find the `ClaudeCodeLaunchpad` profile, remove the duplicated keys, add an `"icon"`, save, then fully close and relaunch WT (all windows).
>
> **Follow-up 2 (2026-05-24): the tab icon and the taskbar/window icon are loaded by *different* code paths in WT, and only the tab path is robust.** After adding the `icon` key above, the **tab** showed the Kivun icon correctly but the **taskbar button stayed generic** — even with the launch working directory and the icon both on `C:`. This is upstream bug [microsoft/terminal#16233](https://github.com/microsoft/terminal/issues/16233) (open, Priority-3): WT's window/taskbar icon loader is fragile about local `.ico` references and silently fails to render them while the tab loader succeeds. Confirmed *not* the cause on this machine: icon file is valid (16/32/48/64 px, 32bpp) and on the same drive as the launch dir. Suspected remaining trigger: the window-icon loader not resolving the `%LOCALAPPDATA%` environment variable that the tab loader resolves fine. **Current mitigation:** the profile `icon` was changed from `%LOCALAPPDATA%\\Kivun\\claude_icon.ico` to a **literal absolute path** (`C:\\Users\\<user>\\AppData\\Local\\Kivun\\claude_icon.ico`) on the same drive as the launch directory. Per #16233 the only *fully* reliable taskbar icons are same-drive literal paths or built-in `ms-appx:` icons; cross-drive paths and `https:` URLs are confirmed to fail. The installer should write the expanded literal path into the fragment at install time (the fragment can't carry a per-user absolute path); tracked as a follow-up.

### Added — `fix-wt-icon.hta` automated repair tool (+ two HTA bugs fixed during testing)

New `source/fix-wt-icon.hta` automates the manual `settings.json` repair above: backs up the file, locates the `ClaudeCodeLaunchpad` profile, sets `"icon"` to the **expanded literal absolute path** (`%LOCALAPPDATA%` resolved at runtime via `ExpandEnvironmentStrings`, e.g. `C:\Users\<user>\AppData\Local\Kivun\claude_icon.ico`) per Follow-up 2 above, and saves. Companion `source/FIX_WT_ICON_README.txt` documents both the automated and manual paths. No PowerShell — runs via `mshta.exe` ([[no-powershell]] project rule).

Two bugs surfaced and were fixed while testing the tool on a live machine:

- **`'JSON' is undefined`** — `mshta.exe` renders in IE7 document mode by default, where the native `JSON` object (IE8+ standards mode) does not exist, so `JSON.parse` threw. Fixed by adding `<meta http-equiv="X-UA-Compatible" content="IE=edge">` as the first `<head>` element, forcing the modern IE11 script engine — matching the already-working `source/folder-picker.hta`.
- **`Invalid character`** — the file was read with `OpenTextFile(..., -1)` (UTF-16) and written with `CreateTextFile(..., true)` (UTF-16), but Windows Terminal stores `settings.json` as **UTF-8 (no BOM)**. Reading UTF-8 bytes as UTF-16 mangled the text and broke `JSON.parse`; the write path would have corrupted the file. Replaced both with `ADODB.Stream`-based `readUtf8()` / `writeUtf8NoBom()` helpers, again mirroring `folder-picker.hta`. The backup-before-write step meant no settings files were harmed by the failed runs.

### Fixed — no longer deletes the sister Kivun Terminal (WSL) product's shortcut + right-click menu

This installer used to treat `Kivun Terminal` as its own former name and, on every install/uninstall, delete `$DESKTOP\Kivun Terminal.lnk`, `$SMPROGRAMS\Kivun Terminal`, and the `KivunTerminal` folder context-menu keys. Those now belong to a **separate, still-installed product** — the WSL-based Kivun Terminal (`noambrand/kivun-terminal-wsl`) — so this was wiping that product's desktop shortcut and "Open with Kivun Terminal" menu whenever this installer ran. Removed that cleanup from `SecCore`, the uninstaller, and the finish-page shortcut function. The two products now coexist: this one owns the `ClaudeCodeLaunchpad` namespace, the other owns `KivunTerminal`. (This installer still cleans up its *own* legacy `Kivun` ARP entry and Windows Terminal fragment.)

### Changed — finish-page checkboxes default to unchecked

"Create Desktop Shortcut" and "View Quick Start Guide" on the installer's finish page are now unchecked by default (`MUI_FINISHPAGE_RUN_NOTCHECKED`, `MUI_FINISHPAGE_SHOWREADME_NOTCHECKED`).

## [2.6.5] - 2026-05-18

### Added — statusline reasoning-effort field + opt-in extras

The bottom-of-session statusline (`source/statusline.mjs`, internal version bumped v2.1 → v2.2) now surfaces the reasoning effort level (low/medium/high/max) that Claude Code 2.1.x supports via `/effort`. Inspired by [jftuga/claude-statusline](https://github.com/jftuga/claude-statusline), which also exposes session cost, cache tokens, and tokens/minute — those land here as **opt-in** fields so the bar stays clean for users who don't want them.

#### `source/statusline.mjs`

- **New default field `effort:<level>` on line 1**, magenta, placed right after the model name. Three-tier resolution chain in `readEffort()`:
  1. `d.effort.level` from the JSON Claude Code pipes to the statusline. Forward-compat for [anthropics/claude-code#40261](https://github.com/anthropics/claude-code/issues/40261) (request to expose effort on the statusline payload) — still open as of 2026-05, also tracked under #38476, #31415, #27747.
  2. `CLAUDE_CODE_EFFORT_LEVEL` env var. Useful as an explicit override per shell.
  3. `effortLevel` key from `~/.claude/settings.json`. Picks up the user's saved default. **Known gap:** stale on mid-session `/effort` overrides — Claude Code doesn't rewrite `settings.json` when the user toggles effort during a session, so the statusline will show whatever was set at session start. Upstream limitation; no workaround until Anthropic ships #40261.

  If none of the three resolve, the field is hidden (cleaner than rendering a misleading `auto` placeholder).

- **Three opt-in fields, off by default** — each gated by a single env var matched by `truthy()` (`1`/`true`/`yes`/`on`):
  - `KIVUN_SL_COST=1` — renders `$X.XX` from `d.cost.total_cost_usd` in green.
  - `KIVUN_SL_CACHE=1` — renders `cache:<N>` (sum of `cache_read_input_tokens` + `cache_creation_input_tokens`, formatted as M/K/raw) in blue.
  - `KIVUN_SL_TPM=1` — renders `tpm:<output_tokens_per_minute>` in cyan, suppressed when session duration is under 5 s.
- **No installer changes.** Env vars beat installer-controlled flags here because adding new keys would have meant touching `ClaudeCode_Launchpad_CLI_Setup.nsi` and the macOS `.pkg` postinstall scripts. Env vars require touching neither — `setx KIVUN_SL_COST 1` on Windows or `export KIVUN_SL_COST=1` in shell rc on macOS, and the field appears. Trade-off: less discoverable; documented in `TROUBLESHOOTING.md` to compensate.
- **Imports added:** `fs`, `path`, `os` (needed for the `settings.json` fallback read). First time the file has imports.

#### Release sweep

- `ClaudeCode_Launchpad_CLI_Setup.nsi` — `PRODUCT_VERSION` 2.6.4 → 2.6.5; `VIProductVersion` and `FileVersion` → 2.6.5.0.
- `README.md` — cachebust `cb=v2.6.4` → `v2.6.5` (both badges); picker.png alt text version bumped.
- `source/folder-picker.hta` — `FALLBACK_VERSION = "2.6.4"` → `"2.6.5"`.
- `START_HERE.txt` — banner version bumped.
- `TROUBLESHOOTING.md` — new section documenting the four statusline env vars (`CLAUDE_CODE_EFFORT_LEVEL`, `KIVUN_SL_COST`, `KIVUN_SL_CACHE`, `KIVUN_SL_TPM`).

#### Sister repo

Same statusline change shipped same day in `noambrand/kivun-terminal-wsl` as Kivun Terminal v1.4.10.

## [2.6.4] - 2026-05-08

### Security fixes from internal audit

A security audit of the v2.6.3 codebase surfaced three HIGH-severity issues — one in the NSIS installer, two in the picker. All fixed in this release.

#### Fixed (HIGH)

- **`ClaudeCode_Launchpad_CLI_Setup.nsi` — installer no longer requests admin elevation (audit #1).** v2.6.3 and earlier shipped with `RequestExecutionLevel admin` while writing per-user files into `$LOCALAPPDATA\Kivun` and the right-click context menu into `HKLM`/`HKCR`. Under "over-the-shoulder" UAC (a regular user enters an admin's password), `$LOCALAPPDATA` resolves to the **admin's** profile, not the invoking user — so the desktop shortcut, picker, and Windows Terminal fragment land where the real user can't reach them. Fixed: `RequestExecutionLevel user`; uninstaller entry moved from `HKLM` to `HKCU`; right-click context menu moved from `HKCR Directory\shell\...` to `HKCU Software\Classes\Directory\shell\...`; `CLAUDE_CODE_STATUSLINE` env var moved from `HKLM SYSTEM\...\Environment` to `HKCU\Environment`. Uninstaller also best-effort cleans the legacy HKLM/HKCR locations from v2.6.3-and-older admin installs (silently no-ops without admin, which is fine).
- **`source/folder-picker.hta` — JScript injection via profile chip onclick (audit #2).** v2.6.0–v2.6.3's `populateProfileChips()` HTML-escaped profile names with `&#39;` for the single quote, then interpolated them into `onclick="switchToProfile('NAME')"`. IE/HTA HTML-decodes attributes **before** evaluating the JS, so `&#39;` becomes `'` again and a profile name like `x'); evil(); //` survives the escape and runs as JScript with full ActiveX privileges. Fixed by passing a profile **index** (a literal integer, no interpolation risk) and looking up the name from trusted state inside a new `switchToProfileByIndex()` handler.
- **`source/folder-picker.hta` — `WshShell.Run` trusted attacker-controllable URL in update banner (audit #3).** v2.6.1's update-check feature interpolated GitHub's `browser_download_url` into `onclick="openUpdateUrl('URL')"`. Two layers of risk: (a) `escapeHtml` did not escape `'`, so a hostile JSON response with `'` in the URL could break out of the JS string; (b) under a corp-MITM root CA, the JSON itself can be rewritten to point `browser_download_url` at any URL and ride the user's click into arbitrary download/run. Fixed two ways: (1) URLs stashed in module-scope `__pendingReleaseUrl`/`__pendingDownloadUrl` read by parameter-less click handlers — no string interpolation; (2) new `isTrustedUpdateUrl()` allowlists the URL prefix to `https://github.com/noambrand/kivun-terminal/`, `https://api.github.com/repos/noambrand/kivun-terminal/`, and `https://objects.githubusercontent.com/`; anything else is silently rejected.

#### Not fixed in this release (deferred)

- **MEDIUM #4 — `KIVUN_CLAUDE_BIN` env validation.** Applies to the WSL sister repo only (this repo doesn't ship the BiDi wrapper). N/A here.
- **MEDIUM #5 — synchronous WinHttp call hangs picker UI ≤ 5 s on hostile networks.** Marked as known limitation; async rewrite isn't worth destabilising a working feature.
- **MEDIUM #6 — quote injection if `installDir` contains `"` or `&`.** Theoretical; NTFS forbids `"` in paths.

#### Confirmed clean (negative findings)

- ✅ No hardcoded secrets in source
- ✅ Bash and batch launchers correctly quote user paths
- ✅ No DLL search-order hijacking opportunities
- ✅ NSIS uninstaller `RMDir /r` is path-bounded — can't be tricked into root delete
- ✅ `data.tag_name` from GitHub API is `escapeHtml`'d before innerHTML


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
