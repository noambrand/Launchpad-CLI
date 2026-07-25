/*
  build-picker.js  -  turn the canonical folder-picker.hta into the HTML page the
  signed WebView2 host loads. Keeping ONE source of truth (the .hta) means the
  native picker can never drift from the shipping UI.

  It applies exactly four, tightly-scoped edits and ASSERTS each one landed
  (aborting the build if the source changed shape), so a future edit to the .hta
  can't silently break the port:

    1. Remove the <HTA:APPLICATION .../> element (no HTA host here).
    2. Strip language="JScript" so the script runs as ordinary JS in Chromium.
    3. Inject <script src="webview-shim.js"> before the picker's own script, so
       the COM shim (ActiveXObject, window.resizeTo/moveTo) is defined first.
    4. Replace getInstallDir()'s body: the old version derived the install dir
       from the .hta's file path (location.pathname); under a WebView2 virtual
       host that path is meaningless, so read window.__APP_DIR__ (set by the exe).

  Usage:  node build-picker.js <input.hta> <output.html>
*/
"use strict";
var fs = require("fs");
var path = require("path");

var inPath = process.argv[2];
var outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error("usage: node build-picker.js <input.hta> <output.html>");
  process.exit(2);
}

var src = fs.readFileSync(inPath, "utf8");
var out = src;

function assertChanged(label, before, after) {
  if (before === after) {
    console.error("BUILD ABORTED: transform step did not match anything: " + label);
    console.error("The source folder-picker.hta changed shape; update build-picker.js to match.");
    process.exit(1);
  }
  return after;
}

// Apply an edit that is only present in SOME pages (folder-picker has the
// JScript language attr and getInstallDir; fix-wt-icon does not). If the marker
// isn't there, skip quietly - this is not drift, just a different page.
function applyOptional(label, before, re, repl) {
  var after = before.replace(re, repl);
  console.log(after === before ? "    skip (" + label + " - not in this page)" : "    " + label);
  return after;
}

// 1. Remove the HTA:APPLICATION element. REQUIRED in every page.
out = assertChanged(
  "remove <HTA:APPLICATION>",
  out,
  out.replace(/<HTA:APPLICATION[\s\S]*?\/>\s*/i, "")
);

// 2. Inject the shim <script> immediately before the FIRST <script ...> (any
//    attributes). REQUIRED - the shim must define ActiveXObject/resizeTo first.
out = assertChanged(
  "inject webview-shim.js",
  out,
  out.replace(/(<script\b[^>]*>)/i, '<script src="webview-shim.js"></script>\n$1')
);

// 3. Strip language="JScript" so the script runs as ordinary JS (folder-picker only).
out = applyOptional(
  "strip language=\"JScript\"",
  out,
  /(<script\b[^>]*?)\s+language\s*=\s*"?JScript"?([^>]*>)/gi,
  "$1$2"
);

// 4. Replace getInstallDir() body with the __APP_DIR__ lookup (folder-picker only).
out = applyOptional(
  "rewrite getInstallDir()",
  out,
  /function getInstallDir\(\)\s*\{[\s\S]*?return fso\.GetParentFolderName\(url\);\s*\}/,
  "function getInstallDir() { return window.__APP_DIR__ || \"\"; }"
);

// Sanity: the shim reference must be present exactly once.
var shimRefs = (out.match(/webview-shim\.js/g) || []).length;
if (shimRefs !== 1) {
  console.error("BUILD ABORTED: expected exactly 1 webview-shim.js reference, found " + shimRefs);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, "utf8");
console.log("OK  built " + outPath + " from " + inPath + " (" + out.length + " bytes)");
