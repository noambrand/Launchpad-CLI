// Windows Terminal warned "Found a profile with an invalid colorScheme" right after an install
// (2026-11-26): settings.json pinned the Launchpad profile to "Launchpad Color", Windows Terminal had
// dropped our copy of that scheme from settings.json, and the fragment the installer copies called its
// scheme "Noam". Every fragment must define "Launchpad Color", and apply-terminal-color.js must leave
// no pin to a scheme that isn't defined. Runs a copy of the script against a sealed folder.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const NAME = 'Launchpad Color';
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const COLOR = readJson(path.join(SOURCE, 'claudecode-launchpad-wt-fragment.json'));
const NOCOLOR = readJson(path.join(SOURCE, 'claudecode-launchpad-wt-fragment-nocolor.json'));

// A sealed Kivun folder with the script and config.txt, a fake LOCALAPPDATA with Windows Terminal's
// settings.json (given as an object), and the fragment the installer copied there.
function sandbox(name, color, settings, fragment) {
  const root = path.join(ROOT, 'wtcolor', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, lad: path.join(root, 'LAD') };
  d.kivun = path.join(d.lad, 'LaunchpadAI');
  d.settings = path.join(d.lad, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json');
  d.fragment = path.join(d.lad, 'Microsoft', 'Windows Terminal', 'Fragments', 'ClaudeCodeLaunchpad', 'claudecode-launchpad-wt-fragment.json');
  for (const f of [d.kivun, path.dirname(d.settings), path.dirname(d.fragment)]) fs.mkdirSync(f, { recursive: true });
  fs.copyFileSync(path.join(SOURCE, 'apply-terminal-color.js'), path.join(d.kivun, 'apply-terminal-color.js'));
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'TERMINAL_COLOR=' + color + '\r\n');
  fs.writeFileSync(d.settings, JSON.stringify(settings, null, 4));
  fs.writeFileSync(d.fragment, JSON.stringify(fragment, null, 4) + '\n');
  return d;
}
function run(d) {
  const r = cp.spawnSync(process.execPath, [path.join(d.kivun, 'apply-terminal-color.js')],
    { env: Object.assign({}, process.env, { LOCALAPPDATA: d.lad }), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
}
// settings.json as Windows Terminal leaves it: the profile materialized and pinned, our scheme dropped.
const pinnedSettings = () => ({
  profiles: { defaults: {}, list: [{ name: 'ClaudeCode Launchpad CLI', source: 'ClaudeCodeLaunchpad', colorScheme: NAME, guid: '{63d87c58-23d5-5232-962b-e7938d455cf6}' }] },
  schemes: [],
});
const schemeNames = j => (j.schemes || []).map(s => s.name);

test('UT_TerminalColor_ShippedFragmentNamesLaunchpadColor: the installer\'s color fragment pins a scheme it defines, "Launchpad Color"', () => {
  assert.strictEqual(COLOR.profiles[0].colorScheme, NAME);
  assert.deepStrictEqual(schemeNames(COLOR), [NAME]);
});

test('UT_TerminalColor_NoColorFragmentDefinesIt: the no-color fragment pins nothing but still defines "Launchpad Color"', () => {
  assert.ok(!('colorScheme' in NOCOLOR.profiles[0]));
  assert.deepStrictEqual(schemeNames(NOCOLOR), [NAME]);
});

test('UT_TerminalColor_ShippedEqualsWritten: the installer\'s fragment is what apply-terminal-color.js writes for the light blue', () => {
  const d = sandbox('kivun', 'kivun', pinnedSettings(), { profiles: [] });
  run(d);
  assert.deepStrictEqual(readJson(d.fragment), COLOR);
});

test('UT_TerminalColor_DefaultUnpins: TERMINAL_COLOR=default takes the pin out of settings.json, and no fragment pin is left', () => {
  const d = sandbox('default', 'default', pinnedSettings(), NOCOLOR);
  run(d);
  const s = readJson(d.settings);
  assert.ok(!('colorScheme' in s.profiles.list[0]), JSON.stringify(s.profiles.list[0]));
  assert.ok(!('colorScheme' in readJson(d.fragment).profiles[0]));
});

test('UT_TerminalColor_EveryPinIsDefined: after a run, each pin names a scheme the fragment or settings.json defines', () => {
  for (const color of ['kivun', 'dark', '#336699', 'default']) {
    const d = sandbox('pin-' + color.replace('#', 'x'), color, pinnedSettings(), COLOR);
    run(d);
    const s = readJson(d.settings), f = readJson(d.fragment);
    const defined = schemeNames(s).concat(schemeNames(f));
    for (const p of s.profiles.list.concat(f.profiles)) {
      if (p.colorScheme) assert.ok(defined.includes(p.colorScheme), color + ': ' + p.colorScheme + ' is not defined');
    }
  }
});
