// v3.6.0 "Let Claude hand work to Codex": configure-codex-plugin.js, run as the installer runs it
// (node configure-codex-plugin.js install|remove), against a sealed folder and a stand-in for Claude
// Code's `claude plugin` commands (codex-plugin-fixture.js). Nothing touches this PC's real Claude Code.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-plugin-fixture');

const SCRIPT = path.join(fx.SOURCE, 'configure-codex-plugin.js');
const CP = require(SCRIPT);
const run = (d, mode, extra) => cp.spawnSync(process.execPath, [SCRIPT, mode], { env: Object.assign({}, d.env, extra || {}), encoding: 'utf8', windowsHide: true, timeout: 60000 });
const verbs = d => fx.calls(d).map(a => a.slice(0, a[1] === 'marketplace' ? 3 : 2).join(' '));

test('UT_CodexPlugin_InstallTurnsOn: lists, adds Launchpad\'s folder, installs codex@launchpad-plugins, checks, records', () => {
  const d = fx.makeEnv('install-on');
  const r = run(d, 'install');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(fx.calls(d), [
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', path.join(d.kivun, 'plugins')],
    ['plugin', 'install', fx.ID, '--scope', 'user'],
    ['plugin', 'list', '--json'],
  ]);
  assert.deepStrictEqual(fx.state(d).plugins, [fx.ID]);
  assert.ok(fx.has(d, 'kivun-codex-plugin.txt'), 'the record the installer reads');
  assert.match(r.stdout, /Claude can now hand work to Codex: \/codex:review and \/codex:rescue/);
});

test('UT_CodexPlugin_InstallAlreadyOn: an installed copy is left as it is (only the list is read)', () => {
  const d = fx.makeEnv('install-again', { plugins: [fx.ID], marketplaces: ['x'] });
  const r = run(d, 'install');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(verbs(d), ['plugin list']);
  assert.ok(fx.has(d, 'kivun-codex-plugin.txt'));
});

test('UT_CodexPlugin_OwnCopyLeftAlone: with OpenAI\'s own copy in Claude, nothing is added (no command twice): exit 3', () => {
  const d = fx.makeEnv('own-copy', { plugins: ['codex@openai-codex'] });
  const r = run(d, 'install');
  assert.strictEqual(r.status, CP.EXIT.OWN_COPY, r.stdout + r.stderr);
  assert.deepStrictEqual(verbs(d), ['plugin list']);
  assert.deepStrictEqual(fx.state(d).plugins, ['codex@openai-codex']);
  assert.ok(!fx.has(d, 'kivun-codex-plugin.txt'), 'no record: Launchpad did not put it in');
  assert.match(r.stdout, /Claude already has codex@openai-codex, so Launchpad left it as it is/);
});

test('UT_CodexPlugin_NeedsCodex: without Codex on the PC nothing runs: exit 4', () => {
  const d = fx.makeEnv('no-codex', { codex: false });
  const r = run(d, 'install');
  assert.strictEqual(r.status, CP.EXIT.NOT_HERE);
  assert.deepStrictEqual(fx.calls(d), [], 'Claude is not started');
  assert.match(r.stdout, /Codex is not on this PC/);
});

test('UT_CodexPlugin_NeedsClaude: without Claude Code on the PC: exit 4', () => {
  const d = fx.makeEnv('no-claude', { noClaude: true });
  const r = run(d, 'install');
  assert.strictEqual(r.status, CP.EXIT.NOT_HERE, r.stdout + r.stderr);
  assert.match(r.stdout, /Claude Code is not on this PC/);
  assert.ok(!fx.has(d, 'kivun-codex-plugin.txt'));
});

test('UT_CodexPlugin_InstallFails: a failed install is exit 1 and leaves no record', () => {
  for (const fail of ['plugin marketplace add', 'plugin install']) {
    const d = fx.makeEnv('fails ' + fail.split(' ').pop(), { fail: { [fail]: true } });
    const r = run(d, 'install');
    assert.strictEqual(r.status, CP.EXIT.FAILED, fail);
    assert.ok(!fx.has(d, 'kivun-codex-plugin.txt'), fail);
    assert.match(fs.readFileSync(path.join(d.kivun, 'codex-plugin-setup.log'), 'utf8'), /stand-in failure/, 'the reason is logged');
  }
});

test('UT_CodexPlugin_ListUnreadable: when Claude\'s list can\'t be read, nothing is changed: exit 1', () => {
  const d = fx.makeEnv('bad-list', { badList: true });
  const r = run(d, 'install');
  assert.strictEqual(r.status, CP.EXIT.FAILED);
  assert.deepStrictEqual(verbs(d), ['plugin list']);
  assert.ok(!fx.has(d, 'kivun-codex-plugin.txt'));
});

test('UT_CodexPlugin_TickAgainClearsUntick: turning it on again forgets the earlier untick', () => {
  const d = fx.makeEnv('re-tick');
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-plugin-off.txt'), 'unticked\r\n');
  assert.strictEqual(run(d, 'install').status, 0);
  assert.ok(!fx.has(d, 'kivun-codex-plugin-off.txt'));
});

test('UT_CodexPlugin_RemoveTakesOutOnlyLaunchpads: Launchpad\'s copy goes, OpenAI\'s own stays; the untick is remembered', () => {
  const d = fx.makeEnv('remove', { plugins: [fx.ID, 'codex@openai-codex'], marketplaces: ['x'] });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-plugin.txt'), fx.ID + '\r\n');
  const r = run(d, 'remove');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(fx.calls(d), [['plugin', 'list', '--json'], ['plugin', 'uninstall', fx.ID, '--scope', 'user'], ['plugin', 'list', '--json']]);
  assert.deepStrictEqual(fx.state(d).plugins, ['codex@openai-codex']);
  assert.ok(!fx.has(d, 'kivun-codex-plugin.txt'));
  assert.ok(fx.has(d, 'kivun-codex-plugin-off.txt'));
});

test('UT_CodexPlugin_RemoveWhenNeverAdded: no record means Claude is not started; the untick is still remembered', () => {
  const d = fx.makeEnv('remove-never', { plugins: ['codex@openai-codex'] });
  const r = run(d, 'remove');
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(fx.calls(d), []);
  assert.ok(fx.has(d, 'kivun-codex-plugin-off.txt'));
});

test('UT_CodexPlugin_RemoveFails: a failed uninstall is exit 1 and keeps the record, so the next run tries again', () => {
  const d = fx.makeEnv('remove-fails', { plugins: [fx.ID], marketplaces: ['x'], fail: { 'plugin uninstall': true } });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-plugin.txt'), fx.ID + '\r\n');
  assert.strictEqual(run(d, 'remove').status, CP.EXIT.FAILED);
  assert.ok(fx.has(d, 'kivun-codex-plugin.txt'));
});

test('UT_CodexPlugin_HebrewFolder: a Kivun folder with Hebrew and a space reaches Claude unchanged', () => {
  const d = fx.makeEnv('hebrew', { hebrew: true });
  assert.strictEqual(run(d, 'install').status, 0);
  assert.deepStrictEqual(fx.calls(d)[1], ['plugin', 'marketplace', 'add', path.join(d.kivun, 'plugins')]);
});

test('UT_CodexPlugin_FindsClaude: the native copy first, then PATH (claude.exe, then claude.cmd), then npm\'s folder', () => {
  const d = fx.makeEnv('find', { noClaude: true });
  const env = Object.assign({}, d.env);
  const put = (dir, name) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), ''); return path.join(dir, name); };
  assert.strictEqual(CP.findClaude(env), null);
  const npm = put(path.join(env.APPDATA, 'npm'), 'claude.cmd');
  assert.deepStrictEqual(CP.findClaude(env), { kind: 'cmd', file: npm });
  const onPath = path.join(d.root, 'on path');
  const cmd = put(onPath, 'claude.cmd');
  env.PATH = onPath + ';' + env.PATH;
  assert.deepStrictEqual(CP.findClaude(env), { kind: 'cmd', file: cmd });
  const exe = put(onPath, 'claude.exe');
  assert.deepStrictEqual(CP.findClaude(env), { kind: 'exe', file: exe });
  const native = put(path.join(d.home, '.local', 'bin'), 'claude.exe');
  assert.deepStrictEqual(CP.findClaude(env), { kind: 'exe', file: native });
});

test('UT_CodexPlugin_CmdLine: a claude.cmd gets every part quoted; a quote or a % is refused, never passed to cmd', () => {
  assert.strictEqual(CP.cmdLine('C:\\a b\\claude.cmd', ['plugin', 'list', '--json']), '""C:\\a b\\claude.cmd" "plugin" "list" "--json""');
  assert.strictEqual(CP.cmdLine('C:\\x\\claude.cmd', ['plugin', 'marketplace', 'add', 'C:\\100%\\plugins']), null);
  assert.strictEqual(CP.cmdLine('C:\\x"y\\claude.cmd', ['plugin']), null);
});

test('UT_CodexPlugin_CmdCopyRuns: a claude.cmd in a folder with a space and an & is started through cmd.exe correctly', () => {
  const d = fx.makeEnv('cmd copy', { noClaude: true });
  const dir = path.join(d.root, 'npm & co');
  fs.mkdirSync(dir, { recursive: true });
  const seen = path.join(d.root, 'seen.txt');
  // Records its arguments; `plugin list --json` prints an empty list.
  fs.writeFileSync(path.join(dir, 'claude.cmd'), '@echo off\r\n>>"%SEEN%" echo [%*]\r\nif "%~2"=="list" echo []\r\nexit /b 0\r\n');
  const env = Object.assign({}, d.env, { PATH: dir + ';' + d.env.PATH, SEEN: seen });
  const r = cp.spawnSync(process.execPath, [SCRIPT, 'install'], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  // The stand-in never lists the add-on after installing it, so this ends in "does not list" (exit 1),
  // after every command reached it whole.
  assert.strictEqual(r.status, CP.EXIT.FAILED, r.stdout + r.stderr);
  const lines = fs.readFileSync(seen, 'utf8').trim().split(/\r?\n/);
  assert.deepStrictEqual(lines, [
    '["plugin" "list" "--json"]',
    '["plugin" "marketplace" "add" "' + path.join(d.kivun, 'plugins') + '"]',
    '["plugin" "install" "codex@launchpad-plugins" "--scope" "user"]',
    '["plugin" "list" "--json"]',
  ]);
  assert.match(r.stdout, /does not list the Codex add-on after installing it/);
});

test('UT_CodexPlugin_UnknownMode: usage, exit 2', () => {
  const d = fx.makeEnv('usage');
  const r = run(d, 'enable-review-gate');
  assert.strictEqual(r.status, 2);
  assert.deepStrictEqual(fx.calls(d), []);
});
