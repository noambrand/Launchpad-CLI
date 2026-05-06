// write-startcmd.js - Writes an optional startup command to kivun-claude-startcmd.txt as UTF-8
// Called by bat launchers so Hebrew/Unicode commands survive the round-trip through cmd.exe
// Usage: cscript //nologo write-startcmd.js "/voicemode:converse"

var wshShell = new ActiveXObject("WScript.Shell");
var filePath = wshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") + "\\Kivun\\kivun-claude-startcmd.txt";

var stream = new ActiveXObject("ADODB.Stream");
stream.Type = 2;
stream.Charset = "utf-8";
stream.Open();
stream.WriteText(WScript.Arguments(0));

// Save without BOM: copy to binary stream skipping first 3 bytes
stream.Position = 0;
stream.Type = 1;
stream.Position = 3;

var outStream = new ActiveXObject("ADODB.Stream");
outStream.Type = 1;
outStream.Open();
stream.CopyTo(outStream);
outStream.SaveToFile(filePath, 2);
outStream.Close();
stream.Close();
