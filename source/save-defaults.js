// save-defaults.js - Update CLAUDE_FLAGS and STARTUP_CMD in config.txt while preserving everything else
// Usage: cscript //nologo save-defaults.js "<flags>" "<startup_cmd>"
//   - Pass empty strings to clear a value.
//   - Adds missing keys if config.txt doesn't have them yet.

var wshShell = new ActiveXObject("WScript.Shell");
var fso = new ActiveXObject("Scripting.FileSystemObject");

var flags = WScript.Arguments.length > 0 ? WScript.Arguments(0) : "";
var startupCmd = WScript.Arguments.length > 1 ? WScript.Arguments(1) : "";

// Resolve config.txt next to this script (install dir)
var scriptDir = fso.GetParentFolderName(WScript.ScriptFullName);
var cfgPath = scriptDir + "\\config.txt";

if (!fso.FileExists(cfgPath)) {
  WScript.StdErr.WriteLine("config.txt not found: " + cfgPath);
  WScript.Quit(1);
}

// Read existing config as UTF-8
var rs = new ActiveXObject("ADODB.Stream");
rs.Type = 2;
rs.Charset = "utf-8";
rs.Open();
rs.LoadFromFile(cfgPath);
var content = rs.ReadText();
rs.Close();
content = content.replace(/^\uFEFF/, "");

var lines = content.split(/\r\n|\n/);

var sawFlags = false;
var sawStartup = false;
for (var i = 0; i < lines.length; i++) {
  var ln = lines[i];
  if (/^\s*#/.test(ln) || ln === "") continue;
  if (/^CLAUDE_FLAGS\s*=/.test(ln)) {
    lines[i] = "CLAUDE_FLAGS=" + flags;
    sawFlags = true;
  } else if (/^STARTUP_CMD\s*=/.test(ln)) {
    lines[i] = "STARTUP_CMD=" + startupCmd;
    sawStartup = true;
  }
}

if (!sawFlags) lines.push("CLAUDE_FLAGS=" + flags);
if (!sawStartup) {
  lines.push("# Default startup command auto-typed into Claude after the TUI loads (e.g. /voicemode:converse)");
  lines.push("# Leave empty to skip. Do NOT put passwords here (it will be typed visibly).");
  lines.push("STARTUP_CMD=" + startupCmd);
}

// Drop trailing empty lines
while (lines.length && lines[lines.length - 1] === "") lines.pop();

var output = lines.join("\r\n") + "\r\n";

// Write UTF-8 without BOM
var ws = new ActiveXObject("ADODB.Stream");
ws.Type = 2;
ws.Charset = "utf-8";
ws.Open();
ws.WriteText(output);

ws.Position = 0;
ws.Type = 1;
ws.Position = 3;

var out = new ActiveXObject("ADODB.Stream");
out.Type = 1;
out.Open();
ws.CopyTo(out);
out.SaveToFile(cfgPath, 2);
out.Close();
ws.Close();
