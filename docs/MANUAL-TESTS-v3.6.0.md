# Manual release tests: Claude hands work to Codex (v3.6.0)

*Every row needs a commit, date, result and evidence before release. Empty means not run yet. Who:
**C** means Claude Code can drive and check it; **N** means it needs Noam. Evidence paths are under
`test-tools\evidence\codex-plugin\`, outside the repo.*

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| H1 | Step 0 on this PC: the add-on's files read, the bundled copy installed with Git hidden, reviews and a handed-over job against a scratch repo, sign-in missing, removal | C | (before the branch) | 2026-11-10 | PASS, with two notes. (1) A review without a Codex sign-in says only "Reviewer failed to output a response"; Troubleshooting now says to run `/codex:setup`. (2) A handed-over job was run directly, not through Claude: the auto-mode classifier refused a Claude session running the add-on's write-capable job. That moves to H4. | `STEP0-results.md`, `k*.txt`, `k*.cmd` |
| H2 | The test build, installed over 3.5.1 on a PC with Claude Code and Codex: the components page shows **Let Claude hand work to Codex**, ticked, with its description; the finish page starts "Claude can now hand work to Codex"; `claude plugin list` shows `codex@launchpad-plugins` | N, C | | | | |
| H3 | In Claude, in a Git folder with an uncommitted change: `/codex:review` lists real findings; `/codex:adversarial-review` gives a verdict | N, C | | | | |
| H4 | In Claude: `/codex:rescue` with a small job. Codex makes the change, Claude shows Codex's answer, and no console window flashes | N | | | | |
| H5 | Only when asked: in a fresh Claude session, ask Claude to fix a hard bug without mentioning Codex. Claude does not start Codex (`/codex:status` shows no job) | N, C | | | | |
| H6 | Installer again with the tick cleared: the add-on is gone from `claude plugin list`. The next run shows the tick cleared | N, C | | | | |
| H7 | A Claude-only PC (no Codex): the tick does not show, and nothing about Codex appears in the install details | C | | | | |
| H8 | Uninstall: `codex@launchpad-plugins` and the `launchpad-plugins` catalog are gone; Codex itself and its sign-in stay | N, C | | | | |
