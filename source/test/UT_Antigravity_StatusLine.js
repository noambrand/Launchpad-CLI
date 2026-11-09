// antigravity-statusline.js and its .cmd (spec D13).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./antigravity-fixture');
const SCRIPT = path.join(fx.SOURCE, 'antigravity-statusline.js');
const CMD = path.join(fx.SOURCE, 'antigravity-statusline.cmd');

const SAMPLE = {
  cwd: 'C:\\kt\\agy\\w3',
  model: { id: 'Gemini 3.8 Flash (High)', display_name: 'Gemini 3.8 Flash (High)', effort: 'high' },
  version: '1.5.3',
  context_window: { total_input_tokens: 0, total_output_tokens: 0, context_window_size: 1048576, used_percentage: 0, remaining_percentage: 100, current_usage: null },
  quota: {
    '3p-weekly': { remaining_fraction: 1, reset_time: '2026-11-15T18:14:04Z', reset_in_seconds: 604801 },
    'gemini-weekly': { remaining_fraction: 0.9489384, reset_time: '2026-11-15T17:54:22Z', reset_in_seconds: 603619 },
  },
  agent_state: 'idle', plan_tier: 'Antigravity Starter Quota', terminal_width: 120,
};
const clone = () => JSON.parse(JSON.stringify(SAMPLE));
const ENV = Object.assign({}, process.env, { KIVUN_TEST_TZ_OFFSET_MINUTES: '120' });
function line(input, raw, env) {
  const r = cp.spawnSync(process.execPath, [SCRIPT], { env: env || ENV, input: raw !== undefined ? raw : JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stderr, '');
  return r.stdout;
}
const FULL = 'Gemini 3.8 Flash (High)  |  context 0% used  |  95% of weekly limit left  |  resets Sun 19:54';

test('UT_AntigravityStatusLine_Sample: the real input gives the exact line', () => {
  assert.strictEqual(line(SAMPLE), FULL);
});

test('UT_AntigravityStatusLine_TimeZone: the offset moves the day and the time', () => {
  const at = m => line(SAMPLE, undefined, Object.assign({}, ENV, { KIVUN_TEST_TZ_OFFSET_MINUTES: String(m) })).split('  |  ')[3];
  assert.strictEqual(at(0), 'resets Sun 17:54');
  assert.strictEqual(at(360), 'resets Sun 23:54');
  assert.strictEqual(at(366), 'resets Mon 00:00');
  assert.strictEqual(at(-1080), 'resets Sat 23:54');
});

test('UT_AntigravityStatusLine_Missing: a part with no data is left out', () => {
  let i = clone(); delete i.model;
  assert.strictEqual(line(i), 'context 0% used  |  95% of weekly limit left  |  resets Sun 19:54');
  i = clone(); delete i.context_window;
  assert.strictEqual(line(i), 'Gemini 3.8 Flash (High)  |  95% of weekly limit left  |  resets Sun 19:54');
  i = clone(); delete i.quota;
  assert.strictEqual(line(i), 'Gemini 3.8 Flash (High)  |  context 0% used');
  i = clone(); delete i.quota['gemini-weekly'].reset_time;
  assert.strictEqual(line(i), 'Gemini 3.8 Flash (High)  |  context 0% used  |  95% of weekly limit left');
  i = clone(); delete i.quota['gemini-weekly'].remaining_fraction;
  assert.strictEqual(line(i), 'Gemini 3.8 Flash (High)  |  context 0% used  |  resets Sun 19:54');
  i = clone(); i.quota['gemini-weekly'].reset_time = 'not a date';
  assert.strictEqual(line(i), 'Gemini 3.8 Flash (High)  |  context 0% used  |  95% of weekly limit left');
  assert.strictEqual(line({}), '');
});

test('UT_AntigravityStatusLine_ModelFallback: display_name missing uses id', () => {
  const i = clone(); delete i.model.display_name; i.model.id = 'some-id';
  assert.strictEqual(line(i).split('  |  ')[0], 'some-id');
});

test('UT_AntigravityStatusLine_Rounding', () => {
  const i = clone(); i.context_window.used_percentage = 12.5; i.quota['gemini-weekly'].remaining_fraction = 0.2549;
  const p = line(i).split('  |  ');
  assert.strictEqual(p[1], 'context 13% used');
  assert.strictEqual(p[2], '25% of weekly limit left');
});

test('UT_AntigravityStatusLine_BadInput: an empty line and exit 0', () => {
  for (const raw of ['', 'not json', 'null', '[]', '42', '"x"']) assert.strictEqual(line(null, raw), '', JSON.stringify(raw));
});

test('UT_AntigravityStatusLine_Cmd: exact bytes, and found by name on PATH from another folder', () => {
  const bytes = fs.readFileSync(CMD);
  assert.deepStrictEqual(bytes, Buffer.from('@node "%~dp0antigravity-statusline.js"\r\n', 'latin1'));
  assert.ok(bytes.every(b => b < 128));
  const d = fx.makeEnv('sl-cmd');
  const env = Object.assign({}, d.env, { KIVUN_TEST_TZ_OFFSET_MINUTES: '120', PATH: [fx.SOURCE, d.env.PATH].join(';'), NoDefaultCurrentDirectoryInExePath: '1' });
  const r = cp.spawnSync(path.join(env.SystemRoot, 'System32', 'cmd.exe'), ['/c', 'antigravity-statusline.cmd'], { cwd: d.work, env, input: JSON.stringify(SAMPLE), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, FULL);
});
