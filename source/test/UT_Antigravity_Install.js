// configure-antigravity.js install / uninstall: Launchpad's plugin folder (spec D8, D9).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./antigravity-fixture');
const AG = require(path.join(fx.SOURCE, 'configure-antigravity.js'));

const FILES = ['antigravity-hook.js', 'hook.cmd', 'hooks.json', 'plugin.json'];
function setup(name, opts) { const d = fx.makeEnv(name, opts); fx.seedHook(d); return d; }
function listing(dir) {
  const out = [];
  (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else out.push(f); } })(dir);
  return out;
}

test('UT_AntigravityInstall_Paths', () => {
  const d = setup('inst-paths');
  const p = AG.paths(d.env);
  assert.strictEqual(AG.MIN_VERSION, '1.5.3');
  assert.strictEqual(p.geminiHome, path.join(d.home, '.gemini'));
  assert.strictEqual(p.pluginDir, d.pluginDir);
  assert.strictEqual(p.userSettings, path.join(d.home, '.gemini', 'antigravity-cli', 'settings.json'));
  assert.strictEqual(p.pathCache, path.join(d.kivun, 'kivun-antigravity-path.txt'));
  assert.strictEqual(p.log, path.join(d.kivun, 'antigravity-setup.log'));
  assert.strictEqual(p.hookSource, path.join(d.kivun, 'antigravity-hook.js'));
});

test('UT_AntigravityInstall_PathsFollowUserProfile: with HOME set elsewhere, the plugin goes under USERPROFILE (D8)', () => {
  const d = setup('inst-userprofile');
  const other = path.join(d.root, 'other-home');
  fs.mkdirSync(other);
  const env = Object.assign({}, d.env, { HOME: other });
  const p = AG.paths(env);
  assert.strictEqual(p.geminiHome, path.join(d.home, '.gemini'));
  assert.strictEqual(p.pluginDir, d.pluginDir);
  assert.strictEqual(p.userSettings, path.join(d.home, '.gemini', 'antigravity-cli', 'settings.json'));
  AG.install(env);
  assert.deepStrictEqual(fs.readdirSync(d.pluginDir).sort(), FILES);
  assert.ok(!fs.existsSync(path.join(other, '.gemini')), 'nothing under HOME');
  AG.uninstall(env);
  assert.ok(!fs.existsSync(d.pluginDir), 'and uninstall finds it there');
  const noProfile = Object.assign({}, d.env);
  delete noProfile.USERPROFILE;
  assert.strictEqual(AG.paths(noProfile).geminiHome, path.join(d.home, '.gemini'), 'no USERPROFILE: HOME, as before');
});

test('UT_AntigravityInstall_Files: the four files, with exact contents', () => {
  const d = setup('inst-files');
  assert.deepStrictEqual(AG.install(d.env), ['sound and language hooks added']);
  assert.deepStrictEqual(fs.readdirSync(d.pluginDir).sort(), FILES);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d.pluginDir, 'plugin.json'), 'utf8')), { name: 'launchpad' });
  assert.strictEqual(fs.readFileSync(path.join(d.pluginDir, 'plugin.json'), 'utf8'), '{\n  "name": "launchpad"\n}\n');
  const hooks = JSON.parse(fs.readFileSync(path.join(d.pluginDir, 'hooks.json'), 'utf8'));
  const bs = String.fromCharCode(92);
  assert.deepStrictEqual(hooks, { launchpad: {
    SessionStart: [{ type: 'command', command: '.' + bs + 'hook.cmd session-start', timeout: 10 }],
    Stop: [{ type: 'command', command: '.' + bs + 'hook.cmd stop', timeout: 10 }],
  } });
  assert.ok(!hooks.launchpad.Stop[0].command.includes('"'), 'no quotes in a hook command');
  const cmd = fs.readFileSync(path.join(d.pluginDir, 'hook.cmd'));
  assert.deepStrictEqual(cmd, Buffer.from('@node "%~dp0antigravity-hook.js" %*\r\n', 'latin1'));
  assert.ok(cmd.every(b => b < 128));
  assert.deepStrictEqual(fs.readFileSync(path.join(d.pluginDir, 'antigravity-hook.js')), fs.readFileSync(path.join(d.kivun, 'antigravity-hook.js')));
  assert.ok(fs.readFileSync(path.join(d.kivun, 'antigravity-setup.log'), 'utf8').includes('install'));
});

test('UT_AntigravityInstall_Idempotent: a second run rewrites nothing', () => {
  const d = setup('inst-idem');
  AG.install(d.env);
  const old = new Date(Date.now() - 3600 * 1000);
  const before = {};
  for (const n of FILES) { const f = path.join(d.pluginDir, n); fs.utimesSync(f, old, old); before[n] = fs.statSync(f).mtimeMs; }
  assert.deepStrictEqual(AG.install(d.env), ['sound and language hooks already present']);
  for (const n of FILES) assert.strictEqual(fs.statSync(path.join(d.pluginDir, n)).mtimeMs, before[n], n + ' was rewritten');
  fs.writeFileSync(path.join(d.pluginDir, 'hook.cmd'), 'junk');
  assert.deepStrictEqual(AG.install(d.env), ['sound and language hooks added'], 'a changed file is repaired');
  assert.strictEqual(fs.readFileSync(path.join(d.pluginDir, 'hook.cmd'), 'utf8'), '@node "%~dp0antigravity-hook.js" %*\r\n');
});

test('UT_AntigravityInstall_Uninstall: removes the files and the folder, and is safe twice', () => {
  const d = setup('inst-un');
  AG.install(d.env);
  AG.uninstall(d.env);
  assert.ok(!fs.existsSync(d.pluginDir));
  assert.doesNotThrow(() => AG.uninstall(d.env));
  assert.doesNotThrow(() => AG.uninstall(fx.makeEnv('inst-un-empty').env));
});

test('UT_AntigravityInstall_UninstallKeepsUserFile: a file of the user\'s survives, with its folder', () => {
  const d = setup('inst-un-user');
  AG.install(d.env);
  const mine = path.join(d.pluginDir, 'my-notes.txt');
  fs.writeFileSync(mine, 'mine');
  AG.uninstall(d.env);
  assert.deepStrictEqual(fs.readdirSync(d.pluginDir), ['my-notes.txt']);
  assert.strictEqual(fs.readFileSync(mine, 'utf8'), 'mine');
});

test('UT_AntigravityInstall_Contained: nothing is written outside the fake home and Kivun folder', () => {
  const d = setup('inst-contained');
  AG.install(d.env);
  AG.uninstall(d.env);
  const allowed = [d.home + path.sep, d.kivun + path.sep, d.work + path.sep];
  for (const f of listing(d.root)) assert.ok(allowed.some(a => f.startsWith(a)), f);
  assert.ok(!fs.existsSync(path.join(d.root, 'lad')), 'nothing under LOCALAPPDATA');
});

test('UT_AntigravityInstall_MissingHook: install without the hook script fails clearly, writes nothing', () => {
  const d = fx.makeEnv('inst-nohook');
  assert.throws(() => AG.install(d.env), /antigravity-hook\.js is missing/);
  assert.ok(!fs.existsSync(d.pluginDir));
});

test('UT_AntigravityInstall_Main: install and uninstall exit 0, no mode prints usage and returns 2', () => {
  const d = setup('inst-main');
  const run = args => cp.spawnSync(process.execPath, [path.join(fx.SOURCE, 'configure-antigravity.js'), ...args], { env: d.env, encoding: 'utf8', windowsHide: true });
  let r = run(['install']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), 'sound and language hooks added');
  assert.strictEqual(fs.readdirSync(d.pluginDir).length, 4);
  r = run([]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /usage/);
  r = run(['uninstall']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(d.pluginDir));
});
