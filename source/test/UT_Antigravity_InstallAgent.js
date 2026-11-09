// configure-antigravity.js install-antigravity and commit (REQUIREMENTS-antigravity-option D3, D4;
// STEP0-results-antigravity A1, A10). Google's installer is replaced by a local .cmd named in
// KIVUN_TEST_AGY_INSTALLER, so nothing is downloaded; agy is a stand-in that records its calls.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./antigravity-fixture');

const MANUAL = 'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd';

// A fake install.cmd. copies: it puts the stand-in at %LOCALAPPDATA%\agy\bin\agy.exe, as Google's does.
function fakeInstaller(d, opts) {
  opts = opts || {};
  const file = path.join(d.root, 'fake-install.cmd');
  const lines = ['@echo off', 'echo fake installer ran>>"' + path.join(d.root, 'installer-ran.txt') + '"'];
  if (opts.copies !== false) {
    lines.push('mkdir "%LOCALAPPDATA%\\agy\\bin" 2>nul', 'copy /y "' + fx.stub() + '" "%LOCALAPPDATA%\\agy\\bin\\agy.exe" >nul');
    if (opts.version) lines.push('>"%LOCALAPPDATA%\\agy\\bin\\version.txt" echo ' + opts.version);
  }
  lines.push('exit /b ' + (opts.exit || 0));
  fs.writeFileSync(file, lines.join('\r\n') + '\r\n');
  return { KIVUN_TEST_AGY_INSTALLER: file };
}
const install = (d, extra) => fx.cli(d, ['install-antigravity'], extra, { timeout: 120000 });
const ran = d => fs.existsSync(path.join(d.root, 'installer-ran.txt'));
const updates = d => fx.records(d).filter(r => r.args[0] === 'update');

test('UT_AntigravityInstall_Fresh: no copy, so Google\'s script runs and the copy it leaves is found (exit 0)', () => {
  const d = fx.makeAgyEnv('inst-fresh', { stub: false });
  const r = install(d, fakeInstaller(d));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(ran(d));
  assert.match(r.stdout, /Antigravity 1\.5\.3 installed/);
  assert.ok(fs.existsSync(d.exe));
  assert.ok(!fs.existsSync(path.join(d.kivun, 'agy-install.cmd')), 'the copied script is deleted afterwards');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-antigravity-path.txt')), 'the verified path is cached');
});

test('UT_AntigravityInstall_IgnoresInstallerExitCode: the script\'s exit code decides nothing, the copy does (D3)', () => {
  const d = fx.makeAgyEnv('inst-exitcode', { stub: false });
  const r = install(d, fakeInstaller(d, { exit: 5 }));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('UT_AntigravityInstall_SilentFailure: a script that exits 0 but installs nothing fails with the manual command and exit 7', () => {
  const d = fx.makeAgyEnv('inst-silent', { stub: false });
  const r = install(d, fakeInstaller(d, { copies: false }));
  assert.strictEqual(r.status, 7, r.stdout + r.stderr);
  assert.ok(ran(d));
  assert.ok(r.stdout.includes(MANUAL), r.stdout);
  assert.match(r.stdout, /Command Prompt/);
  assert.match(r.stdout, /not PowerShell/);
  assert.ok(!fs.existsSync(path.join(d.kivun, 'agy-install.cmd')));
});

test('UT_AntigravityInstall_FetchFailureSaysWhy: when Google\'s script can\'t be fetched, the screen and the log say why (exit 7)', () => {
  const d = fx.makeAgyEnv('inst-nofetch', { stub: false });
  const r = install(d, { KIVUN_TEST_AGY_INSTALLER: path.join(d.root, 'no-such-install.cmd') });
  assert.strictEqual(r.status, 7, r.stdout + r.stderr);
  assert.match(r.stdout, /Google's installer could not be fetched or run: .*no-such-install\.cmd/);
  assert.ok(r.stdout.includes(MANUAL), r.stdout);
  const log = fs.readFileSync(path.join(d.kivun, 'antigravity-setup.log'), 'utf8');
  assert.match(log, /failed: Google's installer could not be fetched or run/);
});

test('UT_AntigravityInstall_BadFolderCharacter: a Kivun path with & says Google\'s installer refuses it', () => {
  const d = fx.makeAgyEnv('inst-amp', { stub: false });
  const kivun = path.join(d.root, 'a&b');
  fs.mkdirSync(kivun);
  const r = install(d, Object.assign(fakeInstaller(d, { copies: false }), { KIVUN_DIR: kivun }));
  assert.strictEqual(r.status, 7, r.stdout + r.stderr);
  assert.match(r.stdout, /refuses/);
  const ok = fx.makeAgyEnv('inst-noamp', { stub: false });
  assert.ok(!/refuses/.test(install(ok, fakeInstaller(ok, { copies: false })).stdout), 'not said for a clean path');
});

test('UT_AntigravityInstall_ExistingCopyUpdated: agy update runs, the version is read again, nothing is downloaded', () => {
  const d = fx.makeAgyEnv('inst-update');
  const r = install(d, Object.assign(fakeInstaller(d), { FAKE_AGY_UPDATE_TO: '1.6.0' }));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(updates(d).length, 1);
  assert.deepStrictEqual(updates(d)[0].args, ['update']);
  assert.match(r.stdout, /updated from 1\.5\.3 to 1\.6\.0/);
  assert.ok(!ran(d), 'Google\'s script is not run when a usable copy exists');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-antigravity-path.txt'), 'utf8')).version, '1.6.0');
});

test('UT_AntigravityInstall_UpToDate: "already on the latest version" is reported and exit is 0', () => {
  const d = fx.makeAgyEnv('inst-current');
  const r = install(d);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /up to date/);
});

test('UT_AntigravityInstall_UpdateHangs: an update past the limit keeps the copy and still succeeds', () => {
  const d = fx.makeAgyEnv('inst-hang');
  const started = Date.now();
  const r = install(d, { FAKE_AGY_UPDATE_SLEEP_MS: '20000', KIVUN_TEST_AGY_UPDATE_TIMEOUT: '1500' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(Date.now() - started < 15000, 'stopped waiting at the limit');
  assert.match(r.stdout, /keeps using 1\.5\.3/);
  assert.ok(fs.existsSync(d.exe));
});

test('UT_AntigravityInstall_UpdateFails: a failing update keeps the copy and still succeeds', () => {
  const d = fx.makeAgyEnv('inst-updfail');
  const r = install(d, { FAKE_AGY_UPDATE_EXIT: '1' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /keeps using 1\.5\.3/);
});

test('UT_AntigravityInstall_TooOldIsNotUsable: below 1.5.3 the copy is not used; Google\'s script runs and a newer copy passes', () => {
  const m = fx.load();
  assert.strictEqual(m.MIN_VERSION, '1.5.3');
  const d = fx.makeAgyEnv('inst-old', { version: '1.5.2' });
  assert.strictEqual(m.resolveAntigravity(d.env, { noCache: true }).missing, true);
  const r = install(d, fakeInstaller(d, { version: '1.5.3' }));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(ran(d));
  assert.strictEqual(m.resolveAntigravity(d.env, { noCache: true }).version, '1.5.3');
});

test('UT_AntigravityInstall_FoundOnPath: a copy outside the default folder is found with where.exe', () => {
  const d = fx.makeAgyEnv('inst-path', { stub: false });
  const bin = path.join(d.root, 'other bin');
  fs.mkdirSync(bin);
  fs.copyFileSync(fx.stub(), path.join(bin, 'agy.exe'));
  const env = Object.assign({}, d.env, { PATH: bin + ';' + d.env.PATH });
  const c = fx.load().resolveAntigravity(env, { noCache: true });
  assert.strictEqual(c.exe.toLowerCase(), path.join(bin, 'agy.exe').toLowerCase());
  assert.strictEqual(c.version, '1.5.3');
});

test('UT_AntigravityInstall_NotFromCurrentFolder: an agy.exe in the current folder (the user\'s project) is never picked', () => {
  const d = fx.makeAgyEnv('inst-cwd', { stub: false });
  fs.copyFileSync(fx.stub(), path.join(d.work, 'agy.exe'));
  const show = 'console.log(JSON.stringify(require(' + JSON.stringify(fx.MODULE) + ').discover(process.env)))';
  const r = fx.cp.spawnSync(process.execPath, ['-e', show], { cwd: d.work, env: d.env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr);
  const found = JSON.parse(r.stdout);
  assert.deepStrictEqual(found, [d.exe], 'only the default folder, which is empty here');
  const c = fx.cli(d, ['commit'], {}, { cwd: d.work });
  assert.strictEqual(c.status, 7, 'commit finds no Antigravity: ' + c.stdout + c.stderr);
  assert.deepStrictEqual(fx.records(d), [], 'the copy in the project folder was never started');
});

test('UT_AntigravityInstall_StartErrorReported: a copy that can\'t be started is named with the reason', () => {
  const d = fx.makeAgyEnv('inst-starterr', { stub: false });
  fs.mkdirSync(path.dirname(d.exe), { recursive: true });
  fs.writeFileSync(d.exe, 'not a program');
  const c = fx.load().resolveAntigravity(d.env, { noCache: true });
  assert.strictEqual(c.missing, true);
  assert.strictEqual(c.problems.length, 1, c.problems.join(' | '));
  assert.ok(c.problems[0].startsWith('Antigravity at ' + d.exe + ' did not start: '), c.problems[0]);
  assert.ok(c.problems[0].length > ('Antigravity at ' + d.exe + ' did not start: .').length, 'with the error\'s own text: ' + c.problems[0]);
});

test('UT_AntigravityInstall_CacheReverified: a cached path whose file changed is checked again', () => {
  const d = fx.makeAgyEnv('inst-cache'), m = fx.load();
  assert.strictEqual(m.resolveAntigravity(d.env).version, '1.5.3');
  const before = fx.records(d).length;
  m.resolveAntigravity(d.env);
  assert.strictEqual(fx.records(d).length, before, 'unchanged file: the cache is trusted, agy is not started');
  fs.appendFileSync(d.exe, Buffer.alloc(16));   // the file changes (size and time)
  m.resolveAntigravity(d.env);
  assert.ok(fx.records(d).length > before, 'changed file: --version runs again');
});

test('UT_AntigravityInstall_Commit: verified, cached, then AGENT=antigravity; with no copy exit 7 and AGENT untouched', () => {
  const d = fx.makeAgyEnv('commit');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n');
  const r = fx.cli(d, ['commit']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), /^AGENT=antigravity\r$/m);
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-antigravity-path.txt')));
  const e = fx.makeAgyEnv('commit-fail', { stub: false });
  fs.writeFileSync(path.join(e.kivun, 'config.txt'), 'AGENT=claude\r\n');
  const f = fx.cli(e, ['commit']);
  assert.strictEqual(f.status, 7);
  assert.match(fs.readFileSync(path.join(e.kivun, 'config.txt'), 'utf8'), /AGENT=claude/);
});

test('UT_AntigravityInstall_NoShellForAgy: install-antigravity starts agy only by argument array (spawn of update has no shell)', () => {
  const src = fs.readFileSync(path.join(fx.SOURCE, 'configure-antigravity.js'), 'utf8');
  assert.ok(!/shell\s*:\s*true/.test(src));
  assert.ok(!/\bexec(Sync)?\(/.test(src));
  assert.ok(!/powershell/i.test(src.replace(/PowerShell 5\.1|PSExecutionPolicyPreference|not PowerShell|PowerShell/g, '')));
});
