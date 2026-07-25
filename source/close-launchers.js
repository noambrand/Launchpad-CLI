// close-launchers.js - terminate any running Kivun launcher windows before
// an install/upgrade overwrites the app files.
//
// WHY: the launcher is an HTA hosted by mshta.exe. mshta loads the .hta into
// memory once and runs its update check a single time at window load. If a
// window from the OLD build is still open when a newer build is installed,
// it keeps showing the previous version's "update available" banner (it has
// no reason to re-check). Closing those stale windows during install forces a
// fresh launch against the new files, so the banner never lies after an
// upgrade. See CHANGELOG v2.6.8.
//
// Two launcher shapes are closed:
//   1. v3.0.0+  -> the signed native picker, process name LaunchpadPicker.exe.
//   2. <= v2.x  -> the legacy HTA, i.e. mshta.exe whose command line matches
//      "folder-picker.hta" (so unrelated mshta windows, including this
//      product's own fix-wt-icon.hta, are left alone). Kept so an upgrade
//      FROM an old build still closes the stale HTA window.
// Pure WSH + WMI to match the rest of the installer tooling; no PowerShell.
// Best-effort: any failure (WMI blocked, access denied) is swallowed so it
// can never block or fail the install.

var LEGACY_HTA = "folder-picker.hta";
var NATIVE_EXE = "launchpadpicker.exe";

try {
    var wmi = GetObject("winmgmts:\\\\.\\root\\cimv2");

    // 1. The new signed picker - match by process name.
    var natives = wmi.ExecQuery(
        "SELECT ProcessId FROM Win32_Process WHERE Name = 'LaunchpadPicker.exe'");
    var en = new Enumerator(natives);
    for (; !en.atEnd(); en.moveNext()) {
        try { en.item().Terminate(); } catch (termErr) {}
    }

    // 2. The legacy HTA - match mshta.exe by command line.
    var procs = wmi.ExecQuery(
        "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'mshta.exe'");
    var e = new Enumerator(procs);
    for (; !e.atEnd(); e.moveNext()) {
        var p = e.item();
        var cmd = "" + (p.CommandLine || "");
        if (cmd.toLowerCase().indexOf(LEGACY_HTA) !== -1) {
            try { p.Terminate(); } catch (termErr2) {}
        }
    }
} catch (err) {
    // WMI unavailable / access denied - never block the install.
}

WScript.Quit(0);
