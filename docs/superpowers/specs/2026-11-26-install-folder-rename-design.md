# Design: the Windows install folder leaves the name "Kivun"

Asked by Noam on 2026-11-26: "the setup should not have the word kivun", then "lets rename to use
Lunchpad". Today Launchpad installs into `%LOCALAPPDATA%\Kivun`, and the setup's folder page shows it.

## The new folder

`%LOCALAPPDATA%\LaunchpadAI` (Noam's choice, 2026-11-26). Called NEW below; the old folder is OLD.

- Not plain `Launchpad`: other software can use that generic name, and uninstall deletes the whole
  install folder.
- The picker's WebView2 data stays where it is (`%LOCALAPPDATA%\ClaudeCodeLaunchpad\WebView2`), out of
  scope here.

## Rule for the code: follow the install folder, never name it

Today about 25 places hard-code `%LOCALAPPDATA%\Kivun`, and the rest follow wherever the files are. After
the change, each script finds the folder from its own location:

| Kind | Finds the folder by |
|---|---|
| Launcher `.bat`, `.cmd` | `%~dp0` (already used for `config.txt`) |
| Node scripts in the folder | `__dirname` / `import.meta.url` |
| Picker (`folder-picker.hta` / `.html`) | the folder the picker runs from (`getInstallDir()`, already used for `config.txt`) |
| NSIS | `$INSTDIR` |
| Windows Terminal fragment | the absolute path written by `apply-terminal-color.js` from its own folder |

Where a script runs from somewhere else (`configure-*.js` at install time, diagnostics, server recovery
tools), the default changes to NEW. `KIVUN_DIR` stays as the override for the tests. The `statusline.mjs`
and `auto-continue.js` pair must read and write the same folder; both move together and a test checks that
they agree.

**Not renamed (nobody sees them):** the `kivun-*.txt` and `.json` hand-off and record files inside the
folder, the `KIVUN_*` variables, and the `TERMINAL_COLOR=kivun` value. Renaming them would touch every
test for no visible gain.

**Renamed in the same change (people see them):**
- The picker's theme choice "Kivun (light blue)" becomes "Light blue". The saved value stays `kivun`.
- The setup's messages that show log paths.
- `README.md`, `TROUBLESHOOTING.md`, `docs/QUICK_START.md`, `FIX_WT_ICON_README.txt` and `docs/CODEX-ADDON.md`.

## Moving an existing install (the installer, before any file is copied)

When OLD holds a Launchpad install (`OLD\claudecode-launchpad.bat` exists) and NEW has no `config.txt`:

1. **Close what runs from OLD,** with the existing `close-launchers.js`. The upgrade closes them already.
2. **Copy the user's data to NEW:**
   - `config.txt`, `profiles.json`, and every `kivun-*.txt` / `kivun-*.json` record and cache;
   - the `copilot-language` folder and the logs.
   - Not copied: `launch\` (one-launch folders) and `ratelimit-*.json` (rebuilt within a minute).
   - Everything the upgrade checks reads from `$INSTDIR` then finds its file: the agent choice, the Codex /
     Copilot / Antigravity records, the "Codex add-on unticked" memory, `ConfigExisted`.
3. **Install to NEW as usual.** Every place outside the folder that stores the path is rewritten by the
   normal install, because it uses `$INSTDIR`:
   - shortcuts (Start menu, Desktop, SendTo, the taskbar pin);
   - the right-click menus and the uninstall entry;
   - `CLAUDE_CODE_STATUSLINE` and Claude's status line in `~\.claude\settings.json`;
   - the Windows Terminal fragment and profile.
4. **Repoint what the normal install doesn't rewrite:**
   - **The `launchpad-plugins` catalog.** It is registered at `OLD\plugins`. Step 0 measures what `claude
     plugin marketplace add` does when the name exists at another path. If it doesn't move it, use remove,
     then add, then install `rtl-terminal` again, and `codex` when its record says on.
   - **Copilot's sound hook,** `~\.copilot\hooks\launchpad-sounds.json`: its `copilot-sound.js` path, when
     that file exists.
   - **Windows Terminal `settings.json`:** a profile icon set by Fix WT Icon (a literal OLD path), and
     saved tabs in `state.json` whose command line names the OLD launcher. Both are rewritten while Windows
     Terminal is closed.
5. **Remove OLD** (`RMDir /r /REBOOTOK`). A file still in use goes at the next restart.
   - A shortcut the user made by hand to OLD's `.bat` stops working. This is rare, and `TROUBLESHOOTING.md`
     gets one line on it.
   - `%LOCALAPPDATA%\Kivun-WSL` (Kivun Terminal, the sister product) is a different folder and is never
     touched.

**Uninstall** removes NEW. It also removes OLD when it still holds a Launchpad install (the
`claudecode-launchpad.bat` check), so nothing is left behind from a failed move. The Codex and Copilot
record checks (NSIS 1411, 1436) read `$INSTDIR` instead of the hard-coded OLD.

## macOS

Not part of this change. The Mac installer shows no folder. Its status line sits in
`/usr/local/share/kivun`, which the user never sees. Its settings folder is already
`~/Library/Application Support/ClaudeCode-Launchpad`.

## Step 0, measured before building

- `claude plugin marketplace add` with the same name and a new path, in a throwaway Claude config folder:
  does it move, refuse, or keep the old path?
- NSIS `CopyFiles` of the data set while a Launchpad window is open, after `close-launchers.js`.

## Tests

- **Update the 17 test files that build `LAD\Kivun`** to NEW, through one shared constant.
- **New installer tests** (NSIS simulation, like `UT_Installer_*`):
  - an upgrade from OLD keeps `config.txt`, profiles and the agent choice;
  - the Codex add-on untick survives;
  - OLD is removed;
  - a fresh install never creates OLD.
- **A guard test:** no shipped file outside the "not renamed" list contains `\Kivun\` or `\\Kivun\\`.
- **Statusline and auto-continue** agree on the folder.
- **By hand on Windows:**
  1. An upgrade over a real 3.7.0 install.
  2. The picker launches Claude, Codex, Copilot and Antigravity.
  3. The status line shows.
  4. The right-click menu works.
  5. The terminal profile from Windows Terminal's dropdown opens.
  6. Uninstall leaves neither folder.

## Release

Ships as 3.8.0 (a moved folder is more than a fix), after PR #65's fixes.
