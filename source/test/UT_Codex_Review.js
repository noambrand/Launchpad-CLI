// configure-codex.js cases found by the independent review of the v3.3.0 build (acceptance A41,
// A42, A43, A47, A48), run against the real module with the fake npm Codex of codex-fixture.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./codex-fixture');

function launch(d, data) { return fx.load().createLaunch(Object.assign({ agent: 'codex', workdir: d.work }, data), d.env); }
const starts = d => fx.records(d).filter(r => !r.args.includes('--version') && !r.args.includes('models') && !r.args.includes('prompt-input'));
const checks = d => fx.records(d).filter(r => r.args.includes('prompt-input')).length;
const versionCalls = d => fx.records(d).filter(r => r.args.includes('--version')).length;

test('UT_Commit_FreshPcOldPath: A41, commit finds the new Codex although the installer\'s PATH predates Node', () => {
  const d = fx.makeEnv('rv-oldpath');
  const cfg = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(cfg, 'RESPONSE_LANGUAGE=english\r\n');
  const appdata = path.join(d.root, 'appdata');
  fs.mkdirSync(appdata);
  // Neither node, npm nor codex is on this PATH; npm itself knows where it installed Codex.
  const r = fx.cli(d, ['commit'], { PATH: path.join(d.env.SystemRoot, 'System32'), APPDATA: appdata, npm_config_prefix: d.prefix });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(cfg, 'utf8'), /^AGENT=codex\r$/m);
});

test('UT_StatusLine_TuiDottedOrInlineLeftAlone: A43, a [tui] header would break such a file, so nothing is added', () => {
  const cc = fx.load();
  for (const text of ['tui.notifications = true\n', '"tui".theme = "x"\r\nmodel = "m"\r\n', 'tui = { theme = "x" }\n',
    '\uFEFFtui.animations = false\n', 'model = "m"\ntui . animations = false\n[profiles.a]\nmodel = "z"\n']) {
    const r = cc.ensureStatusLine(text);
    assert.strictEqual(r.added, null, JSON.stringify(text));
    assert.strictEqual(r.text, text, JSON.stringify(text));
  }
  // A dotted tui key inside another table belongs to that table: our [tui] is still added.
  assert.ok(cc.ensureStatusLine('[profiles.a]\ntui.theme = "x"\n').added);
  // Through install: config.toml stays byte-identical and the sound hooks are still added.
  const d = fx.makeEnv('rv-tui');
  const file = path.join(d.codexHome, 'config.toml');
  fs.writeFileSync(file, 'tui.notifications = true\r\n');
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'tui.notifications = true\r\n');
  assert.ok(fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8').includes('play.js'));
});

test('UT_Run_RefusedOptionsStopLaunch: A42, Codex is not started without an option the user asked for', () => {
  const cases = [
    ['CODEX_FLAGS', '-s read-only --add-dir "D:\\data', /quote mark/],
    ['custom', 'resume --last', /continue last/],
    ['custom', '-s read-only --yolo', /does not start Codex with --yolo/],
    ['custom', '-a untrusted', /approval option/],
    ['custom', '-m a --model b', /model more than once/],
  ];
  cases.forEach(([where, flags, re], i) => {
    const d = fx.makeEnv('rv-refuse-' + i);
    fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n' + (where === 'CODEX_FLAGS' ? 'CODEX_FLAGS=' + flags + '\r\n' : ''));
    const r = fx.cli(d, ['run', launch(d, where === 'custom' ? { customFlags: flags } : {})]);
    assert.notStrictEqual(r.status, 0, flags);
    assert.match(r.stdout, re, flags);
    assert.match(r.stdout, /Codex was not started/, flags);
    assert.strictEqual(starts(d).length, 0, flags + ': Codex must not start');
  });
});

test('UT_Run_BadStartupTextOnlyDropped: A42, an invalid startup message is left out and Codex starts', () => {
  const d = fx.makeEnv('rv-startup');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nCODEX_STARTUP_CMD=/init\r\n');
  const id = fx.cli(d, ['prepare', d.work]).stdout.trim();
  const r = fx.cli(d, ['run', id]);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /can't run commands at startup/);
  assert.deepStrictEqual(starts(d).pop().args, fx.withDaemonFlag(d, []));
});

test('UT_Language_UnclearAnswerNotKept: A47, a failed check is tried again at the next launch', () => {
  const d = fx.makeEnv('rv-lang-retry');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  const id = launch(d, {});
  const LINE = "developer_instructions='''Always respond in Hebrew.'''";
  let out = JSON.parse(fx.cli(d, ['compose', id], { FAKE_PROMPT_INPUT: 'not json' }).stdout);
  assert.ok(!out.args.includes(LINE), 'unclear answer: the line is skipped this time');
  out = JSON.parse(fx.cli(d, ['compose', id]).stdout);
  assert.ok(out.args.includes(LINE), 'the next launch checks again and adds the line');
  assert.strictEqual(checks(d), 2);
});

test('UT_Language_CachePerFolder: A47, two folders used in turn keep their own remembered answer', () => {
  const d = fx.makeEnv('rv-lang-two');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  const w2 = path.join(d.root, 'w2');
  fs.mkdirSync(w2);
  const a = launch(d, {}), b = launch(d, { workdir: w2 });
  for (const id of [a, b, a, b]) fx.cli(d, ['compose', id]);
  assert.strictEqual(checks(d), 2, 'one check per folder');
});

test('UT_PathCache_PinnedPairLayout: A48, a Codex whose Windows package sits beside it is cached and trusted', () => {
  const d = fx.makeEnv('rv-pinned');
  const nested = path.join(d.prefix, 'node_modules', '@openai', 'codex', 'node_modules');
  const rel = path.join('@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin');
  const beside = path.join(d.prefix, 'node_modules', rel);
  fs.mkdirSync(beside, { recursive: true });
  fs.renameSync(path.join(nested, rel, 'codex.exe'), path.join(beside, 'codex.exe'));
  fx.rmrf(nested);
  assert.strictEqual(fx.cli(d, ['commit']).status, 0);
  const cache = JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), 'utf8'));
  assert.strictEqual(cache.nativeExe, path.join(beside, 'codex.exe'));
  assert.ok(cache.stamp, 'the cache records the file it checked');
  const before = versionCalls(d);
  assert.strictEqual(fx.cli(d, ['run', launch(d, {})]).status, 0);
  assert.strictEqual(versionCalls(d), before, 'cache trusted: no new version check');
});
