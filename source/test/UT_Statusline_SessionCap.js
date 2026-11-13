// The Session bar's reset never shows later than the Weekly bar's reset.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-fixture');

const SOON = Date.UTC(2099, 0, 6, 20, 0) / 1000;     // far ahead, so the dates never pass
const LATER = Date.UTC(2099, 0, 6, 23, 5) / 1000;

// Runs the bar in a sealed folder. Returns line 2 (colors removed) and the rate-limit state file.
function render(limits) {
  const d = fx.makeEnv('slcap');
  const r = cp.spawnSync(process.execPath, [path.join(fx.SOURCE, 'statusline.mjs')], {
    input: JSON.stringify({ rate_limits: limits, workspace: { current_dir: d.work } }),
    env: Object.assign({}, d.env, { TZ: 'UTC' }), encoding: 'utf8', windowsHide: true,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const dir = path.join(d.env.LOCALAPPDATA, 'Kivun');
  const files = fs.readdirSync(dir).filter(f => /^ratelimit-[0-9a-f]{8}\.json$/.test(f));
  assert.strictEqual(files.length, 1, files.join(','));
  return {
    line: r.stdout.replace(/\x1b\[\d+m/g, '').split('\n')[1],
    state: JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8')),
  };
}
const sessionText = line => line.split('|')[0];
const weeklyText = line => line.split('|')[1];

test('UT_Statusline_SessionCap_WeeklyFirst: the session shows the weekly reset when that comes first', () => {
  const { line } = render({ five_hour: { used_percentage: 40, resets_at: LATER }, seven_day: { used_percentage: 90, resets_at: SOON } });
  assert.match(sessionText(line), /Session .* 40% resets in \d+d\d+h \(Tue Jan 6 20:00\)/);
  assert.match(weeklyText(line), /Weekly .* 90% resets in \d+d\d+h \(Tue Jan 6 20:00\)/);
});

test('UT_Statusline_SessionCap_SessionFirst: the session keeps its own reset when that comes first', () => {
  const { line } = render({ five_hour: { used_percentage: 40, resets_at: SOON }, seven_day: { used_percentage: 90, resets_at: LATER } });
  assert.match(sessionText(line), /\(Tue Jan 6 20:00\)/);
  assert.match(weeklyText(line), /\(Tue Jan 6 23:05\)/);
});

test('UT_Statusline_SessionCap_NoWeekly: without a weekly reset time the session keeps its own', () => {
  assert.match(sessionText(render({ five_hour: { used_percentage: 40, resets_at: LATER } }).line), /\(Tue Jan 6 23:05\)/);
  assert.match(sessionText(render({ five_hour: { used_percentage: 40, resets_at: LATER }, seven_day: { used_percentage: 90 } }).line), /\(Tue Jan 6 23:05\)/);
  assert.match(sessionText(render({ five_hour: { used_percentage: 40, resets_at: LATER }, seven_day: { used_percentage: 90, resets_at: 0 } }).line), /\(Tue Jan 6 23:05\)/);
});

test('UT_Statusline_SessionCap_WatcherUnchanged: auto-continue still gets the session\'s own reset time', () => {
  const { state } = render({ five_hour: { used_percentage: 100, resets_at: LATER }, seven_day: { used_percentage: 90, resets_at: SOON } });
  assert.strictEqual(state.five_hour.resets_at, LATER);
  assert.strictEqual(state.five_hour.pct, 100);
});
