// auto-continue.js - Resumes Claude Code once the 5-hour usage limit resets.
// Spawned detached by claudecode-launchpad.bat (only when AUTO_CONTINUE=true) via:
//   start "" /b wscript.exe //nologo auto-continue.js "<tabTitle>" "<workingFolder>"
// where <tabTitle> is the per-tab title (the project folder name) the launcher
// passes so this watcher focuses the RIGHT window (see the focus-target caveat).
//
// Native Windows has no pty wrapper around Claude's output (unlike the Kivun WSL
// sibling), so this watcher CANNOT read the screen. Instead statusline.mjs writes
// the 5-hour usage %, its reset epoch, and the working folder to
//   %LOCALAPPDATA%\Kivun\ratelimit-<hash(cwd)>.json
// every render. This watcher polls that file; once the limit has reset it focuses
// the Launchpad tab and types "continue" + Enter exactly once per reset.
//
// This does NOT bypass the limit: it waits for the real reset time (+grace) and
// then resumes idle work. Opt-in (default off), capped, and disclosed in README.
//
// -------------------------------------------------------------------------
// Arg #2 note: the .bat passes the WORKING FOLDER (not a pre-built file path),
// because the state-file name embeds hashCwd(cwd) and cmd/batch cannot compute
// that 32-bit djb2 hash. This watcher derives the same filename the way
// statusline.mjs does, so writer and reader agree without the .bat hashing.
// (If arg #2 is instead a literal ...\ratelimit-<hash>.json path, it is used
// as-is and the hash is read back from the filename — handy for tests.)
//
// CAVEAT B5 (documented, no fix in this architecture): the watcher cannot read
// the screen, so if a *permission prompt* is pending at reset time the injected
// keystrokes land in that prompt. Partial mitigation: the picker's "Auto-accept
// file edits" chip auto-accepts FILE-EDIT prompts only — a pending Bash/command
// or MCP-tool permission prompt still appears and would receive the keys (Enter
// may pick its default). Stated next to the toggle and in the README.
//
// CAVEAT (focus target): the launcher passes this watcher the PER-TAB title (the
// project folder name), which IS the real Windows Terminal window title — WT's
// suppressApplicationTitle only stops Claude from overwriting it; the launcher's
// --title <folder> is what actually shows. So AppActivate(folderTitle) is what
// matches in the WT path. For the no-WT cmd.exe fallback (whose console title
// the .bat sets to the static "ClaudeCode Launchpad CLI") we also try that
// static title. We focus the WINDOW but cannot disambiguate multiple tabs in it.
//
// Provenance: escSendKeys() is copied VERBATIM from source/inject-startup-cmd.js
// (lines 72-75); the AppActivate idiom is adapted from the same file (55-60).
// Accepted duplication per gate G1 (WSH has no shared-require mechanism for two
// files spawned independently by wscript).

// ---- Tunables ------------------------------------------------------------
var POLL_MS = 60000;             // re-check the state file every ~60s
var GRACE_S = 60;                // wait this long PAST resets_at before typing
var MAX_UPTIME_S = 86400;        // give up after 24h so a watcher can't linger
var ACTIVATE_FAIL_LIMIT = 10;    // consecutive focus failures after a success = tab gone
var DEFAULT_MAX = 5;             // B1 default cap on resumes per run
var DEFAULT_FALLBACK_MIN = 300;  // B2 default fixed-wait minutes when no resets_at

// ---- Pure helpers (unit-tested via source/test/RunUT.cmd) ----------------

// hashCwd() MUST stay byte-for-byte identical to statusline.mjs so the filename
// the statusline WRITES equals the one this watcher READS. 32-bit djb2 over a
// normalised path (lowercased, forward slashes -> back, trailing slashes off)
// rendered as 8 hex chars. Bitwise/>>>0 semantics are identical in V8 and JScript.
function hashCwd(s) {
  s = ("" + (s || "")).toLowerCase().replace(/\//g, "\\").replace(/\\+$/, "");
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;   // h*33 + c, 32-bit
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

// SendKeys reserved chars: + ^ % ~ ( ) { } [ ] - escape by wrapping in {}
// (VERBATIM from inject-startup-cmd.js:72-75)
function escSendKeys(s) {
  return s.replace(/[+^%~(){}\[\]]/g, function (c) { return "{" + c + "}"; });
}

// Parse the small state JSON WITHOUT throwing on malformed input (returns null).
// WSH JScript has no JSON object; the file is written only by our own
// statusline.mjs into %LOCALAPPDATA%, so an eval of a leading-'{' payload is
// acceptable and guarded by try/catch.
function parseState(txt) {
  if (txt === null || typeof txt === "undefined") return null;
  var t = ("" + txt).replace(/^﻿/, "").replace(/^\s+/, "");
  if (t.charAt(0) !== "{") return null;
  var obj = null;
  try { obj = eval("(" + t + ")"); } catch (e) { return null; }
  if (!obj || typeof obj !== "object") return null;
  return obj;
}

// Resolve the state-file + done-marker paths (and the shared hash) from arg #2.
function resolvePaths(arg, localApp) {
  arg = "" + (arg || "");
  var hash, stateFile;
  var m = /ratelimit-([0-9a-fA-F]+)\.json$/.exec(arg);
  if (m && /\.json$/i.test(arg)) {
    hash = ("" + m[1]).toLowerCase();
    stateFile = arg;
  } else {
    hash = hashCwd(arg);
    stateFile = localApp + "\\Kivun\\ratelimit-" + hash + ".json";
  }
  return {
    hash: hash,
    stateFile: stateFile,
    doneMarker: localApp + "\\Kivun\\autocontinue-done-" + hash + ".txt"
  };
}

// Decide the effective reset epoch (seconds) and whether the session is blocked.
// blocked = explicit blocked:true OR the fallback heuristic five_hour.pct >= 99
// (native Windows has no output stream, gate G3). Reset epoch prefers the real
// resets_at; if blocked with no usable resets_at, B2 fixed-wait from ts.
function computeReset(state, fallbackMin) {
  var fh = (state && state.five_hour) ? state.five_hour : null;
  var pct = (fh && typeof fh.pct === "number") ? fh.pct : -1;
  var blocked = (state && state.blocked === true) || (pct >= 99);
  var ra = (fh && typeof fh.resets_at === "number") ? fh.resets_at : 0;
  var reset = null;
  if (ra > 0) {
    reset = ra;
  } else if (blocked && state && typeof state.ts === "number") {
    reset = state.ts + fallbackMin * 60;   // B2 fixed-wait fallback
  }
  return { blocked: blocked, reset: reset };
}

// Decide whether to type "continue" this poll, INCLUDING the "witnessed-future"
// latch. `armedVal` is the reset value the caller recorded as seen-while-still-
// in-the-future on a prior poll (null if none). We fire only for a reset we saw
// while now < reset — so a STALE past reset sitting in a leftover state file
// (never witnessed in the future) NEVER fires, even on the very first poll. This
// is the poll-based equivalent of the WSL twin's "reject resets_at <= now" guard
// (kivun-claude-bidi/lib/auto-continue.js:114-132). NOTE: a naive "make
// computeReset reject reset <= now" does NOT work here — at fire time now is
// already >= reset+grace, so that would reject the legitimate fire too; the latch
// is what distinguishes stale-past from witnessed-then-elapsed.
// Returns the usual {fire,resetVal,blocked} plus `arm` = the armed value the
// caller must persist for the next poll. Done-marker (keyed on the reset VALUE)
// still makes it single-shot; a new reset value re-arms naturally.
function decideFire(state, nowSecVal, fallbackMin, doneVal, armedVal) {
  var r = computeReset(state, fallbackMin);
  var arm = armedVal;
  if (r.blocked && r.reset !== null && nowSecVal < r.reset) {
    arm = r.reset;                                   // witnessed while still future -> arm
  }
  var fire = false;
  if (r.blocked && r.reset !== null && nowSecVal >= r.reset + GRACE_S) {
    if (String(r.reset) !== String(doneVal) && String(r.reset) === String(arm)) fire = true;
  }
  return { fire: fire, resetVal: r.reset, blocked: r.blocked, arm: arm };
}

// B3 quiet hours. Spec "HH:MM-HH:MM" local time; "" or degenerate = never quiet.
function parseQuiet(spec) {
  if (!spec) return null;
  var m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec("" + spec);
  if (!m) return null;
  var sH = parseInt(m[1], 10), sM = parseInt(m[2], 10);
  var eH = parseInt(m[3], 10), eM = parseInt(m[4], 10);
  if (sH > 23 || eH > 23 || sM > 59 || eM > 59) return null;
  return { start: sH * 60 + sM, end: eH * 60 + eM };
}
function inQuietHours(spec, dateObj) {
  var q = parseQuiet(spec);
  if (!q) return false;
  if (q.start === q.end) return false;                 // empty / degenerate window
  var cur = dateObj.getHours() * 60 + dateObj.getMinutes();
  if (q.start < q.end) return (cur >= q.start && cur < q.end);
  return (cur >= q.start || cur < q.end);               // overnight window
}

// Read a single KEY=VALUE from config.txt text (skips # comments).
function readConfigValue(text, key) {
  if (!text) return null;
  var lines = ("" + text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if (/^\s*#/.test(ln)) continue;
    var m = new RegExp("^\\s*" + key + "\\s*=(.*)$").exec(ln);
    if (m) return m[1].replace(/^\s+|\s+$/g, "");
  }
  return null;
}

function nowSec() { return Math.floor((new Date()).getTime() / 1000); }

// The static app title. It is the cmd.exe FALLBACK window title (the .bat runs
// `title ClaudeCode Launchpad CLI`); in the normal Windows Terminal path the
// real window title is the per-tab folder name the launcher passes as arg #1.
var FALLBACK_TITLE = "ClaudeCode Launchpad CLI";

// Title fallback: missing/blank arg #1 -> the static app title. (UT_TitleFallback)
function resolveTitle(raw) {
  return (raw && ("" + raw) !== "") ? ("" + raw) : FALLBACK_TITLE;
}

// Ordered list of window titles to try for focus: the per-tab title first (the
// folder name = the real WT window title), then the static app title (the
// cmd.exe fallback console title), deduped. Pure -> unit-tested (UT_ChooseTitles).
// The actual AppActivate side effect lives in activateTitle(), not unit-testable.
function chooseTitles(primary) {
  var p = (primary && ("" + primary) !== "") ? ("" + primary) : FALLBACK_TITLE;
  return (p === FALLBACK_TITLE) ? [p] : [p, FALLBACK_TITLE];
}

// Loop-exit predicates (kept pure so RunUT can exercise the real decisions).
function shouldExitUptime(nowSecVal, startedSec) { return (nowSecVal - startedSec) >= MAX_UPTIME_S; }
function shouldExitMax(fireCount, cfgMax) { return fireCount >= cfgMax; }                       // B1
function shouldExitTabGone(everActivated, consecFail) {                                         // tab closed
  return everActivated && (consecFail >= ACTIVATE_FAIL_LIMIT);
}

// ---- I/O helpers (not unit-tested; touch the real filesystem) ------------
function readUtf8File(path) {
  var s = "";
  var st = new ActiveXObject("ADODB.Stream");
  st.Type = 2; st.Charset = "utf-8"; st.Open();
  st.LoadFromFile(path);
  s = st.ReadText();
  st.Close();
  return s;
}
function readDoneMarker(fso, path) {
  try {
    if (!fso.FileExists(path)) return "";
    var f = fso.OpenTextFile(path, 1);            // 1 = ForReading
    var v = f.AtEndOfStream ? "" : f.ReadAll();
    f.Close();
    return ("" + v).replace(/^\s+|\s+$/g, "");
  } catch (e) { return ""; }
}
function writeDoneMarker(fso, path, val) {
  try {
    var f = fso.CreateTextFile(path, true);       // true = overwrite
    f.Write("" + val);
    f.Close();
  } catch (e) {}
}

// Focus the Launchpad window by trying each candidate title in order (per-tab
// folder title, then static app title). Returns the title that activated, or
// null if none matched. Side-effecting (AppActivate) -> not unit-tested; the
// title ORDER is covered by chooseTitles(). (Adapted from inject-startup-cmd.js.)
function activateTitle(sh, primary) {
  var titles = chooseTitles(primary);
  for (var i = 0; i < titles.length; i++) {
    if (sh.AppActivate(titles[i])) return titles[i];
  }
  return null;
}

// ---- Watcher main loop ---------------------------------------------------
function main() {
  var sh = new ActiveXObject("WScript.Shell");
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var args = WScript.Arguments;

  var title = resolveTitle(args.length > 0 ? ("" + args(0)) : "");
  var stateArg = (args.length > 1) ? ("" + args(1)) : "";
  var localApp = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%");
  var P = resolvePaths(stateArg, localApp);

  // Rev B config: read the picker's config.txt sitting next to this script.
  var cfgMax = DEFAULT_MAX, cfgFallbackMin = DEFAULT_FALLBACK_MIN, cfgQuiet = "";
  try {
    var cfgPath = fso.GetParentFolderName(WScript.ScriptFullName) + "\\config.txt";
    if (fso.FileExists(cfgPath)) {
      var cfgTxt = readUtf8File(cfgPath);
      var vMax = readConfigValue(cfgTxt, "AUTO_CONTINUE_MAX");
      var vFb = readConfigValue(cfgTxt, "AUTO_CONTINUE_FALLBACK_MIN");
      var vQ = readConfigValue(cfgTxt, "AUTO_CONTINUE_QUIET");
      if (vMax !== null && /^[0-9]+$/.test(vMax)) cfgMax = parseInt(vMax, 10);
      if (vFb !== null && /^[0-9]+$/.test(vFb)) cfgFallbackMin = parseInt(vFb, 10);
      if (vQ !== null) cfgQuiet = vQ;
    }
  } catch (e) {}
  if (!(cfgMax > 0)) cfgMax = DEFAULT_MAX;
  if (!(cfgFallbackMin > 0)) cfgFallbackMin = DEFAULT_FALLBACK_MIN;

  var startedSec = nowSec();
  var fireCount = 0;
  var consecFail = 0;
  var everActivated = false;
  var armedResetVal = null;   // reset value witnessed while still in the future (latch)

  while (true) {
    if (shouldExitUptime(nowSec(), startedSec)) break;   // 24h uptime cap
    if (shouldExitMax(fireCount, cfgMax)) break;         // B1 max-resumes cap

    var state = null;
    try {
      if (fso.FileExists(P.stateFile)) state = parseState(readUtf8File(P.stateFile));
    } catch (e) { state = null; }

    if (state) {
      var doneVal = readDoneMarker(fso, P.doneMarker);
      var decision = decideFire(state, nowSec(), cfgFallbackMin, doneVal, armedResetVal);
      armedResetVal = decision.arm;                      // persist the witnessed-future latch
      if (decision.fire) {
        if (!inQuietHours(cfgQuiet, new Date())) {      // B3: silent inside quiet window
          // Focus the tab: per-tab (folder) title first, then the static fallback.
          var effTitle = activateTitle(sh, title);
          if (effTitle !== null) {
            everActivated = true;
            consecFail = 0;
            WScript.Sleep(500);
            sh.AppActivate(effTitle);                    // re-focus so keys land in the tab
            sh.SendKeys(escSendKeys("continue"));
            WScript.Sleep(100);
            sh.SendKeys("{ENTER}");
            writeDoneMarker(fso, P.doneMarker, decision.resetVal);  // single-shot per reset
            fireCount++;
            if (shouldExitMax(fireCount, cfgMax)) break;
          } else {
            consecFail++;
            if (shouldExitTabGone(everActivated, consecFail)) break;  // tab closed -> clean exit
          }
        }
      }
    }

    WScript.Sleep(POLL_MS);
  }
}

// Run the watcher only in production. The test harness (RunUT.cmd via a .wsf)
// declares AC_TEST_MODE before including this file, so it can exercise the pure
// helpers above without entering the infinite poll loop.
if (typeof AC_TEST_MODE == "undefined") {
  main();
}
