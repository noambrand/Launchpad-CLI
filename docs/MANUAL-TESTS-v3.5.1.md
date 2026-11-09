# Manual release tests: the picker opens with the Launch button in view (v3.5.1)

*Every row needs a commit, date, result and evidence before release. Empty means not run yet. Who: **C** Claude Code can drive and check it; **N** needs Noam.*

| ID | Scenario and required result | Who | Commit | Date | Result | Evidence |
|---|---|---|---|---|---|---|
| P1 | The real signed `LaunchpadPicker.exe` (installed 3.5.0) with this branch's picker page and shim, at 125% display scaling, with saved profiles and four agents: the window opens with everything down to the Launch button in view and no scroll bar | C | `db62e50` | 2026-11-09 | PASS. Before (3.5.0 page): the window was 1042x729 on screen with a scroll bar and the Launch button out of view; the page reported devicePixelRatio 1.25 and a 552 CSS px viewport for the 690 it asked for. After: 1302x902, the Launch button in view, no scroll bar. Run under a fresh page name so no cached page could be used; the installed files were restored byte for byte afterwards. | `evidence\picker-351\before-3.5.0-125pct.png`, `evidence\picker-351\before-3.5.0-numbers.png`, `evidence\picker-351\after-3.5.1-125pct.png` |
| P2 | The same, choosing Antigravity: the data-use note shows and the window grows so the Launch button stays in view | C | `db62e50` | 2026-11-09 | PASS: the window grew to 948 px high with the note; "Launch Antigravity CLI" in view. | `evidence\picker-351\after-3.5.1-antigravity-note.png` |
| P3 | At 100% display scaling the picker keeps its old size (nothing to correct) | C | | | Not run on this PC (it runs at 125%). `UT_PickerFit_NoScaling` covers it. | |
| P4 | After installing the signed 3.5.1 build, the desktop shortcut opens the picker with the Launch button in view | N, C | | | | |
