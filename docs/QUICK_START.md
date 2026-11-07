# ClaudeCode Launchpad CLI - Quick Start Guide

## What is ClaudeCode Launchpad CLI?

ClaudeCode Launchpad CLI is a Claude Code installer for Windows and macOS. It sets up Node.js, Claude Code, and a preconfigured terminal environment.

## Installation

### Windows

> **Note:** The installer may close open terminal windows (Windows Terminal, cmd.exe) during setup- particularly when installing Git or Windows Terminal. Save your work in any open terminals before running the installer.

1. Double-click `ClaudeCode_Launchpad_CLI_Setup.exe` (no admin needed - it installs just for you)
2. Follow the wizard:
   - Enter your name
   - Choose the AI agent: Claude Code (default) or Codex by OpenAI (see [Using Codex](#using-codex))
   - Choose response language (English or Hebrew)
   - Select components (Windows Terminal recommended, Git optional)
3. Done! Launch from the desktop shortcut.

### macOS

> **Note:** An internet connection is required. The installer downloads all dependencies via Homebrew - no binaries are bundled in the .pkg.

1. Download `ClaudeCode_Launchpad_CLI_Setup_<version>.pkg` from the [latest release](https://github.com/noambrand/launchpad-cli/releases/latest)
2. **Double-click** the `.pkg` - macOS will block it with *"cannot be opened because Apple cannot check it for malicious software"*. Close the alert.
3. Go to  → **System Settings → Privacy & Security**, scroll to the bottom, and click **Allow Anyway** next to the blocked installer.
4. **Double-click the `.pkg` again** to run it. Click **Open** in the confirmation dialog.
5. Enter your Mac password when prompted (admin access is needed to install Homebrew, Node.js, Git, and Claude Code).
6. Wait for the installer to finish, then open **Terminal** (Finder → Applications → Utilities → Terminal).
7. Type `claude` and press Enter.

On first launch, Claude Code will ask for your account details or Anthropic API key.

**Navigating to a folder in Terminal:** Drag any folder from Finder into the Terminal window - the path is inserted automatically (spaces escaped). Prefix it with `cd ` and press Enter to navigate there.

**If something goes wrong:** Check the install log at `/tmp/kivun_install.log`.

## Using ClaudeCode Launchpad CLI

### Recommended: Pin it to your taskbar (Windows)

Pin it once so you get a one-click blue Claude icon and never have to look for the shortcut on your desktop:

1. Click **Start** and type: `ClaudeCode Launchpad CLI`
2. Right-click the result and choose **Pin to taskbar**
   - On Windows 11 you may need to click **More → Pin to taskbar**, or choose **Open file location** and then drag the icon onto the taskbar.
3. Click the pinned blue icon any time to launch.

### Method 1: The icon (desktop or taskbar) - opens the folder picker

Click the **ClaudeCode Launchpad CLI** icon. The folder picker opens:

1. Pick the folder Claude should work in (browse the tree, or type/paste a path)
2. Optionally open **Advanced options** to choose a model (Opus / Sonnet / Haiku), tap option chips (Respond in Hebrew, High effort, Auto-accept file edits, Read-only, ...), or add startup commands
3. Click **Launch** - Claude Code opens in that folder with your choices applied

Tip: save a folder + options combo as a **named profile** using the chip row at the top of the picker, then switch between projects in one click.

### Method 2: Right-click a folder - "Open with" (skips the picker)

1. Right-click any folder in Windows Explorer
2. Select **Open with ClaudeCode CLI**, or **Open with Codex CLI** or **Open with Copilot CLI** if those are installed
3. That agent opens straight into that folder

### Method 3: Right-click - Send To

1. Right-click any file or folder in Windows Explorer
2. **Send To - ClaudeCode Launchpad CLI**
3. The agent chosen in the installer opens in that folder

## Using Codex

Choose **Codex** in the installer (Windows only) and Launchpad sets up OpenAI's Codex instead of
Claude Code. Codex is a download of about 500 MB, and you get the newest version. If npm installed the
Codex you already have, Launchpad updates it. One installed any other way is used as is, if it's 0.166.0
or newer. A Claude Code already on your PC stays.

**The first time Codex opens:**

1. Sign in with your ChatGPT account or an OpenAI API key. If your company PC blocks the
   sign-in page, open Command Prompt from the Start menu and run `codex login --device-auth`:
   it signs you in with a code instead, then launch again. If it says to enable device code
   sign-in, turn that on in your ChatGPT Security Settings first.
2. Press Enter on the short "You're in control" introduction. In a Git project folder, Codex also
   asks **Trust this folder?** Choose **Trust and continue** if it is your own project.
3. Codex shows **Hooks need review**. Choose **Trust all and continue** to turn on Launchpad's
   two sounds: *permission* when Codex asks before acting, and *done* when it finishes a reply.
   If you skip this, Codex works without the sounds and asks again the next time it opens.
4. Codex asks how to set up its sandbox (the safety fence around what it may change). Choose
   **Set up default sandbox** if you can approve the Windows administrator prompt that follows.
   Otherwise choose **Use non-admin sandbox**.

**What works differently from Claude Code:**

- The startup message in the picker is sent as your first message once Codex is ready.
  Several lines become one message. Commands that start with / can't run at startup. In a few
  cases (for example while the sandbox is being set up) Codex leaves the message in the input
  box: press Enter to send it.
- **Continue last conversation** reopens the last Codex conversation in that folder. If Codex
  says the conversation is open in another app, close that window or press R.
- If your Codex settings already hold instructions of your own, Launchpad doesn't add the
  response-language line, so your instructions are kept.
- Codex shows Hebrew and Arabic left to right. Right-to-left display works only with Claude Code.
- With a response language set, Codex shows "1 warning" in the corner. It is expected and harmless.
- No idle reminder sound and no auto-continue after the usage limit resets.

**Both agents on one PC:** the picker shows a Claude Code / Codex choice, and each profile
keeps its own. Within a profile, each agent keeps its own options and environment variables, so
an API key typed for one never reaches the other. Right-clicking a folder offers one entry for
each agent. Send To starts the agent you chose in the installer; run the installer again to
change it.

## Using GitHub Copilot

Choose **GitHub Copilot** in the installer (Windows only) and Launchpad sets up GitHub's Copilot CLI
instead of Claude Code. It is a download of about 170 MB and needs Node.js 22 or newer, plus a GitHub
account with a Copilot plan (a free plan works). You get the newest version. If npm installed the copy
you already have, Launchpad updates it. One installed any other way is used as is, if it's 1.0.105 or
newer. An AI agent already on your PC stays.

**The first time Copilot opens:**

1. **Do you trust the files in this folder?** Choose **Yes** for your own project. Choose **Yes, and
   remember this folder** to stop being asked there.
2. **Set up terminal for multi-line input support.** Press Esc to skip it. You can set it up later
   with `/terminal-setup`.
3. If you aren't signed in, Copilot says **Please use /login**. Type `/login`, choose your account
   type and follow the steps. If you are already signed in to the GitHub CLI, Copilot may use that
   and not ask. Your startup message goes out by itself once you've signed in.

**What works differently from Claude Code:**

- The startup message in the picker is sent as your first message once Copilot is ready. Several
  lines become one message. One command that starts with / can run at startup, on its own.
- **Continue last** reopens the last Copilot conversation in that exact folder. If there is none, a new
  one starts, and Launchpad tells you so. A conversation from another folder, or from a subfolder, is
  reached with **Pick from history**, which lists every folder's conversations.
- If Copilot says **Session in use**, that conversation is open in another window. Close that window, or
  choose **Resume anyway**.
- There's no model list in the picker, because Copilot offers no way to read one from outside a session.
  Leave the box empty to let Copilot decide, or type a model name. If your plan can't use that name,
  Copilot says so in red and decides by itself. Inside Copilot, `/model` shows what you can choose.
- Copilot's own status line at the bottom shows the folder, the credits used and the model. The installer
  also turns on two of its items: how full the conversation is, and how much of your plan's limit you've
  used. An item you had already chosen stays as you set it. Type `/statusline` inside Copilot to choose
  what it shows. Launchpad's own status bar is for Claude Code.
- Copilot draws its own colors, so its background is white rather than the terminal color you chose.
  Type `/settings theme default` once inside Copilot to use the terminal's colors. Launchpad doesn't
  change this for you, because it's stored in your own Copilot settings.
- The response language is added to Copilot's instructions, alongside your own, which still apply. For
  less common languages such as N'Ko, Copilot's automatic model may still answer in English or write
  poorly: that depends on the model it picks.
- Copilot shows Hebrew and Arabic left to right. Right-to-left display works only with Claude Code.
- No idle reminder sound and no auto-continue after the usage limit resets.

**PowerShell:** Copilot's documentation asks for PowerShell 6 or newer, but it also runs on the
PowerShell built into Windows, and Launchpad doesn't install anything extra. Windows normally blocks
scripts there, which would stop `npm` inside Copilot, so for Copilot's session only, Launchpad lets
scripts on your own PC run. Unsigned scripts from the internet stay blocked, nothing is saved, and
Copilot still asks before it runs commands. If you or your company set a script policy, it is left
alone. You can install PowerShell 7 yourself (`winget install Microsoft.PowerShell`) and Copilot will
use it.

## Configuration

All settings live in one plain-text file: `%LOCALAPPDATA%\Kivun\config.txt`. Open it in Notepad and change anything - nothing is permanent. Common keys:

- `RESPONSE_LANGUAGE` - the language Claude replies in (e.g. `english`, `hebrew`)
- On Windows, Hebrew, Arabic and other right-to-left replies are right-aligned automatically. Type `/rtl off` inside Claude to turn it off, `/rtl on` to turn it back on.
- `TERMINAL_COLOR` - `kivun` (light blue), `dark`, `black`, `white`, `default`, or a custom `#RRGGBB`
- `CLAUDE_FLAGS` - default flags added to every launch (e.g. `--model opus`)
- `STARTUP_CMD` - a slash command typed in automatically after Claude opens
- `AUTO_CONTINUE` - `true` to have Launchpad type a resume message after the 5-hour limit resets (off by default, Claude Code only). Claude Code now continues by itself, so most people can leave this off; see the README
- `AGENT` - the agent Send To starts: empty for Claude Code, `codex` for Codex, `copilot` for GitHub Copilot (the installer sets it)
- `CODEX_FLAGS` - Codex options added to every Codex launch (e.g. `--search`)
- `CODEX_STARTUP_CMD` - a first message sent to Codex on right-click launches
- `COPILOT_FLAGS` - Copilot options added to every Copilot launch (e.g. `--add-dir C:\docs`)
- `COPILOT_STARTUP_CMD` - a first message sent to Copilot on right-click launches

Most of these can also be set per-launch in the folder picker's **Advanced options**.

## Status Bar

ClaudeCode Launchpad CLI adds a status bar at the bottom of Claude Code. It updates automatically and shows:

```
Opus 4.6 | context used:23% | my-project | total tokens:45K | duration:12m | /Users/me/my-project
```

**Fields:**

- **Model** - which Claude model is active. Green = Opus, Yellow = Sonnet or Haiku.
- **Context used** - how much of the context window has been consumed.
  - Green: under 40% - plenty of room
  - Yellow: 40–69% - getting there
  - Red: 70%+ - running low, consider starting a new session
- **Project** - the name of your current working folder (cyan).
- **Total tokens** - combined input and output tokens used this session (e.g. "45K", "1.2M").
- **Duration** - how long the session has been running (e.g. "12m" or "1:30" for hours).
- **Full path** - the complete path to your working directory.

The status bar is installed automatically - no configuration needed.

## Files

Everything is installed in: `%LOCALAPPDATA%\Kivun`

Key files:
- `LaunchpadPicker.exe` - The signed folder picker (this is what the desktop / Start-menu / taskbar shortcut opens)
- `claudecode-launchpad.bat` - Main launcher (opens Claude Code in a folder)
- `config.txt` - Your configuration
- `post-install.bat` - Re-runs Claude Code installation if needed

## Troubleshooting

### Something not working? Send a 1-click diagnostic report

Run **Diagnostics** (Start Menu → ClaudeCode Launchpad CLI → Diagnostics), or — if the
install failed and you have no shortcut — download **`launchpad-diagnostics.cmd`** from the
[latest release](https://github.com/noambrand/launchpad-cli/releases/latest) and double-click it.
It saves **`Launchpad-Report.txt`** to your Desktop and opens it in Notepad. No admin, no
PowerShell, nothing is sent automatically. **Email it to noambbb@gmail.com** or attach it to a
[GitHub issue](https://github.com/noambrand/launchpad-cli/issues).

### Windows Terminal not installed

ClaudeCode Launchpad CLI falls back to cmd.exe with a light blue color scheme. For the best experience, install Windows Terminal from the Microsoft Store.

### Node.js not found

Download and install from https://nodejs.org/

## Uninstalling

Start Menu - ClaudeCode Launchpad CLI - Uninstall
