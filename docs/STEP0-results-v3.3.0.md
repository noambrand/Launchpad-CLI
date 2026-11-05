# Step 0 results: the Codex option (v3.3.0)

*Redone 2026-11-05 after a PC crash lost the first set from 2026-10-31. Windows 11 Home x64, normal user (not elevated), Smart App Control on, Launchpad 3.2.2 installed, Codex 0.166.0 (the latest on npm that day). Codex's full-screen UI was driven through a real Windows pseudo console by a test tool, so the screens and exit codes below are what Codex actually did. Nothing here needed a Launchpad build. Requirements: `REQUIREMENTS-codex-option.md`. Manual release tests: `MANUAL-TESTS-v3.3.0.md`.*

| # | Check | Result | What happened |
|---|---|---|---|
| S1 | npm install | PASS | Fresh `npm install -g --prefix` in a throwaway folder: 16 s, 480 MB, `codex-cli 0.166.0`, Windows package `codex-win32-x64`. No optional-dependency error, so the pinned-pair repair was not needed. Real copy: `npm prefix -g` is `%APPDATA%\npm`; `where codex` finds `codex` and `codex.cmd` there |
| S1b | Installed another way | EXCEPTED | Needs a second PC (see the exceptions in `MANUAL-TESTS-v3.3.0.md`). Unit test: `UT_Install_ExistingStandaloneUsed` |
| S2 | ARM64 | EXCEPTED | No ARM64 device |
| S3 | First-run screens | PASS | Fresh profile, browser sign-in. Screens and order recorded below. Left open 5 minutes on the first screen: stayed open, no retry, no exit. The browser sign-in on a managed PC is excepted: no such PC |
| S4 | Resume, no history | PASS | `codex resume --last` in a never-used folder: "Resuming session..." then a fresh session. No error, no picker, no exit, still running at 25 s. No retry logic needed |
| S5 | Unknown flag | PASS | `codex --not-a-flag`: exit code 2 in 0.3 s |
| S6 | Language | PASS | "hi" with the Hebrew line got a Hebrew reply. Launchpad's TOML form of the N'Ko line (with the apostrophe) got an N'Ko reply |
| S7 | Status line | PARTIAL | Renders. On this account the limit items show as "monthly 90% left", not separate five-hour and weekly. Readability on the kivun light-blue background needs eyes in the real terminal |
| S8 | Hooks | PASS except sounds | See below. Whether the sounds play, and any console flash, still need a person listening and watching |
| S9 | Hebrew folder | PASS | Codex started and answered in a Hebrew-named folder with a space in the name |
| S10 | Model list | PASS | `codex debug models`: JSON with 6 entries, 3 with `visibility:"list"`, all with `slug`, `display_name` and `visibility` |
| S11 | Deferred first message | PASS | Fresh profile: held through sign-in, the introduction and the hook review screen, never typed into any of them, delivered exactly once, before the sandbox question (both "Trust all" and "Continue without trusting"). In a Git folder it was also held behind the folder-trust screen for 20 s with no key pressed, and sent once after "Trust and continue" |
| S12 | Duplicate options | PASS | Repeated `-m`, `-s` and `--search`: refused, exit 2. Repeated `-c` is accepted. Launchpad's composition keeps one model and reports the rest |
| S13 | Minimum version | PASS at 0.166.0 | Every result here is on 0.166.0, so it is the verified minimum. Older versions were not tested. `MIN_VERSION` in the code is already 0.166.0 |

## S8 detail: Q4 (`done` only on a completed turn)

The test hooks only wrote to a log, in the exact shape Launchpad writes (`timeout: 10`, `async: true`, no matcher).

| Situation | `Stop` | `PermissionRequest` |
|---|---|---|
| Short reply, twice | once each | none |
| Multi-step turn (a progress message, a failed command, an approval, a final reply) | once, only at the end | once, before the prompt |
| Permission refused with Esc | none | once |
| Interrupted with Esc during a long reply | none | none |
| Embedded mode: `-c` language line, Hebrew session | once per finished turn | once |

**Q4 is verified: the Codex `done` hook stays.** Not tested: a turn that ends in a model or network error.

- Review screen: blocking, at startup. "Hooks need review / 2 hooks are new or changed. / Hooks can run outside the sandbox after you trust them." Choices: "1. Review hooks", "2. Trust all and continue", "3. Continue without trusting (hooks won't run)". Enter confirms, Esc skips.
- "Continue without trusting": the hooks did not run, and the screen came back at the next launch.
- Approval survived a restart, and survived rewriting an identical `hooks.json`.
- Trust is stored in `config.toml` under `[hooks.state.'<path>:permission_request:0:0']` and `[hooks.state.'<path>:stop:0:0']`.
- `/hooks` still exists: a screen listing hooks by event, for managing them later.

## S3: first screen

```
Welcome to Codex, OpenAI's command-line coding agent
Choose how you want to use Codex.
> 1. Sign in with ChatGPT    (Usage included with Plus, Pro, Business, and Enterprise plans)
  2. Sign in with Device Code    (Sign in from another device with a one-time code)
  3. Use an OpenAI API key    (Pay for what you use)
  4. Use Amazon Bedrock    (Connect using your AWS credentials)
Press enter to continue
```

Order on a fresh profile with a startup message and unreviewed hooks, 2026-11-05:

1. The screen above. "Sign in with ChatGPT" opens the browser, with the link shown in case it doesn't.
2. "You're in control": "Learn about permissions and approvals", "Codex can make mistakes", "Included with your ChatGPT plan". Press Enter.
3. "Hooks need review".
4. The main screen. The startup message is sent and answered.
5. Over the main screen: "Set up the Codex agent sandbox to protect your files and control network access." Choices: "1. Set up default sandbox (requires Administrator permissions)", "2. Use non-admin sandbox (higher risk if prompt injected)", "3. Quit". Choice 2 gave "Sandbox ready" and wrote `sandbox = "unelevated"` under `[windows]`, with no Windows prompt. Choice 1 was not run: it needs an administrator prompt.

Choosing "Sign in with Device Code" shows `https://auth.openai.com/codex/device` and a one-time code that expires in 15 minutes. On Noam's account, entering the code stopped with: "Enable device code sign-in for Codex, Excel, PowerPoint, and Word in ChatGPT Security Settings, then run "codex login --device-auth" again." The setting was left off, so the device-code path was not completed. Esc on that screen returns to the choices.

## Differences from the handout

| Finding | Effect | Action |
|---|---|---|
| Hook review is a startup screen with three choices, not only `/hooks` | Docs told users something they would not see | Fixed in README, QUICK_START, TROUBLESHOOTING, CHANGELOG and the installer's finish text |
| Any `-c`, `--enable`, `--disable` or `--search` shows "1 warning" (F2): "Running without the shared background server: command-line configuration overrides ... requires embedded mode." | Harmless, but everyone with a response language or `--search` sees it. Hooks still fire in this mode | Explained in QUICK_START and TROUBLESHOOTING |
| `-a untrusted` is refused by 0.166.0 (only `on-request` and `never`) | None: Launchpad already refuses it with a message | None |
| The folder-trust question appeared in Git project folders; new plain folders opened without it. Text: "Folder access / Trust this folder? Codex can read, edit, and run files here, subject to your permission settings. Folder settings can run code automatically, even without a model request. Continue only if you trust these files. Your trust decision will be saved." Choices: "1. Trust and continue", "2. Back to Agent Command Center" | Docs implied it always appears | Fixed in QUICK_START and README |
| First-run order differs from the docs: hook review comes before the sandbox question, and the message is sent between them | Docs listed trust, sandbox, then hooks | Fixed in QUICK_START and README |
| Device-code sign-in can be off on an account | The docs' fallback for a blocked sign-in page can stop with a message | Explained in QUICK_START and TROUBLESHOOTING |
