# Manual release tests: GitHub Copilot CLI (v3.4.0)

*Every row needs a commit, date, result and evidence before release. Empty means not run yet. Requirements: `REQUIREMENTS-copilot-option.md`. Real Copilot behavior: `STEP0-results-copilot.md`.*

Who: **C** Claude Code can drive and check it (`test-tools\e2e-copilot.js`: the branch's real launcher and the real Copilot, hidden, in a throwaway `COPILOT_HOME`). **N** needs Noam's eyes, ears or clicks. Results from a hidden run are not results from a real install; the "real install" rows below are.

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| E1 | Right-click on a new folder, first run of a profile: trust, terminal offer, first message sent once | C | `52475c3` | 2026-11-06 | PASS | `evidence\e2e\rightclick.txt` |
| E2 | The `done` sound's hook fires once for a turn | C | `52475c3` | 2026-11-06 | PASS by alert log; not heard | `alerts.log` |
| E3 | `npm -v` works inside Copilot through the launcher, with nothing installed | C | `52475c3` | 2026-11-06 | PASS: printed `11.13.0` | `evidence\e2e\npm.txt` |
| E4 | The `permission` sound's hook fires on a real prompt | C | `52475c3` | 2026-11-06 | PASS by alert log; not heard | `alerts.log` |
| E5 | Response language Hebrew, through `config.txt` | C | `52475c3` | 2026-11-06 | PASS: replied in Hebrew | `evidence\e2e\hebrew.txt` |
| E6 | N'Ko with the firmer wording: letters arrive; whether the text is good needs a reader | C, N | `52475c3` | 2026-11-06 | PARTIAL: letters in 2 of 3. GPT-6 Luna wrote N'Ko, MAI-Code-1.1-Flash answered in English. Text quality not judged | `evidence\e2e\nko1.txt` to `nko3.txt` |
| E7 | Continue reopens this folder's conversation, not a newer one from another folder | C | `52475c3` | 2026-11-06 | PASS: its own conversation, not the newer one from another folder | `evidence\e2e\conv-yes.txt` |
| E8 | Continue with no history never opens another folder's conversation | C | `52475c3` | 2026-11-06 | PASS: a new conversation | `evidence\e2e\conv-none.txt` |
| E9 | Pick from history opens the list | C | `52475c3` | 2026-11-06 | PASS | `evidence\e2e\conv-pick.txt` |
| E10 | `--yolo` refused, with the reason on screen | C | `52475c3` | 2026-11-06 | PASS | `evidence\e2e\conv-yolo.txt` |
| E11 | After `/exit` the tab stays at a prompt; typing `copilot` relaunches with no second message; `exit` removes the launch folder | C | `52475c3` | 2026-11-06 | PASS | `evidence\e2e\relaunch.txt` |
| E12 | One Ctrl+C warns; two reach the prompt | C | `52475c3` | 2026-11-06 | PASS | `evidence\e2e\ctrlc.txt` |
| R1 | Real install from a signed build, choosing GitHub Copilot, on a PC with Claude and Codex: right-click entries appear, `AGENT=copilot` | N, C | | | | |
| R2 | Real install keeps Claude and Codex working: their settings byte-identical (`test-tools\m2-snapshot.js`) | N, C | | | | |
| R3 | A real right-click on each Copilot entry opens Copilot in that folder | N | | | | |
| R4 | The picker: agent choice, wording, a Copilot profile keeps its own settings | N | | | | |
| R5 | First message after a real `/login` in an empty profile: is it sent, or must it be retyped? The docs say to retype it | N, C | | | | |
| R6 | Hearing the `permission` and `done` sounds, and silence with sound off | N | | | | |
| R7 | Saying Yes to the terminal offer, with Windows Terminal's settings backed up first: Launchpad's own settings survive it | N, C | | | | |
| R8 | Uninstall removes `launchpad-sounds.json` and the right-click entries; Copilot, its sign-in and its sessions stay | N, C | | | | |
| R9 | How Hebrew and the terminal color look in a real tab, as the docs describe | N, C | `52475c3` | 2026-11-06 | PASS by screenshot, in a tab opened by hand, not through an install: Hebrew shows left to right with each word's letters reversed. The standard theme is white; `/settings theme default` shows the light blue | `evidence\e2e\look-hebrew.png`, `theme-default.png` |
| R10 | `install-copilot` for real: a fresh install, and an old copy updated with its notice. Throwaway npm folders | C | `52475c3` | 2026-11-06 | PASS: fresh in 17 s; 1.0.65 updated to 1.0.106; both verified and set `AGENT` | `evidence\e2e\install-fresh.txt`, `install-update.txt` |
| R11 | A real stand-alone Copilot (the winget package): found, version read and started through the launcher, also with Node below 22. The automated tests use a stand-in | N, C | | | | |

**About the versions:** Step 0 tested 1.0.105. Copilot updated itself to 1.0.106 during these runs, and the screenshots show 1.0.106. With auto-update on, even an old npm package runs the newest copy already downloaded, so the version Launchpad reads is the one that really runs.

**About the commit:** these results are on `52475c3`. `0f4dcd1` came later and only changes what happens on Node below 22. This PC has Node 24, so it doesn't affect them.

**Rerun E7, E8 and E9 against the Copilot version current on release day.** Continue reads Copilot's internal files, and Copilot updates itself.
