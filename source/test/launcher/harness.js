// Launcher test harness: runs the real claudecode-launchpad.bat in a sealed folder, with
// recording stand-ins for claude.exe and wt.exe and stubs for the helpers that would focus
// windows or type keys (auto-continue.js, inject-startup-cmd.js) or touch Windows Terminal
// settings (apply-terminal-color.js, dedupe-launch-tab.js). Nothing opens on screen: every
// process is started hidden, wt.exe is a windowless stand-in, and phase 2 (what Windows
// Terminal would run in the new tab) is run by the harness itself.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..', '..'); // source/
const REPO = path.resolve(SOURCE, '..');
// Outside %TEMP% (Codex refuses its helpers there) and short (Codex's 108-character socket path).
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(REPO, '.test-run');
const CSC = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

// Build claude.exe (console) and wt.exe (no window) from standin.cs, once per source version.
function buildStandIns() {
  const src = path.join(__dirname, 'standin.cs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 12);
  const dir = path.join(ROOT, 'standin-' + hash);
  const want = [['claude.exe', 'exe'], ['wt.exe', 'winexe']];
  if (want.every(([n]) => fs.existsSync(path.join(dir, n)))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, target] of want) {
    const r = cp.spawnSync(CSC, ['/nologo', '/optimize', '/target:' + target, '/out:' + path.join(dir, name), src], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error('csc failed for ' + name + ': ' + r.stdout + r.stderr);
  }
  return dir;
}

// Stubs: each call writes one JSON file into STUB_LOG_DIR (UTF-16 from JScript, UTF-8 from Node).
const WSH_STUB = name => `// test stub for ${name}
var fso = new ActiveXObject("Scripting.FileSystemObject");
var sh = new ActiveXObject("WScript.Shell");
var dir = sh.ExpandEnvironmentStrings("%STUB_LOG_DIR%");
var a = [], i;
for (i = 0; i < WScript.Arguments.length; i++) a.push('"' + WScript.Arguments(i).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"');
var f = fso.CreateTextFile(dir + "\\\\${name}-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1e9) + ".json", true, true);
f.Write('{"stub":"${name}","args":[' + a.join(",") + ']}');
f.Close();
`;
const NODE_STUB = name => `// test stub for ${name}
require('fs').writeFileSync(require('path').join(process.env.STUB_LOG_DIR, '${name}-' + Date.now() + '-' + Math.floor(Math.random() * 1e9) + '.json'),
  JSON.stringify({ stub: '${name}', args: process.argv.slice(2) }));
`;
const STUBS = {
  'auto-continue.js': WSH_STUB('auto-continue.js'),
  'inject-startup-cmd.js': WSH_STUB('inject-startup-cmd.js'),
  'apply-terminal-color.js': NODE_STUB('apply-terminal-color.js'),
  'dedupe-launch-tab.js': NODE_STUB('dedupe-launch-tab.js'),
};

// A fresh sealed install for one case. Same path every time, so two runs compare directly.
function makeSandbox(caseId, launcherText) {
  const sb = path.join(ROOT, 'cases', caseId);
  rmrf(sb);
  const d = {
    root: sb, user: path.join(sb, 'User'), lad: path.join(sb, 'LAD'), kivun: path.join(sb, 'LAD', 'Kivun'),
    bin: path.join(sb, 'bin'), tmp: path.join(sb, 'tmp'), work: path.join(sb, 'work'), stubs: path.join(sb, 'stubs'),
    log: path.join(sb, 'standin.jsonl'), appdata: path.join(sb, 'AppData'),
  };
  for (const k of ['user', 'kivun', 'bin', 'tmp', 'work', 'stubs', 'appdata']) fs.mkdirSync(d[k], { recursive: true });
  // cmd misreads batch files with bare LF line ends (a comment line became claude's arguments
  // in the first calibration run), so the launcher is always written with CRLF, as installed.
  fs.writeFileSync(path.join(d.kivun, 'claudecode-launchpad.bat'), launcherText.replace(/\r?\n/g, '\r\n'));
  fs.copyFileSync(path.join(SOURCE, 'write-startcmd.js'), path.join(d.kivun, 'write-startcmd.js'));
  for (const [n, t] of Object.entries(STUBS)) fs.writeFileSync(path.join(d.kivun, n), t);
  return d;
}

function baseEnv(d, extra) {
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const nodeDir = path.dirname(process.execPath);
  const env = {
    SystemRoot: sys, windir: sys, SystemDrive: process.env.SystemDrive || 'C:', ComSpec: path.join(sys, 'System32', 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF', OS: 'Windows_NT', PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE || 'AMD64',
    TEMP: d.tmp, TMP: d.tmp, USERPROFILE: d.user, LOCALAPPDATA: d.lad, APPDATA: d.appdata, USERNAME: 'tester',
    HOMEDRIVE: d.user.slice(0, 2), HOMEPATH: d.user.slice(2), ProgramFiles: path.join(d.root, 'PF'),
    PATH: [d.bin, path.join(sys, 'System32'), sys, path.join(sys, 'System32', 'Wbem'), nodeDir].join(';'),
    STANDIN_LOG: d.log, STUB_LOG_DIR: d.stubs,
  };
  return Object.assign(env, extra || {});
}

// Run "<bat>" <args...> hidden. Arguments are quoted for cmd; none may contain a double quote.
function runBat(bat, args, opts) {
  for (const a of args) if (a.includes('"')) throw new Error('argument with a quote: ' + a);
  const line = '/d /s /c ""' + bat + '"' + args.map(a => ' "' + a + '"').join('') + '"';
  const r = cp.spawnSync(opts.env.ComSpec, [line], {
    cwd: opts.cwd, env: opts.env, input: opts.input || 'exit\r\n\r\n\r\n', windowsVerbatimArguments: true,
    windowsHide: true, encoding: 'utf8', timeout: opts.timeout || 60000,
  });
  return { status: r.status, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
}

function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isFile()) out[n] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
  }
  return out;
}

function readStubs(dir) {
  return fs.readdirSync(dir).sort().map(n => {
    const buf = fs.readFileSync(path.join(dir, n));
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString('utf16le') : buf.toString('utf8');
    return JSON.parse(text);
  }).sort((a, b) => (a.stub + JSON.stringify(a.args)).localeCompare(b.stub + JSON.stringify(b.args)));
}

function readStandIns(log) {
  if (!fs.existsSync(log)) return [];
  return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// After `start "" wt.exe ... -- "<bat>" --run`, Windows Terminal would run phase 2 in the new tab,
// in the -d folder, with its own environment. The harness does exactly that, hidden.
function phase2FromWt(wtRecord) {
  const a = wtRecord.args;
  const d = a.indexOf('-d');
  const dash = a.indexOf('--');
  if (d < 0 || dash < 0) throw new Error('unexpected wt.exe arguments: ' + JSON.stringify(a));
  return { cwd: a[d + 1], bat: a[dash + 1], args: a.slice(dash + 2) };
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// One full launch: case.setup prepares files, then phase 1, then phase 2 if Windows Terminal "opened".
function runCase(c, launcherText) {
  const d = makeSandbox(c.id, launcherText);
  if (c.mode !== 'fallback') fs.copyFileSync(path.join(buildStandIns(), 'wt.exe'), path.join(d.bin, 'wt.exe'));
  fs.copyFileSync(path.join(buildStandIns(), 'claude.exe'), path.join(d.bin, 'claude.exe'));
  if (c.setup) c.setup(d);
  const before = snapshot(d.kivun);
  const env = baseEnv(d, c.env);
  const p1 = runBat(path.join(d.kivun, 'claudecode-launchpad.bat'), c.args(d), { cwd: d.user, env, input: c.input });
  let p2 = null;
  const wt = readStandIns(d.log).find(r => r.name === 'wt');
  if (wt) {
    const ph = phase2FromWt(wt);
    p2 = runBat(ph.bat, ph.args, { cwd: ph.cwd, env: baseEnv(d, c.env), input: c.input });
  }
  sleep(1500); // detached `start /b wscript` stubs finish writing
  const after = snapshot(d.kivun);
  const files = {};
  for (const n of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[n] !== after[n]) files[n] = after[n] ? (before[n] ? 'changed:' + after[n] : 'created:' + after[n]) : 'deleted';
  }
  return normalize({ phase1: p1, phase2: p2, standIns: readStandIns(d.log), stubs: readStubs(d.stubs), kivunFiles: files }, d);
}

// Paths become <SB>; variables listed in golden-normalize.json (found by calibration) become <VARIES>.
function normalize(result, d) {
  const varies = loadNormalizeList();
  for (const r of result.standIns) for (const k of Object.keys(r.env)) if (varies.includes(k.toUpperCase())) r.env[k] = '<VARIES>';
  let s = JSON.stringify(result);
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const p of [d.root, d.root.replace(/\\/g, '/')]) {
    s = s.replace(new RegExp(esc(JSON.stringify(p).slice(1, -1)), 'gi'), '<SB>');
    s = s.replace(new RegExp(esc(p), 'gi'), '<SB>');
  }
  return JSON.parse(s);
}

function loadNormalizeList() {
  const f = path.join(__dirname, 'golden-normalize.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).variables.map(v => v.toUpperCase()) : [];
}

module.exports = { ROOT, SOURCE, REPO, runCase, buildStandIns, makeSandbox, baseEnv, runBat, readStandIns, readStubs, snapshot, normalize };
