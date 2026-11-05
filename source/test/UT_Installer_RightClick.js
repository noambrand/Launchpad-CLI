// The right-click menu entries (acceptance A6, A32, A40). The installer has run as a normal user
// since v2.6.4, and a normal user can't write through HKCR: Windows answers "Access is denied", the
// installer doesn't check, and the menu entry stays without its command, so a right-click shows
// "This file does not have an app associated with it". One entry per agent is Noam's decision
// (2026-11-05). Checked in the script, not by running it: a real run would write to the real
// registry of whoever runs the tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const NSI = fs.readFileSync(path.resolve(__dirname, '..', '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi'), 'utf8').replace(/\r\n/g, '\n');
const writes = NSI.split('\n').map(l => l.trim()).filter(l => /^WriteReg/.test(l));
function section(start) {
  const i = NSI.indexOf(start);
  assert.ok(i >= 0, 'not in the installer script: ' + start);
  return NSI.slice(i, NSI.indexOf('\nSectionEnd', i));
}
const command = (key, entry, word, arg) => `WriteRegStr HKCU "Software\\Classes\\${key}\\shell\\${entry}\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" ${word} "${arg}"'`;
const KEYS = [['folder', 'Directory', '%1'], ['inside-a-folder', 'Directory\\Background', '%V']];

test('UT_Installer_RegistryWritesPerUser: a per-user installer writes only to HKCU', () => {
  assert.match(NSI, /^RequestExecutionLevel user/m);
  assert.deepStrictEqual(writes.filter(l => !/^WriteReg\w+ HKCU /.test(l)), []);
});

for (const [name, key, arg] of KEYS) {
  test(`UT_Installer_RightClickCommand: the ${name} entries name their agent`, () => {
    for (const want of [command(key, 'ClaudeCodeLaunchpad', 'OPEN-CLAUDE', arg), command(key, 'ClaudeCodeLaunchpadCodex', 'OPEN-CODEX', arg)]) assert.ok(writes.includes(want), 'missing: ' + want);
  });
}

test('UT_Installer_RightClickClaudeLabels: Claude\'s entries use Noam\'s short name', () => {
  assert.ok(writes.includes('WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpad" "" "Open with ClaudeCode CLI"'));
  assert.ok(writes.includes('WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpad" "" "Open ClaudeCode CLI here"'));
});

test('UT_Installer_RightClickCodexLabels: Codex\'s entries use Noam\'s short name', () => {
  assert.ok(writes.includes('WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadCodex" "" "Open with Codex CLI"'));
  assert.ok(writes.includes('WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadCodex" "" "Open Codex CLI here"'));
});

test('UT_Installer_RightClickCodexOnlyOnceVerified: Codex\'s entries need the verified copy; a PC without Claude loses Claude\'s', () => {
  const menu = section('Section "-Right-click entries for Codex" SecCodexMenu');
  assert.ok(menu.indexOf('${FileExists} "$INSTDIR\\kivun-codex-path.txt"') < menu.indexOf('WriteRegStr'), 'checked before anything is written');
  assert.match(menu, /DeleteRegKey HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpad"\n/);
  assert.match(menu, /DeleteRegKey HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpad"\n/);
  assert.ok(menu.indexOf('.local\\bin\\claude.exe') < menu.indexOf('DeleteRegKey'), 'Claude looked for first');
});

test('UT_Installer_RightClickUninstall: uninstall removes the Codex entries too', () => {
  for (const key of ['Directory', 'Directory\\Background']) assert.ok(NSI.includes(`  DeleteRegKey HKCU "Software\\Classes\\${key}\\shell\\ClaudeCodeLaunchpadCodex"\n`), key);
});

test('UT_Installer_RegistryOutsideTestedSections: the sections the installer tests run for real leave the registry alone', () => {
  // UT_Installer_Agent.js compiles and runs these on the PC running the tests. A registry write in
  // one of them would overwrite that PC's real right-click menu with a sandbox path.
  for (const start of ['Section /o "!Install Codex (Required)" SecCodex', 'Section "-Use Claude Code" SecAgentClaude']) {
    assert.doesNotMatch(section(start), /(WriteReg|DeleteReg)/, start);
  }
});
