# Requirements: GitHub Copilot CLI as a third agent (v3.4.0)

*Follows `REQUIREMENTS-codex-option.md`: every rule there about Claude staying frozen, user text never passing through a shell, and no bypass flags applies here too. Real Copilot behavior: `STEP0-results-copilot.md`. Manual release tests: `MANUAL-TESTS-v3.4.0.md`.*

## Noam's decisions (2026-11-06)

| # | Decision |
|---|---|
| C1 | Copilot is added after v3.3.0 ships, as v3.4.0. |
| C2 | **Continue keeps no record of Launchpad's own.** It reads Copilot's own session folders. |
| C3 | **PowerShell 7 is not installed.** Noam said "yes if that is the way" to installing it, then left the choice to Claude Code ("you do all of it") once a simpler way was found: for Copilot's session only, set `PSExecutionPolicyPreference=RemoteSigned`, when nobody chose a policy. To reverse this: one line in `configure-copilot.js`, plus the installer. |
| C4 | Right-click, button and picker wording follow the Codex pattern Noam chose: "Open with Copilot CLI", "Open Copilot CLI here", "Launch Copilot CLI". |

## Design decisions, and the facts behind them

| # | Decision | Why |
|---|---|---|
| D1 | Nothing moves out of `configure-codex.js`. `configure-copilot.js` requires it and reuses its exported helpers. | The plan was a new `agent-core.js`, but two locked tests copy exactly `configure-codex.js` and `agent-helpers.js` into a sealed folder, so a third required file would break them. This also leaves the code Codex's tests passed untouched. |
| D2 | Start `node npm-loader.js` with an argument array, never `copilot.cmd`. | `cmd` would re-read `%`, `^`, `&`. Tested with those characters and Hebrew. Ctrl+C through Node behaves normally. |
| D3 | Never plain `--continue`. | With no conversation in this folder it opens another folder's, in plain folders and in git repos. |
| D4 | Reopen with `--session-id <id>`, not `--resume=<id>`. | `--resume=` exits with an error if the session can't be reopened. `--session-id` never fails. |
| D5 | Skip sessions with no `events.jsonl`. | A session opened and left with no message has none, and Copilot can't reopen it. |
| D6 | Pick from history is `-i "/resume"`. | Plain `--resume` shows no list after a trust screen. |
| D7 | Language: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` pointing at `<Kivun>\copilot-language\<code>`, holding `.github\instructions\language.instructions.md` with `applyTo: "**"`. | Only that form applies at startup. `AGENTS.md` in that folder does not. It adds to the user's own instructions. |
| D8 | A firmer language line for Copilot only. | The automatic model ignored the plain line for N'Ko. Claude's and Codex's line is frozen. |
| D9 | `done` is `agentStop`. | Once per turn, including multi-step turns. Not after an interrupt, a refusal or a startup failure. |
| D10 | `permission` is `notification`, filtered to `permission_prompt`. | `permissionRequest` also fires when no prompt shows, and `notification` also covers other messages. |
| D11 | One hook file of Launchpad's own, `hooks\launchpad-sounds.json`, using `exec` and `args`. | No shell, no review screen, and uninstall deletes one file. So no change record is needed. |
| D12 | The hook script starts the player with no pipes and returns at once. | A pipe kept the hook alive until the clip ended, holding up the end of the turn. Found by a test. |
| D13 | Minimum Copilot 1.0.105. | Reopening with `--session-id` failed on 1.0.65. 1.0.105 is the only version that passed. |
| D14 | Refuse `--allow-all`, `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`, `--yolo`, `--autopilot`, `--mode autopilot`, and `COPILOT_ALLOW_ALL` in a profile. | The same rule as Codex. `COPILOT_ALLOW_ALL="true"` also trusts the folder and loads its hooks. Narrow choices such as `--allow-tool=write` stay the user's. |
| D15 | Copilot's own footer is the status bar. | A custom `statusLine` is documented, but it would edit a settings file the user owns. |
| D16 | No model list. | Copilot has no command for one outside a session, and hard-coded names go stale. A wrong name is reported by Copilot in red, and it continues. |
| D17 | Uninstall deletes the hook file with a plain NSIS `Delete`. | It works with Node.js gone. |
| D18 | Launchpad doesn't set Copilot's `theme`; the docs give `/settings theme default`. | Copilot's standard `github` theme paints over Launchpad's terminal color, and `default` shows it (seen in a real tab). No option or variable sets it per launch, and changing it means editing a settings file the user owns, which would need a change record. |
| D19 | Below Node 22, the installer and the launcher both skip an npm copy and can still use a stand-alone `copilot.exe`. | npm's copy runs on that Node; a stand-alone copy doesn't use Node. The first version refused everything on an old Node, which CI's Node 20 exposed. Tested with a stand-in: Step 0 never ran the real winget package. |

## Acceptance

Automated, in `source/test/`: `UT_Copilot_Compose`, `UT_Copilot_Run`, `UT_Copilot_Sound`, `UT_Copilot_Install`, `UT_Launcher_Copilot`, `UT_Picker_Copilot`, `UT_Installer_Copilot`.

Must also hold:

- Every test that existed in v3.3.0 passes with no edit.
- The Claude golden comparison against v3.2.2 stays empty.
- A Claude launch or install never sees anything Copilot adds. `UT_LauncherCopilot_ClaudeUntouched` and `UT_LauncherCopilot_ScriptPolicyOnlyForCopilot` check this.
