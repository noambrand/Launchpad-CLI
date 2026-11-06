// Copilot additions to the sealed launcher harness (harness.js stays as it is): the sandbox also gets
// configure-copilot.js and the fake npm Copilot of copilot-fixture.js on PATH, and phase 2 is
// `--run-copilot <id>`. Nothing opens on screen, exactly as for the Claude and Codex cases.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const h = require('./harness');
const fx = require('../copilot-fixture');
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
// fallback mode (no Windows Terminal) needs no compiled stand-in, so it also runs on a PC whose Smart
// App Control blocks them. The default mode uses the wt.exe stand-in, as the Codex cases do.
function runCopilotCase(c) {
  const launcher = fs.readFileSync(path.join(h.SOURCE, 'claudecode-launchpad.bat'), 'utf8');
  const d = h.makeSandbox(c.id, launcher);
  for (const f of ['configure-copilot.js', 'configure-codex.js', 'agent-helpers.js', 'copilot-sound.js']) fs.copyFileSync(path.join(h.SOURCE, f), path.join(d.kivun, f));
  const standins = h.buildStandIns();
  if (c.mode !== 'fallback') fs.copyFileSync(path.join(standins, 'wt.exe'), path.join(d.bin, 'wt.exe'));
  d.claudeLog = path.join(d.root, 'claude-ran.txt');
  fs.rmSync(path.join(d.bin, 'claude.exe'), { force: true });
  fs.writeFileSync(path.join(d.bin, 'claude.cmd'), '@cd > "' + d.claudeLog + '"\r\n');
  const fake = fx.makeEnv('lt-' + c.id, { fakeCopilot: c.copilot !== false });
  const fakeCodex = cfx.makeEnv('ltc-' + c.id);
  d.copilotLog = fake.log;
  const env = h.baseEnv(d, Object.assign({ FAKE_COPILOT_LOG: fake.log, FAKE_CODEX_LOG: fakeCodex.log, HOME: d.user, KIVUN_TEST_PAUSE_DIR: fake.pause, KIVUN_TEST_SCRIPT_POLICY: 'none', KIVUN_TEST_NODE_VERSION: fx.NODE_OK, COPILOT_HOME: fake.copilotHome }, c.env || {}));
  env.PATH = fake.prefix + ';' + fakeCodex.prefix + ';' + env.PATH;
  d.env = env;
  d.copilotHome = fake.copilotHome;
  if (c.setup) c.setup(d);
  const p1 = runBat(path.join(d.kivun, 'claudecode-launchpad.bat'), c.args(d), { cwd: d.user, env, input: c.input });
  let p2 = null, phase2 = null;
  const wt = h.readStandIns(d.log).find(r => r.name === 'wt');
  if (wt && !c.skipPhase2) {
    const a = wt.args, dash = a.indexOf('--'), dd = a.indexOf('-d');
    phase2 = { cwd: a[dd + 1], command: a.slice(dash + 1) };
    if (/\.bat$/i.test(a[dash + 1])) p2 = runBat(a[dash + 1], a.slice(dash + 2), { cwd: a[dd + 1], env, input: c.input });
  }
  return {
    d, p1, p2, wt, phase2,
    copilotRuns: fx.records(fake).filter(isRun),
    codexRuns: cfx.records(fakeCodex).filter(r => r.args && !r.args.includes('--version') && !r.args.includes('models') && !r.args.includes('prompt-input')),
    claudeIn: fs.existsSync(d.claudeLog) ? fs.readFileSync(d.claudeLog, 'utf8').trim() : null,
    launches: fs.existsSync(path.join(d.kivun, 'launch')) ? fs.readdirSync(path.join(d.kivun, 'launch')) : [],
  };
}

function copilotModule() { return fx.load(); }

module.exports = { runCopilotCase, copilotModule };
