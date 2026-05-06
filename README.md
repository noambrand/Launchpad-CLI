<p align="center">
  <img src="ClaudeCode Launchpad CLI.jpeg" width="700" alt="ClaudeCode Launchpad CLI">
</p>

<p align="center">
  <img src="claudecode_launchpad_GIF.gif" width="700" alt="ClaudeCode Launchpad CLI in action - installer wizard, terminal launch, status bar">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/version-2.4.1-brightgreen" alt="v2.4.1">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11%20%7C%20macOS%2012%2B-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/languages-24%2B-orange" alt="24+ Languages">
  <a href="https://github.com/noambrand/kivun-terminal/releases/latest"><img src="https://img.shields.io/github/downloads/noambrand/kivun-terminal/total?color=purple&label=downloads" alt="Total Downloads"></a>
</p>

<h3 align="center">Zero-to-Claude in 1 minute. Installer, status bar, and launcher for Claude Code on Windows & macOS.</h3>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-why-launchpad-cli">Why Launchpad CLI?</a> &bull;
  <a href="#-status-bar">Status Bar</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-configuration">Configuration</a> &bull;
  <a href="docs/CHANGELOG.md">Changelog</a> &bull;
  <a href="TROUBLESHOOTING.md">Troubleshooting</a>
</p>

---

> 💡 **Working in Hebrew, Arabic, Persian, or another RTL language?** Check out the sister project **[Kivun Terminal (kivun-terminal-wsl)](https://github.com/noambrand/kivun-terminal-wsl)** - same launcher concept but with full BiDi/RTL rendering for Claude Code on Windows (WSL+Konsole), Linux, and macOS. The new v1.1.0 ships a `kivun-claude-bidi` wrapper that fixes the bullet-line direction bug.

<p align="center">
  <img src="picker.png" alt="ClaudeCode Launchpad CLI folder picker - folder selection, model + flag chips, startup slash commands, all in one dialog" width="780">
</p>

The desktop shortcut opens this picker: type/paste a Windows path or browse the tree, optionally pick a model (Opus / Sonnet / Haiku), tap chips for common options (Respond in Hebrew, Low effort, High effort, Auto-accept file edits, Read-only, Don't fail if Opus is busy, Confirm before changes), and add startup slash commands like `/voicemode:converse` that get typed into Claude after it opens.

## Why Launchpad CLI?

|  | Manual Setup | Launchpad CLI |
|---|---|---|
| **Install Node.js, Git, Claude Code** | Find downloads, run 3 installers, configure PATH | Handled automatically |
| **Terminal theme** | Edit Windows Terminal JSON by hand | One checkbox in the wizard |
| **Status bar** (model, context %, usage limits) | Write your own statusline script, configure settings.json | Pre-installed and configured |
| **Desktop shortcut + right-click menu** | Create shortcuts manually, edit registry | Included |
| **Folder picker** | `cd` into every project | GUI picker or right-click any folder |
| **Multi-language support** | Configure manually | One setting in `config.txt` |
| **Time to first prompt** | 20+ minutes | ~1 minute |

## Quick Start

### Windows

1. **[Download `ClaudeCode_Launchpad_CLI_Setup.exe`](https://github.com/noambrand/kivun-terminal/releases/latest)**
2. Run as Administrator - the wizard auto-detects what's already installed
3. Double-click the **"ClaudeCode Launchpad CLI"** desktop shortcut
4. Start coding with Claude

### macOS

1. **[Download the `.pkg` installer](https://github.com/noambrand/kivun-terminal/releases/latest)**
2. Double-click it, allow in **System Settings > Privacy & Security**, then run again
3. Open **Terminal** and type `claude`
4. Start coding with Claude

> **First time?** You'll need a Claude Pro/Max subscription or [Anthropic API key](https://console.anthropic.com).

## Status Bar

A two-line live status bar at the bottom of every session:

> **BookWriter** | 🟢 Sonnet 4.6 | Context 🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜ 51% | tokens: 284K | 24:13
>
> Session 🟨🟨🟨🟨🟨🟨🟨🟨⬜⬜ 77% resets in 4h15m &nbsp;|&nbsp; Weekly 🟩🟩⬜⬜⬜⬜⬜⬜⬜⬜ 16% resets in 6d18h

| Field | What it shows |
|-------|---------------|
| **Model** | Active Claude model (color-coded: green = Opus, yellow = Sonnet/Haiku) |
| **Context** | % of context window consumed (green/yellow/red) |
| **Tokens** | Combined input + output tokens this session |
| **Session / Weekly** | Usage limit % with countdown to reset |

## Architecture

```mermaid
graph TD
    A[NSIS Installer / macOS .pkg] --> B{Dependency Check}
    B -->|Missing| C[Install Node.js + Git + Windows Terminal]
    B -->|Present| D[Skip]
    C --> E[curl -fsSL https://claude.ai/install.cmd]
    D --> E
    E --> F[Configure statusline.mjs]
    F --> G[Register WT Profile + Color Scheme]
    G --> H[Create Desktop Shortcut + Context Menu]

    subgraph Runtime
        I[Launcher .bat / Terminal] --> J{Windows Terminal available?}
        J -->|Yes| K[WT with Kivun profile]
        J -->|No| L[CMD fallback + ANSI colors]
        K --> M[Claude Code + Status Bar]
        L --> M
    end
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Windows installer | NSIS | Silent/wizard install with dependency detection |
| macOS installer | pkgbuild | .pkg with postinstall script via Homebrew |
| Launcher | Batch / Shell | Folder picker, flag passing, WT/CMD fallback |
| Terminal profile | Windows Terminal JSON Fragment | Custom "Noam" color scheme (#C8E6FF) |
| Status bar | Node.js (`statusline.mjs`) | Live model, context, and usage display |
| Config scripts | Node.js | WT settings injection, statusline setup |
| CI/CD | GitHub Actions | Automated macOS .pkg builds |

## Configuration

Edit `%LOCALAPPDATA%\Kivun\config.txt` (Windows) after installation:

```ini
RESPONSE_LANGUAGE=english     # 24+ languages supported
TERMINAL_COLOR=kivun          # "kivun" or "default"
CLAUDE_FLAGS=                 # e.g. --continue
```

## Contributing

Contributions are welcome! Areas where help is especially useful:

- **Linux installer** -- no Linux support yet
- **Installer testing** -- different Windows/macOS versions and locales

Fork the repo, make your changes, and open a PR.

## Community

Submitted to awesome lists (pending review):

- [awesome-claude-code](https://github.com/jqueryscript/awesome-claude-code/pull/166)
- [awesome-claude](https://github.com/webfuse-com/awesome-claude/pull/159)
- [awesome-claude-plugins](https://github.com/quemsah/awesome-claude-plugins/pull/85)

## License

[MIT](LICENSE)

---

<p align="center">
  <strong>Made by <a href="https://github.com/noambrand">Noam Brand</a></strong>
  <br><br>
  <a href="https://github.com/noambrand"><img src="https://img.shields.io/badge/GitHub-noambrand-181717?logo=github" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/noambrand/"><img src="https://img.shields.io/badge/LinkedIn-noambrand-0A66C2?logo=linkedin&logoColor=white" alt="LinkedIn"></a>
  <a href="https://www.facebook.com/noambbb/"><img src="https://img.shields.io/badge/Facebook-noambbb-1877F2?logo=facebook&logoColor=white" alt="Facebook"></a>
  <a href="mailto:noambbb@gmail.com"><img src="https://img.shields.io/badge/Email-noambbb%40gmail.com-EA4335?logo=gmail&logoColor=white" alt="Email"></a>
</p>
