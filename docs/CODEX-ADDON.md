# The bundled Codex add-on (v3.6.0)

Launchpad's installer tick **Let Claude hand work to Codex** installs OpenAI's Codex plugin for Claude
Code, [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0). Inside Claude,
`/codex:review` has Codex check the work, and `/codex:rescue` hands Codex a job.

## What Launchpad ships

- **The files:** `source/plugins/codex/` is the `plugins/codex` folder of the release named in
  `source/plugins/codex.upstream` (repository, tag, commit, folder), with OpenAI's LICENSE and NOTICE.
- **The checksums:** `source/plugins/codex.sha256` lists every shipped file.
- **The catalog:** `source/plugins/.claude-plugin/marketplace.json` lists it as `codex`, so Claude
  installs it as `codex@launchpad-plugins` from `%LOCALAPPDATA%\Kivun\plugins`.
- **Why a copy:** a GitHub source would need Git on the PC, and many users have none. A copy needs no
  network and installs exactly the files that were tested.

## What Launchpad changed, and why

Noam's decision, 2026-11-10: **Claude uses Codex only when the user asks.** OpenAI's helper description
starts "Proactively use when Claude Code is stuck…", so Claude could hand a job to Codex on its own, using
the user's Codex limits. `tools/codex-addon-patch.js` makes four one-line changes, and nothing else:

| File | OpenAI's text | Launchpad's text |
|---|---|---|
| `agents/codex-rescue.md` | `description: Proactively use when Claude Code is stuck, wants a second implementation or diagnosis pass, needs a deeper root-cause investigation, or should hand a substantial coding task to Codex through the shared runtime` | `description: Use only when the user asks for Codex, for example with /codex:rescue. Never use it on your own initiative. Hands an investigation, a fix or a coding task to Codex through the shared runtime` |
| `agents/codex-rescue.md` | `- Do not wait for the user to explicitly ask for Codex. Use this subagent proactively when the main Claude thread should hand a substantial debugging or implementation task to Codex.` | `- Run only when the user asked for Codex. Never start on your own initiative.` |
| `commands/rescue.md` | (no such line) | `disable-model-invocation: true`, so Claude can't run `/codex:rescue` by itself; the user still can |
| `commands/setup.md` | (no such line) | `disable-model-invocation: true`, so Claude can't run `/codex:setup` by itself. That command can turn on the review gate |

**What these changes can and can't do:**
- **The commands:** `disable-model-invocation` is a hard stop. OpenAI's other commands already have it.
- **The helper:** Claude Code has no setting that stops Claude from choosing a helper on its own. The
  description is what Claude reads when it decides, and it now says to wait for the user.
- **Typed commands keep working:** `/codex:rescue` starts the helper by name, so the command still works
  when the user types it.

## What it adds to every Claude session

- **Three hooks run in every Claude session**, each a short `node` run:
  - at session start (sets three variables);
  - at session end (stops leftover Codex jobs);
  - after each reply (the review gate). The reply hook takes about 0.3 s and does nothing while the gate
    is off.
- **The review gate stays off.** `/codex:setup --enable-review-gate` would make Codex review after every
  reply. OpenAI warns it can loop and use up the limits, so Launchpad never turns it on. Tests and CI
  check that nothing in Launchpad does.
- **Job records** go to the add-on's data folder under the Claude config folder, never into the user's
  project. Uninstalling the add-on deletes them.

## Installing and removing

- **The installer:**
  - `SecCodexPlugin` runs `configure-codex-plugin.js install`. It is shown only when the install leaves
    both Claude Code and Codex on the PC (`CodexPluginFits`, called from `ComponentsPre`).
  - Unticking it runs `configure-codex-plugin.js remove` (`SecCodexPluginOff`).
- **The helper's records** in `%LOCALAPPDATA%\Kivun`:
  - `kivun-codex-plugin.txt`: Launchpad's copy is on.
  - `kivun-codex-plugin-off.txt`: the user unticked it, so the next run starts unticked.
- **A user's own `codex@openai-codex`** is left as it is, and no second copy is added. The commands
  would have the same names.
- **Uninstall:** the existing `plugin marketplace remove launchpad-plugins` step removes
  `codex@launchpad-plugins` with rtl-terminal. Codex itself, its sign-in and its conversations stay.

## Moving to a new OpenAI release

1. **Read the new release first.** Read its changes and its `plugins/codex` files: which programs it
   starts, any download, any PowerShell. Clone it with `git -c core.autocrlf=false` so the bytes match
   upstream.
2. **Replace and patch.** Replace `source/plugins/codex/` with the new `plugins/codex`, then run
   `node tools/codex-addon-patch.js source/plugins/codex`.
   - If it stops with "upstream text not found", OpenAI changed a line Launchpad changes.
   - Read the new text, then update `CHANGES` in the tool and the table above, together.
3. **Update the pin and the checksums.** Write the new tag and commit into `codex.upstream`, and
   regenerate `codex.sha256` (one `sha256  path` line per file, sorted bytewise).
4. **Test.**
   - `UT_CodexPlugin_*.js` and `UT_Installer_CodexPlugin.js`.
   - CI's `validate-codex-addon.yml`, which rebuilds the folder from the pinned release and compares.
   - `/codex:review` and `/codex:rescue` by hand on Windows: `docs/MANUAL-TESTS-v3.6.0.md`.

## Measured on a real PC

See `docs/STEP0-results-codex-plugin.md`.
- **Setup:** Codex 0.166 and Claude Code 2.1.321 on Windows 11.
- **Review:** worked with and without Git Bash. The older Windows report (openai/codex-plugin-cc #57,
  reviews blocked by the read-only sandbox) did not happen.
- **Jobs:** handing Codex a job worked.
- **Install:** the copy installed with Git hidden from the PATH.
