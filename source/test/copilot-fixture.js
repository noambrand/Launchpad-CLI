// Test fixture for the Copilot unit tests: a sealed Kivun folder, Copilot home and fake npm install.
// The fake Copilot (npm-loader.js, started the way npm's copilot.cmd starts it) records its exact
// arguments, working folder and selected environment, and answers --version like the real one. Its
// copilot.cmd records too, to prove the runner never uses it.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const MODULE = path.join(SOURCE, 'configure-copilot.js');
const REPO = path.resolve(SOURCE, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(REPO, '.test-run');
const NODE_OK = 'v22.0.0';

const FAKE_LOADER = `// fake npm-loader.js for tests
const fs = require('fs');
const out = process.env.FAKE_COPILOT_LOG;
const a = process.argv.slice(2);
const rec = { args: a, cwd: process.cwd(), env: {} };
for (const k of ['COPILOT_HOME', 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS', 'PSExecutionPolicyPreference', 'MY_PROFILE_VAR', 'AGENT']) if (process.env[k] !== undefined) rec.env[k] = process.env[k];
rec.pathHead = (process.env.PATH || '').split(';')[0];
if (out) fs.appendFileSync(out, JSON.stringify(rec) + '\\n');
if (a.includes('--version')) { console.log('GitHub Copilot CLI ' + (process.env.FAKE_COPILOT_VERSION || '1.0.105') + '.'); process.exit(0); }
process.exit(Number(process.env.FAKE_COPILOT_EXIT || 0));
`;

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

function makeEnv(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'cp', name);
  rmrf(root);
  const d = {
    root, kivun: path.join(root, 'k'), home: path.join(root, 'h'), copilotHome: path.join(root, 'h', '.copilot'),
    prefix: path.join(root, 'npm'), work: path.join(root, 'w'), log: path.join(root, 'fake-copilot.jsonl'), pause: path.join(root, 'pause'),
  };
  for (const k of ['kivun', 'home', 'work', 'pause']) fs.mkdirSync(d[k], { recursive: true });
  if (opts.fakeCopilot !== false) installFakeCopilot(d);
  const sys = process.env.SystemRoot || 'C:\\Windows';
  d.env = {
    SystemRoot: sys, windir: sys, ComSpec: path.join(sys, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [d.prefix, path.join(sys, 'System32'), path.dirname(process.execPath)].join(';'),
    USERPROFILE: d.home, HOME: d.home, LOCALAPPDATA: path.join(root, 'lad'), KIVUN_DIR: d.kivun, COPILOT_HOME: d.copilotHome,
    PROCESSOR_ARCHITECTURE: 'AMD64', FAKE_COPILOT_LOG: d.log, KIVUN_TEST_PAUSE_DIR: d.pause,
    // Tests never read this PC's real PowerShell settings, except the test that asks to.
    KIVUN_TEST_SCRIPT_POLICY: opts.scriptPolicy || 'none',
    // The Node that Copilot would run on is a test input: CI's own Node is older than Copilot allows.
    KIVUN_TEST_NODE_VERSION: opts.nodeVersion || NODE_OK,
  };
  return d;
}

function installFakeCopilot(d) {
  const pkg = path.join(d.prefix, 'node_modules', '@github', 'copilot');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'npm-loader.js'), FAKE_LOADER);
  fs.writeFileSync(path.join(d.prefix, 'copilot.cmd'), '@echo off\r\necho {"cmdShimUsed":true}>>"%FAKE_COPILOT_LOG%"\r\n');
}

// One session as Copilot records it under session-state. events: false is a session opened and left empty.
function addSession(d, id, cwd, updated, events) {
  const dir = path.join(d.copilotHome, 'session-state', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workspace.yaml'), `id: ${id}\ncwd: ${cwd}\nsummary_count: 0\ncreated_at: ${updated}\nupdated_at: ${updated}\n`);
  if (events !== false) fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"type":"user.message"}\n');
}

function records(d) {
  return fs.existsSync(d.log) ? fs.readFileSync(d.log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

function cli(d, args, extraEnv, opts) {
  return cp.spawnSync(process.execPath, [MODULE, ...args], Object.assign({
    env: Object.assign({}, d.env, extraEnv || {}), encoding: 'utf8', windowsHide: true, timeout: 60000,
  }, opts || {}));
}

function load() {
  delete require.cache[require.resolve(MODULE)];
  return require(MODULE);
}

module.exports = { MODULE, SOURCE, ROOT, NODE_OK, makeEnv, addSession, records, cli, load, rmrf };
