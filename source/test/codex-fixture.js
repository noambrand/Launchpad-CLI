// Test fixture for the Codex unit tests: a sealed Kivun folder, Codex home and fake npm install.
// The fake Codex (codex.js, started the way npm's codex.cmd starts it) records its exact
// arguments, working folder and selected environment, and answers --version, debug models and
// debug prompt-input like the real one. Its codex.cmd records too, to prove the runner never uses it.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const MODULE = path.join(SOURCE, 'configure-codex.js');
const REPO = path.resolve(SOURCE, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(REPO, '.test-run');

const FAKE_CODEX_JS = `// fake codex.js for tests
const fs = require('fs');
const out = process.env.FAKE_CODEX_LOG;
const a = process.argv.slice(2);
const rec = { args: a, cwd: process.cwd(), env: {} };
for (const k of ['CODEX_HOME', 'MY_PROFILE_VAR', 'OPENAI_API_KEY', 'AGENT']) if (process.env[k] !== undefined) rec.env[k] = process.env[k];
rec.pathHead = (process.env.PATH || '').split(';')[0];
if (out) fs.appendFileSync(out, JSON.stringify(rec) + '\\n');
if (a.includes('--version')) { console.log('codex-cli ' + (process.env.FAKE_CODEX_VERSION || '0.166.0')); process.exit(0); }
if (a.includes('models')) { console.log(process.env.FAKE_CODEX_MODELS || JSON.stringify({ models: [
  { slug: 'gpt-a', display_name: 'GPT A', visibility: 'list' }, { slug: 'gpt-hidden', display_name: 'Hidden', visibility: 'hide' },
  { slug: 'gpt-b', display_name: 'GPT B', visibility: 'list' } ] })); process.exit(0); }
if (a.includes('prompt-input')) { console.log(process.env.FAKE_PROMPT_INPUT || JSON.stringify([{ type: 'message', role: 'developer',
  content: [{ type: 'input_text', text: '<permissions instructions>x' }] }])); process.exit(0); }
process.exit(Number(process.env.FAKE_CODEX_EXIT || 0));
`;

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

// A fresh, sealed set of folders for one test. Paths stay short (Codex socket limit).
function makeEnv(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'cx', name);
  rmrf(root);
  const d = {
    root, kivun: path.join(root, 'k'), home: path.join(root, 'h'), codexHome: path.join(root, 'h', '.codex'),
    prefix: path.join(root, 'npm'), work: path.join(root, 'w'), log: path.join(root, 'fake-codex.jsonl'), pause: path.join(root, 'pause'),
  };
  for (const k of ['kivun', 'codexHome', 'work', 'pause']) fs.mkdirSync(d[k], { recursive: true });
  if (opts.fakeCodex !== false) installFakeCodex(d);
  const sys = process.env.SystemRoot || 'C:\\Windows';
  d.env = {
    SystemRoot: sys, windir: sys, ComSpec: path.join(sys, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [d.prefix, path.join(sys, 'System32'), path.dirname(process.execPath)].join(';'),
    USERPROFILE: d.home, HOME: d.home, LOCALAPPDATA: path.join(root, 'lad'), KIVUN_DIR: d.kivun, CODEX_HOME: d.codexHome,
    PROCESSOR_ARCHITECTURE: 'AMD64', FAKE_CODEX_LOG: d.log, KIVUN_TEST_PAUSE_DIR: d.pause,
  };
  return d;
}

function installFakeCodex(d) {
  const pkg = path.join(d.prefix, 'node_modules', '@openai', 'codex');
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'bin', 'codex.js'), FAKE_CODEX_JS);
  const native = path.join(pkg, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin');
  fs.mkdirSync(native, { recursive: true });
  fs.writeFileSync(path.join(native, 'codex.exe'), 'not a real program');
  fs.writeFileSync(path.join(d.prefix, 'codex.cmd'), '@echo off\r\necho {"cmdShimUsed":true}>>"%FAKE_CODEX_LOG%"\r\n');
}

function records(d) {
  return fs.existsSync(d.log) ? fs.readFileSync(d.log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

// Run the real configure-codex.js as a child, the way the launcher or installer does.
function cli(d, args, extraEnv, opts) {
  return cp.spawnSync(process.execPath, [MODULE, ...args], Object.assign({
    env: Object.assign({}, d.env, extraEnv || {}), encoding: 'utf8', windowsHide: true, timeout: 60000,
  }, opts || {}));
}

// Load a fresh copy of the module with this test's environment.
function load(d) {
  delete require.cache[require.resolve(MODULE)];
  return require(MODULE);
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The runner adds --no-daemon when Codex's background-server connection file would be too long
// (Gate 0). Test folders can be long on a developer PC, so expected arguments include it then.
function withDaemonFlag(d, args, extraEnv) {
  const env = Object.assign({}, d.env, extraEnv || {});
  return (load().socketPath(env).length >= 108 ? ['--no-daemon'] : []).concat(args);
}

module.exports = { MODULE, SOURCE, ROOT, makeEnv, records, cli, load, sleep, rmrf, withDaemonFlag };
