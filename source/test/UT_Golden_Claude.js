// Golden comparison (handout 9.2, requirement A1): every Claude setup must behave byte-for-byte
// like v3.2.2. Each case runs the v3.2.2 launcher and the current one in the same sealed folder
// and compares the stand-ins' arguments, working folder and environment, the helper calls and
// the files created or deleted in the Kivun folder.
// KIVUN_LAUNCHER_UNDER_TEST overrides the launcher being checked (used to prove the test fails
// on a deliberately broken copy).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const h = require('./launcher/harness');
const cases = require('./launcher/cases');

const baseline = fs.readFileSync(path.join(__dirname, 'launcher', 'baseline-v3.2.2', 'claudecode-launchpad.bat'), 'utf8');
const current = fs.readFileSync(process.env.KIVUN_LAUNCHER_UNDER_TEST || path.join(h.SOURCE, 'claudecode-launchpad.bat'), 'utf8');

for (const c of cases) {
  test('UT_Golden_Claude ' + c.id, () => {
    const expected = h.runCase(c, baseline);
    const actual = h.runCase(c, current);
    assert.ok(expected.standIns.some(r => r.name === 'claude'), 'v3.2.2 did not start claude in ' + c.id);
    assert.deepStrictEqual(actual, expected);
  });
}
