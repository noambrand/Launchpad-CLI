# Claude Code voice alerts

Short spoken clips that tell you what Claude Code is doing without you watching the
screen. Bundled with the installer and wired up automatically. Pure **Node.js** (the
runtime the installer already sets up) plus the bundled `.wav` clips — no Python, no
PowerShell, no extra installs.

## The four alerts (and when each fires)

| Alert | Plays when | Hook (event) |
|-------|-----------|--------------|
| **done** | Claude has genuinely finished the task — nothing left to do | on-demand (Claude runs it) |
| **permission** | The numbered **1. Yes / 2. No** confirm appears and you must pick | `PermissionRequest` |
| **waiting** | Claude has been waiting on you (~60s idle / you stepped away) | `Notification` (idle only) |
| **save** | You must go do something by hand (manual intervention) | on-demand (Claude runs it) |

`done` and `save` are **on-demand**: Claude plays them itself when it has truly finished
or needs you to act by hand. They are **not** tied to a hook — in particular not to
`Stop`, which fires at the end of *every* turn (not at true task completion), so wiring
`done` there made it announce on every turn.

`permission` fires **only** on a real interactive confirm — never on an auto-approved
tool. `waiting` is filtered to the idle notification (`matcher: "idle_prompt"`), so it
never fires just because a permission prompt appeared (that's `permission`'s job). This
matters: an earlier version put the permission clip on `Notification`, which also fires
on idle, so it announced "permission required" when none was needed.

## Regular vs Funny mode

Every alert has two recordings — a plain one and a joke one:

| Alert | Regular says | Funny says |
|-------|--------------|------------|
| done | "Done." | "Done. I'll pretend that took effort." |
| permission | "Permission required." | "Permission needed. I'm about to run a command I have feelings about." |
| waiting | "Attention required." | "Waiting for you. I've been very patient." |
| save | "Manual intervention." | "About to delete things. Last chance to press escape." |

Clips live in `regular/<name>.wav` and `funny/<name>.wav`; `config.json` `"mode"`
selects the set and `play.js` falls back `funny → regular → flat`, so a missing funny
clip never goes silent. Switch any time (applies immediately):

- Double-click **Regular Sounds ON** / **Funny Sounds ON**
- or `node voice.js mode regular|funny`

## How playback works per platform

| Platform | Player | Notes |
|----------|--------|-------|
| Windows  | `cscript play.vbs` (Windows Media Player COM) | No PowerShell — avoids antivirus false positives |
| macOS    | `afplay` | Built in |
| Linux / WSL | `paplay` then `aplay` (best effort) | **Stub.** Real audio from WSL needs WSLg/PulseAudio; silent otherwise |

## The repeat reminder — OFF by default

When you've gone idle, an optional reminder repeats the **waiting** clip every couple
of minutes until you respond (capped at 15). It is **off by default** so you are never
nagged. Turn it on with `node voice.js repeat on`; off with `node voice.js repeat off`.
It stops the instant you type a prompt (`UserPromptSubmit`) or Claude runs its next
tool (`PostToolUse`).

## Controls

Double-click in this folder (`.cmd` on Windows, `.command` on macOS), or run the command:

| File | Command | Does |
|------|---------|------|
| **Sound ON** | `voice.js on` | enable all alerts |
| **Sound OFF** | `voice.js off` | silence everything + stop any nag |
| **Regular Sounds ON** | `voice.js mode regular` | use the plain clips |
| **Funny Sounds ON** | `voice.js mode funny` | use the joke clips |
| **Test Sounds** | — | play all four alerts in the current mode |
| — | `voice.js repeat on\|off` | repeat reminder (off by default) |
| — | `voice.js status` | show current settings |

## config.json

```json
{ "enabled": true, "mode": "regular", "repeat_enabled": false, "repeat_minutes": 2 }
```

`enabled`, `mode`, and `repeat_*` are re-read on every play, so they apply
**immediately**. The hooks themselves load only when Claude Code starts, so a fresh
install takes effect in the next session.

## Files

| File | Role |
|------|------|
| `play.js` | Plays one alert: `node play.js done\|permission\|waiting\|save` |
| `play.vbs` | Windows player used by `play.js` (no PowerShell) |
| `reminder.js` | The repeat reminder: `arm` / `disarm` / internal `wait` |
| `voice.js` | All controls (on/off, mode, repeat, status, test) |
| `configure-sound-hooks.js` | Deploys to `~/.claude/sounds` and merges the hooks (idempotent) |
| `config.json` | `enabled` + `mode` + `repeat_enabled` + `repeat_minutes` |
| `regular/`, `funny/` | The two clip sets (`done/permission/waiting/save.wav`) |
| `*.cmd` / `*.command` | Double-click launchers |

The installer copies this whole folder (including `regular/` and `funny/`) to
`~/.claude/sounds/` and runs `node configure-sound-hooks.js` once to wire the hooks.
Re-running that command is safe — it replaces only its own hooks and leaves every other
setting untouched.
