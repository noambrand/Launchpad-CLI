![ClaudeCode Launchpad CLI Demo](https://raw.githubusercontent.com/noambrand/kivun-terminal/main/claudecode-launchpad_v2.6.9.gif)

## Windows

1. Download **ClaudeCode_Launchpad_CLI_Setup.exe** below
2. Run as Administrator - follow the wizard
3. Double-click the "ClaudeCode Launchpad CLI" desktop shortcut

> **Note:** The installer may close open terminal windows during setup. Save your work before running.

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
| **Folder picker** | ✅ Native dialog | ✅ Native dialog |
| **Right-click menu** | ✅ Context menu | ✅ Quick Action |
| **Language config** | ✅ config.txt (24+ languages) | ✅ config.txt (24+ languages) |
| **Light blue theme** | ✅ Windows Terminal | ✅ AppleScript |
| **Statusline** | ✅ Model, context %, usage | ✅ Model, context %, usage |
| **Desktop shortcut** | ✅ | ✅ |
| **SendTo integration** | ✅ | - |
| **Native Claude installer** | ✅ curl | ✅ curl |

### Included Components
- **Claude Code** - installed via Anthropic's official native installer
- **Node.js** - required for statusline display only
- **Windows Terminal** (recommended, optional) - with light blue color scheme
- **Git** (optional)

---

## First time?

You'll need a Claude account or API key. Claude will ask for it on first launch.

See [CHANGELOG](https://github.com/noambrand/kivun-terminal/blob/main/docs/CHANGELOG.md) for full history.
