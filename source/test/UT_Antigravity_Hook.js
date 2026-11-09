// antigravity-hook.js: the language line and the done sound (Antigravity Step 0, A6, A7), including the
// real path: cmd /c .\hook.cmd <event> in the installed plugin folder, as Antigravity runs it.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./antigravity-fixture');
const SCRIPT = path.join(fx.SOURCE, 'antigravity-hook.js');
const HEBREW_LINE = 'Always respond in Hebrew: שלום עולם';

function run(env, event, payload, raw) {
  return cp.spawnSync(process.execPath, [SCRIPT, event], { env, input: raw !== undefined ? raw : JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 20000 });
}
function setup(name, extra) {
  const d = fx.makeEnv(name);
  const pl = fx.fakePlayer(d);
  return { d, pl, env: Object.assign({}, d.env, { KIVUN_SOUND_PLAYER: pl.player, KIVUN_ANTIGRAVITY: '1' }, extra || {}) };
}

test('UT_AntigravityHook_SessionStart: the language line goes in as a system message, or {}', () => {
  const s = setup('hook-ss');
  let r = run(s.env, 'session-start', {});
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{}\n');
  r = run(Object.assign({}, s.env, { KIVUN_ANTIGRAVITY_LANGUAGE_LINE: '' }), 'session-start', {});
  assert.strictEqual(r.stdout, '{}\n');
  const line = 'Always respond in French.';
  r = run(Object.assign({}, s.env, { KIVUN_ANTIGRAVITY_LANGUAGE_LINE: line }), 'session-start', {});
  assert.strictEqual(r.stdout, JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: line } }] }) + '\n');
  r = run(Object.assign({}, s.env, { KIVUN_ANTIGRAVITY_LANGUAGE_LINE: HEBREW_LINE }), 'session-start', {});
  assert.strictEqual(JSON.parse(r.stdout).injectSteps[0].systemMessage.systemMessage, HEBREW_LINE);
  assert.deepStrictEqual(fx.played(s.pl.out, 300), [], 'session-start never plays a sound');
});

test('UT_AntigravityHook_Stop: the done sound only for a turn that ended by itself, in a Launchpad launch', () => {
  const s = setup('hook-stop');
  for (const payload of [{ terminationReason: 'USER_CANCELED' }, { terminationReason: 'ERROR' }, { terminationReason: 'MAX_INVOCATIONS' }, {}, { terminationReason: 'no_tool_call' }]) {
    const r = run(s.env, 'stop', payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '{}\n');
  }
  const env2 = Object.assign({}, s.env); delete env2.KIVUN_ANTIGRAVITY;
  assert.strictEqual(run(env2, 'stop', { terminationReason: 'NO_TOOL_CALL' }).stdout, '{}\n');
  assert.deepStrictEqual(fx.played(s.pl.out, 500), [], 'none of those play');
  const r = run(s.env, 'stop', { terminationReason: 'NO_TOOL_CALL', workspacePaths: [s.d.work] });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{}\n');
  const p = fx.played(s.pl.out);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].sound, 'done');
  assert.strictEqual(fs.realpathSync(p[0].cwd), fs.realpathSync(s.d.work), 'the player runs in the workspace');
});

test('UT_AntigravityHook_Stop_Workspace: a missing workspace folder still gets its sound', () => {
  const s = setup('hook-stop-ws');
  run(s.env, 'stop', { terminationReason: 'NO_TOOL_CALL', workspacePaths: [path.join(s.d.root, 'gone')] });
  assert.strictEqual(fx.played(s.pl.out).length, 1);
});

test('UT_AntigravityHook_Other: unknown events, bad JSON and empty input print {} and exit 0', () => {
  const s = setup('hook-bad');
  for (const [ev, raw] of [['stop', ''], ['stop', 'not json'], ['stop', 'null'], ['stop', '[]'], ['session-start', 'not json'], ['bogus', '{}'], [undefined, '{}']]) {
    const r = cp.spawnSync(process.execPath, ev === undefined ? [SCRIPT] : [SCRIPT, ev], { env: s.env, input: raw, encoding: 'utf8', windowsHide: true });
    assert.strictEqual(r.status, 0, ev + ' ' + raw);
    assert.strictEqual(r.stdout, '{}\n');
  }
  const r = run(Object.assign({}, s.env, { KIVUN_SOUND_PLAYER: path.join(s.d.root, 'no-such-player.js') }), 'stop', { terminationReason: 'NO_TOOL_CALL' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{}\n');
  assert.deepStrictEqual(fx.played(s.pl.out, 300), []);
});

test('UT_AntigravityHook_Decisions: the exported decisions', () => {
  const H = require(SCRIPT);
  assert.strictEqual(H.wantsDone({ KIVUN_ANTIGRAVITY: '1' }, { terminationReason: 'NO_TOOL_CALL' }), true);
  assert.strictEqual(H.wantsDone({ KIVUN_ANTIGRAVITY: '0' }, { terminationReason: 'NO_TOOL_CALL' }), false);
  assert.strictEqual(H.wantsDone({ KIVUN_ANTIGRAVITY: '1' }, null), false);
  assert.deepStrictEqual(H.answer('stop', { KIVUN_ANTIGRAVITY_LANGUAGE_LINE: 'x' }), {});
});

test('UT_AntigravityHook_RealPath: cmd /c .\\hook.cmd in the installed plugin folder, under a Hebrew path with a space', () => {
  const d = fx.makeEnv('hook-real', { hebrew: true });
  fx.seedHook(d);
  const AG = require(path.join(fx.SOURCE, 'configure-antigravity.js'));
  AG.install(d.env);
  const pl = fx.fakePlayer(d);
  const env = Object.assign({}, d.env, { NoDefaultCurrentDirectoryInExePath: '1', KIVUN_SOUND_PLAYER: pl.player, KIVUN_ANTIGRAVITY: '1', KIVUN_ANTIGRAVITY_LANGUAGE_LINE: HEBREW_LINE });
  const hookCmd = '.' + String.fromCharCode(92) + 'hook.cmd';
  const go = (ev, payload) => cp.spawnSync(path.join(env.SystemRoot, 'System32', 'cmd.exe'), ['/c', hookCmd, ev], { cwd: d.pluginDir, env, input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  let r = go('stop', { terminationReason: 'NO_TOOL_CALL', workspacePaths: [d.work] });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), '{}');
  const p = fx.played(pl.out);
  assert.strictEqual(p.length, 1, 'the player ran: ' + r.stderr);
  assert.strictEqual(p[0].sound, 'done');
  r = go('session-start', {});
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).injectSteps[0].systemMessage.systemMessage, HEBREW_LINE);
  r = go('stop', { terminationReason: 'USER_CANCELED' });
  assert.strictEqual(r.stdout.trim(), '{}');
  assert.strictEqual(fx.played(pl.out, 300).length, 1, 'a cancel adds no sound');
});

test('UT_AntigravityHook_ReturnsAtOnce: the hook exits long before a slow player finishes', () => {
  const d = fx.makeEnv('hook-slow');
  const pl = fx.fakePlayer(d, 3000);
  const env = Object.assign({}, d.env, { KIVUN_SOUND_PLAYER: pl.player, KIVUN_ANTIGRAVITY: '1' });
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [SCRIPT, 'stop'], { env, input: JSON.stringify({ terminationReason: 'NO_TOOL_CALL' }), encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const took = Date.now() - t0;
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '{}\n');
  assert.ok(took < 2500, 'took ' + took + ' ms');
  assert.ok(!fs.existsSync(pl.out), 'the player is still sleeping');
  assert.strictEqual(fx.played(pl.out, 6000).length, 1, 'and it was started');
});
