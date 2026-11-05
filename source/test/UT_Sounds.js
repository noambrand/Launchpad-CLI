// Sound setup (handout 7.6; requirements: "Claude is frozen", "Hooks print nothing";
// acceptance A2, A15). Runs on Windows and macOS (build-and-test-mac.yml), so no cmd here.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const SOUNDS = path.join(SOURCE, 'sounds');
const BASELINE = path.join(__dirname, 'sounds-baseline-v3.2.2', 'configure-sound-hooks.js');
const ROOT = path.join(os.tmpdir(), 'kivun-sounds-ut');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const n of fs.readdirSync(a)) {
    if (n === 'alerts.log' || n === '.nag.lock') continue;
    const s = path.join(a, n), t = path.join(b, n);
    if (fs.statSync(s).isDirectory()) copyDir(s, t); else fs.copyFileSync(s, t);
  }
}
function listFiles(dir, base) {
  base = base || dir;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(n => { const p = path.join(dir, n); return fs.statSync(p).isDirectory() ? listFiles(p, base) : [path.relative(base, p)]; }).sort();
}

// Run one version of the script from its own copy of the sounds bundle, with a fresh home.
function runSetup(script, args, seedSettings) {
  const bundle = path.join(ROOT, 'bundle');
  const home = path.join(ROOT, 'home');
  rmrf(bundle); rmrf(home);
  copyDir(SOUNDS, bundle);
  fs.copyFileSync(script, path.join(bundle, 'configure-sound-hooks.js'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (seedSettings !== undefined) fs.writeFileSync(path.join(home, '.claude', 'settings.json'), seedSettings);
  const r = cp.spawnSync(process.execPath, [path.join(bundle, 'configure-sound-hooks.js'), ...args], {
    env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }), encoding: 'utf8', windowsHide: true, timeout: 60000,
  });
  const settingsFile = path.join(home, '.claude', 'settings.json');
  return {
    status: r.status, stdout: r.stdout,
    settings: fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : null,
    deployed: listFiles(path.join(home, '.claude', 'sounds')),
  };
}

const USER_SETTINGS = JSON.stringify({ model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.cmd' }] }],
  PermissionRequest: [{ hooks: [{ type: 'command', command: 'node "/old/play.js" permission' }] }] } }, null, 2);

for (const [label, seed] of [['no settings.json', undefined], ['user settings with old sound hooks', USER_SETTINGS], ['broken settings.json', '{oops']]) {
  test('UT_Sounds_DefaultOutputUnchanged: same settings.json and files as v3.2.2 (' + label + ')', () => {
    const before = runSetup(BASELINE, [], seed);
    const after = runSetup(path.join(SOUNDS, 'configure-sound-hooks.js'), [], seed);
    assert.deepStrictEqual(after, before);
    assert.ok(before.settings, 'v3.2.2 wrote settings.json');
  });
}

test('UT_Sounds_DeployOnlyNoSettings: the toolkit is copied, no settings.json is made', () => {
  const r = runSetup(path.join(SOUNDS, 'configure-sound-hooks.js'), ['--deploy-only']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.settings, null);
  assert.ok(r.deployed.includes('play.js'));
  assert.ok(r.deployed.includes('config.json'));
  const full = runSetup(path.join(SOUNDS, 'configure-sound-hooks.js'), []);
  assert.deepStrictEqual(r.deployed, full.deployed, 'same toolkit as a normal install');
});

test('UT_PlayJs_CodexInputSilent: Codex hook input is accepted, nothing is printed', () => {
  const dir = path.join(ROOT, 'play');
  rmrf(dir);
  copyDir(SOUNDS, dir);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ enabled: false }));
  const payloads = {
    permission: { session_id: 's', turn_id: 't', cwd: 'C:\\w', hook_event_name: 'PermissionRequest', model: 'gpt', permission_mode: 'default', tool_name: 'shell', tool_input: { command: ['mkdir', 'x'] } },
    done: { session_id: 's', turn_id: 't', transcript_path: 'C:\\t.jsonl', cwd: 'C:\\w', hook_event_name: 'Stop', model: 'gpt', permission_mode: 'default', stop_hook_active: false, last_assistant_message: 'שלום' },
  };
  for (const [sound, payload] of Object.entries(payloads)) {
    const r = cp.spawnSync(process.execPath, [path.join(dir, 'play.js'), sound], { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.strictEqual(r.status, 0, sound);
    assert.strictEqual(r.stdout, '', sound + ': play.js must print nothing (a printed decision would decide a permission request)');
  }
});
