// Codex additions to the sealed launcher harness (harness.js stays as it is): the sandbox also
// gets configure-codex.js and the fake npm Codex of codex-fixture.js on PATH, and phase 2 is
// `--run-codex <id>`. Nothing opens on screen, exactly as for the Claude cases.
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness');
const fx = require('../codex-fixture');

const isRun = r => r.args && !r.args.includes('--version') && !r.args.includes('models') && !r.args.includes('prompt-input');

// One launch. setup(d) may write config.txt or launch folders; args(d) gives phase 1's arguments.
function runCodexCase(c) {
  const launcher = fs.readFileSync(path.join(h.SOURCE, 'claudecode-launchpad.bat'), 'utf8');
  const d = h.makeSandbox(c.id, launcher);
  for (const f of ['configure-codex.js', 'agent-helpers.js']) fs.copyFileSync(path.join(h.SOURCE, f), path.join(d.kivun, f));
  const standins = h.buildStandIns();
  if (c.mode !== 'fallback') fs.copyFileSync(path.join(standins, 'wt.exe'), path.join(d.bin, 'wt.exe'));
  fs.copyFileSync(path.join(standins, 'claude.exe'), path.join(d.bin, 'claude.exe'));
  const fake = fx.makeEnv('lt-' + c.id, { fakeCodex: c.codex !== false });   // fake npm Codex and its log
  d.codexLog = fake.log;
  d.pause = fake.pause;
  const env = h.baseEnv(d, Object.assign({ FAKE_CODEX_LOG: fake.log, HOME: d.user, KIVUN_TEST_PAUSE_DIR: fake.pause }, c.env || {}));
  env.PATH = fake.prefix + ';' + env.PATH;
  d.env = env;
  if (c.setup) c.setup(d);
  const before = h.snapshot(d.kivun);
  const p1 = h.runBat(path.join(d.kivun, 'claudecode-launchpad.bat'), c.args(d), { cwd: d.user, env, input: c.input });
  let p2 = null, phase2 = null;
  const wt = h.readStandIns(d.log).find(r => r.name === 'wt');
  if (wt && !c.skipPhase2) {
    const a = wt.args, dash = a.indexOf('--'), dd = a.indexOf('-d');
    phase2 = { cwd: a[dd + 1], command: a.slice(dash + 1) };
    if (/\.bat$/i.test(a[dash + 1])) p2 = h.runBat(a[dash + 1], a.slice(dash + 2), { cwd: a[dd + 1], env, input: c.input });
  }
  const codexRuns = fx.records(fake).filter(isRun);
  return {
    d, p1, p2, wt, phase2, codexRuns, before, after: settledSnapshot(d.kivun),
    standIns: h.readStandIns(d.log),
    launches: fs.existsSync(path.join(d.kivun, 'launch')) ? fs.readdirSync(path.join(d.kivun, 'launch')) : [],
  };
}

// Each launch starts a hidden model-list refresh that writes kivun-codex-models.json through a
// temporary file at its own pace: read the folder once that has settled (5 s at most).
function settledSnapshot(dir) {
  let last = null;
  for (let i = 0; i < 25; i++) {
    let snap = null;
    try { snap = h.snapshot(dir); } catch (e) { /* a temporary file vanished while being read */ }
    if (snap && !Object.keys(snap).some(n => n.endsWith('.tmp')) && JSON.stringify(snap) === JSON.stringify(last)) return snap;
    last = snap;
    fx.sleep(200);
  }
  return h.snapshot(dir);
}

// Load configure-codex.js with this sandbox's environment, to create picker launch folders.
function codexModule(d) { return fx.load(); }

module.exports = { runCodexCase, codexModule, withDaemonFlag: (d, args) => (fx.load().socketPath(d.env).length >= 108 ? ['--no-daemon'] : []).concat(args) };
