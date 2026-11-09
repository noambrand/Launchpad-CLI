// Antigravity additions to the sealed launcher harness (harness.js stays as it is): the sandbox also gets
// configure-antigravity.js and a stand-in agy.exe at %LOCALAPPDATA%\agy\bin (where Google's installer puts
// it), and phase 2 is `--run-antigravity <id>`. Nothing opens on screen, exactly as for the other cases.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const h = require('./harness');
const fx = require('../antigravity-fixture');
const cpx = require('../copilot-fixture');
const cfx = require('../codex-fixture');

const isRun = r => r.args && !r.args.includes('--version');

// As harness.js runs the launcher, and also returns what it printed: these tests read the messages.
function runBat(bat, args, opts) {
  const line = '/d /s /c ""' + bat + '"' + args.map(a => ' "' + a + '"').join('') + '"';
  const r = cp.spawnSync(opts.env.ComSpec, [line], {
    cwd: opts.cwd, env: opts.env, input: opts.input || 'exit\r\n\r\n\r\n', windowsVerbatimArguments: true,
    windowsHide: true, encoding: 'utf8', timeout: opts.timeout || 60000,
  });
  return { status: r.status, stdout: r.stdout || '', timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
}

// One launch. setup(d) may write config.txt or launch folders; args(d) gives phase 1's arguments.
// fallback mode (no Windows Terminal) needs no compiled wt.exe stand-in. The stand-in agy.exe is
// always compiled (c.agy === false leaves it out, for the not-installed case).
function runAntigravityCase(c) {
  const launcher = fs.readFileSync(path.join(h.SOURCE, 'claudecode-launchpad.bat'), 'utf8');
  const d = h.makeSandbox(c.id, launcher);
  for (const f of ['configure-antigravity.js', 'configure-copilot.js', 'configure-codex.js', 'agent-helpers.js', 'copilot-sound.js']) fs.copyFileSync(path.join(h.SOURCE, f), path.join(d.kivun, f));
  const standins = h.buildStandIns();
  if (c.mode !== 'fallback') fs.copyFileSync(path.join(standins, 'wt.exe'), path.join(d.bin, 'wt.exe'));
  d.claudeLog = path.join(d.root, 'claude-ran.txt');
  fs.rmSync(path.join(d.bin, 'claude.exe'), { force: true });
  fs.writeFileSync(path.join(d.bin, 'claude.cmd'), '@cd > "' + d.claudeLog + '"\r\n');
  const fakeCopilot = cpx.makeEnv('ltcp-' + c.id, { fakeCopilot: true });
  const fakeCodex = cfx.makeEnv('ltc-' + c.id);
  d.agyLog = path.join(d.root, 'fake-agy.jsonl');
  d.agyPause = path.join(d.root, 'pause');
  fs.mkdirSync(d.agyPause, { recursive: true });
  const env = h.baseEnv(d, Object.assign({
    FAKE_AGY_LOG: d.agyLog, FAKE_COPILOT_LOG: fakeCopilot.log, FAKE_CODEX_LOG: fakeCodex.log, HOME: d.user,
    KIVUN_TEST_PAUSE_DIR: d.agyPause, KIVUN_TEST_SCRIPT_POLICY: 'none',
    // The Node that Copilot would run on is a test input, as in Copilot's harness: CI's own Node is older than Copilot allows.
    KIVUN_TEST_NODE_VERSION: cpx.NODE_OK,
  }, c.env || {}));
  env.PATH = fakeCopilot.prefix + ';' + fakeCodex.prefix + ';' + env.PATH;
  d.env = env;
  if (c.agy !== false) {
    const dir = path.join(d.lad, 'agy', 'bin');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(fx.stub(), path.join(dir, 'agy.exe'));
  }
  if (c.setup) c.setup(d);
  const p1 = runBat(path.join(d.kivun, 'claudecode-launchpad.bat'), c.args(d), { cwd: d.user, env, input: c.input });
  let p2 = null, phase2 = null;
  const wt = h.readStandIns(d.log).find(r => r.name === 'wt');
  if (wt && !c.skipPhase2) {
    const a = wt.args, dash = a.indexOf('--'), dd = a.indexOf('-d');
    phase2 = { cwd: a[dd + 1], command: a.slice(dash + 1) };
    if (/\.bat$/i.test(a[dash + 1])) p2 = runBat(a[dash + 1], a.slice(dash + 2), { cwd: a[dd + 1], env, input: c.input });
  }
  const rec = log => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  return {
    d, p1, p2, wt, phase2,
    agyRuns: rec(d.agyLog).filter(isRun),
    copilotRuns: cpx.records(fakeCopilot).filter(isRun),
    codexRuns: cfx.records(fakeCodex).filter(r => r.args && !r.args.includes('--version') && !r.args.includes('models') && !r.args.includes('prompt-input')),
    claudeIn: fs.existsSync(d.claudeLog) ? fs.readFileSync(d.claudeLog, 'utf8').trim() : null,
    launches: fs.existsSync(path.join(d.kivun, 'launch')) ? fs.readdirSync(path.join(d.kivun, 'launch')) : [],
  };
}

function antigravityModule() { return fx.load(); }

module.exports = { runAntigravityCase, antigravityModule };
