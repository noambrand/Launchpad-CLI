# Manual release tests: the Codex option (v3.3.0)

*The release gate from the handout, section 10, and `REQUIREMENTS-codex-option.md`. Every row needs a commit, PC, date, result and a screenshot or log before release. Empty means not run yet.*

## Exceptions approved by Noam

Noam, 2026-11-05: "we do not need Clean-machine test. we do not have a second PC or a virtual machine for those". The handout allows an exception only with Noam's written approval; this is it.

Noam, 2026-11-06, answering "can I record written exceptions for M25, M26, A36, A39, M13, A44 and the second half of A34?": "yes". Each would have meant another install or removing something from this PC.

| Excepted | Why | What still covers it |
|---|---|---|
| M1 fresh Claude install | Clean PC | `UT_Golden_Claude`, `UT_Installer_ClaudeFreshInstall` |
| M3 fresh Codex install, as a clean PC | Clean PC | M4 here, the fresh-profile Step 0 run, `UT_Installer_CodexFreshSuccess` |
| M14 fresh install fails offline | Clean PC | `UT_Install_Fail_Fresh`, `UT_Installer_CodexFailFreshPC` |
| M19 and S1b, a standalone Codex | Needs a second PC | `UT_Install_ExistingStandaloneUsed` |
| A41 Node installed in the same run | Clean PC | `UT_Commit_FreshPcOldPath` |
| Windows 10: M1 to M3, M13, M23 | No Windows 10 PC | The Windows 11 runs |
| ARM64: S2, M3 | No ARM64 device | None: no automated test covers ARM64 |
| Browser sign-in on a managed PC (S3) | No such PC | None. The device-code fallback was not completed: it was off on Noam's account (Step 0) |
| M25 Codex install fails with Claude present | Removes npm Codex and reinstalls | `UT_Install_Fail_Fresh`, `UT_Install_Repair`, `UT_Installer_CommitNeedsVerifiedCodex` |
| M26 Installer killed during download, rerun repairs | Removes npm Codex and reinstalls | `UT_Install_Repair`, `UT_Changes_InterruptedRecovery` |
| A36 Older npm Codex, and a non-npm older copy | Installs an old Codex and reinstalls | `UT_Install_OldVersion_Npm_UpdatedWithNotice`, `UT_Install_OldVersion_NotNpm` |
| A39 Installer stopped around verifying | Stopping a real install twice | `UT_Installer_CommitNeedsVerifiedCodex`, `UT_Changes_InterruptedRecovery` |
| M13 Uninstall removes only Launchpad's Codex entries | Uninstall and reinstall | `UT_UninstallIdempotent`, `UT_Installer_UninstallRemovesCodexEntries`, `UT_Installer_RightClickUninstall` |
| A44 Uninstall after Node.js removed | Removes Node.js from this PC | `UT_Installer_UninstallWithoutNode` |
| M18 Profile `OPENAI_API_KEY` | Noam has no OpenAI API key (2026-11-06) | `UT_Picker_EnvVarsPerAgent`: the key reaches only Codex. Nothing tested a real key, or that it is masked in the preview |
| A34, second half: upgrade to a higher version | Needs a local version bump and a second signature | First half here; `UT_UninstallIdempotent` and the byte comparison in A34's note. No test performs a real upgrade to a higher version |

**Remaining risk:** no real first-time install of v3.3.0 has run on a PC without Launchpad, Node.js or an AI agent. A fault that appears only there would reach new downloaders first. The exceptions from 2026-11-06 add a second gap: their tests use stand-ins for the network and the npm package. So a real failed download, a real old Codex and a real uninstall of v3.3.0 have not been seen on a PC, and neither has a real upgrade to a higher version.

## Before running

- Every install force-closes all of Windows Terminal, including a Claude session running in it (`apply-wt-settings.js`, unchanged since v2.2.0). Update the handoff notes first, then reopen the session afterward.
- Smart App Control is on on Noam's PC, so sign the test build first (below). **Do not use `sign-and-release.cmd` for a test build:** it signs the latest published release and uploads to GitHub.
- Build from a commit, so the results can name it: `makensis /INPUTCHARSET CP1252 /V2 /WX ClaudeCode_Launchpad_CLI_Setup.nsi`. Without `/INPUTCHARSET`, NSIS stops with "Bad text encoding" on a PC whose system code page is UTF-8, as on Noam's PC; GitHub's runners build the script without it.
- For M2: take the "before" copies right before installing, not earlier. `config.txt` and `settings.json` change during normal use, and launching from the picker saves the profile to `profiles.json`.

```
"C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /n "Noam Brand" /fd sha256 /tr http://time.certum.pl /td sha256 /v ClaudeCode_Launchpad_CLI_Setup.exe
```

## Tests, in the order to run them

Who: **C** Claude Code can drive and check it. **N** needs Noam's eyes, ears or clicks, then Claude Code checks the result.
"Temporarily removes npm Codex" means `npm uninstall -g @openai/codex`, which leaves `.codex` alone. Ask Noam first, and reinstall afterward.

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| M2 | Upgrade 3.2.2 to 3.3.0 choosing Claude: `config.txt`, `settings.json`, `profiles.json` and plugin state byte-identical. Expected: status bar shows the reset date; the user PATH may gain `.local\bin` | N, C | `0d71235` | 2026-11-05 | PASS | Note below |
| M16 | Claude right-to-left cases 02, 03, 05, 05b, 06, 13 unchanged | N, C | `0d71235` | 2026-11-05 | PASS | Note below |
| M4 | Installer run again choosing Codex: Claude remains available and unchanged | N, C | `72760e3` | 2026-11-05 | PASS | Note below |
| M12 | Existing Codex settings, hooks and status kept; only missing entries added (real `.codex` on this PC) | C | `72760e3` | 2026-11-05 | PASS | Note under M4 |
| A34 | Reinstall, and upgrade to a higher local test build: no new hook review. Needs Codex's hooks trusted first | N, C | `987e79b` | 2026-11-06 | First half PASS without a full install; see note. Second half EXCEPTED by Noam | Note below; Exceptions, above |
| M6 | Right-click (on a folder and inside one): the Claude entry starts Claude and the Codex entry starts Codex, whatever `AGENT` says. Changed by Noam, 2026-11-05 | N | `987e79b` | 2026-11-06 | PASS by Claude Code, see note; no mouse click | `evidence\n\` |
| M32 | Send To follows global `AGENT`, not the last active profile. Changed by Noam, 2026-11-05 | N | `987e79b` | 2026-11-06 | PASS by Claude Code, see note | `evidence\n\` |
| M5 | Both installed: per-profile agent and flags stay separate | N | `987e79b` | 2026-11-06 | PASS in the simulator, see note | `evidence\n\` |
| M31 | One profile Claude to Codex to Claude: no flag leakage | N | `987e79b` | 2026-11-06 | PASS in the simulator, see note | `evidence\n\` |
| M7 | Continue last with no history reaches a fresh session | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M8 | Hebrew response language works with no existing instructions | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M29 | Existing `developer_instructions` kept; language line skipped with a note | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M9 | Codex never starts Claude's auto-continue watcher | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M10 | Exit Codex, type `codex`: same options, no startup text | N, C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M11 | Hebrew folder, drive root, disconnected network drive | N | `987e79b` | 2026-11-06 | PASS; no real network drive | `evidence\c\` |
| M15 | Voice OFF: Codex alerts silent. With voice on, the `permission` sound plays (the `done` sound was heard in S8) | N | `987e79b` | 2026-11-06 | PASS by alert log, see note; **sound not heard** | `evidence\n\` |
| M17 | Startup uses the first-message argument, not timed typing | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M30 | First message survives all setup screens, sent once | C | `987e79b` | 2026-11-06 | PASS | Step 0 S11 and M17 |
| M18 | Profile `OPENAI_API_KEY` works and is masked in preview. Needs an API key | N | n/a | 2026-11-06 | EXCEPTED by Noam: no OpenAI API key | Exceptions, above |
| M20 | Custom npm prefix resolved | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M21 | After a Codex update, next picker shows the refreshed model list | N, C | `987e79b` | 2026-11-06 | PARTIAL: refresh only, no newer Codex to update to | `evidence\c\` |
| M22 | Sign-in left open 5 minutes, through the launcher: tab stays open, no retry | C | `987e79b` | 2026-11-06 | PASS: 315 seconds, no key pressed, still on the same sign-in screen, no retry | `evidence\c\m22-launcher.txt` |
| M23 | Two Codex launches within one second keep separate data | N, C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M24 | Claude and Codex within one second: neither touches the other's data | N, C | `987e79b` | 2026-11-06 | PASS by test; see note | Note below |
| M27 | Saved model removed from the catalog: notice, default model used | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M28 | Custom `-m` plus picker model: one `-m`, the custom one | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| A33 | Installer as administrator still installs; no elevated interactive Codex | N | | | | |
| A35 | Normal user: sandbox screen explained, non-admin choice works (fresh profile) | N, C | `987e79b` | 2026-11-06 | PASS: "Sandbox ready", no Windows prompt, steps match QUICK_START | `evidence\n\` |
| A37 | Hebrew startup text in a Hebrew folder arrives and displays readably | N | `987e79b` | 2026-11-06 | ACCEPTED by Noam as a known limit: arrives intact, but each word shows with its letters reversed; see note | `evidence\n\a37-hebrew.png` |
| A38 | Quotes, `%`, `!`, `^`, `&`, Hebrew reach Codex as typed and match the preview | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| A40 | Right-click on a drive root or second drive through Explorer | N | `987e79b` | 2026-11-06 | PASS by Claude Code, see note | `evidence\n\` |
| A42 | Bad options from `CODEX_FLAGS` on a right-click: reason shown, Codex not started | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| A43 | `config.toml` with dotted or inline `tui` left unchanged | C | `987e79b` | 2026-11-06 | PASS | `evidence\c\` |
| M25 | Codex install fails with Claude present: `AGENT` stays claude. Temporarily removes npm Codex | N, C | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |
| M26 | Installer killed during download, rerun repairs. Temporarily removes npm Codex | N, C | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |
| A36 | Older npm Codex: notice, then updated. Non-npm older copy left alone. Temporarily installs an old version | N, C | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |
| A39 | Installer stopped right after verifying, and before: correct agent either way | N, C | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |
| M13 | Uninstall removes only Launchpad's Codex entries; agents, sign-in, sessions kept. Run last, then reinstall | N, C | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |
| A44 | Uninstall after Node.js removed: plain message, finishes. Only if Noam agrees to remove Node.js | N | n/a | 2026-11-06 | EXCEPTED by Noam | Exceptions, above |

Covered by automated tests with no manual run needed: A45 to A49 (`REQUIREMENTS-codex-option.md`, automated coverage).

## Result notes

**M2, 2026-11-05.** Build `0d71235`, signed installer SHA-256 `c6c257df67584dbaf6c4cf1e031ba2ac0a9be3d2479862c1fae3da996e655f4a`, Claude Code chosen. Snapshots were taken right before the install and after it. The copies stay outside the repo because they hold personal settings.

- **Byte-identical:** `config.txt`, Claude's `settings.json`, `installed_plugins.json`, `known_marketplaces.json` and the 23 plugin files.
- **`profiles.json` differs in one field, not from the installer:** `conv` went from empty to `--continue` at 22:44:57, in the same second as `kivun-workdir.txt` and after the installer's last log line (22:44:39). That is the picker saving the choice used to reopen the session. The installer script doesn't name this file, and no `agent` or `codex` field was added.
- **Also unchanged:** the user PATH, Windows Terminal's settings, Codex's `config.toml` and `hooks.json`. Codex setup did not run.
- **Changed as expected:** `VERSION` and the uninstall entry now say 3.3.0. The 11 installed files compared with the build match, and the installed launcher is all CRLF.
- **Not shown by this run:** `statusline.mjs` was already the new file, copied by hand earlier, and `.local\bin` was already on the user PATH, so neither change happened here.
- **Launch afterward:** the session was reopened from the picker through the new launcher, and Claude resumed.
- **Noam saw:** no Windows or Smart App Control warning on the signed installer; the agent choice with Claude Code selected; a finish page that read properly; the reset date in the status bar.
- **The install closed the terminal,** as it has since v2.2.0: see "Before running".

**M16, 2026-11-05.** Claude Code 2.1.318, rtl-terminal 1.0.7. The six cases from `source/test/rtl-ab/` went through real Claude replies, in one reply per run, drawn in a hidden pseudo console (the same route a Windows Terminal tab uses), through `claudecode-launchpad.bat --run`. Four runs: the installed v3.3.0 launcher and the v3.2.2 baseline launcher kept in the repo, each with and without `WT_SESSION`. The earlier A/B script (`ab_run.py`, named in `RELEASING.md`) and its recorded screens were lost in the crash, so old and new were compared directly.

- **Rows:** old and new identical, 23 rows in Windows Terminal mode and 24 in conhost mode.
- **Words:** every word of each case is on screen.
- **Case 13:** `/rtl off`, `/copy`, `/doctor`, `--model`, `.env` and `~/notes` have their punctuation on the left.
- **Case 05b:** in Windows Terminal mode the named link is a clickable link. In conhost mode the address is written in brackets, and the bare address still shows once.
- **Real window, Noam:** a real Windows Terminal tab, opened by right-click, with the same six cases. Right-to-left layout, case 13's slashes, case 05b's clickable link and case 06's brackets all looked right.
- **Not opened:** a real conhost window. Its mode is covered by the identical rows.

**Right-click bug, found by Noam during M16, 2026-11-05.** On build `0d71235`, right-clicking a folder showed "This file does not have an app associated with it". The installer's two `WriteRegStr HKCR` lines fail for a normal user ("Access is denied", reproduced with a throwaway key), and nothing checks them. It has been so since v2.6.4, not new in this build. M6, M32 and A40 need a build with the fix. On the test PC the two missing keys were added by hand with the same text the fixed installer writes, so that build's install must be checked by removing them first.

**M4 and M12, 2026-11-05.** Build `72760e3`, signed installer SHA-256 `821117236921b2ef05af6f96b85db6324da4d0c62b49e9b67cab4eab5a33f643`, Codex chosen. Snapshots were taken right before the install and after it. The two hand-added right-click keys were deleted first.

- **Right-click fix proven:** the installer itself wrote both commands.
- **`config.txt`:** only `AGENT=codex` was added at the end; every earlier byte is the same.
- **Claude's side:** `settings.json`, plugin lists and the 23 plugin files identical. The user PATH and Windows Terminal's settings unchanged.
- **Codex reused:** the log says "Codex 0.166.0 is already installed", with no download.
- **`profiles.json`:** gained a `codex` block and no `agent` field, because Noam switched the picker to Codex and back. Running the real picker on a copy of the "before" profile: a plain Claude launch left it byte-identical; switching to Codex and back gave a file byte-identical to the one on this PC.
- **Real `.codex` (M12):** every earlier line kept. `config.toml` gained `status_line` under `[tui]` and `hooks.json` gained the two sound entries, as the change record lists. Codex itself then added the trust entries when Noam chose "Trust all and continue". This PC had no hooks of its own: `UT_Hooks_*` and `UT_ExistingCodexConfig` cover that case.
- **Noam saw:** no Windows warning, Codex opened, the picker worked, and this session came back on Claude.
- **Noam's decisions from this run, not in this build:** the button wording and one right-click entry per agent.

**Hidden runs, 2026-11-06, commit `987e79b`.** Noam asked to stop reinstalling, so this build was never run through its installer. The two installed files that differ from `72760e3` (`claudecode-launchpad.bat`, `folder-picker.html`) were copied in, and the right-click entries were written by the installer script's own lines (`test-tools\apply-rightclick.js`). `test-tools\c-tests.js` then ran the real launcher and the real Codex hidden, from a sealed copy of the installed folder, with Windows Terminal off PATH: 23 of 23 checks passed.

- **M11:** an unreachable folder (`Z:\nope`) stood in for a disconnected network drive.
- **M21:** no newer Codex exists to update to, so only the refresh was run.
- **M24:** Claude and Codex were not started together for real. Two Codex launches left Claude's four hand-off files untouched, and `UT_Launch_ClaudeCodexConcurrent` passes in CI.
- **Handed over by Noam, 2026-11-06 ("you do all of it"):** Claude Code ran these rows, so none of them had a person clicking or listening. `test-tools\n-tests.js` and `real-shell.js`:
  - **M6:** each of the four registry commands, read from the real registry, started the right agent with `AGENT` set to claude and to codex: 8 of 8, hidden, with the real Claude and Codex. In addition, Windows itself ran the two folder entries through its shell (`InvokeVerb`, the request Explorer makes) and opened real tabs in the right folder; screenshots `m6-shell-codex.png`, `m6-shell-claude.png`. The menu was never opened with a mouse, and the two "inside a folder" entries were only run hidden.
  - **M32:** the real shortcut's target, with the folder added as Explorer adds it: Codex with `AGENT=codex`, Claude with `AGENT=claude`. Hidden.
  - **A40:** `C:\` and a real second drive (`X:\`, made with `subst` and removed afterward): each entry started the right agent there. Hidden.
  - **M15:** a real Codex approval prompt through the launcher logged `alert=permission`, `wav=regular\permission.wav` in `alerts.log` at 01:31:58; the clip is a valid WAV. With sound off, a copy of `play.js` with its own settings logged "sound OFF - not played", so the real setting was never changed. **Nobody confirmed hearing the sound.**
  - **M5, M31, button wording:** the picker's real script in the test simulator, with both agents installed. Each profile kept its agent and flags, Claude's `CLAUDE_FLAGS` never held Codex's flag and the reverse, and the button read "Launch ClaudeCode CLI" and "Launch Codex CLI". The picker window itself was not clicked.
  - **A35:** a brand-new Codex profile through the launcher; Noam signed in through the browser. Introduction, then hook review, then the sandbox question, as in QUICK_START. "Use non-admin sandbox" gave "Sandbox ready" and `sandbox = "unelevated"`, with no Windows prompt.
  - **A37:** screenshot of a real tab. The text arrives intact and the tab title is correct, but Windows Terminal draws Hebrew left to right inside the session, so each word's letters read backwards: `כתוב` shows as `בותכ`, in the message, in Codex's reply and in the folder path. The picker already says "Right-to-left display works only with Claude Code", so this is the documented limit, not a new fault, but "displays readably" is not met. Noam accepted this for v3.3.0 on 2026-11-06.
- **A34:** rerunning `configure-codex.js install` and `commit` changed no byte of `hooks.json` or `config.toml`, Codex started with no review screen, and the Claude side stayed identical. The upgrade to a higher version was not run: Noam excepted it on 2026-11-06.
