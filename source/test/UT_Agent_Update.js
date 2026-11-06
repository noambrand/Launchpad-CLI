// When an agent is selected, a copy npm installed is brought up to the newest version, a copy installed any
// other way is left alone, and a failed update keeps the working copy (Noam, 2026-11-07, replacing Q5's
// "use it if new enough"). Real npm against fake-npm-registry.js: nothing is downloaded from the internet,
// and no real Codex or Copilot is touched.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const codexFx = require('./codex-fixture'), copilotFx = require('./copilot-fixture');
const CC = require(path.join(codexFx.SOURCE, 'configure-codex.js'));

const NATIVE = 'vendor/x86_64-pc-windows-msvc/bin/codex.exe';
function codexVersion(v, hasWindowsPackage) {
  const out = { bin: { codex: 'bin/codex.js' }, files: { 'bin/codex.js': `if (process.argv.includes('--version')) console.log('codex-cli ${v}');\n` } };
  if (hasWindowsPackage) out.optionalDependencies = { '@openai/codex-win32-x64': `npm:@openai/codex@${v}-win32-x64` };
  return out;
}
const codexWindowsPackage = () => ({ files: { [NATIVE]: 'not a real program' } });
function copilotVersion(v) {
  return { bin: { copilot: 'npm-loader.js' }, files: { 'npm-loader.js': `if (process.argv.includes('--version')) console.log('GitHub Copilot CLI ${v}.');\n` } };
}

// The registries: Codex's "latest" (0.168.0) has no Windows package yet, as really happens. Copilot's 1.0.108
// is newer than its "latest", as a copy that updated itself can be.
const AGENTS = [
  { tag: 'Codex', fx: codexFx, mode: 'install-codex', failCode: 5, pkg: '@openai/codex', noCopy: { fakeCodex: false }, label: 'Codex', cache: 'kivun-codex-path.txt',
    below: '0.150.0', old: '0.166.0', newest: '0.167.0', newer: '0.168.0', exeLine: v => `codex-cli ${v}`, exeName: 'codex',
    registry: { latest: '0.168.0', versions: {
      '0.150.0': codexVersion('0.150.0', true), '0.150.0-win32-x64': codexWindowsPackage(),
      '0.166.0': codexVersion('0.166.0', true), '0.166.0-win32-x64': codexWindowsPackage(),
      '0.167.0': codexVersion('0.167.0', true), '0.167.0-win32-x64': codexWindowsPackage(),
      '0.168.0': codexVersion('0.168.0', false),
    } } },
  { tag: 'Copilot', fx: copilotFx, mode: 'install-copilot', failCode: 6, pkg: '@github/copilot', noCopy: { fakeCopilot: false }, label: 'GitHub Copilot', cache: 'kivun-copilot-path.txt',
    below: '1.0.65', old: '1.0.105', newest: '1.0.107', newer: '1.0.108', exeLine: v => `GitHub Copilot CLI ${v}.`, exeName: 'copilot',
    registry: { latest: '1.0.107', versions: {
      '1.0.65': copilotVersion('1.0.65'), '1.0.105': copilotVersion('1.0.105'), '1.0.107': copilotVersion('1.0.107'), '1.0.108': copilotVersion('1.0.108'),
    } } },
];
const LONG = { timeout: 240000 };
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- the registry's process
const RUN = path.join(codexFx.ROOT, 'agent-update');
const specFile = path.join(RUN, 'spec.json'), portFile = path.join(RUN, 'port.txt'), requestLog = path.join(RUN, 'requests.txt');
let server, registryUrl;
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function setRegistry(change) {
  const packages = {};
  for (const a of AGENTS) packages[a.pkg] = JSON.parse(JSON.stringify(a.registry));
  if (change) change(packages);
  fs.writeFileSync(specFile, JSON.stringify({ packages }));
}
const requests = () => fs.readFileSync(requestLog, 'utf8').split('\n').filter(Boolean);
const downloads = () => requests().filter(u => u.startsWith('/tarball/'));

test.before(() => {
  codexFx.rmrf(RUN);
  fs.mkdirSync(RUN, { recursive: true });
  setRegistry();
  fs.writeFileSync(requestLog, '');
  server = cp.spawn(process.execPath, [path.join(__dirname, 'fake-npm-registry.js'), specFile, portFile, requestLog], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) pause(100);
  registryUrl = 'http://127.0.0.1:' + fs.readFileSync(portFile, 'utf8').trim() + '/';
});
test.after(() => { server.kill(); });
test.beforeEach(() => { setRegistry(); });

// ---------------------------------------------------------------- helpers
function net(d, registry) {
  const cache = path.join(d.root, 'npm-cache');
  fs.mkdirSync(cache, { recursive: true });
  return { npm_config_registry: registry || registryUrl, npm_config_fetch_retries: '0', npm_config_fetch_timeout: '5000', npm_config_update_notifier: 'false',
    npm_config_cache: cache, APPDATA: path.join(d.root, 'appdata'), KIVUN_LOG: path.join(d.kivun, 'install-log.txt') };
}
const CLOSED = 'http://127.0.0.1:9/';

// A copy really installed by npm, from the registry, the way a user's copy got there.
function withNpmCopy(a, name, version) {
  const d = a.fx.makeEnv('upd-' + name, a.noCopy);
  const env = Object.assign({}, d.env, net(d));
  const r = CC.npm(env, CC.npmCommand(env), ['install', '-g', '--prefix', d.prefix, a.pkg + '@' + version, '--no-fund', '--no-audit']);
  assert.strictEqual(r.status, 0, 'setup: npm install ' + version + ' ' + r.stdout + r.stderr);
  assert.strictEqual(versionInPrefix(a, d.prefix), version, 'setup');
  fs.writeFileSync(requestLog, '');
  return d;
}
function versionInPrefix(a, prefix) {
  return JSON.parse(fs.readFileSync(path.join(prefix, 'node_modules', ...a.pkg.split('/'), 'package.json'), 'utf8')).version;
}
function fakeExe(a, dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(dir, a.exeName + '.cs');
  fs.writeFileSync(src, `class P { static int Main(string[] a) { if (a.Length > 0 && a[0] == "--version") System.Console.WriteLine("${a.exeLine(version)}"); return 0; } }`);
  const csc = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const r = cp.spawnSync(csc, ['/nologo', '/out:' + path.join(dir, a.exeName + '.exe'), src], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0, r.stdout);
}
function committedVersion(a, d, env) {
  const r = a.fx.cli(d, ['commit'], env, LONG);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return JSON.parse(fs.readFileSync(path.join(d.kivun, a.cache), 'utf8')).version;
}

// ---------------------------------------------------------------- both agents, the same rules
for (const a of AGENTS) {
  test(`UT_AgentUpdate_${a.tag}_BehindIsUpdated: a copy npm installed moves to the newest version, in its own folder`, () => {
    const d = withNpmCopy(a, a.exeName + '-behind', a.old);
    const r = a.fx.cli(d, [a.mode], net(d), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(versionInPrefix(a, d.prefix), a.newest, r.stdout);
    assert.match(r.stdout, new RegExp('from ' + escape(a.old) + ' to ' + escape(a.newest)), 'says what it is about to download');
    assert.strictEqual(committedVersion(a, d, net(d)), a.newest, 'and that is the copy Launchpad then uses');
  });

  test(`UT_AgentUpdate_${a.tag}_UpToDate: the newest version already here: nothing is downloaded`, () => {
    const d = withNpmCopy(a, a.exeName + '-current', a.newest);
    const r = a.fx.cli(d, [a.mode], net(d), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(escape(a.label + ' ' + a.newest) + ' is already installed'));
    assert.deepStrictEqual(downloads(), []);
  });

  test(`UT_AgentUpdate_${a.tag}_NewerIsNotDowngraded: a copy newer than what the registry offers stays`, () => {
    const d = withNpmCopy(a, a.exeName + '-newer', a.newer);
    const r = a.fx.cli(d, [a.mode], net(d), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(versionInPrefix(a, d.prefix), a.newer);
    assert.deepStrictEqual(downloads(), []);
  });

  test(`UT_AgentUpdate_${a.tag}_RegistryDown: no way to check: the working copy is kept, and the install succeeds`, () => {
    const d = withNpmCopy(a, a.exeName + '-down', a.old);
    const r = a.fx.cli(d, [a.mode], net(d, CLOSED), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /couldn't check for a newer version/);
    assert.strictEqual(versionInPrefix(a, d.prefix), a.old);
    assert.strictEqual(committedVersion(a, d, net(d, CLOSED)), a.old);
  });

  test(`UT_AgentUpdate_${a.tag}_UpdateFails: a failed download keeps the working copy, and the install succeeds`, () => {
    const d = withNpmCopy(a, a.exeName + '-fail', a.old);
    setRegistry(packages => { packages[a.pkg].versions[a.newest].broken = true; });
    const r = a.fx.cli(d, [a.mode], net(d), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp("couldn't be updated.*" + escape(a.old)), 'says so, and names what stays');
    assert.ok(downloads().length > 0, 'it did try');
    assert.strictEqual(versionInPrefix(a, d.prefix), a.old);
    assert.strictEqual(committedVersion(a, d, net(d)), a.old);
  });

  test(`UT_AgentUpdate_${a.tag}_StandaloneLeftAlone: a copy installed another way: npm is never asked`, () => {
    const d = a.fx.makeEnv('upd-' + a.exeName + '-exe', a.noCopy);
    const exeDir = path.join(d.root, 'standalone');
    fakeExe(a, exeDir, a.old);
    fs.writeFileSync(requestLog, '');
    const r = a.fx.cli(d, [a.mode], Object.assign(net(d), { PATH: exeDir + ';' + d.env.PATH }), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(escape(a.label + ' ' + a.old) + ' is already installed'));
    assert.deepStrictEqual(requests(), []);
    assert.ok(!fs.existsSync(path.join(d.root, 'appdata', 'npm', 'node_modules')), 'no second copy');
  });

  test(`UT_AgentUpdate_${a.tag}_StandaloneComesFirst: the copy that runs is the stand-alone one, so npm's copy isn't touched`, () => {
    const d = withNpmCopy(a, a.exeName + '-both', a.old);
    const exeDir = path.join(d.root, 'standalone');
    fakeExe(a, exeDir, a.old);
    const r = a.fx.cli(d, [a.mode], Object.assign(net(d), { PATH: exeDir + ';' + d.env.PATH }), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(versionInPrefix(a, d.prefix), a.old);
    assert.deepStrictEqual(downloads(), []);
  });

  test(`UT_AgentUpdate_${a.tag}_Fresh: no copy at all: the newest version is installed`, () => {
    const d = a.fx.makeEnv('upd-' + a.exeName + '-fresh', a.noCopy);
    const env = net(d);
    const r = a.fx.cli(d, [a.mode], env, LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.strictEqual(versionInPrefix(a, path.join(env.APPDATA, 'npm')), a.newest, r.stdout);
  });

  test(`UT_AgentUpdate_${a.tag}_BelowMinimum: a copy npm installed below the minimum is announced and updated`, () => {
    const d = withNpmCopy(a, a.exeName + '-below', a.below);
    const r = a.fx.cli(d, [a.mode], net(d), LONG);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(escape(a.label + ' ' + a.below) + ' is older than .* Launchpad will update it now'));
    assert.strictEqual(versionInPrefix(a, d.prefix), a.newest);
  });
}

// ---------------------------------------------------------------- an old Node, Copilot only
test('UT_AgentUpdate_Copilot_OldNodeSaysHow: Node below 22: the message gives the exact command, and nothing is downloaded', () => {
  const a = AGENTS[1];
  const d = copilotFx.makeEnv('upd-oldnode', { fakeCopilot: false, nodeVersion: 'v20.11.0' });
  fs.writeFileSync(requestLog, '');
  const r = copilotFx.cli(d, [a.mode], net(d), LONG);
  assert.strictEqual(r.status, a.failCode, r.stdout + r.stderr);
  assert.match(r.stdout, /winget install OpenJS\.NodeJS\.LTS/);
  assert.deepStrictEqual(downloads(), []);
});
