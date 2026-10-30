// The real launcher (claudecode-launchpad.bat) on the Codex path, end to end and hidden
// (handout 7.3, D15, D19; acceptance A6, A10, A11, A23, A24, A31, A32, A38).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ch = require('./launcher/codex-harness');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };
const pickerLaunch = (d, data) => ch.codexModule(d).createLaunch(Object.assign({ agent: 'codex' }, data), d.env);
const LEGACY = ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt'];
const legacyState = d => LEGACY.map(n => [n, fs.existsSync(path.join(d.kivun, n)) ? fs.readFileSync(path.join(d.kivun, n), 'utf8') : null]);

test('UT_Launch_AgentPrecedence: right-click with AGENT=codex starts Codex in the clicked folder', () => {
  let p;
  const r = ch.runCodexCase({ id: 'L01-rightclick', setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.strictEqual(r.codexRuns.length, 1, 'Codex started once');
  assert.strictEqual(r.codexRuns[0].cwd, p);
  assert.deepStrictEqual(r.codexRuns[0].args, ch.withDaemonFlag(r.d, []));
  assert.ok(!r.standIns.some(s => s.name === 'claude'), 'Claude not started');
  assert.deepStrictEqual(r.wt.args.slice(r.wt.args.indexOf('--title'), r.wt.args.indexOf('--title') + 2), ['--title', 'proj']);
  assert.match(r.phase2.command[1], /^--run-codex$/);
  assert.match(r.phase2.command[2], /^[0-9a-f]{32}$/);
});

test('UT_Launch_ReadfileIsClaude: a Claude picker launch starts Claude even when AGENT=codex', () => {
  const r = ch.runCodexCase({ id: 'L02-readfile', setup: d => { cfg(d, 'AGENT=codex\r\n'); fs.writeFileSync(path.join(d.kivun, 'kivun-workdir.txt'), folder(d, 'proj')); }, args: () => ['READFILE'] });
  assert.ok(r.standIns.some(s => s.name === 'claude'), 'Claude started');
  assert.strictEqual(r.codexRuns.length, 0, 'Codex not started');
});

test('UT_Launch_Switch: right-click with AGENT=claude or no AGENT starts Claude', () => {
  for (const extra of ['AGENT=claude\r\n', '', 'AGENT=\r\n', 'AGENT=other\r\n']) {
    const r = ch.runCodexCase({ id: 'L03-claude', setup: d => cfg(d, extra), args: d => [folder(d, 'proj')] });
    assert.ok(r.standIns.some(s => s.name === 'claude'), JSON.stringify(extra));
    assert.strictEqual(r.codexRuns.length, 0, JSON.stringify(extra));
  }
});

test('UT_Launch_PickerLaunch: LAUNCH <id> starts Codex with the picker\'s choices and the exact startup text', () => {
  let id, p;
  const text = 'He said "go" & 50% done! ^ (now)';
  const r = ch.runCodexCase({ id: 'L04-picker', setup: d => { cfg(d); p = folder(d, 'proj'); id = pickerLaunch(d, { workdir: p, conv: 'last', model: 'gpt-a', startup: [text], env: { MY_PROFILE_VAR: 'v' } }); }, args: () => ['LAUNCH', id] });
  assert.strictEqual(r.codexRuns.length, 1);
  assert.deepStrictEqual(r.codexRuns[0].args, ch.withDaemonFlag(r.d, ['resume', '--last', '-m', 'gpt-a', text]));
  assert.strictEqual(r.codexRuns[0].cwd, p);
  assert.strictEqual(r.codexRuns[0].env.MY_PROFILE_VAR, 'v');
});

test('UT_Launch_RightClickArgvExact: folders with ! % ^ & ( ) and Hebrew reach Codex exactly', () => {
  for (const name of ['a!b', '50% off', 'x & y', 'c^d', '(paren)', 'פרויקט']) {
    let p;
    const r = ch.runCodexCase({ id: 'L05-chars', setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [p = folder(d, name)] });
    assert.strictEqual(r.codexRuns.length, 1, name);
    assert.strictEqual(r.codexRuns[0].cwd, p, name);
  }
});

test('UT_Launch_ClaudeEnvUnchanged and D19: a Codex launch never touches Claude\'s hand-off files', () => {
  let id;
  const r = ch.runCodexCase({ id: 'L06-isolation', setup: d => {
    cfg(d);
    for (const n of LEGACY) fs.writeFileSync(path.join(d.kivun, n), 'claude data ' + n);
    id = pickerLaunch(d, { workdir: folder(d, 'proj') });
  }, args: () => ['LAUNCH', id] });
  assert.strictEqual(r.codexRuns.length, 1);
  for (const [n, v] of legacyState(r.d)) assert.strictEqual(v, 'claude data ' + n, n);
  assert.strictEqual(r.before['config.txt'], r.after['config.txt'], 'config.txt unchanged');
  assert.ok(!('MY_VAR' in r.codexRuns[0].env));
});

test('UT_Launch_CodexSessionEnd: the launch folder is removed when the session ends; exit 43 relaunches without the message', () => {
  let id;
  const r = ch.runCodexCase({ id: 'L07-end', input: 'exit 43\r\nexit\r\n',
    setup: d => { cfg(d); id = pickerLaunch(d, { workdir: folder(d, 'proj'), startup: ['hello'] }); }, args: () => ['LAUNCH', id] });
  assert.strictEqual(r.codexRuns.length, 2, 'first start and one relaunch');
  assert.deepStrictEqual(r.codexRuns[0].args, ch.withDaemonFlag(r.d, ['hello']));
  assert.deepStrictEqual(r.codexRuns[1].args, ch.withDaemonFlag(r.d, []), 'relaunch has no startup text');
  assert.deepStrictEqual(r.launches, [], 'launch folder removed');
});

test('UT_Launch_MissingFolder: an unreachable folder opens a plain message tab, Codex is not started', () => {
  let id;
  const r = ch.runCodexCase({ id: 'L08-missing', skipPhase2: true, setup: d => { cfg(d); id = pickerLaunch(d, { workdir: path.join(d.work, 'gone') }); }, args: () => ['LAUNCH', id] });
  assert.strictEqual(r.codexRuns.length, 0);
  assert.ok(r.wt.args.includes('Folder not found'));
  assert.deepStrictEqual(r.wt.args.slice(r.wt.args.indexOf('--') + 1, r.wt.args.indexOf('--') + 2), ['node']);
});

test('UT_Launch_BadId: anything but a 32-character lowercase hex id stops before Codex', () => {
  for (const bad of ['ABC', '..\\x', 'g'.repeat(32), 'a'.repeat(31)]) {
    const r = ch.runCodexCase({ id: 'L09-badid', input: '\r\n', setup: d => cfg(d), args: () => ['LAUNCH', bad] });
    assert.strictEqual(r.codexRuns.length, 0, bad);
    assert.ok(!r.wt, bad + ': no tab opened');
  }
});

test('UT_Launch_CodexMissing: Codex not installed gives a message in the tab, nothing else starts', () => {
  const r = ch.runCodexCase({ id: 'L10-nocodex', codex: false, setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [folder(d, 'proj')] });
  assert.strictEqual(r.codexRuns.length, 0);
  assert.ok(!r.standIns.some(s => s.name === 'claude'), 'never a silent switch to Claude');
  assert.strictEqual(r.p2.status, 0, 'the tab ends normally at the prompt');
});

test('UT_Launch_CmdFallback: without Windows Terminal, Codex runs in the same console', () => {
  let p;
  const r = ch.runCodexCase({ id: 'L11-fallback', mode: 'fallback', setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.strictEqual(r.codexRuns.length, 1);
  assert.strictEqual(r.codexRuns[0].cwd, p);
});

test('UT_Launch_ClaudeCodexConcurrent: Claude runs completely while a Codex launch is held mid-start', async () => {
  const cp = require('child_process');
  let id, pFolder;
  // Set up one sandbox with both a Codex picker launch and Claude's picker files.
  const r0 = ch.runCodexCase({ id: 'L12-concurrent', skipPhase2: true, setup: d => {
    cfg(d); pFolder = folder(d, 'proj'); id = pickerLaunch(d, { workdir: pFolder, startup: ['from codex'] });
    fs.writeFileSync(path.join(d.kivun, 'kivun-workdir.txt'), pFolder);
    fs.writeFileSync(path.join(d.kivun, 'kivun-claude-flags.txt'), '--verbose');
  }, args: () => ['LAUNCH', id] });
  const d = r0.d;
  const bat = path.join(d.kivun, 'claudecode-launchpad.bat');
  // Codex phase 2, held inside the runner just before Codex starts.
  const env = Object.assign({}, d.env, { KIVUN_TEST_PAUSE: 'run-before-start' });
  const codex = cp.spawn(env.ComSpec, ['/d /s /c ""' + bat + '" "--run-codex" "' + id + '""'], { env, cwd: pFolder, windowsVerbatimArguments: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
  codex.stdin.end('exit\r\n');
  const reached = path.join(d.pause, 'run-before-start.reached');
  const until = Date.now() + 30000;
  while (!fs.existsSync(reached) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  assert.ok(fs.existsSync(reached), 'Codex is held mid-start');
  // While Codex is held: a complete Claude picker launch (phase 1 and phase 2).
  const h = require('./launcher/harness');
  const p1 = h.runBat(bat, ['READFILE'], { cwd: d.user, env: d.env });
  const wt = h.readStandIns(d.log).filter(x => x.name === 'wt').pop();
  const a = wt.args;
  h.runBat(a[a.indexOf('--') + 1], a.slice(a.indexOf('--') + 2), { cwd: a[a.indexOf('-d') + 1], env: d.env });
  fs.writeFileSync(path.join(d.pause, 'run-before-start.release'), '');
  await new Promise(res => codex.on('exit', res));
  const claude = h.readStandIns(d.log).filter(x => x.name === 'claude');
  assert.strictEqual(p1.status, 0);
  assert.strictEqual(claude.length, 1);
  assert.deepStrictEqual(claude[0].args, ['--verbose'], "Claude got its own one-time flags");
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-claude-flags.txt')), 'and consumed them, as in v3.2.2');
  const runs = require('./codex-fixture').records({ log: d.codexLog }).filter(x => x.args && x.args.includes('from codex'));
  assert.strictEqual(runs.length, 1, 'Codex got its own startup text');
});
