╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        Windows Terminal Icon Fix Tool                      ║
║        For ClaudeCode Launchpad CLI v2.6.6+                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

PROBLEM:
  Windows Terminal shows the generic black terminal icon instead
  of the blue Kivun/Claude icon on the taskbar and tabs.

WHY IT HAPPENS:
  When you customize the ClaudeCode Launchpad profile, Windows
  Terminal "materializes" it into settings.json. That copy may
  not have the correct icon path, or may be missing it entirely.

  The v2.6.6 update fixed the fragment files, but if your profile
  was already materialized, you need to update settings.json.

  IMPORTANT - tab icon vs. taskbar icon:
  Windows Terminal loads the TAB icon and the TASKBAR/window icon
  through DIFFERENT code paths. The tab path is robust; the
  taskbar path (upstream bug microsoft/terminal#16233, still open)
  is fragile about local .ico files. So you can end up with the
  correct icon on the tab but a generic icon on the taskbar.

  The two things that make the taskbar path succeed:
    1. Use a LITERAL absolute path (e.g.
       C:\Users\YOU\AppData\Local\Kivun\claude_icon.ico),
       NOT "%LOCALAPPDATA%\Kivun\claude_icon.ico" - the taskbar
       loader does not reliably expand environment variables.
    2. Keep the icon on the SAME DRIVE as the folder you launch
       into. A cross-drive icon path fails on the taskbar
       (confirmed in #16233) even though the tab still shows it.

HOW TO FIX:

  Option 1 (Automated):
    • Double-click: fix-wt-icon.hta
    • Click "Fix Icon Now"
    • Follow the on-screen instructions
    • Close ALL Windows Terminal windows
    • Relaunch Windows Terminal

  Option 2 (Manual):
    • Press Win+R and paste:
      %LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json

    • Find the ClaudeCode Launchpad profile
      (look for: "source": "ClaudeCodeLaunchpad")

    • Add this line inside that profile (use your REAL username,
      a literal path - do NOT use %LOCALAPPDATA% here):
      "icon": "C:\\Users\\YOU\\AppData\\Local\\Kivun\\claude_icon.ico",

    • Save the file
    • Close ALL Windows Terminal windows
    • Relaunch Windows Terminal

WHAT THE TOOL DOES:
  ✓ Creates a timestamped backup of settings.json first
  ✓ Finds your ClaudeCode Launchpad profile(s)
  ✓ Adds/updates the icon path to claude_icon.ico
  ✓ Reads and writes settings.json as UTF-8 (no BOM),
    the encoding Windows Terminal expects
  ✓ Safe: won't proceed if JSON is malformed (backup is
    already saved, so a parse failure never touches the file)
  ✓ No PowerShell needed - runs as HTA (HTML Application)

REQUIREMENTS:
  • Windows Terminal installed
  • ClaudeCode Launchpad CLI v2.6.6 installed
  • Windows with mshta.exe (included in all Windows versions)

TROUBLESHOOTING:
  If the icon is STILL wrong after running the fix:

  1. Check the icon file exists:
     %LOCALAPPDATA%\Kivun\claude_icon.ico

  2. Make sure you closed ALL Windows Terminal windows
     (not just the current tab - all windows!)

  3. Check if your launch directory is on a different drive
     than C:\ (Windows Terminal has a known issue with
     cross-drive icon paths - keep the launch folder and the
     icon on the same drive)

  4. Try manually opening the settings.json file and
     verifying the icon line was actually added, and that it
     is a LITERAL path (C:\Users\...), not %LOCALAPPDATA%

  5. Update Windows Terminal to the latest version

  6. If the TAB shows the icon but the TASKBAR button is still
     generic after all of the above, you have hit upstream bug
     microsoft/terminal#16233 directly. It is open and unfixed:
     WT's taskbar/window-icon loader does not reliably render
     custom local .ico files the way the tab loader does. The
     only fully reliable taskbar icons are same-drive literal
     paths or WT's built-in ms-appx: icons. There is no
     settings.json change that can force it beyond that.

KNOWN LIMITATIONS:
  • Windows Terminal only reloads settings.json on startup.
    You MUST close all windows and relaunch - Ctrl+R or
    Settings > Reload won't work.

  • The tool uses standard JSON.stringify which formats nicely
    but may differ slightly from your current formatting.

SUPPORT:
  GitHub: https://github.com/noambrand/kivun-terminal/issues
  Related: v2.6.6 release notes (CHANGELOG.md)
