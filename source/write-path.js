// write-path.js - Writes a path to kivun-workdir.txt as UTF-8 (JScript for Windows Script Host)
// Called by bat launchers to preserve Hebrew/Unicode folder names
// Usage: cscript //nologo write-path.js "C:\path\to\folder"

var wshShell = new ActiveXObject("WScript.Shell");
// Launchpad's folder is the one this script sits in.
var filePath = new ActiveXObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) + "\\kivun-workdir.txt";

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
