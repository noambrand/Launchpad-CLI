// Handout items with no test of their own: 9.1 (UT_Install_Repair, UT_FlagsQuoting) and 9.2 (the
// Claude watcher stays off for Codex, no Codex folder on Claude's PATH). Acceptance A9, A26, A38.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./codex-fixture');
const h = require('./launcher/harness');
const ch = require('./launcher/codex-harness');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };

test('UT_Launch_NoWatcher_Codex: AUTO_CONTINUE=true starts the watcher for Claude and never for Codex', () => {
  const watcherCalls = r => { fx.sleep(1500); return h.readStubs(r.d.stubs).filter(s => s.stub === 'auto-continue.js'); }; // detached stubs finish writing
  const claude = ch.runCodexCase({ id: 'G01-watcher-claude', setup: d => cfg(d, 'AGENT=claude\r\nAUTO_CONTINUE=true\r\n'), args: d => [folder(d, 'proj')] });
  assert.strictEqual(watcherCalls(claude).length, 1, 'control: the check sees Claude\'s watcher');
  const codex = ch.runCodexCase({ id: 'G02-watcher-codex', setup: d => cfg(d, 'AGENT=codex\r\nAUTO_CONTINUE=true\r\n'), args: d => [folder(d, 'proj')] });
  assert.strictEqual(codex.codexRuns.length, 1, 'Codex started');
  assert.deepStrictEqual(watcherCalls(codex), []);
});

test('UT_Launch_ClaudePathNoCodex: a PC with Codex set up gives Claude the same PATH as one without', () => {
  const NATIVE_DIR = 'C:\\CodexOnlyFolder';
  const claudePath = withCodex => {
    const r = ch.runCodexCase({ id: 'G03-claude-path', setup: d => {
      cfg(d);
      fs.writeFileSync(path.join(d.kivun, 'kivun-workdir.txt'), folder(d, 'proj'));
      if (withCodex) fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), JSON.stringify({ nativeExe: NATIVE_DIR + '\\codex.exe' }));
    }, args: () => ['READFILE'] });
    const claude = r.standIns.find(s => s.name === 'claude');
    assert.ok(claude, 'Claude started');
    return claude.env[Object.keys(claude.env).find(k => k.toUpperCase() === 'PATH')];
  };
  const without = claudePath(false), withIt = claudePath(true);
  assert.ok(!withIt.includes(NATIVE_DIR));
  assert.strictEqual(withIt, without);
});

test('UT_Install_Repair: a failed install changes nothing, and a rerun once Codex is available finishes it', () => {
  const d = fx.makeEnv('repair', { fakeCodex: false });
  const cfgFile = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(cfgFile, 'RESPONSE_LANGUAGE=english\r\n');
  const cache = path.join(d.root, 'npm-cache');
  fs.mkdirSync(cache, { recursive: true });
  const offline = { npm_config_registry: 'http://127.0.0.1:9/', npm_config_fetch_retries: '0', npm_config_fetch_timeout: '3000', npm_config_cache: cache, APPDATA: path.join(d.root, 'appdata') };

  assert.strictEqual(fx.cli(d, ['install-codex'], offline).status, 5);
  assert.strictEqual(fx.cli(d, ['commit'], offline).status, 5);
  assert.strictEqual(fs.readFileSync(cfgFile, 'utf8'), 'RESPONSE_LANGUAGE=english\r\n', 'AGENT not written');
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-codex-path.txt')), 'no false "installed"');

  const repaired = Object.assign({}, offline, { PATH: fx.makeEnv('repair-src').prefix + ';' + d.env.PATH });
  assert.strictEqual(fx.cli(d, ['install-codex'], repaired).status, 0);
  assert.strictEqual(fx.cli(d, ['commit'], repaired).status, 0);
  assert.match(fs.readFileSync(cfgFile, 'utf8'), /^RESPONSE_LANGUAGE=english\r\nAGENT=codex\r\n$/);
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-codex-path.txt')));
});

test('UT_FlagsQuoting: quoted options, paths, cmd characters and Hebrew reach Codex as one exact argument each', () => {
  const cc = fx.load();
  const r = cc.compose({ customFlags: '--add-dir "D:\\פרויקט שלי\\my docs" -c "note=50% & !y! ^z" --search' });
  assert.deepStrictEqual(r.args, ['--add-dir', 'D:\\פרויקט שלי\\my docs', '-c', 'note=50% & !y! ^z', '--search']);
  assert.deepStrictEqual(r.errors, []);
  const bad = cc.compose({ customFlags: '--add-dir "D:\\open' });
  assert.deepStrictEqual(bad.args, []);
  assert.strictEqual(bad.errors.length, 1, 'an unclosed quote is reported, not guessed at');
});
