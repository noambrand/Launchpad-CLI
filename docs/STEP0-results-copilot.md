# GitHub Copilot CLI, Step 0 results

Run 2026-11-06 on this PC, with Copilot CLI 1.0.105 from npm, in a throwaway `COPILOT_HOME` under `C:\kt\s\copilot`. Nothing was changed in Launchpad or in a real Copilot setup. Screens are in `test-tools\evidence\copilot\`, and the scripts are `test-tools\copilot-tests.js` and `copilot-tests2.js` to `copilot-tests5.js`.

**Result: nothing blocks Copilot as a third agent, but three parts of the plan had to change.**

**Noam's answers, 2026-11-06:** PowerShell 7 through the installer, "yes if that is the way". Launchpad's own per-folder record for Continue, "no". The two sections below "What changes in the plan" record what was tested as a result. Where they differ from the tables, they win.

| # | Check | Result | What it means for Launchpad |
|---|---|---|---|
| S1 | Install | **PASS.** npm: 14 seconds, 165 MB, plus 213 MB unpacked on first run. A winget package exists (MSI), not run | Use npm, as for Codex |
| S2 | Works with no PowerShell 7? | **PARTLY.** It starts, and ordinary work runs on the built-in PowerShell 5.1: it created a file and counted files. **`npm -v` fails inside Copilot** with "running scripts is disabled on this system", because Windows blocks `npm.ps1` by default. A forced `&&` also fails, but Copilot has avoided `&&` on 5.x by itself since 1.0.49 | **Noam decides.** Not confirmed that PowerShell 7 fixes `npm`: downloading a portable copy was refused |
| S3 | First screens | **PASS.** Order: folder trust, then the terminal-setup offer (first run only), then "Please use /login", then an account choice. Stable for 5 minutes on the trust screen and on the sign-in message. An empty profile on this PC needed no sign-in, probably through the GitHub CLI login | Plain steps in the docs. **Not tested:** whether the first message is sent after a real `/login` |
| S4 | `--continue` | **FAILS the requirement.** In a folder with no history, it opens another folder's conversation, in a plain folder and in a real git repo. With history in the folder or its repo, it opens the right one | Replace it with `--session-id`, below |
| S5 | First message | **PASS.** `-i` waits behind the trust screen and the terminal offer, and is sent once. `-i "/env"` runs as a command and spends no credits | Use `-i` |
| S6 | Language | **PASS after a change.** Only a `.github/instructions/*.instructions.md` file with `applyTo: "**"` applies at startup; `AGENTS.md` in that folder does not. Hebrew 5 of 5, including a folder name with Hebrew and a space. The user's own `AGENTS.md` still applied. N'Ko: below | Launchpad-owned folder holding that one file |
| S7 | Sounds | **PASS.** `agentStop` fires once per turn, including a turn with two tool calls, and not after an interrupt, a refusal, or a network failure at startup. `notification` with type `permission_prompt` fires only when a prompt really shows; `permissionRequest` also fires when none shows. No review screen for hooks, and `exec` + `args` runs with no shell | One Launchpad-owned hook file, and a small script that filters by type. **Not tested:** hearing the sounds |
| S8 | Odd inputs | **PASS.** Hebrew folder and drive root work. `%PATH% ^ & \| < >` and Hebrew arrive unchanged when Node starts Copilot directly. A wrong model name shows a red message and continues on the automatic choice. Of two `--model` options, the last wins. Unknown option or session: exit 1 with a message. Hooks that print nothing are fine | Start `node npm-loader.js`, not `copilot.cmd`, so `cmd` never reparses the text |
| S9 | Minimum version | **1.0.105.** On 1.0.65, reopening with `--session-id` showed an empty conversation, and the language line held in 1 of 2 replies | Require 1.0.105, the only version that passed. An older npm copy gets the same notice and update as Codex. Copilot normally updates itself |

## What changes in the plan

| Feature | Plan said | Now |
|---|---|---|
| Continue | `--continue` | **`--session-id <id>`, with the id found in Copilot's own session folders** (see "Continue, with no record of Launchpad's own"). With no conversation for this folder, it starts a new one. Tested on 1.0.105 |
| Choose from a list | `--resume` | **`-i "/resume"`.** Plain `--resume` shows no list after a trust screen, only in a folder already remembered as trusted. The list covers every folder and shows each one's path |
| Language | Any instructions file in the folder | **`.github/instructions/language.instructions.md` with `applyTo: "**"`**, passed with `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` |
| `permission` sound | `permissionRequest` or `notification` | **`notification`,** filtered to `permission_prompt` |
| Status bar | Custom command only described by a third party | Custom `statusLine` is officially documented (`copilot help config`). **Still use the built-in footer in v3.4.0:** it already shows folder, credits and model, and a custom bar would edit a settings file the user owns |
| Node.js | Check the version Launchpad installs | Copilot's docs ask for Node 22 or newer, and Launchpad can find an older copy already installed. Check the version in the installer, with a plain message |

## Continue, with no record of Launchpad's own

Noam said no to a record, so Launchpad reads Copilot's own session folders instead, without changing them. It takes the newest session under `session-state` whose `workspace.yaml` names exactly this folder and which has an `events.jsonl`; a session opened and left with no message has none. It reopens that with `--session-id <id>`, and with none it starts a new conversation.

All passed on 1.0.105 (`copilot-tests6.js`):

| Case | Result |
|---|---|
| A conversation, then four later sessions left empty | Found the conversation |
| A never-used folder while other folders have history | New conversation, not another folder's |
| A conversation started by hand, with plain `copilot` | Found |
| Hebrew folder name | Found |
| Same folder in another case, with a trailing backslash | Found |
| A new message into the reopened conversation | Joined it, sent once |

**The weak point:** `workspace.yaml` and `events.jsonl` are Copilot's internal files, not a documented interface, and Copilot updates itself. If they change, the search finds nothing and Continue starts a new conversation. That is safe, but Continue would quietly stop finding old ones, so this needs a test against each new Copilot version before each Launchpad release. An exact-folder match also means a subfolder doesn't find its parent's conversation; the list does.

## `npm` inside Copilot: PowerShell 7 may not be needed

| Run, same PC, same command `npm -v` | Result |
|---|---|
| Default | Fails: "running scripts is disabled on this system" |
| With `PSExecutionPolicyPreference=RemoteSigned` set for that session | **Works:** printed `11.13.0` |

Microsoft documents that variable as the "Process" scope: it lasts only for that session and writes nothing to the registry. Group Policy still overrides it. It would, however, also override a stricter policy a user chose on purpose, so Launchpad should set it only when no policy has been chosen and the variable isn't already set. Launchpad can check that with `reg query`, with no PowerShell.

**`RemoteSigned` is a real, if modest, loosening of a security setting:** local scripts may run for that session, while unsigned scripts downloaded from the internet stay blocked. Copilot's own approval prompts are unchanged.

**PowerShell 7 itself is still untested here,** because its download was refused. Installing it would also need a machine-wide install with an administrator prompt on every user's PC. **Decision: use the variable, install nothing, and mention PowerShell 7 in the docs as optional.** Noam left this to Claude Code ("you do all of it", 2026-11-06). It is one line to reverse, on an unmerged branch.

## Last facts before writing the code

From `copilot-tests7.js`:

| Check | Result | Effect |
|---|---|---|
| A first message starting with `-` | `-i "-hello"` exits 1. `--interactive=-hello` works | Launchpad uses the second form for such text |
| Folder names in `workspace.yaml` | `w a # b` is written in single quotes. `w it's`, `w [x] {y}`, `w %PATH% & !bang`, a leading space and `-dash` are written plainly | The search reads both forms |
| A hook script path with Hebrew and a space | Ran | `exec` + `args` is safe in such a user folder |
| Ctrl+C through Node | One press: "ctrl+c again to exit", still running. Two: Copilot exits with 0 | Starting through Node is safe |

## Limits to state in the docs

- **N'Ko is not reliable.** With the plain line, N'Ko letters came back in 2 of 4 replies; the automatic model choice answered in English in the other 2. With stronger wording ("whatever language the user writes in. Do not answer in English"), 2 of 2 came back in N'Ko letters, which is too few to rely on. I can't judge the text, but only one of the four N'Ko replies appears to spell "Paris". Launchpad can only pass the instruction. Try the stronger wording for all languages when building, in Copilot's file only, since Claude and Codex stay as they are.
- **The model field can't be checked ahead of time.** No command lists models outside the session. Copilot Free offers only the automatic choice, so any named model falls back to it, with a red message.
- **Continue looks in this exact folder only.** A conversation from a subfolder or parent folder is reached through the list.
- **Copilot asks about folder trust at every launch** unless "Yes, and remember" is chosen.
- **The terminal-setup offer:** No is safe. Yes edits Windows Terminal's settings, and how that fits with Launchpad's own changes there is untested, so it needs a test with a backup.
- **A conversation open in another tab** gets Copilot's own "Session in use" question.
- **`COPILOT_ALLOW_ALL`** must be refused in profile environment variables, along with the bypass flags.

## Still open

1. **First message after a real `/login`:** needs Noam to sign in once in a throwaway profile. It goes on the v3.4.0 test sheet.
2. **Hearing the sounds and reading N'Ko:** Noam, on the v3.4.0 test sheet.

## Terminal color (found after Step 0, on 1.0.106)

Copilot's standard `github` theme paints its own white background over the terminal's color, so Launchpad's light blue doesn't show. `/settings theme default` lets it show, as seen in a real tab. No option or variable sets the theme per launch. See D18 in `REQUIREMENTS-copilot-option.md`.

## Corrections and cost

- **The account is Copilot Free,** as Copilot's `/model` screen says, not the individual paid plan I reported earlier. Its usage screen shows a limit of 200 AI credits a month. Step 0 used about 6, added up from the screens. The usage screen itself still showed 0, so its count may lag.
- **My first batch was invalid for three checks** because of wrong quoting, so they were rerun: multi-word prompts failed, and `/help` went to the model as a question. The "English only" result for the language line was real and led to the file form above.
- **`--model mai-code-1.1-flash` did nothing:** on Free it falls back to the automatic choice, so the "strong wording on Flash" runs used whichever model it picked.
- **Five `codex.exe` processes were still running** after the hidden Codex runs. Some are probably mine; I can't tell which, because the query was refused, so I left them all.
