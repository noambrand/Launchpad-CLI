# Google Antigravity CLI, Step 0 results

Run 2026-11-08, 19:45 to 20:15, on this PC, with Antigravity CLI (`agy`) 1.5.3, signed in with Noam's usual Google account (G3), on the free "Antigravity Starter Quota". Antigravity has no setting to keep its files elsewhere, so the real `~\.gemini` was used; it didn't exist before. Screens are in `test-tools\evidence\antigravity\` (the account's e-mail masked), driven hidden with `test-tools\agy-drive.js` and `ptyrun.py`. Nothing in Launchpad, Claude, Codex, Copilot or Windows Terminal changed (`m2-snapshot.js compare agy-before agy-after`).

**Result: nothing blocks Antigravity as a fourth agent.** Four parts of the plan changed. Language goes through a Launchpad plugin hook instead of a rules file. Hook commands can't hold quotes. "Choose from a list" can't be started from outside. And there is no `permission` event. Three points need Noam's decision (end of file).

| # | Check | Result | What it means for Launchpad |
|---|---|---|---|
| A1 | Install | **PASS.** Google's `install.cmd`, read in full first: curl, findstr, certutil, no PowerShell; manifest from Google's update server, SHA-512 check against the manifest, copy to `%LOCALAPPDATA%\agy\bin\agy.exe`, then `agy install`, which only adds that folder to the user PATH. 225 MB. **Signed by Google LLC**, `signtool verify /pa` passes. Smart App Control didn't block it. The script refuses a starting command line holding `& | ; < > ^`, and exits 0 even if `agy install` fails. It leaves an empty `%LOCALAPPDATA%\antigravity\staging` | Installer runs Google's script without `&&`, then checks the file and `agy --version` itself. It doesn't check the signature, because that needs PowerShell or signtool (spec D3). No Node needed for the agent |
| A2 | First screens | **PASS.** Sign-in choice (Google OAuth / Google Cloud project) → browser; the page gives a code to paste back → colour scheme (`terminal` preselected) → **Terms and data use** → folder trust. No rendering-mode screen. Each new folder asks trust again. The sign-in screen waited 3.5 minutes untouched | Plain steps in Quick Start, including pasting the code |
| A3 | Data use (G2) | **The opt-out is a tick on the first-run Terms screen, already set:** "Yes, I agree to help improve Antigravity CLI by allowing Google to collect and use my Interactions data". Enter clears it; Antigravity goes on. `/config` then shows "Enable Telemetry: off", still off in a new session and folder. It isn't in `settings.json` or other local files; it's kept with the account | **The installer can't preset it.** Launchpad tells users, before their first launch, to clear that tick (Noam's fallback in G2). `/config` can turn it off later |
| A4 | Continue | **PASS.** `-c` uses `~\.gemini\antigravity-cli\cache\last_conversations.json`. A never-used folder gets a new conversation, not another folder's; the right folder gets its own; a Hebrew folder with a space works. **Folder names are case-sensitive** (`C:\KT\AGY\W1` is a new folder); a trailing backslash is ignored | Use `-c` as is. Start agy in the folder's real spelling (`fs.realpathSync.native`) |
| A5 | First message | **PASS.** `-i` waits behind the trust screen and is sent once. Text starting with `-` is sent unchanged. `-c -i` continues and sends. **`-i "/resume"` goes to the model as text**; typed in a session, `/resume` opens a list of every folder's conversations | No special form for `-`. "Choose from a list" can't be started by Launchpad (see the decision list) |
| A6 | Language | **PASS, Hebrew 4 of 4,** through a Launchpad plugin whose `SessionStart` hook adds the Copilot wording ("Always respond in Hebrew, whatever language the user writes in. Do not answer in English.") **only when the launch sets a Launchpad variable.** Without it: English. Continue keeps the conversation's first language. The folder's own `AGENTS.md` applied from the second message on, in both folders tried, but not to the first `-i` message | No user file is written. Sessions started by hand, and the Antigravity app and IDE (which share `~\.gemini\config`), get nothing. Limits for the docs: the first message may miss the user's own `AGENTS.md`; changing a profile's language doesn't change an old conversation |
| A7 | Sounds | **PASS for `done`:** `Stop` fires once per turn (`terminationReason: NO_TOOL_CALL`), including a turn with a tool call; not while an approval prompt shows; not after Esc. The plugin loads with no trust screen. **There is no event for an approval prompt.** Hook commands run through `cmd /c` with their quotes broken, so **no quotes or spaces in a hook command**: a relative `.\hook.cmd stop` in the plugin folder, building paths from `%~dp0`, works, also from a Hebrew folder with a space (simulated) | One plugin folder of Launchpad's own, `~\.gemini\config\plugins\launchpad\`: uninstall deletes it. Hooks block the turn, so the script must return at once (Copilot's D12) |
| A8 | Odd inputs | **PASS.** `%PATH% ^ & | < > ! "q" שלום` arrives unchanged when agy.exe is started directly. Unknown option: exit 2 with a message. Ctrl+C once: "press ctrl+c again to exit"; twice: exit 0 | Start agy.exe with an argument array, never through `cmd` |
| A9 | `npm` inside the agent | **Same as Copilot:** the agent's shell is PowerShell; `npm -v` fails ("running scripts is disabled"); with `PSExecutionPolicyPreference=RemoteSigned` for that session it prints `11.13.0` | Reuse Copilot's rule C3: set it only when no policy was chosen |
| A10 | Footer, settings, updates | The footer shows only the model ("Gemini 3.8 Flash · high"). **`--settings` works and isn't saved** (`settings.json` byte-identical after). A `statusLine` command gets JSON close to Claude Code's: model, `context_window.used_percentage`, weekly quota (`gemini-weekly.remaining_fraction`, reset time), plan, folder. It runs in the user's folder, so it must be found by a bare name: **putting Launchpad's folder on PATH for the agy process only works, from a Hebrew folder with a space.** `agy update` exits 0 when current, with no pseudo console | A status line is possible per launch with no user file edited (decision below) |
| A11 | Options | `agy --help` in `evidence\antigravity\a11-help.txt`. Approval bypasses: `--dangerously-skip-permissions`, `--mode auto`, and `--settings` (it could set `toolPermission: always-proceed` or `agentMode: auto`). Also `--remote-control` and `--remote-agent` | Refuse the bypasses in profile flags, as D14. Remote options: decision below |

## Defaults seen in `/config`

Tool Permission `request-review` (edits and commands ask; **reading files doesn't ask**), Agent Mode `default`, Non-Workspace Access off, Notifications off, Use AI Credits off, Colour Scheme `terminal`, Sandbox off, Show Feedback Survey on.

## Not run

- Drive root: trusting `C:\` would trust the whole drive for every later session.
- Whether the background updater flashes a window: a hidden run can't show it.
- The same conversation open in two tabs.
- A real user profile with Hebrew and a space: simulated with `cmd /c` in such a folder.
- Hearing the sounds: that's for Noam, on the v3.5.0 test sheet.

## Mistakes and cost

- **19:54: one message went to the agent by mistake.** Git Bash turned `/config` into `C:/Program Files/Git/config`. The data-use tick was already cleared, and Claude Code cancelled it with Esc, but the agent had already read that path.
- **20:01: one run from Bash, with no pseudo console, sent its test message** (`-x Reply with just the word ok`) and then hung until killed.
- **The model also finished an interrupted 400-word story** after `-c`.
- **About 14 messages in all:** the weekly Gemini quota went from 100% to about 95% remaining.

## Left on this PC

- Antigravity 1.5.3 in `%LOCALAPPDATA%\agy\bin`, on the user PATH.
- `~\.gemini`, holding the sign-in data and test conversations.
- A `gemini:antigravity` entry in Credential Manager.
- Throwaway folders in `C:\kt\agy`, including the test plugin, moved out of `~\.gemini\config\plugins` to `C:\kt\agy\plugin-launchpad-step0-moved`.

To remove the sign-in, delete that Credential Manager entry. Whether Antigravity has a `/logout` command wasn't checked.
