// antigravity-statusline.js
// Antigravity runs this for Launchpad's launches with a JSON object on stdin and shows the one line
// it prints: model, how full the context is, how much of the weekly limit is left, and when it
// resets. A part whose data is missing is left out. Bad input prints an empty line. Node built-ins only.
// KIVUN_TEST_TZ_OFFSET_MINUTES (minutes east of UTC) fixes the time zone for tests.
'use strict';
const fs = require('fs');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isNum = v => typeof v === 'number' && isFinite(v);
const pad = n => String(n).padStart(2, '0');

function resetText(iso, env) {
  if (typeof iso !== 'string') return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const set = env.KIVUN_TEST_TZ_OFFSET_MINUTES;
  const off = set !== undefined && set !== '' && isFinite(Number(set)) ? Number(set) : -t.getTimezoneOffset();
  const l = new Date(t.getTime() + off * 60000);
  return 'resets ' + DAYS[l.getUTCDay()] + ' ' + pad(l.getUTCHours()) + ':' + pad(l.getUTCMinutes());
}

function line(input, env) {
  if (!input || typeof input !== 'object') return '';
  const parts = [];
  const m = input.model;
  const name = m && (m.display_name || m.id);
  if (typeof name === 'string' && name) parts.push(name);
  const c = input.context_window;
  if (c && isNum(c.used_percentage)) parts.push('context ' + Math.round(c.used_percentage) + '% used');
  const q = input.quota && input.quota['gemini-weekly'];
  if (q && isNum(q.remaining_fraction)) parts.push(Math.round(q.remaining_fraction * 100) + '% of weekly limit left');
  const r = q && resetText(q.reset_time, env);
  if (r) parts.push(r);
  return parts.join('  |  ');
}

if (require.main === module) {
  let out = '';
  try { out = line(JSON.parse(fs.readFileSync(0, 'utf8')), process.env); } catch (e) { /* empty line */ }
  process.stdout.write(out);
  process.exitCode = 0;
}
module.exports = { line };
