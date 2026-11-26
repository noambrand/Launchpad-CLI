# Install folder rename (Kivun to LaunchpadAI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launchpad installs into `%LOCALAPPDATA%\LaunchpadAI`, and an upgrade moves an existing `%LOCALAPPDATA%\Kivun` install there with every setting kept.

**Architecture:**
- Runtime code finds the folder from its own location (`%~dp0`, `__dirname`, the picker's own folder).
- Install-time code and the few fixed strings Windows needs (the WT fragment, the status line state folder, the NSIS default) name `LaunchpadAI`.
- The installer copies the user's data from OLD before its upgrade checks read anything. A small Node helper repoints what the normal install doesn't rewrite. OLD is then removed.

**Tech Stack:** NSIS 3, Windows batch, ES3 JScript (HTA picker), Node built-ins, node:test.

**Spec:** `docs/superpowers/specs/2026-11-26-install-folder-rename-design.md`

## Global Constraints

- **New folder:** `%LOCALAPPDATA%\LaunchpadAI`. **Old folder:** `%LOCALAPPDATA%\Kivun`.
- **Never touch `%LOCALAPPDATA%\Kivun-WSL`** (Kivun Terminal), nor the existing `KivunTerminal` cleanup lines.
- **Internal names stay:** `kivun-*.txt` / `kivun-*.json`, `KIVUN_*` variables, `TERMINAL_COLOR=kivun`.
- **macOS paths are unchanged.**
- **Step 0 (measured 2026-11-26):** `claude plugin marketplace add <new>\plugins` with the existing name `launchpad-plugins` repoints the catalog, and its installed add-ons follow. The installer's existing `marketplace add "$INSTDIR\plugins"` line therefore moves it, and no extra step is needed.
- **The picker's `.html` is generated** from the `.hta`: `node picker-app/build-picker.js source/folder-picker.hta source/folder-picker.html`.
- **Product text rules:** present tense, no "new" or "now".

## Review Focus

1. **An upgrade cancelled after the OK box, then run again:** OLD is still the live install, so the copy runs again and overwrites NEW's data. Test `UT_FolderMove_CancelledThenAgain`.
2. **OLD's removal is held up by a file in use:** the next install must not copy stale OLD data over NEW. The copy runs only while NEW has no `claudecode-launchpad.bat`. Test `UT_FolderMove_DoneOnceOnly`.
3. **A username with Hebrew letters or spaces:** paths written into the Copilot hook and the WT files stay valid JSON. Test `UT_MoveHelper_UnicodePath`.
4. **No OLD folder at all** (fresh install): nothing is copied or deleted, and OLD is never created. Test `UT_FolderMove_FreshInstall`.
5. **A leftover hard-coded `\Kivun\` in shipped code:** guard test `UT_NoOldFolderName`.

---

### Task 1: Runtime code follows its own folder

**Files:**
- Modify: `source/claudecode-launchpad.bat` (lines 115, 181, 338-340, 351, 359, 368, 588, 670, 752)
  - `%LOCALAPPDATA%\Kivun\` becomes `%SCRIPT_DIR%` where SCRIPT_DIR is set, else `%~dp0` (its `shift /1` leaves `%0` alone).
- Modify: `source/folder-picker.hta:646`: `var kivunDir = installDir;`. Regenerate `source/folder-picker.html`.
- Modify: `source/write-path.js:6`, `source/write-startcmd.js:6`, `source/inject-startup-cmd.js:14`: use `__dirname`.
- Modify: `source/fix-wt-icon.hta:201`, `source/fix-wt-icon.html:189`: the icon path is the page's own folder plus `\claude_icon.ico`.
- Modify: `source/configure-codex.js:53`, `source/configure-codex-plugin.js:34`: default `env.KIVUN_DIR || __dirname`.
- Modify: `source/install.cmd:26`: `KIVUN_DIR=%~dp0` without the trailing backslash.
- Modify: `source/statusline.mjs:65-66`, `source/auto-continue.js:10,121,126,281`: folder name `LaunchpadAI`.
- Modify: `source/apply-wt-settings.js:132`, `source/apply-terminal-color.js:193-194`, both fragment JSON files: `%LOCALAPPDATA%\\LaunchpadAI\\…`.
- Modify: `source/launchpad-diagnostics.cmd:13`, `server-recovery/*.cmd`, `tools/DIAGNOSE-HEBREW-PATH.cmd`: `LaunchpadAI` (they run from elsewhere).
- Tests: rename every sandbox `Kivun` folder to `LaunchpadAI`, in the files listed by the inventory:
  - `launcher/harness.js:60`
  - `UT_Picker*.js` (6)
  - `UT_Statusline_SessionCap.js:19`
  - `UT_TerminalColor_Fragment.js:24`
  - `codex-plugin-fixture.js:61`
  - `RunUT.wsf:73-75`
  - `UT_Installer_Agent.js:103`
  - `UT_Codex_Install.js`, `UT_Copilot_Install.js`, `UT_Installer_Antigravity.js`: the `KIVUN_DIR` default checks expect the script's own folder.
  - `UT_Copilot_StatusLine.js:203`: expect the `$INSTDIR` form from Task 2.
- Create: `source/test/UT_NoOldFolderName.js`.

**Interfaces:**
- Produces: every shipped runtime file resolves its data folder without the literal `Kivun`. Only NSIS's OLD constant and the move helper name OLD.

- [ ] **Step 1: Write the guard test** `UT_NoOldFolderName`
  - Scan every file under `source/` (except `source/test/`, `source/plugins/`, `*.wav`, `*.ico`, `*.png`) plus the `.nsi`.
  - Match the regex `/[\\/]Kivun(?![-\w])/`. Allowed: the NSIS lines that name OLD (`OLD_DIR` define and its uses), `source/move-from-old-folder.js`, and the `Uninstall\Kivun` registry cleanup.
  - Assert the match list is empty.
- [ ] **Step 2: Run** `node --test source/test/UT_NoOldFolderName.js`. Expected: FAIL, listing about 25 places.
- [ ] **Step 3: Make the runtime edits above;** rename the test sandbox folders; regenerate the picker html.
- [ ] **Step 4: Add `UT_Statusline_SameFolder`** to `UT_Statusline_SessionCap.js`: statusline and auto-continue name the same state folder, `LaunchpadAI`.
- [ ] **Step 5: Run** `node source/test/run-node-tests.js`. Expected: `UT_NoOldFolderName` still lists only the NSIS lines (Task 2). Everything else passes, apart from the known local `UT_Installer_CodexPlugin` flakiness.
- [ ] **Step 6: Commit** `refactor: runtime files find Launchpad's folder from their own location`.

### Task 2: The installer installs into LaunchpadAI and moves an old install

**Files:**
- Modify: `ClaudeCode_Launchpad_CLI_Setup.nsi`
  - `!define INSTALL_DIR "$LOCALAPPDATA\LaunchpadAI"`.
  - Add `!define OLD_DIR "$LOCALAPPDATA\Kivun"`.
  - Message boxes and progress text (712, 714, 938, 942, 1057, 1061, 1162, 1166, 1211, 1241, 1255) use `$INSTDIR`.
  - Uninstall record checks (1411, 1436) use `$INSTDIR`.
- `.onInit`, right after `continueInstall:` and before the `AGENT=` read, calls `Call CopyFromOldFolder`:
  - **Condition:** `${OLD_DIR}\claudecode-launchpad.bat` exists and `$INSTDIR\claudecode-launchpad.bat` does not.
  - **Copy** with `CreateDirectory $INSTDIR`, then `CopyFiles /SILENT` of:
    - `config.txt`, `profiles.json`
    - `kivun-*.txt`, `kivun-*.json`
    - `*.log`, `install-log.txt`, `Launchpad-Report.txt`
    - the folder `copilot-language`
- The main section, after `apply-terminal-color.js`, when `${OLD_DIR}\claudecode-launchpad.bat` exists:
  - run `"$NodeExe" "$INSTDIR\move-from-old-folder.js" "${OLD_DIR}" "$INSTDIR"`;
  - then `RMDir /r /REBOOTOK "${OLD_DIR}"`.
- The uninstall section: `RMDir /r /REBOOTOK "${OLD_DIR}"` when `${OLD_DIR}\claudecode-launchpad.bat` exists.
- Create: `source/move-from-old-folder.js` (ship it in the file list next to `apply-terminal-color.js`).
- Test: `source/test/UT_MoveHelper.js`, `source/test/UT_Installer_FolderMove.js` (makensis cut-out, same seams as `UT_Installer_Agent.js`).

**Interfaces:**
- Produces:
  - `move-from-old-folder.js <old> <new>`, exit 0 always; one log line per file changed.
  - Export `rewrite(text: string, oldDir: string, newDir: string): string`. It replaces the old folder in both spellings: raw backslashes, and JSON-escaped doubled backslashes. The match is case-insensitive, and only when followed by a separator or a quote.
  - Files it rewrites when present:
    - `%USERPROFILE%\.copilot\hooks\launchpad-sounds.json`
    - WT `LocalState\settings.json` and `LocalState\state.json`

- [ ] **Step 1: Write `UT_MoveHelper.js`**
  - `UT_MoveHelper_RewritesBothSpellings`: `rewrite('"C:\\\\U\\\\AppData\\\\Local\\\\Kivun\\\\x.js" C:\\U\\AppData\\Local\\Kivun\\y', old, new)` turns both spellings into LaunchpadAI.
  - `UT_MoveHelper_LeavesKivunWsl`: `…\Local\Kivun-WSL\…` is unchanged.
  - `UT_MoveHelper_UnicodePath`: a user folder `נועם כהן` survives, and the file still parses as JSON.
  - `UT_MoveHelper_Files`: in a sandbox `USERPROFILE` / `LOCALAPPDATA`, the Copilot hook args and a WT profile icon and saved-tab command line point at NEW; a missing file is skipped with exit 0.
- [ ] **Step 2: Run them.** Expected: FAIL (module missing).
- [ ] **Step 3: Write `move-from-old-folder.js`.** It needs Node built-ins only, never throws, and writes only a file whose text changed.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Write `UT_Installer_FolderMove.js`** (skipped without makensis). It cuts `CopyFromOldFolder` plus the move block, and runs them against a sealed `$TestLocal`.
  - `UT_FolderMove_CopiesData`: OLD holds `config.txt` (AGENT=codex), `profiles.json`, `kivun-codex-path.txt`, `kivun-codex-plugin-off.txt` and `launch\x\launch.json`. After the run, NEW has the first four, NEW has no `launch`, and OLD is gone.
  - `UT_FolderMove_FreshInstall`: no OLD means no OLD afterwards, and NEW has no copied files.
  - `UT_FolderMove_DoneOnceOnly`: NEW already has `claudecode-launchpad.bat` and a `config.txt` with AGENT=claude; OLD has AGENT=codex. NEW keeps claude.
  - `UT_FolderMove_CancelledThenAgain`: NEW has only data (no `.bat`) and OLD's `config.txt` changed. The copy overwrites NEW's `config.txt`.
  - `UT_FolderMove_KivunWslUntouched`: `Kivun-WSL\x` is still there.
- [ ] **Step 6: Make the NSIS edits.** Run `UT_Installer_FolderMove.js`, `UT_NoOldFolderName.js` and the existing `UT_Installer_*.js`. Expected: PASS, with `UT_Installer_CodexPlugin` failing locally as on clean `main`.
- [ ] **Step 7: Commit** `feat(installer): install into %LOCALAPPDATA%\LaunchpadAI and move an old Kivun install there`.

### Task 3: What people read

**Files:**
- Modify: `source/folder-picker.hta:2312`: the label "Kivun (light blue)" becomes "Light blue" (value unchanged). Regenerate the html.
- Modify: `README.md:321`; `TROUBLESHOOTING.md` lines 159, 165, 250, 258, 300, 370, 487, 592, 679, plus one line saying a hand-made shortcut to the old folder's `.bat` needs to be made again.
- Modify: `docs/QUICK_START.md:258,300`, `source/FIX_WT_ICON_README.txt`, `docs/CODEX-ADDON.md:13,58-60`, `picker-app/README_PICKER_EXE.md:65`.
- Modify: `docs/CHANGELOG.md` Unreleased:
  - "Changed: Launchpad lives in %LOCALAPPDATA%\LaunchpadAI".
  - An upgrade moves settings, profiles and the agent choice.
  - "Kivun (light blue)" reads "Light blue".
- Test: extend `UT_Picker.js` with `UT_Picker_ThemeLabel`: the radio with value `kivun` is labeled "Light blue".

- [ ] **Step 1: Write `UT_Picker_ThemeLabel`; run it.** Expected: FAIL.
- [ ] **Step 2: Edit the picker; regenerate the html.** Run `UT_Picker*.js`. Expected: PASS.
- [ ] **Step 3: Edit the docs.** `grep -rn "Local\\\\Kivun" README.md TROUBLESHOOTING.md docs/QUICK_START.md` returns nothing.
- [ ] **Step 4: Commit** `docs: Launchpad's folder is LaunchpadAI; the light-blue theme says so`.

### Task 4: Whole check and PR

- [ ] **Step 1:** Run `node source/test/run-node-tests.js`, and read every failure against clean `main`.
- [ ] **Step 2:** Build the installer locally with makensis.
  - Install over the real 3.7.0 install on this PC, with Noam's OK (it closes Launchpad windows).
  - Check, in order:
    1. Settings and profiles are kept.
    2. The picker launches Claude.
    3. The status line shows.
    4. The right-click menu opens Launchpad.
    5. The WT dropdown profile opens.
    6. `%LOCALAPPDATA%\Kivun` is gone, and `Kivun-WSL` is untouched.
- [ ] **Step 3:** Update `HANDOFF.md`, push the branch, open the PR, and wait for CI.
