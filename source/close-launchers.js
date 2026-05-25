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
// Targeted by command line (matches "folder-picker.hta"), so unrelated mshta
// windows - including this product's own fix-wt-icon.hta - are left alone.
// Pure WSH + WMI to match the rest of the installer tooling; no PowerShell.
// Best-effort: any failure (WMI blocked, access denied) is swallowed so it
// can never block or fail the install.

var TARGET = "folder-picker.hta";

try {
    var wmi = GetObject("winmgmts:\\\\.\\root\\cimv2");
    var procs = wmi.ExecQuery(
        "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'mshta.exe'");
    var e = new Enumerator(procs);
    for (; !e.atEnd(); e.moveNext()) {
        var p = e.item();
        var cmd = "" + (p.CommandLine || "");
        if (cmd.toLowerCase().indexOf(TARGET) !== -1) {
            try { p.Terminate(); } catch (termErr) {}
        }
    }
} catch (err) {
    // WMI unavailable / access denied - never block the install.
}

WScript.Quit(0);
