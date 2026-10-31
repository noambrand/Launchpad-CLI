// Installing Codex: configure-codex.js install-codex and install.cmd /codex (handout 7.4, D14, Q5;
// acceptance A14, A19, A20, A25, A36). The npm registry is always pointed at a closed local port,
// so no test downloads anything or changes a real Codex.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-fixture');

const OFFLINE = { npm_config_registry: 'http://127.0.0.1:9/', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '3000' };
function offline(d) {
  const cache = path.join(d.root, 'npm-cache');
  fs.mkdirSync(cache, { recursive: true });
  return Object.assign({ npm_config_cache: cache, APPDATA: path.join(d.root, 'appdata'), KIVUN_LOG: path.join(d.kivun, 'install-log.txt') }, OFFLINE);
}

// A stand-alone (non-npm) codex.exe that only answers --version, built with the Windows csc.exe.
function fakeExe(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, 'codex.cs');
  fs.writeFileSync(src, 'class P { static int Main(string[] a) { if (a.Length > 0 && a[0] == "--version") System.Console.WriteLine("codex-cli ' + version + '"); return 0; } }');
  const csc = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const r = cp.spawnSync(csc, ['/nologo', '/out:' + path.join(dir, 'codex.exe'), src], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0, r.stdout);
}

test('UT_Install_PinnedPairExists: newest stable version with a Windows package, never below the minimum', () => {
  const cc = fx.load();
  const versions = ['0.150.0', '0.166.0', '0.167.0', '0.168.0-alpha.1', '0.168.0'];
  assert.strictEqual(cc.chooseVersion(versions, v => v !== '0.168.0'), '0.167.0', 'latest has no Windows package yet');
  assert.strictEqual(cc.chooseVersion(versions, () => true), '0.168.0', 'pre-releases are never chosen');
  assert.strictEqual(cc.chooseVersion(['0.150.0', '0.160.0'], () => true), null);
  assert.strictEqual(cc.chooseVersion(versions, v => v === '0.150.0'), null);
});

test('UT_Install_NodeTooOld', () => {
  const cc = fx.load();
  assert.strictEqual(cc.nodeTooOld('v14.21.3'), true);
  assert.strictEqual(cc.nodeTooOld('v16.0.0'), false);
  assert.strictEqual(cc.nodeTooOld(process.version), false);
});

test('UT_Install_ExistingCompatible: a compatible copy is used, nothing is installed', () => {
  const d = fx.makeEnv('inst-ok');
  const r = fx.cli(d, ['install-codex'], offline(d));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Codex 0\.166\.0 is already installed/);
  assert.match(fs.readFileSync(path.join(d.kivun, 'install-log.txt'), 'utf8'), /already installed/, 'the same line goes to the log');
});

test('UT_Install_OldVersion_Npm_UpdatedWithNotice: an older npm copy is announced, then updated (here: registry offline)', () => {
  const d = fx.makeEnv('inst-oldnpm');
  const r = fx.cli(d, ['install-codex'], Object.assign(offline(d), { FAKE_CODEX_VERSION: '0.150.0' }));
  assert.strictEqual(r.status, 5);
  assert.match(r.stdout, /Codex 0\.150\.0 is older than 0\.166\.0\. Launchpad will update it now\./);
  assert.match(r.stdout, /couldn't reach the npm registry/);
});

test('UT_Install_OldVersion_NotNpm: an older copy installed another way is never changed', () => {
  const d = fx.makeEnv('inst-oldexe', { fakeCodex: false });
  const exeDir = path.join(d.root, 'standalone');
  fakeExe(exeDir, '0.150.0');
  const env = Object.assign(offline(d), { PATH: exeDir + ';' + d.env.PATH });
  const r = fx.cli(d, ['install-codex'], env);
  assert.strictEqual(r.status, 5);
  assert.match(r.stdout, /was not installed with npm/);
  assert.match(r.stdout, /Launchpad does not change it/);
  assert.ok(!/Downloading/.test(r.stdout), 'no download attempted');
});

test('UT_Install_ExistingStandaloneUsed: a compatible stand-alone copy is used without a second install', () => {
  const d = fx.makeEnv('inst-exe', { fakeCodex: false });
  const exeDir = path.join(d.root, 'standalone');
  fakeExe(exeDir, '0.167.0');
  const r = fx.cli(d, ['install-codex'], Object.assign(offline(d), { PATH: exeDir + ';' + d.env.PATH }));
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /Codex 0\.167\.0 is already installed/);
});

test('UT_Install_Fail_Fresh: no Codex and no registry: a plain repair message, exit 5, AGENT untouched', () => {
  const d = fx.makeEnv('inst-offline', { fakeCodex: false });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'X=1\r\n');
  const r = fx.cli(d, ['install-codex'], offline(d));
  assert.strictEqual(r.status, 5);
  assert.match(r.stdout, /couldn't reach the npm registry to download Codex\. Check the internet connection, then run this installer again\./);
  assert.strictEqual(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), 'X=1\r\n');
});

// install.cmd itself: /codex with the Node path, as the installer calls it.
function installCmd(d, args, extra) {
  const lad = path.join(d.root, 'lad');
  fs.mkdirSync(path.join(lad, 'Kivun'), { recursive: true });
  for (const f of ['install.cmd', 'configure-codex.js', 'agent-helpers.js']) fs.copyFileSync(path.join(fx.SOURCE, f), path.join(lad, 'Kivun', f));
  const env = Object.assign({}, d.env, offline(d), { LOCALAPPDATA: lad, TEMP: path.join(d.root, 'tmp'), TMP: path.join(d.root, 'tmp') }, extra || {});
  delete env.KIVUN_DIR; delete env.KIVUN_LOG;      // install.cmd sets both itself
  fs.mkdirSync(env.TEMP, { recursive: true });
  const line = '/d /s /c ""' + path.join(lad, 'Kivun', 'install.cmd') + '"' + args.map(a => ' "' + a + '"').join('') + '"';
  const r = cp.spawnSync(env.ComSpec, [line], { env, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 120000 });
  const log = path.join(lad, 'Kivun', 'install-log.txt');
  return { status: r.status, stdout: r.stdout, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

test('UT_Install_Cmd_Codex: install.cmd /codex "<node.exe>" uses a compatible Codex and logs it', () => {
  const d = fx.makeEnv('inst-cmd-ok');
  const r = installCmd(d, ['/codex', process.execPath]);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.log, /install\.cmd .*\/codex/);
  assert.match(r.log, /\[Codex\] Codex 0\.166\.0 is already installed/);
});

test('UT_Install_Cmd_Codex: install.cmd /codex fails with exit code 5 when Codex cannot be installed', () => {
  const d = fx.makeEnv('inst-cmd-fail', { fakeCodex: false });
  const r = installCmd(d, ['/codex', process.execPath]);
  assert.strictEqual(r.status, 5, r.stdout);
});
