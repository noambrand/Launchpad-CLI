# Claude Code voice alerts

Short spoken clips that tell you what Claude Code is doing without you watching the
screen. Bundled with the installer and wired up automatically. Pure **Node.js** (the
runtime the installer already sets up) plus the bundled `.wav` clips — no Python, no
PowerShell, no extra installs.

## The three sounds

| Sound | When it plays | Hook |
|-------|---------------|------|
| **done**  | Claude finishes a turn | `Stop` |
| **stuck** | Claude is waiting for you (permission or input) | `Notification` |
| **save**  | You must act by hand — Claude plays this on demand | none |

Each is a `.wav` in this folder. Swap a voice by replacing the file of the same name.

## The repeat reminder (the "nag")

When Claude stops to wait for you, it also starts a quiet background **nag** that
replays the *stuck* clip every couple of minutes until you come back. It stops the
instant you type a prompt (`UserPromptSubmit`) or Claude runs its next tool
(`PostToolUse`). A hard cap of 15 repeats means it can never nag forever.

## How playback works per platform

| Platform | Player | Notes |
|----------|--------|-------|
| Windows  | `cscript play.vbs` (Windows Media Player COM) | No PowerShell — avoids antivirus false positives |
| macOS    | `afplay` | Built in |
| Linux / WSL | `paplay` then `aplay` (best effort) | **Stub.** Real audio from WSL needs WSLg/PulseAudio; silent otherwise |

## Turn it on/off and tune it

Double-click in this folder:

- **Sound ON** / **Sound OFF** — enable or silence everything (and stop any nag)
- **Test Sounds** — play all three clips and show current settings

(`.cmd` files on Windows, `.command` files on macOS.) Or from a terminal:

```
node voice.js on
node voice.js off
node voice.js every 3        # nag every 3 minutes
node voice.js status
node voice.js test stuck
```

Settings live in `config.json` (`enabled`, `repeat_minutes`) and are re-read on every
play, so changes apply immediately. The hooks themselves load only when Claude Code
starts, so a fresh install takes effect in the next session.

## Files

| File | Role |
|------|------|
| `play.js`  | Plays one clip: `node play.js done\|stuck\|save` |
| `play.vbs` | Windows player used by `play.js` (no PowerShell) |
| `reminder.js` | The nag: `arm` / `disarm` / internal `wait` |
| `voice.js` | On/off and tuning controls |
| `configure-sound-hooks.js` | Merges the hooks into `~/.claude/settings.json` (idempotent) |
| `config.json` | `enabled` + `repeat_minutes` |
| `*.wav` | The voice clips |
| `Sound *.cmd` / `*.command` | Double-click launchers |

The installer copies this whole folder to `~/.claude/sounds/` and runs
`node configure-sound-hooks.js` once to wire the hooks. Re-running that command is safe
— it replaces only its own hooks and leaves every other setting untouched.
