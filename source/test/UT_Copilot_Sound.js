// copilot-sound.js: which Copilot events make a sound (Copilot Step 0, S7). A stand-in player records
// each call, so these tests never play anything.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./copilot-fixture');
const SCRIPT = path.join(fx.SOURCE, 'copilot-sound.js');

function setup(name) {
  const d = fx.makeEnv(name, { fakeCopilot: false });
  const out = path.join(d.root, 'played.jsonl');
  const player = path.join(d.root, 'player.js');
  fs.writeFileSync(player, `require('fs').appendFileSync(${JSON.stringify(out)}, JSON.stringify({ sound: process.argv[2], cwd: process.cwd() }) + '\\n');\n`);
  return { d, out, env: Object.assign({}, d.env, { KIVUN_SOUND_PLAYER: player }) };
}
function fire(s, sound, payload, raw) {
  return cp.spawnSync(process.execPath, [SCRIPT, sound], { env: s.env, input: raw !== undefined ? raw : JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 20000 });
}
// The player is started and left running, so give it a moment to finish.
function played(s) {
  const until = Date.now() + 3000;
  while (!fs.existsSync(s.out) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  return fs.existsSync(s.out) ? fs.readFileSync(s.out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

test('UT_CopilotSound_Permission: only a real prompt sounds, because this event also covers other messages', () => {
  const s = setup('snd-permission');
  fire(s, 'permission', { notification_type: 'shell_completed', message: 'done' });
  fire(s, 'permission', { notification_type: 'agent_completed' });
  fire(s, 'permission', {});
  assert.deepStrictEqual(played(s), []);
  fire(s, 'permission', { notification_type: 'permission_prompt', message: 'Run command: x', cwd: s.d.work });
  const p = played(s);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].sound, 'permission');
  assert.strictEqual(fs.realpathSync(p[0].cwd), fs.realpathSync(s.d.work), 'the player\'s log names the project from its folder');
  fs.rmSync(s.out);
  fire(s, 'permission', { notification_type: 'permission_prompt', cwd: path.join(s.d.root, 'gone') });
  assert.strictEqual(played(s).length, 1, 'a folder that has gone still gets its sound');
});

test('UT_CopilotSound_Done: a finished turn sounds; any other reason does not', () => {
  const s = setup('snd-done');
  fire(s, 'done', { stopReason: 'error' });
  assert.deepStrictEqual(played(s), []);
  fire(s, 'done', { stopReason: 'end_turn' });
  assert.strictEqual(played(s).length, 1);
});

test('UT_CopilotSound_PrintsNothing: Copilot reads a hook\'s output as a decision', () => {
  const s = setup('snd-silent');
  for (const [sound, payload] of [['done', { stopReason: 'end_turn' }], ['permission', { notification_type: 'permission_prompt' }], ['done', { stopReason: 'x' }]]) {
    const r = fire(s, sound, payload);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
  }
});

test('UT_CopilotSound_NeverFails: bad input or a missing player can\'t disturb a session', () => {
  const s = setup('snd-bad');
  for (const raw of ['', 'not json', 'null', '[]', '42']) {
    const r = fire(s, 'done', null, raw);
    assert.strictEqual(r.status, 0, JSON.stringify(raw));
    assert.strictEqual(r.stdout, '');
  }
  const r = cp.spawnSync(process.execPath, [SCRIPT, 'done'], { env: Object.assign({}, s.env, { KIVUN_SOUND_PLAYER: path.join(s.d.root, 'no-such-player.js') }), input: JSON.stringify({ stopReason: 'end_turn' }), encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0);
  const u = cp.spawnSync(process.execPath, [SCRIPT, 'unknown-sound'], { env: s.env, input: '{}', encoding: 'utf8', windowsHide: true });
  assert.strictEqual(u.status, 0);
});

test('UT_CopilotSound_DoesNotWaitForTheClip: the hook returns while the player is still running', () => {
  const s = setup('snd-fast');
  const slow = path.join(s.d.root, 'slow.js');
  fs.writeFileSync(slow, `setTimeout(() => {}, 4000);\n`);
  const env = Object.assign({}, s.env, { KIVUN_SOUND_PLAYER: slow });
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [SCRIPT, 'done'], { env, input: JSON.stringify({ stopReason: 'end_turn' }), encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0);
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
});
