![ClaudeCode Launchpad CLI Demo](https://raw.githubusercontent.com/noambrand/launchpad-cli/main/assets/claudecode-launchpad_v2.6.9.gif)

## Windows

1. Download **ClaudeCode_Launchpad_CLI_Setup.exe** below
2. Run it and follow the wizard - no administrator rights needed. It asks which AI agent to set up: Claude Code, Codex, GitHub Copilot or Antigravity (Google)
3. Double-click the "ClaudeCode Launchpad CLI" desktop shortcut

> **Note:** The installer may close open terminal windows during setup. Save your work before running.

> **SmartScreen / antivirus:** this installer is **digitally signed** by its verified publisher. A brand-new signature still has to build reputation with Microsoft SmartScreen, so for a short while you may still see *"Windows protected your PC"* (click **More info**, then **Run anyway**); this fades as more people install. Launchpad CLI is open-source (MIT) and installs only official tools, with no `certutil`/`bitsadmin` download tricks. See [TROUBLESHOOTING](https://github.com/noambrand/launchpad-cli/blob/main/TROUBLESHOOTING.md#antivirus-or-smartscreen-flags-the-installer-false-positive).

## macOS

1. Download **ClaudeCode_Launchpad_CLI_Setup_mac.pkg** below
2. **Right-click** the `.pkg` file → **Open** (required - macOS blocks unsigned packages on double-click)
3. Enter your password when prompted
4. After install, you'll have:
   - **Desktop shortcut** with folder picker dialog
   - **Right-click menu** on any folder in Finder
   - **Language configuration** (24+ languages)

> The .pkg is small (~3 KB) because it's a script-only installer - all dependencies are downloaded via [Homebrew](https://brew.sh) during installation.

---

## What's new in TAG_PLACEHOLDER

<!-- Fill in release-specific changes here -->

---

## Current Features

| Feature | Windows | macOS |
|---------|---------|-------|
| **AI agents** | ✅ Claude Code, Codex, GitHub Copilot or Antigravity | ✅ Claude Code |
| **Folder picker** | ✅ Native dialog | ✅ Native dialog |
| **Right-click menu** | ✅ Context menu | ✅ Quick Action |
| **Language config** | ✅ config.txt (24+ languages) | ✅ config.txt (24+ languages) |
| **Light blue theme** | ✅ Windows Terminal | ✅ AppleScript |
| **Statusline** | ✅ Model, context %, usage | ✅ Model, context %, usage |
| **Desktop shortcut** | ✅ | ✅ |
| **SendTo integration** | ✅ | - |
| **Native Claude installer** | ✅ curl | ✅ curl |

### Included Components
- **The AI agent you choose** - Claude Code, installed with Anthropic's official native installer, Codex (OpenAI) or GitHub Copilot CLI, installed with npm, or Antigravity CLI (Google), installed with Google's own installer. macOS sets up Claude Code
- **Node.js** - for the status bar, and to install and run Codex or GitHub Copilot (Antigravity itself doesn't need Node.js; Launchpad uses Node.js to install and start it)
- **Windows Terminal** (recommended, optional) - with light blue color scheme
- **Git** (optional)

---

## First time?

You'll need an account for the agent you choose: a Claude account or API key for Claude Code, a ChatGPT account or OpenAI API key for Codex, a GitHub account with a Copilot plan (a free plan works) for GitHub Copilot, or a Google account (a free one works, with a weekly limit) for Antigravity. The agent asks you to sign in the first time it opens. On Antigravity's "Terms of Service & Data Use" screen (shown once, after the sign-in and the colour scheme), press Enter to clear the tick that lets Google use what you type, then press the Down arrow, then the Right arrow to reach Done, and press Enter.

See [CHANGELOG](https://github.com/noambrand/launchpad-cli/blob/main/docs/CHANGELOG.md) for full history.
