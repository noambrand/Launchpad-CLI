// The right-click menu entries (acceptance A6, A32, A40). The installer has run as a normal user
// since v2.6.4, and a normal user can't write through HKCR: Windows answers "Access is denied", the
// installer doesn't check, and the menu entry stays without its command, so a right-click shows
// "This file does not have an app associated with it". Checked in the script, not by running it:
// a real run would write to the real registry of whoever runs the tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const NSI = fs.readFileSync(path.resolve(__dirname, '..', '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi'), 'utf8');
const writes = NSI.split(/\r?\n/).map(l => l.trim()).filter(l => /^WriteReg/.test(l));

test('UT_Installer_RegistryWritesPerUser: a per-user installer writes only to HKCU', () => {
  assert.match(NSI, /^RequestExecutionLevel user/m);
  assert.deepStrictEqual(writes.filter(l => !/^WriteReg\w+ HKCU /.test(l)), []);
});

for (const [name, key, arg] of [['folder', 'Directory', '%1'], ['inside-a-folder', 'Directory\\Background', '%V']]) {
  test(`UT_Installer_RightClickCommand: the ${name} entry has its command in the user's own classes`, () => {
    const want = `WriteRegStr HKCU "Software\\Classes\\${key}\\shell\\ClaudeCodeLaunchpad\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" "${arg}"'`;
    assert.ok(writes.includes(want), 'missing: ' + want);
  });
}
