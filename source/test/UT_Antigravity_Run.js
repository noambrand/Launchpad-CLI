// configure-antigravity.js: starting agy (REQUIREMENTS-antigravity-option D2, D5, D6, D13, D15;
// STEP0-results-antigravity A4, A5, A8, A9, A10). A stand-in agy.exe records what it was started with.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./antigravity-fixture');
const AH = require('../agent-helpers');

const SL = AH.ANTIGRAVITY_STATUSLINE;
const launch = (m, d, data) => m.createLaunch(Object.assign({ agent: 'antigravity', workdir: d.work }, data), d.env);
const lastRun = d => fx.launches(d).pop();
const withConfig = (d, text) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), text);
const run = (d, id, extra, more) => fx.cli(d, ['run', id].concat(more || []), extra);
const envOf = (rec, name) => { const k = Object.keys(rec.env).find(x => x.toUpperCase() === name.toUpperCase()); return k === undefined ? undefined : rec.env[k]; };

test('UT_Antigravity_RunFromLaunchRecord: continue-last, model, flags and message compose in agy\'s order, in the work folder', () => {
  const d = fx.makeAgyEnv('run-record'), m = fx.load();
  const id = launch(m, d, { conv: 'last', model: 'gemini-x', customFlags: '--verbose', startup: ['hello there'] });
  const r = run(d, id);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const rec = lastRun(d);
  assert.deepStrictEqual(rec.args, ['-c', '--model', 'gemini-x', '--settings', SL, '--verbose', '-i', 'hello there']);
  assert.strictEqual(rec.cwd, fs.realpathSync.native(d.work));
  assert.strictEqual(fx.launches(d).length, 1);
});

test('UT_Antigravity_RunFromConfig: a right-click launch takes ANTIGRAVITY_FLAGS, ANTIGRAVITY_STARTUP_CMD and the language from config.txt', () => {
  const d = fx.makeAgyEnv('run-config'), m = fx.load();
  withConfig(d, 'RESPONSE_LANGUAGE=hebrew\r\nANTIGRAVITY_FLAGS=--verbose\r\nANTIGRAVITY_STARTUP_CMD=hello\r\n');
  const id = fx.cli(d, ['prepare'], { KV_FOLDER: d.work + '\\' }).stdout.trim();
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.strictEqual(m.readLaunch(id, d.env).workdir, d.work);
  assert.deepStrictEqual(JSON.parse(fx.cli(d, ['compose', id]).stdout).args, ['--settings', SL, '--verbose', '-i', 'hello']);
  run(d, id);
  const rec = lastRun(d);
  assert.deepStrictEqual(rec.args, ['--settings', SL, '--verbose', '-i', 'hello']);
  assert.strictEqual(envOf(rec, 'KIVUN_ANTIGRAVITY_LANGUAGE_LINE'), AH.antigravityLanguageLine('hebrew'));
  assert.strictEqual(fx.cli(d, ['info', id, 'workdir']).stdout.trim(), d.work);
  assert.strictEqual(fx.cli(d, ['check', id]).status, 0);
});

test('UT_Antigravity_RunPick: the hint is printed and no message is sent (D5)', () => {
  const d = fx.makeAgyEnv('run-pick'), m = fx.load();
  const r = run(d, launch(m, d, { conv: 'pick', startup: ['hello'] }));
  assert.match(r.stdout, /Type \/resume to choose a conversation\./);
  assert.deepStrictEqual(lastRun(d).args, ['--settings', SL]);
});

test('UT_Antigravity_RunRelaunch: --relaunch leaves the first message out', () => {
  const d = fx.makeAgyEnv('run-relaunch'), m = fx.load();
  run(d, launch(m, d, { startup: ['hello'] }), {}, ['--relaunch']);
  assert.deepStrictEqual(lastRun(d).args, ['--settings', SL]);
});

test('UT_Antigravity_RunTextExact: Hebrew and every shell-special character reach agy unchanged (A5, A8)', () => {
  const d = fx.makeAgyEnv('run-text'), m = fx.load();
  const texts = ['\u05E9\u05DC\u05D5\u05DD \u05E2\u05D5\u05DC\u05DD', '%PATH% ^ & | < > ! "q"', '-dash first', '/resume', 'two  spaces', 'ends with \\'];
  for (const text of texts) {
    const r = run(d, launch(m, d, { startup: [text] }));
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.deepStrictEqual(lastRun(d).args, ['--settings', SL, '-i', text], JSON.stringify(text));
  }
});

test('UT_Antigravity_RunStatusLine: --settings by default; absent when the user\'s own settings.json has a statusLine (D13)', () => {
  const d = fx.makeAgyEnv('run-statusline'), m = fx.load();
  const id = launch(m, d);
  run(d, id);
  assert.deepStrictEqual(lastRun(d).args, ['--settings', SL]);
  const file = path.join(d.home, '.gemini', 'antigravity-cli', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"statusLine":{"type":"command","command":"mine.cmd"}}');
  run(d, id);
  assert.deepStrictEqual(lastRun(d).args, []);
  fs.writeFileSync(file, '{"theme":"dark"}');
  run(d, id);
  assert.deepStrictEqual(lastRun(d).args, ['--settings', SL], 'a settings file without statusLine');
  fs.writeFileSync(file, 'not json at all');
  run(d, id);
  assert.deepStrictEqual(lastRun(d).args, ['--settings', SL], 'an unparsable file');
});

test('UT_Antigravity_RunRealFolderSpelling: a launch record spelled in another letter case starts agy in the real spelling (A4, D6)', () => {
  const d = fx.makeAgyEnv('run-case'), m = fx.load();
  const real = path.join(d.root, 'MixedCase Dir');
  fs.mkdirSync(real);
  const id = m.createLaunch({ agent: 'antigravity', workdir: real.toLowerCase() }, d.env);
  const r = run(d, id);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(lastRun(d).cwd, fs.realpathSync.native(real));
  assert.ok(lastRun(d).cwd.endsWith('MixedCase Dir'), lastRun(d).cwd);
});

test('UT_Antigravity_RunEnvironment: marker, language line, Kivun first on PATH (D15)', () => {
  const d = fx.makeAgyEnv('run-env'), m = fx.load();
  withConfig(d, 'RESPONSE_LANGUAGE=hebrew\r\n');
  run(d, launch(m, d));
  const rec = lastRun(d);
  assert.strictEqual(envOf(rec, 'KIVUN_ANTIGRAVITY'), '1');
  assert.strictEqual(envOf(rec, 'KIVUN_ANTIGRAVITY_LANGUAGE_LINE'), AH.antigravityLanguageLine('hebrew'));
  assert.match(envOf(rec, 'KIVUN_ANTIGRAVITY_LANGUAGE_LINE'), /Hebrew/);
  assert.strictEqual(envOf(rec, 'PATH').split(';')[0], d.kivun);
  assert.ok(envOf(rec, 'PATH').split(';').includes(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')), 'the old PATH follows');
});

test('UT_Antigravity_RunEnvironmentNoLanguage: an unknown language gives no line, even if the parent had one', () => {
  const d = fx.makeAgyEnv('run-env-nolang'), m = fx.load();
  withConfig(d, 'RESPONSE_LANGUAGE=klingon\r\n');
  run(d, launch(m, d), { KIVUN_ANTIGRAVITY_LANGUAGE_LINE: 'left over' });
  assert.strictEqual(envOf(lastRun(d), 'KIVUN_ANTIGRAVITY_LANGUAGE_LINE'), undefined);
  assert.strictEqual(envOf(lastRun(d), 'KIVUN_ANTIGRAVITY'), '1');
});

test('UT_Antigravity_RunPathKeyCase: a PATH spelled "Path" keeps one key, with Kivun first', () => {
  const d = fx.makeAgyEnv('run-pathcase'), m = fx.load();
  const id = launch(m, d);
  const env = Object.assign({}, d.env);
  env.Path = env.PATH; delete env.PATH;
  const r = require('child_process').spawnSync(process.execPath, [fx.MODULE, 'run', id], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const keys = Object.keys(lastRun(d).env).filter(k => k.toUpperCase() === 'PATH');
  assert.strictEqual(keys.length, 1, keys.join(','));
  assert.strictEqual(lastRun(d).env[keys[0]].split(';')[0], d.kivun);
});

test('UT_Antigravity_RunScriptPolicy: set only when no policy was chosen, never over a variable already set (A9)', () => {
  let d = fx.makeAgyEnv('run-policy-none'), m = fx.load();
  run(d, launch(m, d));
  assert.strictEqual(envOf(lastRun(d), 'PSExecutionPolicyPreference'), 'RemoteSigned');
  d = fx.makeAgyEnv('run-policy-chosen', { scriptPolicy: 'chosen' });
  run(d, launch(m, d));
  assert.strictEqual(envOf(lastRun(d), 'PSExecutionPolicyPreference'), undefined);
  d = fx.makeAgyEnv('run-policy-set');
  run(d, launch(m, d), { PSExecutionPolicyPreference: 'Bypass' });
  assert.strictEqual(envOf(lastRun(d), 'PSExecutionPolicyPreference'), 'Bypass');
  d = fx.makeAgyEnv('run-policy-set-lower');
  run(d, launch(m, d), { psexecutionpolicypreference: 'Restricted' });
  const rec = lastRun(d);
  assert.strictEqual(envOf(rec, 'PSExecutionPolicyPreference'), 'Restricted');
  assert.strictEqual(Object.keys(rec.env).filter(k => k.toUpperCase() === 'PSEXECUTIONPOLICYPREFERENCE').length, 1);
});

test('UT_Antigravity_RunRefused: a refused flag stops the start, with the reason', () => {
  const d = fx.makeAgyEnv('run-refused'), m = fx.load();
  const r = run(d, launch(m, d, { customFlags: '--dangerously-skip-permissions' }));
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout, /does not start Antigravity with --dangerously-skip-permissions/);
  assert.match(r.stdout, /was not started/);
  assert.deepStrictEqual(fx.launches(d), []);
});

test('UT_Antigravity_RunExitCode: agy\'s own exit code is returned', () => {
  const d = fx.makeAgyEnv('run-exit'), m = fx.load();
  assert.strictEqual(run(d, launch(m, d), { FAKE_AGY_EXIT: '3' }).status, 3);
});

test('UT_Antigravity_RunMissing: no agy gives a plain repair message and exit 7', () => {
  const d = fx.makeAgyEnv('run-missing', { stub: false }), m = fx.load();
  const r = run(d, launch(m, d));
  assert.strictEqual(r.status, 7);
  assert.match(r.stdout, /Antigravity was not found/);
  assert.match(r.stdout, /installer again and choose Antigravity/);
});

test('UT_Antigravity_RunTooOld: a version below the minimum is not started', () => {
  const d = fx.makeAgyEnv('run-old', { version: '1.5.2' }), m = fx.load();
  const r = run(d, launch(m, d));
  assert.strictEqual(r.status, 7);
  assert.match(r.stdout, /older than 1\.5\.3/);
  assert.deepStrictEqual(fx.launches(d), []);
});

test('UT_Antigravity_NotForOthers: Copilot and Codex runs never get KIVUN_ANTIGRAVITY variables', () => {
  const cpFx = require('./copilot-fixture'), cxFx = require('./codex-fixture');
  const cpD = cpFx.makeEnv('agy-not-copilot'), cpM = cpFx.load();
  fs.writeFileSync(path.join(cpD.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  const cpPlan = cpM.plan(cpM.createLaunch({ agent: 'copilot', workdir: cpD.work }, cpD.env), cpD.env);
  assert.deepStrictEqual(Object.keys(cpPlan.runEnv).filter(k => /^KIVUN_ANTIGRAVITY/i.test(k)), []);
  const cxD = cxFx.makeEnv('agy-not-codex'), cxM = cxFx.load();
  const cxId = cxM.createLaunch({ agent: 'codex', workdir: cxD.work }, cxD.env);
  const r = cxFx.cli(cxD, ['run', cxId]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const rec = cxFx.records(cxD).filter(x => !x.args.includes('--version')).pop();
  assert.ok(rec, 'the fake Codex was started');
  assert.deepStrictEqual(Object.keys(rec.env || {}).filter(k => /^KIVUN_ANTIGRAVITY/i.test(k)), []);
});
