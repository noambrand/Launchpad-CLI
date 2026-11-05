// Calibration for the golden comparison (handout 9.2): run every case twice on the v3.2.2
// launcher. Environment variables whose values differ between those two runs vary by nature
// (time, process), so they are written to golden-normalize.json; everything else must match exactly.
// Run: node calibrate.js   (rewrites golden-normalize.json; commit it with a reason)
'use strict';
const fs = require('fs'), path = require('path');
const h = require('./harness');
const cases = require('./cases');
const baseline = fs.readFileSync(path.join(__dirname, 'baseline-v3.2.2', 'claudecode-launchpad.bat'), 'utf8');

const listFile = path.join(__dirname, 'golden-normalize.json');
const saved = fs.existsSync(listFile) ? fs.readFileSync(listFile) : null;
if (saved) fs.unlinkSync(listFile); // calibrate on raw values

// Derived from the clock like CC_T0/CC_T1, but two quick runs can land on the same second and hide it.
const ALWAYS = ['CC_ELAPSED'];
const varies = new Set(ALWAYS);
const other = [];
try {
  for (const c of cases) {
    const a = h.runCase(c, baseline), b = h.runCase(c, baseline);
    if (a.standIns.length !== b.standIns.length) other.push(c.id + ': different number of stand-in calls');
    a.standIns.forEach((ra, i) => {
      const rb = b.standIns[i] || { env: {} };
      for (const k of new Set([...Object.keys(ra.env), ...Object.keys(rb.env)])) if (ra.env[k] !== rb.env[k]) varies.add(k);
      if (JSON.stringify(ra.args) !== JSON.stringify(rb.args)) other.push(c.id + ': arguments differ between two identical runs');
    });
    if (JSON.stringify(a.stubs) !== JSON.stringify(b.stubs)) other.push(c.id + ': stub calls differ between two identical runs');
    if (JSON.stringify(a.kivunFiles) !== JSON.stringify(b.kivunFiles)) other.push(c.id + ': files differ between two identical runs');
    process.stdout.write('.');
  }
} catch (e) {
  if (saved) fs.writeFileSync(listFile, saved);
  throw e;
}
const out = { note: 'Variables whose values differ between two runs of the same v3.2.2 launcher. Written by calibrate.js; change only with a reason in the commit.', variables: [...varies].sort() };
fs.writeFileSync(listFile, JSON.stringify(out, null, 2) + '\n');
console.log('\nvarying variables:', out.variables.join(', ') || '(none)');
if (other.length) { console.log('NOT DETERMINISTIC:\n' + other.join('\n')); process.exit(1); }
