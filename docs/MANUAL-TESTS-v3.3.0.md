# Manual release tests: the Codex option (v3.3.0)

*The release gate from the handout, section 10, and `REQUIREMENTS-codex-option.md`. Every row needs a commit, PC, date, result and a screenshot or log before release. Empty means not run yet.*

## Exceptions approved by Noam

Noam, 2026-11-05: "we do not need Clean-machine test. we do not have a second PC or a virtual machine for those". The handout allows an exception only with his written approval; this is it.

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

**Remaining risk:** no real first-time install of v3.3.0 has run on a PC without Launchpad, Node.js or an AI agent. A fault that appears only there would reach new downloaders first.

## Before running

- The installer closes only the folder picker (`close-launchers.js`), so a Claude session open in a terminal tab survives it. That tab still runs the old launcher until it is reopened.
- Smart App Control is on on Noam's PC, so sign the test build first (below). **Do not use `sign-and-release.cmd` for a test build:** it signs the latest published release and uploads to GitHub.
- Build from a commit, so the results can name it: `makensis /INPUTCHARSET CP1252 /V2 /WX ClaudeCode_Launchpad_CLI_Setup.nsi`. Without `/INPUTCHARSET`, NSIS stops with "Bad text encoding" on a PC whose system code page is UTF-8, as on Noam's PC; GitHub's runners build the script without it.
- For M2: take the "before" copies right before installing, not earlier. `config.txt` and `settings.json` change during normal use.

```
"C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /n "Noam Brand" /fd sha256 /tr http://time.certum.pl /td sha256 /v ClaudeCode_Launchpad_CLI_Setup.exe
```

## Tests, in the order to run them

Who: **C** Claude Code can drive and check it. **N** needs Noam's eyes, ears or clicks, then Claude Code checks the result.
"Temporarily removes npm Codex" means `npm uninstall -g @openai/codex`, which leaves `.codex` alone. Ask Noam first, and reinstall afterward.

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| M2 | Upgrade 3.2.2 to 3.3.0 choosing Claude: `config.txt`, `settings.json`, `profiles.json` and plugin state byte-identical. Expected: status bar shows the reset date; the user PATH may gain `.local\bin` | N, C | | | | |
| M16 | Claude right-to-left cases 02, 03, 05, 05b, 06, 13 unchanged | N | | | | |
| A34 | Reinstall, and upgrade to a higher local test build: no new hook review | C | | | | |
| M4 | Installer run again choosing Codex: Claude remains available and unchanged | N, C | | | | |
| M12 | Existing Codex settings, hooks and status kept; only missing entries added (real `.codex` on this PC) | C | | | | |
| M6 | Right-click "Open with" uses global `AGENT` | N | | | | |
| M32 | Right-click follows global `AGENT`, not the last active profile | N | | | | |
| M5 | Both installed: per-profile agent and flags stay separate | N | | | | |
| M31 | One profile Claude to Codex to Claude: no flag leakage | N | | | | |
| M7 | Continue last with no history reaches a fresh session | C | | | | |
| M8 | Hebrew response language works with no existing instructions | C | | | | |
| M29 | Existing `developer_instructions` kept; language line skipped with a note | C | | | | |
| M9 | Codex never starts Claude's auto-continue watcher | C | | | | |
| M10 | Exit Codex, type `codex`: same options, no startup text | N, C | | | | |
| M11 | Hebrew folder, drive root, disconnected network drive | N | | | | |
| M15 | Voice OFF: Codex alerts silent. Also S8's open items: sounds play, no console flash | N | | | | |
| M17 | Startup uses the first-message argument, not timed typing | C | | | | |
| M30 | First message survives all setup screens, sent once | C | | | | |
| M18 | Profile `OPENAI_API_KEY` works and is masked in preview. Needs an API key | N | | | | |
| M20 | Custom npm prefix resolved | C | | | | |
| M21 | After a Codex update, next picker shows the refreshed model list | N, C | | | | |
| M22 | Sign-in left open 5 minutes, through the launcher: tab stays open, no retry | C | | | | |
| M23 | Two Codex launches within one second keep separate data | N, C | | | | |
| M24 | Claude and Codex within one second: neither touches the other's data | N, C | | | | |
| M27 | Saved model removed from the catalog: notice, default model used | C | | | | |
| M28 | Custom `-m` plus picker model: one `-m`, the custom one | C | | | | |
| A33 | Installer as administrator still installs; no elevated interactive Codex | N | | | | |
| A35 | Normal user: sandbox screen explained, non-admin choice works (fresh profile) | N, C | | | | |
| A37 | Hebrew startup text in a Hebrew folder arrives and displays readably | N | | | | |
| A38 | Quotes, `%`, `!`, `^`, `&`, Hebrew reach Codex as typed and match the preview | C | | | | |
| A40 | Right-click on a drive root or second drive through Explorer | N | | | | |
| A42 | Bad options from `CODEX_FLAGS` on a right-click: reason shown, Codex not started | C | | | | |
| A43 | `config.toml` with dotted or inline `tui` left unchanged | C | | | | |
| M25 | Codex install fails with Claude present: `AGENT` stays claude. Temporarily removes npm Codex | N, C | | | | |
| M26 | Installer killed during download, rerun repairs. Temporarily removes npm Codex | N, C | | | | |
| A36 | Older npm Codex: notice, then updated. Non-npm older copy left alone. Temporarily installs an old version | N, C | | | | |
| A39 | Installer stopped right after verifying, and before: correct agent either way | N, C | | | | |
| M13 | Uninstall removes only Launchpad's Codex entries; agents, sign-in, sessions kept. Run last, then reinstall | N, C | | | | |
| A44 | Uninstall after Node.js removed: plain message, finishes. Only if Noam agrees to remove Node.js | N | | | | |

Covered by automated tests with no manual run needed: A45 to A49 (`REQUIREMENTS-codex-option.md`, automated coverage).
