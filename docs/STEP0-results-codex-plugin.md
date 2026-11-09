# Step 0 results: OpenAI's Codex add-on for Claude Code (2026-11-10, 00:30-00:45)

- **Add-on:** `openai/codex-plugin-cc` v1.0.6, commit `db52e28f4d9ded852ab3942cea316258ae4ef346` (2026-07-07), Apache-2.0.
- **This PC:** Claude Code 2.1.321, codex-cli 0.166.0 (npm, `%APPDATA%\npm\codex.cmd`), Node 24.16.0.
- **Where the checks ran:**
  - A scratch copy of Launchpad's plugin folder in `C:\kt\cp\plugins`, with a scratch Claude config folder at `C:\kt\cp\cfg`.
  - A scratch git repo at `C:\kt\cp\repo` with two planted mistakes in `calc.js`: an average loop that starts at 1 and runs past the end, and `isAdmin` that assigns the role instead of comparing it.

| # | Check | Result |
|---|---|---|
| K1 | Read the files before running them | PASS. Nothing is downloaded and there is no PowerShell in the add-on's code. It starts only `codex app-server` (through the shell on Windows, hidden), `git`, and node workers (hidden), and links them with a local named pipe. **It adds three hooks to every Claude session:** at start and end (sets three variables, cleans up jobs) and after each reply (the review gate; it returns at once when the gate is off). **`/codex:review` needs git**, because it reviews git changes. **New finding:** the `codex:codex-rescue` helper says "Proactively use when Claude Code is stuck…", so **Claude may hand a task to Codex without being asked**. |
| K2 | Install the bundled copy with git hidden from the PATH | PASS. `plugin marketplace add` and `plugin install codex@launchpad-plugins --scope user` both exit 0. The list shows version 1.0.6, enabled, read from the folder. Not tested: a fully offline PC (the source is a local folder, so nothing should be fetched). Evidence (in `test-tools\evidence\codex-plugin\`, outside the repo): `k2.cmd`. |
| K3 | Hand Codex a job (`task --write`, which `/codex:rescue` uses) | PASS when run directly: in 24 s Codex fixed exactly the two mistakes and nothing else. **Not run through Claude:** the auto-mode classifier refused a Claude session running the add-on's write-capable job ("Code from External"), and I did not work around it. **It moves to Noam's hand test.** Evidence (in `test-tools\evidence\codex-plugin\`, outside the repo): `k3-rescue.txt`. |
| K4 | `/codex:review` and `/codex:adversarial-review` (bug #57) | **PASS: #57 does not happen with codex 0.166.** Codex's PowerShell commands ran (exit 0). Times: review 19 s with Git Bash's `SHELL` set, 14 s without it; adversarial review 12 s. Every run found both mistakes. Run through a real Claude session (`claude -p "/codex:review --wait" --plugin-dir …`): 35 s, same two findings, returned as is. Evidence (in `test-tools\evidence\codex-plugin\`, outside the repo): `k4-*.txt`. |
| K5 | Codex not signed in (empty scratch `CODEX_HOME`) | PARTLY. `/codex:setup` says "auth: The active provider requires OpenAI authentication" and "Run `!codex login`". **A review says only "Reviewer failed to output a response"**, so Troubleshooting must say: run `/codex:setup`. |
| K6 | Uninstall | PASS. `plugin marketplace remove launchpad-plugins` uninstalled `codex@launchpad-plugins` and emptied both settings entries. Claude marked the cached copy `.orphaned_at`, its normal cleanup. Job records live in the add-on's data folder, never in the user's project. Not run: keeping a user's own `codex@openai-codex`, which would mean adding OpenAI's catalog from GitHub. CI covers it with a fake. Evidence (in `test-tools\evidence\codex-plugin\`, outside the repo): `k6.cmd`. |
| — | Time the after-each-reply hook | About 0.3 s per reply (bare node is 0.1 s). Claude runs it next to Launchpad's sound hook. |

**Other notes:**
- Node prints a `DEP0190` warning on Windows when the add-on starts Codex through the shell. It does no harm: the text reaches Claude, not the user.
- The review gate stayed off in every run.

**Verdict:** nothing blocks the plan. One finding goes to Noam: Claude may call Codex on its own (K1).
