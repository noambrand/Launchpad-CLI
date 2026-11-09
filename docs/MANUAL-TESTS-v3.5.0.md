# Manual release tests: Google Antigravity CLI (v3.5.0)

*Every row needs a commit, date, result and evidence before release. Empty means not run yet. Requirements: `REQUIREMENTS-antigravity-option.md`. Real Antigravity behavior: `STEP0-results-antigravity.md`.*

Who: **C** Claude Code can drive and check it (the branch's real launcher and the real Antigravity, hidden, with the real `~\.gemini` or a throwaway user profile). **N** needs Noam's eyes, ears or clicks. Results from a hidden run are not results from a real install; the "real install" rows below are.

Be careful with `/` in Git Bash: it turns `/config` into a file path, and one message went to the agent that way in Step 0. Use `MSYS_NO_PATHCONV=1`.

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| E1 | Right-click on a new folder, first run of a profile: sign-in already done, colour scheme, "Terms of Service & Data Use" (tick cleared, Done), folder trust, then the first message sent once | C | | | | |
| E2 | Continue in a folder with history reopens that folder's conversation, not another folder's | C | | | | |
| E3 | Continue in a folder with no history starts a new conversation and never opens another folder's | C | | | | |
| E4 | Continue in a folder spelled with different capital letters than the first run: the case-sensitivity limit is as documented (Launchpad starts agy in the folder's real spelling) | C | | | | |
| E5 | Pick from history prints "Type /resume to choose a conversation." and starts a normal session; typing `/resume` lists conversations | C | | | | |
| E6 | Response language Hebrew, through `config.txt`: the first reply is in Hebrew in a folder with no `AGENTS.md`; the documented limit with the folder's own `AGENTS.md` is as written | C | | | | |
| E7 | `--dangerously-skip-permissions`, `--mode auto`, `--settings`, `--remote-control` and `--remote-agent` in a profile's flags are each refused, with the reason on screen and agy not started | C | | | | |
| E8 | After `/exit` the tab stays at a prompt; typing `agy` relaunches with no second message; `exit` removes the launch folder | C | | | | |
| E9 | One Ctrl+C warns ("press ctrl+c again to exit"); two reach the prompt | C | | | | |
| E10 | The status line shows the model, the context used, and the weekly quota left with its reset day and hour; a user `statusLine` in `settings.json` keeps theirs | C | | | | |
| E11 | The `done` hook fires once per turn, including a turn with a tool call, by the alert log; nothing after Esc; nothing in a session started by hand (no `KIVUN_ANTIGRAVITY`) | C | | | | |
| E12 | `npm -v` works inside Antigravity through the launcher, with nothing installed | C | | | | |
| E13 | A path with spaces, Hebrew letters and the characters `% ^ & < > !` and the pipe sign reaches agy unchanged as the folder and as the first message | C | | | | |
| R1 | Real install from a signed build, choosing Antigravity (Google), on a PC with Claude, Codex and Copilot: the page shows four choices, right-click entries appear, `AGENT=antigravity`, `agy.exe` found and recorded in `kivun-antigravity-path.txt`, the four plugin files written | N, C | | | | |
| R2 | Real install keeps the other agents working: Claude's, Codex's and Copilot's settings and Windows Terminal's settings byte-identical (`test-tools\m2-snapshot.js`); `config.txt` differs only in `AGENT` and the new lines | N, C | | | | |
| R3 | A real right-click on each entry, "Open with Antigravity CLI" on a folder and "Open Antigravity CLI here" inside a folder, opens Antigravity in that folder | N | | | | |
| R4 | The picker: the agent choice with four agents, the button says "Launch Antigravity CLI", the data-use note shows, an Antigravity profile keeps its own settings | N | | | | |
| R5 | Hearing the `done` sound at the end of a reply, and silence with sound off | N | | | | |
| R6 | Uninstall removes the plugin folder (`~\.gemini\config\plugins\launchpad`) and both right-click entries; `agy.exe`, its sign-in (the `gemini:antigravity` Credential Manager entry) and its conversations stay | N, C | | | | |
| R7 | The data-use step as a new user sees it: the installer's note and finish page, the picker's note and Quick Start say to press Enter to clear the tick, then the Down arrow, the Right arrow and Enter on Done. On a fresh sign-in, this confirms the keys: the "Terms of Service & Data Use" screen comes after the sign-in and the colour scheme, the tick is set, Enter clears it, the Down arrow then the Right arrow reach Done (the screen's own hint doesn't mention Right), and Enter on Done goes on; `/config` then shows Enable Telemetry off | N | | | | |
| R8 | `install-antigravity` for real: a fresh install from Google's script, and an old copy updated first; exit 7 with the manual line when the download fails | C | | | | |
| R9 | The Diagnostics tool on the installed build shows the Antigravity section with the version and all files present, and prints no account details | N, C | | | | |

**About the versions:** Step 0 tested Antigravity 1.5.3, which updates itself about every 15 minutes. Continue reads Antigravity's own files, and the status line reads its JSON, so rerun E2 to E5 and E10 for each release.

**About the other agents:** the full automated suite must also pass: the Claude golden comparison against v3.2.2 stays empty, and Codex and Copilot behave as in 3.4.0. On this PC, Smart App Control sometimes blocks the compiled stand-ins that tests build (Code Integrity events 3077 and 3033), so a local failure there can be false; rerun that file alone, and CI is the gate.
