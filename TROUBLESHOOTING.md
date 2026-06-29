# Troubleshooting

Common issues and fixes for ClaudeCode Launchpad CLI.

---

## 🆘 Something not working? Send a 1-click diagnostic report

The fastest way to get help: run the **Diagnostics** tool and send us the report.

- **Installed OK?** Start Menu → **ClaudeCode Launchpad CLI** → **Diagnostics**.
- **Install failed / no shortcut?** Download **`launchpad-diagnostics.cmd`** from the
  [latest release](https://github.com/noambrand/launchpad-cli/releases/latest) and double-click it.

It writes **`Launchpad-Report.txt`** to your Desktop and opens it in Notepad, then you
choose what to do with it. It captures your Launchpad + Windows version, which launcher
files are present (a missing one usually means antivirus removed it), Claude / Node /
Windows Terminal / winget detection, running antivirus, a Defender-quarantine hint, and
the install log. **It needs no admin, runs no PowerShell, and sends nothing automatically.**

**Email it to noambbb@gmail.com** or attach it to a [GitHub issue](https://github.com/noambrand/launchpad-cli/issues).

---

## Status bar: customizing what shows on line 1 (v2.6.5+)

`source/statusline.mjs` (internal v2.2) reads four optional environment variables:

| Env var | Default | Effect |
|---|---|---|
| `CLAUDE_CODE_EFFORT_LEVEL` | *unset* | Forces the `effort:` field on line 1 to the given value (e.g. `low`, `medium`, `high`, `max`). Used when `d.effort.level` is absent from the statusline JSON (Anthropic [issue #40261](https://github.com/anthropics/claude-code/issues/40261) — open) and you don't want to rely on the `~/.claude/settings.json` fallback. |
| `KIVUN_SL_COST` | unset | Set to `1` / `true` / `yes` / `on` to render the session cost in USD (`$X.XX`, green) on line 1. |
| `KIVUN_SL_CACHE` | unset | Set to truthy to render cached tokens (`cache:N`, blue), summing `cache_read_input_tokens` + `cache_creation_input_tokens`. |
| `KIVUN_SL_TPM` | unset | Set to truthy to render tokens-per-minute throughput (`tpm:N`, cyan). Suppressed in the first 5 s of a session. |

**Windows (PowerShell)** — add to your `$PROFILE`:

```powershell
$env:KIVUN_SL_COST = '1'
$env:KIVUN_SL_CACHE = '1'
$env:KIVUN_SL_TPM = '1'
```

…or set persistently via `setx`:

```cmd
setx KIVUN_SL_COST 1
setx KIVUN_SL_CACHE 1
setx KIVUN_SL_TPM 1
```

**macOS / Linux** — add to `~/.zshrc` or `~/.bashrc`:

```bash
export KIVUN_SL_COST=1
export KIVUN_SL_CACHE=1
export KIVUN_SL_TPM=1
```

Restart your Claude Code session for changes to take effect.

**Effort resolution order** (`readEffort()` in `statusline.mjs`):
1. `d.effort.level` from the statusline JSON payload (forward-compatible — appears when Anthropic ships issue #40261).
2. `CLAUDE_CODE_EFFORT_LEVEL` env var.
3. `effortLevel` key in `~/.claude/settings.json`. **Known gap:** `settings.json` is not rewritten when you toggle effort mid-session via `/effort` — the statusline will show whatever was set at session start until #40261 lands.
4. If nothing resolves, the field is hidden entirely.

---

## Windows

### "Claude Code not found" on launch

Claude Code isn't in your PATH.

```
npm install -g @anthropic-ai/claude-code
```

Then close and reopen the terminal.

### Windows Terminal colors not applying

The installer uses ANSI escape sequences as a fallback, so colors should work even without the WT profile. If you see no colors:

1. Make sure **Windows Terminal** is installed (`winget install Microsoft.WindowsTerminal`)
2. Re-run the installer - it registers a WT JSON fragment automatically
3. If using CMD fallback, verify your Windows 10 build supports 24-bit ANSI (build 1903+)

### Folder picker doesn't open

The GUI folder picker requires Windows Script Host. If it's disabled by policy:

- Cancel the picker - a text input prompt will appear where you can type or paste a path

### Desktop shortcut does nothing

Right-click the shortcut > Properties > verify the target points to:

```
%LOCALAPPDATA%\Kivun\claudecode-launchpad.bat
```

### "Continue last conversation" closed the tab / it opened and shut by itself

If you picked **Continue last** in the picker (or set `CLAUDE_FLAGS=--continue` in
`config.txt`) and opened a folder that had **no earlier conversation**, Claude Code
printed *"No conversation found to continue"* and exited at once — and because the
whole terminal tab is that single `claude` call, the tab closed on its own.

**Fixed in v2.7.6+:** the launcher now detects this and **opens a fresh session
instead** (you'll see a short "No previous conversation found — starting fresh"
note). Nothing to do on your side. A real conversation you worked in and closed is
never affected.

### Did upgrading reset my settings?

**No (v2.7.6+).** Installing a newer version **keeps your existing `config.txt`** —
your language, theme, `CLAUDE_FLAGS` and `STARTUP_CMD` are preserved. Your saved
picker profiles (the folders/combos you saved) are kept too. Only a brand-new, first
install generates a fresh `config.txt` from the wizard choices. (Older builds rewrote
`config.txt` on every install — that's fixed.)

### Right-click context menu missing

Re-run the installer as Administrator. The context menu entry is added to the registry during installation.

### Download failed during installation

The installer uses `curl.exe` (built-in on Windows 10 1803+) to download Node.js and Git. If downloads fail:

1. **Firewall/proxy** - corporate firewalls may block `nodejs.org` or `github.com`. Ask your IT team to whitelist these domains
2. **No internet** - an internet connection is required during installation
3. **curl missing** - on very old Windows 10 builds (before 1803), curl may not exist. The installer falls back to winget automatically
4. **Manual install** - if all else fails, install [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/) manually, then re-run the installer (it will detect them and skip)

### Antivirus or SmartScreen flags the installer (false positive)

The installer is **not code-signed yet**, so Windows SmartScreen may warn at
**download** time, again at **run** time (*"Windows protected your PC"*), and some
antivirus (e.g. McAfee) may warn or block a step. This is a **false positive**.

> **Why a NEW version gets flagged when the old one didn't:** SmartScreen trust is
> tied to the exact file. Every new release is a brand-new `.exe`, so it starts with
> **zero download reputation** until enough people have fetched it — even though the
> previous version downloaded fine. This is normal for unsigned apps and clears on
> its own over time (or once we code-sign / submit it to Microsoft).

**If the browser blocks the DOWNLOAD** ("…isn't commonly downloaded" / "blocked"):

- **Microsoft Edge:** open **Downloads** (Ctrl+J) → the blocked item → **⋯** → **Keep**
  → **Keep anyway**.
- **Chrome:** **Downloads** → on the blocked item, click **Keep** (or **Keep anyway**).

Then proceed with the run-time steps below.

Why this is safe:

- Launchpad CLI is **open source (MIT)** - the [full source](https://github.com/noambrand/launchpad-cli), including the NSIS script and `source/install.cmd`, is public and auditable.
- It installs **only official tools** from official sources: Node.js (winget / nodejs.org), Git (winget / git-scm.com), Windows Terminal (Microsoft Store), and Claude Code via **[Anthropic's official installer](https://claude.ai/install.cmd)**.
- It deliberately avoids the techniques antivirus watches for: **no `certutil`/`bitsadmin` downloads**, and it prefers Microsoft-signed **winget** (which handles its own trusted elevation) over script-driven UAC.

What to do:

1. **SmartScreen:** click **More info → Run anyway**.
2. **Antivirus blocked a step:** allow `ClaudeCode_Launchpad_CLI_Setup.exe` (and the install step), or temporarily turn off real-time scanning for the install, then re-run. The installer is resilient and will skip whatever already succeeded.
3. **McAfee Web Protection blocking `claude.ai`:** if the log (`%LOCALAPPDATA%\Kivun\install-log.txt`) shows `curl: (6) Could not resolve host: claude.ai`, your antivirus is blocking the domain - allow `claude.ai`, or install Claude manually from <https://claude.ai/download> (the installer will then detect it and skip).
4. **Verify it yourself:** upload the downloaded `.exe` to [VirusTotal](https://www.virustotal.com/) (the SHA256 is shown on the release page) to confirm it's clean.

---

## macOS

### Installer blocked by Gatekeeper

This is expected for non-notarized packages:

1. Double-click the `.pkg` - macOS will block it
2. Go to **System Settings > Privacy & Security**
3. Scroll to the bottom, click **Allow Anyway**
4. Double-click the `.pkg` again

### `claude: command not found`

The installer adds Claude Code via npm. If the command isn't found:

```bash
# Check if npm is available
which npm

# Reinstall Claude Code
npm install -g @anthropic-ai/claude-code

# If npm is missing, reinstall via Homebrew
brew install node
npm install -g @anthropic-ai/claude-code
```

Make sure your shell profile (`.zshrc` or `.bash_profile`) includes the npm global bin in PATH.

---

## Status Bar

### Status bar not showing

1. Check that `statusline.mjs` exists:
   - Windows: `%LOCALAPPDATA%\Kivun\statusline.mjs`
   - macOS: `/usr/local/share/kivun/statusline.mjs`
2. Verify Claude Code settings:
   ```bash
   cat ~/.claude/settings.json
   ```
   Should contain a `"statusLine"` entry with `"lines": 2`.
3. If missing, re-run the installer or manually run:
   ```bash
   node configure-statusline.js "<path-to-statusline.mjs>"
   ```

### Only one status line visible

Claude Code defaults to 1 line. The installer sets `"lines": 2` in `~/.claude/settings.json`. If it reverted, edit the file and set:

```json
"statusLine": {
  "type": "command",
  "command": "node \"/path/to/statusline.mjs\"",
  "lines": 2
}
```

---

## Still stuck?

Open an issue at [github.com/noambrand/launchpad-cli/issues](https://github.com/noambrand/launchpad-cli/issues) with:

- Your OS and version
- The error message or screenshot
- Steps to reproduce
