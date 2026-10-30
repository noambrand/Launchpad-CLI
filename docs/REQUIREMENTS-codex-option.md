# Requirements: the Codex option (v3.3.0)

*Feature files: `source/configure-codex.js` (new), `source/agent-helpers.js` (new), `source/claudecode-launchpad.bat`, `source/install.cmd`, `source/config.txt`, `source/folder-picker.hta` and the generated `source/folder-picker.html`, `source/sounds/configure-sound-hooks.js`, `source/sounds/play.js`, `source/launchpad-diagnostics.cmd`, `ClaudeCode_Launchpad_CLI_Setup.nsi`, `.gitattributes`. The CI guard derived from this file is `.github/workflows/validate-codex-option.yml`. The full design, with the reasoning behind each rule, is the build handout `Launchpad_Codex_v3.3.0_Approved_Decisions.md` (decisions D1 to D19, Q1 to Q5); the facts it relies on were verified on Windows at Gate 0 (2026-10-31).*

## Business intent

Someone who prefers OpenAI's Codex, or who already pays for ChatGPT and not for Claude, can install Launchpad, pick Codex once, and get the same convenience Claude users get: a folder picker with profiles, right-click "Open with", a desktop shortcut, the Windows Terminal look, a response language, a status bar and sound alerts. Everyone who uses Launchpad with Claude today notices nothing at all, before or after upgrading.

## Invariants

- **Claude is frozen.** For every Claude setup, the v3.3.0 launcher produces the same command, arguments, working folder, environment and leftover files as v3.2.2 (the 12-case golden comparison). An upgrade from 3.2.2 with Claude leaves `config.txt`, `settings.json`, `profiles.json` and the plugin state byte-identical.
- **Claude is the default.** A missing or unknown `AGENT`, an old profile without an `agent` field, and every `READFILE` picker launch mean Claude.
- **One writer, one commit point for `AGENT`** (D13, D18): only `configure-codex.js set-agent`, called by the installer, writes it, as one atomic replace of `config.txt`. The picker never writes it. A Claude upgrade with no `AGENT` key writes nothing.
- **Nothing is switched silently.** If the chosen agent is missing, the user gets a plain message, never the other agent.
- **Disjoint files** (D19): a Codex launch never reads, writes or deletes Claude's hand-off files (`kivun-workdir.txt`, `kivun-claude-flags.txt`, `kivun-claude-startcmd.txt`, `kivun-env.txt`). The only shared file is `config.txt`, where a Codex launch may write only `TERMINAL_COLOR`.
- **User text never passes through cmd** (D15): startup text, flags and environment values reach Codex byte-identical, through an argument array started by Node with no shell.
- **Codex `done` plays only on a completed turn** (D1, Q4): one sound per finished reply, none after a stop, an error or a refused permission. No timer, no idle guess.
- **Hooks print nothing.** A Launchpad hook never writes to its output (a printed decision would approve or deny a permission request).
- **Hook approval survives upgrades**: Launchpad's two hook entries keep the exact frozen text and positions of the handout, section 5.
- **Launchpad never removes what it did not add.** Uninstall removes only recorded entries whose exact text is still present; it never touches sign-in, sessions, `packages`, user hooks, user status settings, or either AI agent.
- **Existing developer instructions are never replaced** (Q1): when any are detected, or detection is uncertain, the language line is skipped and the picker says so.
- **Never an unpinned install** (D14): Codex is installed only as a pinned pair whose Windows package exists, minimum version 0.166.0. `codex update` is never called. A non-npm copy is never updated or duplicated.
- **Nothing pops up on the user's screen** beyond the terminal the user asked for; helpers run hidden. An interactive Codex session is never started from an elevated process.

## Money and data consequences

- Wrong: a Claude user's setup changes after the upgrade. Launchpad has 1,538+ downloads (README badge at `b980130`); a broken launch reaches every one of those users at once and costs reputation the downloads were built on. This is why Claude is frozen and gated by a byte comparison.
- Wrong: `AGENT` points at an agent that is not installed and Launchpad quietly starts the other one. The user believes they are in Codex while in Claude (or the reverse), on a different account and bill.
- Wrong: a hook prints text. Codex can read it as a decision and approve a command the user never saw.
- Wrong: the language override replaces the user's own developer instructions. Their rules (for example, project safety rules) silently stop applying.
- Wrong: uninstall deletes the user's Codex settings, sessions or sign-in. That loses work and forces a new sign-in; this is why only recorded, still-matching entries are removed.
- Wrong: a profile's API key reaches the other agent or another launch. A secret ends up somewhere the user did not put it.
- Wrong: an unpinned install picks an npm version without its Windows package. The install fails for every new user until OpenAI fixes it.

## Out of scope

- Codex right-to-left display, Kivun/Konsole/WSL routing, macOS Codex, auto-continue for Codex, Codex's own talk mode.
- Writing hook approvals for the user; per-profile `CODEX_HOME`.
- Updating non-npm Codex; running `codex update`; uninstalling either agent; the Netlify site copy.
- Claude's own Claude-vs-Claude hand-off race (Q3), and the other existing gaps listed in the handout, section 12.
- Running Codex slash commands at startup (Q2).

## Known misuse paths

- **Closing a terminal tab instead of leaving Codex.** The launch folder stays behind; the next launch's cleanup removes it once the tab's process is gone and it is over 24 hours old.
- **Continuing a conversation that is still open in another window.** Codex shows "This conversation is open in another app" and holds the first message; the picker note tells the user to close the other window or press R.
- **A long custom `CODEX_HOME`.** Codex's background server fails; the runner adds `--no-daemon` and logs why.
- **Typing startup text that starts with `-` or `/`.** A leading `-` is protected with `--`; a leading `/` is refused with a plain message (slash commands do not run at startup).
- **Two different `-m` values** (one in custom flags, one from the picker). Launchpad keeps exactly one: the user's custom value wins.
- **Switching a profile between agents.** Each agent's options stay in their own fields; nothing leaks across.
- **Running the installer as administrator.** It still installs; it never starts an interactive Codex session.

## Acceptance

Each line is observable on Windows 11 x64, normal user, Windows Terminal, unless it says otherwise. Windows 10 repeats A1 to A3, A13 and A23. Each has a results row with commit, PC, date, result and a screenshot or log.

| ID | Observable result |
|---|---|
| A1 | Fresh install, Claude chosen: every v3.2.2 launch path behaves as before (golden comparison empty) |
| A2 | Upgrade 3.2.2 → 3.3.0 with Claude: `config.txt`, `settings.json`, `profiles.json` and plugin files byte-identical before and after |
| A3 | Fresh install, Codex chosen: install, sign-in, folder trust, sandbox screen, hook review, status bar and permission sound all work; one done sound per finished reply |
| A4 | Claude installed, installer run again choosing Codex: Claude still starts from a `READFILE` picker launch and is unchanged |
| A5 | Both installed: two profiles with different agents keep their own agent and flags |
| A6 | Right-click "Open with" starts the agent in global `AGENT` |
| A7 | Codex "continue last" in a folder with no history opens a fresh conversation |
| A8 | Hebrew response language, no existing developer instructions: Codex replies in Hebrew |
| A9 | A Codex launch never starts Claude's auto-continue watcher |
| A10 | After leaving Codex, typing `codex` in the same tab relaunches it with the same options and no startup text |
| A11 | Codex starts in a Hebrew-named folder, at a drive root, and gives a plain message for a disconnected network drive |
| A12 | Existing Codex settings, hooks and status line are kept; only missing Launchpad entries are added |
| A13 | Uninstall removes only Launchpad's recorded Codex entries; both agents, sign-in and sessions remain |
| A14 | Fresh Codex install while offline: a plain repair message, no false "installed" |
| A15 | Voice switched off: no Codex sounds |
| A16 | Claude right-to-left cases 02, 03, 05, 05b, 06 and 13 unchanged |
| A17 | Codex startup text arrives through the first-message argument; `inject-startup-cmd.js` never runs for Codex |
| A18 | A profile's `OPENAI_API_KEY` works and is masked in the picker preview |
| A19 | A compatible standalone Codex already installed is used; no second copy is installed |
| A20 | A custom npm prefix is found and used |
| A21 | After a Codex update, the next picker shows the refreshed model list |
| A22 | Sign-in screen left open five minutes: the tab stays open and nothing retries |
| A23 | Two Codex launches within one second each get their own data and flags |
| A24 | Claude and Codex launched within one second: neither reads or deletes the other's files |
| A25 | Codex install fails with Claude present: `AGENT` unchanged and Claude still works |
| A26 | Installer stopped during the download, then rerun: ends repaired, previous state never corrupted |
| A27 | A saved model removed from the current online list: plain notice, Codex's default model used |
| A28 | Custom `-m` plus a picker model: Codex receives exactly one `-m`, the custom one |
| A29 | Existing developer instructions present: Launchpad's language line is skipped and the picker says why |
| A30 | The first message survives every setup screen: sent once or left unsent in the input box, never twice, never lost |
| A31 | One profile switched Claude → Codex → Claude: no flag or environment leakage; Claude's files unchanged by the Codex launch |
| A32 | Right-click follows global `AGENT`, not the last profile used |
| A33 | No interactive Codex session is started from an elevated process; an installer run as administrator still installs |
| A34 | Reinstalling 3.3.0, and upgrading to a higher local test build, keeps hook approval: no new review prompt |
| A35 | Normal user without admin rights: the sandbox screen is explained by Launchpad's text and the non-admin choice works |
| A36 | Older npm Codex below 0.166.0: the installer says it will update it, then installs the pinned pair; a non-npm older copy is left alone with a clear message |
| A37 | Hebrew startup text in a Hebrew-named folder arrives intact and displays readably |
| A38 | Startup text and custom flags with quotes, `%`, `!`, `^`, `&` and Hebrew reach Codex exactly as typed and match the picker preview |
| A39 | Installer stopped right after Codex is verified, then rerun: Codex selected; stopped before verifying: the previous agent still works |
