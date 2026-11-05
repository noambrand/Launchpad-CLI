// The status bar's reset text: the countdown plus the exact day and hour, in the PC's local time.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path'), cp = require('child_process');
const fx = require('./codex-fixture');

const FUTURE = Date.UTC(2099, 0, 6, 23, 5) / 1000;   // far ahead, so the date never passes

// Line 2 of the bar, colors removed. The sealed LOCALAPPDATA catches the rate-limit state file.
function usageLine(limits, tz) {
  const d = fx.makeEnv('statusline');
  const r = cp.spawnSync(process.execPath, [path.join(fx.SOURCE, 'statusline.mjs')], {
    input: JSON.stringify({ rate_limits: limits }), env: Object.assign({}, d.env, { TZ: tz || 'UTC' }), encoding: 'utf8', windowsHide: true,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.replace(/\x1b\[\d+m/g, '').split('\n')[1];
}

test('UT_Statusline_ResetDate: both bars show the countdown and the exact day and hour', () => {
  const line = usageLine({ five_hour: { used_percentage: 77, resets_at: FUTURE }, seven_day: { used_percentage: 16, resets_at: FUTURE + 86400 } });
  assert.match(line, /Session .* 77% resets in \d+d\d+h \(Tue Jan 6 23:05\)/);
  assert.match(line, /Weekly .* 16% resets in \d+d\d+h \(Wed Jan 7 23:05\)/);
});

test('UT_Statusline_ResetDate_LocalTime: the day and hour follow the PC\'s time zone', () => {
  const at = tz => usageLine({ seven_day: { used_percentage: 1, resets_at: FUTURE } }, tz).match(/\(([^)]+)\)/)[1];
  assert.strictEqual(at('UTC'), 'Tue Jan 6 23:05');
  assert.strictEqual(at('Asia/Jerusalem'), 'Wed Jan 7 01:05', 'the next day, hour with a leading zero');
  assert.strictEqual(at('Asia/Tokyo'), 'Wed Jan 7 08:05');
});

test('UT_Statusline_ResetDate_NoDate: a reset already due or unknown shows no date', () => {
  const past = usageLine({ five_hour: { used_percentage: 100, resets_at: 1000 } });
  assert.match(past, /resets in now/);
  assert.ok(!past.includes('('), past);
  assert.ok(!usageLine({ five_hour: { used_percentage: 5 } }).includes('resets in'));
});
