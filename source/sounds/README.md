# Claude Code voice alerts

Short spoken clips that tell you what Claude Code is doing without you watching the
screen. Bundled with the installer and wired up automatically. Pure **Node.js** (the
runtime the installer already sets up) plus the bundled `.wav` clips — no Python, no
PowerShell, no extra installs.

## The five alerts (and when each fires)

| Alert | Plays when | Hook (event) |
|-------|-----------|--------------|
| **done** | Claude has genuinely finished the task **successfully** — nothing left to do | on-demand (Claude runs it) |
| **error** | Claude finished but the task ended in an **error** — the failure counterpart of `done` | on-demand (Claude runs it) |
| **permission** | The numbered **1. Yes / 2. No** confirm appears and you must pick | `PermissionRequest` |
| **waiting** | Claude has been waiting on you (~60s idle / you stepped away) | `Notification` (idle only) |
| **save** | You must go do something by hand (manual intervention) | on-demand (Claude runs it) |

`done`, `error` and `save` are **on-demand**: Claude plays them itself when it has truly
finished or needs you to act by hand. They are **not** tied to a hook — in particular not
to `Stop`, which fires at the end of *every* turn (not at true task completion), so wiring
`done` there made it announce on every turn.

**Success vs failure at a glance:** `done` and `error` are a pair — Claude plays `done`
when a run finished clean and `error` when it ended in a failure, so the sound alone tells
you whether you're walking back to a green result or a wall of red. Both are short.

`permission` fires **only** on a real interactive confirm — never on an auto-approved
tool. `waiting` is filtered to the idle notification (`matcher: "idle_prompt"`), so it
never fires just because a permission prompt appeared (that's `permission`'s job). This
matters: an earlier version put the permission clip on `Notification`, which also fires
on idle, so it announced "permission required" when none was needed.

Claude Code sends the idle notification about a minute after every reply, also when the
reply asked nothing and the work goes on by itself. So `waiting` ("Attention required")
plays only when Claude's last reply asks you something (it has a question mark). After a
reply that asks nothing, the log shows `(no question in the last reply - not played)`.

## Regular vs Funny mode

Every alert has two recordings — a plain one and a joke one:

| Alert | Regular says | Funny says |
|-------|--------------|------------|
| done | "Done." | "Done. I'll pretend that took effort." |
| error | "Error." | "That errored. Not my proudest moment." |
| permission | "Permission required." | "Permission needed. I'm about to run a command I have feelings about." |
| waiting | "Attention required." | "Waiting for you. I've been very patient." |
| save | "Manual intervention." | "About to delete things. Last chance to press escape." |

Every voice has both sets: a `regular/` and a `funny/` folder (the Original voice's at the
top of this folder, every other voice's under `voices/<name>/`, see **Voices** below).
`config.json` `"mode"` selects the set, and a clip that is missing falls back to the
Original voice's clip, so an alert never goes silent. Switch any time (applies immediately):

- Double-click **Regular Sounds ON** / **Funny Sounds ON**
- or `node voice.js mode regular|funny`

## Voices — Jon by default

Every alert comes in 11 voices: the Original one, plus 10 American voices made with
ElevenLabs in 2026-11 with the same text and the same triggers; only the voice changes. **Jon** plays when you haven't picked a voice (new installs
and upgrades alike); **Jessica** is the default when you pick Female.

| Male | Female |
|------|--------|
| **Jon** (default) — calm presence | **Jessica** (default) — playful, bright |
| Adam — dominant, firm | Bella — professional, warm |
| Will — relaxed optimist | Laura — enthusiastic, quirky |
| Eric — smooth, trustworthy | |
| Chris — charming, down-to-earth | |
| Vincent — deep, confident | |
| Hale — smooth, persuasive | |
| Original — the first Launchpad voice | |

Pick one in the launcher's picker (**Advanced options → 🔊 Sound alerts → Voice**: Male /
Female, then a voice, **▶ Preview** to hear it), double-click **Choose Voice**, or run
`node voice.js voice <name>` (`node voice.js voices` lists them). It applies to the very next
alert, in every agent (Claude, Codex, Copilot, Antigravity) — they all play through `play.js`.

The Original clips live in `regular/` and `funny/`; every other voice in
`voices/<name>/regular/` and `voices/<name>/funny/`. `voices/voices.json` lists the voices,
the two defaults, and each voice's ElevenLabs voice id and settings, so a new line can be
recorded later in the same voice. `play.js` picks the clip in this order:
`voices/<voice>/<pack>/<alert>.wav` → `<pack>/<alert>.wav` (Original) →
`regular/<alert>.wav` → `<alert>.wav`, so a missing clip never goes silent. A `"voice"` that
doesn't ship (or is garbled) plays the default.

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

## Trigger log — `alerts.log` (debug "why did I hear that?")

Every time a sound *would* fire, `play.js` appends one line to `alerts.log` in this
folder — even when sound is OFF. Open it with **View Alert Log** (or `node voice.js
log`). Each line shows **when**, **which project/session**, **why** (which hook event),
and **which .wav** ran:

```
2026-06-27 21:22 | alert=permission | event=PermissionRequest | type=default | wav=regular\permission.wav | why=tool=Bash: npm install foo | project=VBAConverter | session=node-AAA | path=...
```

**Spot a *fake* permission alert:** a real one reads `event=PermissionRequest`. If you
ever see `alert=permission | event=Notification`, that line came from an **old session**
started before the hooks were wired (hooks load only at startup) — restart that Claude
window and it stops. The log self-trims to the last 2000 lines.

## Controls

Double-click in this folder (`.cmd` on Windows, `.command` on macOS), or run the command:

| File | Command | Does |
|------|---------|------|
| **Sound ON** | `voice.js on` | enable all alerts |
| **Sound OFF** | `voice.js off` | silence everything + stop any nag |
| **Regular Sounds ON** | `voice.js mode regular` | use the plain clips |
| **Funny Sounds ON** | `voice.js mode funny` | use the joke clips |
| **Choose Voice** | `voice.js choose` | list the voices and pick one by number |
| — | `voice.js voice <name>` / `voice.js voices` | pick a voice / list them |
| **Test Sounds** | — | play all five alerts in the current voice and pack |
| **View Alert Log** | `voice.js log` | open `alerts.log` — when/why each sound fired |
| — | `voice.js repeat on\|off` | repeat reminder (off by default) |
| — | `voice.js status` | show current settings |

## config.json

```json
{ "enabled": true, "mode": "regular", "repeat_enabled": false, "repeat_minutes": 2 }
```

`"voice": "<name>"` is added when you pick a voice; without it you get the default (Jon).
`enabled`, `mode`, `voice`, and `repeat_*` are re-read on every play, so they apply
**immediately**. The hooks themselves load only when Claude Code starts, so a fresh
install takes effect in the next session.

## Files

| File | Role |
|------|------|
| `play.js` | Plays one alert: `node play.js done\|error\|permission\|waiting\|save` |
| `play.vbs` | Windows player used by `play.js` (no PowerShell) |
| `reminder.js` | The repeat reminder: `arm` / `disarm` / internal `wait` |
| `voice.js` | All controls (on/off, mode, voice, repeat, status, test) |
| `configure-sound-hooks.js` | Deploys to `~/.claude/sounds` and merges the hooks (idempotent) |
| `config.json` | `enabled` + `mode` + `voice` (once picked) + `repeat_enabled` + `repeat_minutes` |
| `regular/`, `funny/` | The Original voice's two clip sets (`done/error/permission/waiting/save.wav`) |
| `voices/<name>/regular/`, `voices/<name>/funny/` | The other 10 voices, same five clips each |
| `voices/voices.json` | The voice list, the defaults (Jon, Jessica), ElevenLabs ids and settings |
| `alerts.log` | Trigger log — auto-created at runtime; when/why each alert fired |
| `*.cmd` / `*.command` | Double-click launchers |

The installer copies this whole folder (including `regular/`, `funny/` and `voices/`) to
`~/.claude/sounds/` and runs `node configure-sound-hooks.js` once to wire the hooks.
Re-running that command is safe — it replaces only its own hooks and leaves every other
setting untouched.
