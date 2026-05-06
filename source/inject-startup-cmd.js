// inject-startup-cmd.js - Auto-types a startup command into Claude Code's TUI after it loads
// Spawned detached by claudecode-launchpad.bat via: start "" /b wscript.exe //nologo inject-startup-cmd.js
// Reads %LOCALAPPDATA%\Kivun\kivun-claude-startcmd.txt (written by write-startcmd.js),
// waits for the Launchpad WT window, focuses it, SendKeys the command + Enter, then deletes the file.

var WIN_TITLE = "ClaudeCode Launchpad CLI";
var POLL_INTERVAL_MS = 500;
var POLL_MAX_ATTEMPTS = 60;   // 30 s total
var SETTLE_MS = 2500;         // extra wait so TUI is drawn before typing
var PRE_SEND_MS = 250;

var sh = new ActiveXObject("WScript.Shell");
var fs = new ActiveXObject("Scripting.FileSystemObject");
var cmdPath = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\\Kivun\\kivun-claude-startcmd.txt");

if (!fs.FileExists(cmdPath)) {
  WScript.Quit(0);
}

// Read the command as UTF-8 via ADODB.Stream (matches how write-startcmd.js writes)
var cmd = "";
try {
  var rs = new ActiveXObject("ADODB.Stream");
  rs.Type = 2;
  rs.Charset = "utf-8";
  rs.Open();
  rs.LoadFromFile(cmdPath);
  cmd = rs.ReadText();
  rs.Close();
} catch (e) {
  cmd = "";
}

cmd = cmd.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "");

if (!cmd) {
  try { fs.DeleteFile(cmdPath); } catch (e) {}
  WScript.Quit(0);
}

// HTA picker can record multiple startup commands (one per line). Type
// each line followed by Enter, with a small pause so Claude has time to
// register each as a separate slash command before the next types in.
var lines = cmd.split(/\r?\n/);
var nonEmpty = [];
for (var k = 0; k < lines.length; k++) {
  var t = lines[k].replace(/^\s+|\s+$/g, "");
  if (t) nonEmpty.push(t);
}
if (nonEmpty.length === 0) {
  try { fs.DeleteFile(cmdPath); } catch (e) {}
  WScript.Quit(0);
}

// Poll for the Launchpad window
var activated = false;
for (var i = 0; i < POLL_MAX_ATTEMPTS; i++) {
  if (sh.AppActivate(WIN_TITLE)) { activated = true; break; }
  WScript.Sleep(POLL_INTERVAL_MS);
}

if (!activated) {
  try { fs.DeleteFile(cmdPath); } catch (e) {}
  WScript.Quit(0);
}

// Let Claude's TUI finish drawing its input box
WScript.Sleep(SETTLE_MS);
sh.AppActivate(WIN_TITLE);
WScript.Sleep(PRE_SEND_MS);

// SendKeys reserved chars: + ^ % ~ ( ) { } [ ] - escape by wrapping in {}
function escSendKeys(s) {
  return s.replace(/[+^%~(){}\[\]]/g, function (c) { return "{" + c + "}"; });
}

for (var n = 0; n < nonEmpty.length; n++) {
  sh.AppActivate(WIN_TITLE);
  WScript.Sleep(150);
  sh.SendKeys(escSendKeys(nonEmpty[n]));
  WScript.Sleep(100);
  sh.SendKeys("{ENTER}");
  // Pause between commands so Claude can process each one before the
  // next slash command lands.
  if (n < nonEmpty.length - 1) WScript.Sleep(800);
}

try { fs.DeleteFile(cmdPath); } catch (e) {}
