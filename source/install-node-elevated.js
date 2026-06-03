// install-node-elevated.js
// ---------------------------------------------------------------------------
// Installs the Node.js MSI with an elevation (UAC) prompt, silent UI, and a
// verbose MSI log.
//
// WHY THIS EXISTS:
// The Launchpad installer runs per-user (RequestExecutionLevel user) so the
// invoking process never holds the admin token that Node's per-machine MSI
// requires. A plain "msiexec /i ... /qn" therefore fails with 1603 (MSI Error
// 1925: "You do not have sufficient privileges to complete this installation
// for all users of the machine."). ShellExecute with the "runas" verb gives
// msiexec the admin token via a single UAC prompt, while leaving the rest of
// the installer per-user (so $LOCALAPPDATA still resolves to the real user --
// see the v2.6.4 over-the-shoulder-UAC note in the .nsi). Node installs to
// C:\Program Files\nodejs, which does not depend on which account elevated.
//
// ShellExecute cannot return an exit code or wait, so we wrap msiexec in cmd
// and have it write the real exit code to a sentinel file we poll for. The
// sentinel path is resolved to an ABSOLUTE path in this (non-elevated) process
// and baked into the command line, so the elevated process writes to the
// invoking user's folder even when a different admin account approves the UAC
// prompt (over-the-shoulder install).
//
// Usage:  cscript //nologo //B install-node-elevated.js <msiPath> <logPath>
// Exit codes:
//   <msiexec code>  normal result (0 = success)
//   1223            user declined the UAC elevation prompt (ERROR_CANCELLED)
//   1601            missing arguments
//   1602            timed out waiting for the elevated install to finish
// ---------------------------------------------------------------------------

var args = WScript.Arguments;
if (args.length < 2) { WScript.Quit(1601); }

var msiPath = args(0);
var logPath = args(1);

var fso = new ActiveXObject("Scripting.FileSystemObject");
var app = new ActiveXObject("Shell.Application");

// Sentinel sits next to the MSI log (an absolute, invoking-user path that the
// elevated process can also write to).
var sentinel = logPath + ".done";
if (fso.FileExists(sentinel)) {
  try { fso.DeleteFile(sentinel); } catch (e) {}
}

// Wrapped in cmd so the elevated process records msiexec's exit code for us.
// /v:on enables delayed expansion so !errorlevel! is read AFTER msiexec exits
// (a plain %errorlevel% would expand at parse time, before msiexec runs).
var cmdLine =
  '/v:on /c msiexec /i "' + msiPath + '" /qn /norestart /l*v "' + logPath + '"' +
  ' & echo !errorlevel!> "' + sentinel + '"';

try {
  // verb "runas" -> UAC elevation; window style 0 -> hidden.
  app.ShellExecute("cmd.exe", cmdLine, "", "runas", 0);
} catch (e) {
  // The user clicked "No" on the UAC prompt (or policy blocked elevation).
  WScript.Quit(1223);
}

// Poll for completion. The elevated cmd writes the sentinel when msiexec ends.
var rc = 1602;                       // default: timed out
var waitedMs = 0;
var TIMEOUT_MS = 10 * 60 * 1000;     // 10 minutes
while (waitedMs < TIMEOUT_MS) {
  if (fso.FileExists(sentinel)) {
    try {
      var f = fso.OpenTextFile(sentinel, 1);   // 1 = ForReading
      var txt = f.ReadAll();
      f.Close();
      rc = parseInt(String(txt).replace(/[^0-9-]/g, ""), 10);
      if (isNaN(rc)) { rc = 0; }
    } catch (e2) {
      rc = 0;   // install finished but we couldn't read the code; verified later by "where node.exe"
    }
    try { fso.DeleteFile(sentinel); } catch (e3) {}
    break;
  }
  WScript.Sleep(500);
  waitedMs += 500;
}

WScript.Quit(rc);
