// Test fixture for the Antigravity unit tests: a sealed Kivun folder and fake home (optionally with
// Hebrew and a space in its path), plus a stand-in sound player that records its calls.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const REPO = path.resolve(SOURCE, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(REPO, '.test-run');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// opts.hebrew: the fake home is named with Hebrew and a space.
function makeEnv(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'agy', name);
  rmrf(root);
  const home = path.join(root, opts.hebrew ? '\u05E4\u05E8\u05D5\u05E4\u05D9\u05DC \u05E2\u05DD \u05E8\u05D5\u05D5\u05D7' : 'h');
  const d = { root, kivun: path.join(root, 'k'), home, work: path.join(root, 'w') };
  for (const k of ['kivun', 'home', 'work']) fs.mkdirSync(d[k], { recursive: true });
  d.pluginDir = path.join(home, '.gemini', 'config', 'plugins', 'launchpad');
  const sys = process.env.SystemRoot || 'C:\\Windows';
  d.env = {
    SystemRoot: sys, windir: sys, ComSpec: path.join(sys, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [path.join(sys, 'System32'), path.dirname(process.execPath)].join(';'),
    USERPROFILE: home, HOME: home, LOCALAPPDATA: path.join(root, 'lad'), KIVUN_DIR: d.kivun,
  };
  return d;
}

// Puts a copy of antigravity-hook.js where install reads it (the Kivun folder).
function seedHook(d) { fs.copyFileSync(path.join(SOURCE, 'antigravity-hook.js'), path.join(d.kivun, 'antigravity-hook.js')); }

// A stand-in player that writes a marker file with its argument (after delayMs, if given).
function fakePlayer(d, delayMs) {
  const out = path.join(d.root, 'played.jsonl');
  const player = path.join(d.root, 'player.js');
  const wait = delayMs ? 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ' + delayMs + ');' : '';
  fs.writeFileSync(player, wait + 'require("fs").appendFileSync(' + JSON.stringify(out) + ', JSON.stringify({ sound: process.argv[2], cwd: process.cwd() }) + "\\n");\n');
  return { out, player };
}

// What the stand-in player recorded, after waiting up to a few seconds for it to run.
function played(out, waitMs) {
  const until = Date.now() + (waitMs || 3000);
  while (!fs.existsSync(out) && Date.now() < until) sleep(50);
  sleep(300);
  return fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

// ---- A stand-in agy.exe (built once per test process with the Windows csc.exe, as UT_Copilot_Install does).
// It records every call (arguments, working folder, whole environment) to FAKE_AGY_LOG, prints the
// version from version.txt beside it (else FAKE_AGY_VERSION, else 1.5.3) for --version, and for `update`
// can sleep (FAKE_AGY_UPDATE_SLEEP_MS), move to a new version (FAKE_AGY_UPDATE_TO) and exit with
// FAKE_AGY_UPDATE_EXIT. Any other call exits with FAKE_AGY_EXIT.
const STUB_SOURCE = `
using System; using System.IO; using System.Text; using System.Collections;
class P {
  static string J(string s) {
    var b = new StringBuilder("\\"");
    foreach (char c in s) {
      if (c == '"' || c == '\\\\') b.Append('\\\\').Append(c);
      else if (c < 32) b.Append("\\\\u" + ((int)c).ToString("x4"));
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }
  static int Main(string[] a) {
    string log = Environment.GetEnvironmentVariable("FAKE_AGY_LOG");
    if (log != null) {
      var b = new StringBuilder("{\\"args\\":[");
      for (int i = 0; i < a.Length; i++) b.Append(i > 0 ? "," : "").Append(J(a[i]));
      b.Append("],\\"cwd\\":").Append(J(Environment.CurrentDirectory)).Append(",\\"env\\":{");
      bool first = true;
      foreach (DictionaryEntry e in Environment.GetEnvironmentVariables()) {
        b.Append(first ? "" : ",").Append(J((string)e.Key)).Append(":").Append(J((string)e.Value)); first = false;
      }
      b.Append("}}\\n");
      File.AppendAllText(log, b.ToString(), new UTF8Encoding(false));
    }
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string vf = Path.Combine(dir, "version.txt");
    string version = File.Exists(vf) ? File.ReadAllText(vf).Trim() : (Environment.GetEnvironmentVariable("FAKE_AGY_VERSION") ?? "1.5.3");
    if (a.Length > 0 && a[0] == "--version") { Console.WriteLine("agy version " + version); return 0; }
    if (a.Length > 0 && a[0] == "update") {
      string ms = Environment.GetEnvironmentVariable("FAKE_AGY_UPDATE_SLEEP_MS");
      if (!string.IsNullOrEmpty(ms)) System.Threading.Thread.Sleep(int.Parse(ms));
      string to = Environment.GetEnvironmentVariable("FAKE_AGY_UPDATE_TO");
      if (!string.IsNullOrEmpty(to)) { File.WriteAllText(vf, to); Console.WriteLine("updated to " + to); }
      else Console.WriteLine("already on the latest version");
      return int.Parse(Environment.GetEnvironmentVariable("FAKE_AGY_UPDATE_EXIT") ?? "0");
    }
    return int.Parse(Environment.GetEnvironmentVariable("FAKE_AGY_EXIT") ?? "0");
  }
}`;
let stubExe = null;
function stub() {
  if (stubExe && fs.existsSync(stubExe)) return stubExe;
  const dir = path.join(ROOT, 'agy-stub-' + process.pid);
  rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'agy.cs');
  fs.writeFileSync(src, STUB_SOURCE);
  const csc = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const r = cp.spawnSync(csc, ['/nologo', '/out:' + path.join(dir, 'agy.exe'), src], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error('could not build the stand-in agy.exe: ' + r.stdout + r.stderr);
  return (stubExe = path.join(dir, 'agy.exe'));
}

// Puts the stand-in at <LOCALAPPDATA>\\agy\\bin\\agy.exe (version: the text in version.txt beside it).
function installStub(d, version) {
  const dir = path.join(d.env.LOCALAPPDATA, 'agy', 'bin');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(stub(), path.join(dir, 'agy.exe'));
  if (version) fs.writeFileSync(path.join(dir, 'version.txt'), version);
  return path.join(dir, 'agy.exe');
}

// makeEnv plus what the runner tests need: the stand-in installed (opts.stub: false for none), its log,
// the pause folder and a fixed script-policy answer (opts.scriptPolicy: 'chosen', else 'none').
function makeAgyEnv(name, opts) {
  opts = opts || {};
  const d = makeEnv(name, opts);
  d.log = path.join(d.root, 'fake-agy.jsonl');
  d.pause = path.join(d.root, 'pause');
  fs.mkdirSync(d.pause, { recursive: true });
  Object.assign(d.env, { FAKE_AGY_LOG: d.log, KIVUN_TEST_PAUSE_DIR: d.pause, KIVUN_TEST_SCRIPT_POLICY: opts.scriptPolicy || 'none' });
  d.exe = opts.stub === false ? path.join(d.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : installStub(d, opts.version);
  return d;
}

// Every call the stand-in recorded, in order.
function records(d) {
  return fs.existsSync(d.log) ? fs.readFileSync(d.log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}
// The calls that are not just a version check.
const launches = d => records(d).filter(r => r.args[0] !== '--version');

const MODULE = path.join(SOURCE, 'configure-antigravity.js');
function cli(d, args, extraEnv, opts) {
  return cp.spawnSync(process.execPath, [MODULE, ...args], Object.assign({
    env: Object.assign({}, d.env, extraEnv || {}), encoding: 'utf8', windowsHide: true, timeout: 60000,
  }, opts || {}));
}
function load() {
  delete require.cache[require.resolve(MODULE)];
  return require(MODULE);
}

module.exports = { SOURCE, ROOT, MODULE, rmrf, sleep, makeEnv, makeAgyEnv, installStub, stub, records, launches, cli, load, seedHook, fakePlayer, played, cp };
