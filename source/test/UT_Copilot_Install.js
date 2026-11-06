// Installing Copilot: configure-copilot.js install-copilot and install.cmd /copilot (Copilot Step 0, S1,
// S9). As for Codex, the npm registry is always pointed at a closed local port, so no test downloads
// anything or changes a real Copilot.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./copilot-fixture');

const OFFLINE = { npm_config_registry: 'http://127.0.0.1:9/', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '3000' };
function offline(d) {
  const cache = path.join(d.root, 'npm-cache');
  fs.mkdirSync(cache, { recursive: true });
  return Object.assign({ npm_config_cache: cache, APPDATA: path.join(d.root, 'appdata'), KIVUN_LOG: path.join(d.kivun, 'install-log.txt') }, OFFLINE);
}

// A stand-alone (non-npm) copilot.exe that only answers --version, built with the Windows csc.exe.
function fakeExe(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'copilot.cs');
  fs.writeFileSync(src, 'class P { static int Main(string[] a) { if (a.Length > 0 && a[0] == "--version") System.Console.WriteLine("GitHub Copilot CLI ' + version + '."); return 0; } }');
  const csc = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const r = cp.spawnSync(csc, ['/nologo', '/out:' + path.join(dir, 'copilot.exe'), src], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0, r.stdout);
}

test('UT_CopilotInstall_NodeTooOld: below Node 22 Copilot isn\'t attempted', () => {
  const m = fx.load();
  assert.strictEqual(m.nodeTooOld('v20.11.0'), true);
  assert.strictEqual(m.nodeTooOld('v21.9.9'), true);
  assert.strictEqual(m.nodeTooOld('v22.0.0'), false);
  assert.strictEqual(m.nodeTooOld('v24.16.0'), false);
});

test('UT_CopilotInstall_MinimumVersion: S9 found 1.0.65 fails, and 1.0.105 passed', () => {
  assert.strictEqual(fx.load().MIN_VERSION, '1.0.105');
});

test('UT_CopilotInstall_ExistingCompatible: a compatible copy is used, nothing is installed', () => {
  const d = fx.makeEnv('inst-ok');
  const r = fx.cli(d, ['install-copilot'], offline(d));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /GitHub Copilot 1\.0\.105 is already installed/);
  assert.match(fs.readFileSync(path.join(d.kivun, 'install-log.txt'), 'utf8'), /already installed/, 'the same line goes to the log');
  assert.ok(!/Downloading/.test(r.stdout));
});

test('UT_CopilotInstall_OldNpmUpdatedWithNotice: an older npm copy is announced, then updated (here: registry offline)', () => {
  const d = fx.makeEnv('inst-oldnpm');
  const r = fx.cli(d, ['install-copilot'], Object.assign(offline(d), { FAKE_COPILOT_VERSION: '1.0.65' }));
  assert.strictEqual(r.status, 6, r.stdout + r.stderr);
  assert.match(r.stdout, /GitHub Copilot 1\.0\.65 is older than 1\.0\.105\. Launchpad will update it now\./);
  assert.match(r.stdout, /could not be installed/);
});

test('UT_CopilotInstall_OldExeLeftAlone: an older copy installed another way is never changed', () => {
  const d = fx.makeEnv('inst-oldexe', { fakeCopilot: false });
  const exeDir = path.join(d.root, 'standalone');
  fakeExe(exeDir, '1.0.65');
  const r = fx.cli(d, ['install-copilot'], Object.assign(offline(d), { PATH: exeDir + ';' + d.env.PATH }));
  assert.strictEqual(r.status, 6, r.stdout);
  assert.match(r.stdout, /was not installed with npm/);
  assert.match(r.stdout, /Launchpad does not change it/);
  assert.ok(!/Downloading/.test(r.stdout), 'no download attempted');
});

test('UT_CopilotInstall_GoodExeUsed: a compatible stand-alone copy is used without a second install', () => {
  const d = fx.makeEnv('inst-exe', { fakeCopilot: false });
  const exeDir = path.join(d.root, 'standalone');
  fakeExe(exeDir, '1.0.200');
  const r = fx.cli(d, ['install-copilot'], Object.assign(offline(d), { PATH: exeDir + ';' + d.env.PATH }));
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /GitHub Copilot 1\.0\.200 is already installed/);
});

test('UT_CopilotInstall_FailFresh: no Copilot and no registry: a plain repair message, exit 6, AGENT untouched', () => {
  const d = fx.makeEnv('inst-offline', { fakeCopilot: false });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'X=1\r\n');
  const r = fx.cli(d, ['install-copilot'], offline(d));
  assert.strictEqual(r.status, 6, r.stdout + r.stderr);
  assert.match(r.stdout, /could not be installed\. Check the internet connection, then run this installer again\./);
  assert.strictEqual(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), 'X=1\r\n');
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-copilot-path.txt')));
});

test('UT_CopilotInstall_ResolveCache: trusted only while the file is unchanged', () => {
  const d = fx.makeEnv('inst-cache'), m = fx.load();
  assert.strictEqual(m.resolveCopilot(d.env).version, '1.0.105');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-copilot-path.txt')));
  fs.appendFileSync(path.join(d.prefix, 'node_modules', '@github', 'copilot', 'npm-loader.js'), '\n// changed\n');
  assert.strictEqual(m.resolveCopilot(Object.assign({}, d.env, { FAKE_COPILOT_VERSION: '1.0.300' })).version, '1.0.300');
});

test('UT_CopilotInstall_NothingHere: nothing found means missing, with no crash', () => {
  const d = fx.makeEnv('inst-none', { fakeCopilot: false });
  assert.strictEqual(fx.load().resolveCopilot(Object.assign({}, d.env, offline(d)), { noCache: true }).missing, true);
});

// install.cmd itself: /copilot with the Node path, as the installer calls it.
function installCmd(d, args, extra) {
  const lad = path.join(d.root, 'lad');
  fs.mkdirSync(path.join(lad, 'Kivun'), { recursive: true });
  for (const f of ['install.cmd', 'configure-copilot.js', 'configure-codex.js', 'agent-helpers.js']) fs.copyFileSync(path.join(fx.SOURCE, f), path.join(lad, 'Kivun', f));
  // install.cmd adds the PATH stored in the registry, where a real Copilot on this PC would be found:
  // here `reg` finds nothing.
  const noReg = path.join(d.root, 'no-reg');
  fs.mkdirSync(noReg, { recursive: true });
  fs.writeFileSync(path.join(noReg, 'reg.cmd'), '@exit /b 1\r\n');
  const env = Object.assign({}, d.env, offline(d), { PATH: noReg + ';' + d.env.PATH, LOCALAPPDATA: lad, TEMP: path.join(d.root, 'tmp'), TMP: path.join(d.root, 'tmp') }, extra || {});
  delete env.KIVUN_DIR; delete env.KIVUN_LOG;      // install.cmd sets both itself
  fs.mkdirSync(env.TEMP, { recursive: true });
  const line = '/d /s /c ""' + path.join(lad, 'Kivun', 'install.cmd') + '"' + args.map(a => ' "' + a + '"').join('') + '"';
  const r = cp.spawnSync(env.ComSpec, [line], { env, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 120000 });
  const log = path.join(lad, 'Kivun', 'install-log.txt');
  return { status: r.status, stdout: r.stdout, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

test('UT_CopilotInstall_CmdUsesCopy: install.cmd /copilot "<node.exe>" uses a compatible Copilot and logs it', () => {
  const d = fx.makeEnv('inst-cmd-ok');
  const r = installCmd(d, ['/copilot', process.execPath]);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.log, /install\.cmd .*\/copilot/);
  assert.match(r.stdout, /already installed/);
});

test('UT_CopilotInstall_CmdFails: install.cmd says exit 6 when Copilot can\'t be installed', () => {
  const d = fx.makeEnv('inst-cmd-fail', { fakeCopilot: false });
  assert.strictEqual(installCmd(d, ['/copilot', process.execPath]).status, 6);
});

test('UT_CopilotInstall_CmdLeavesCodexFlagAlone: /codex and /copilot are separate', () => {
  const text = fs.readFileSync(path.join(fx.SOURCE, 'install.cmd'), 'utf8');
  assert.match(text, /if "!DO_COPILOT!"=="1" call :install_copilot/);
  assert.match(text, /if "!DO_CODEX!"=="1" call :install_codex/);
});
