// The real launcher on the Codex path with the folders, ids and config states found by the
// independent review of the v3.3.0 build (acceptance A40, A45, A49), end to end and hidden,
// like UT_Launcher_Codex.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ch = require('./launcher/codex-harness');
const h = require('./launcher/harness');
const fx = require('./codex-fixture');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };

test('UT_Launch_DriveRootAndTrailingBackslash: A40, a drive root or a folder ending in \\ opens Codex there', () => {
  const root = (process.env.SystemDrive || 'C:') + '\\';
  const cases = [['drive-root', () => root, () => root], ['trailing-backslash', d => folder(d, 'proj') + '\\', d => path.join(d.work, 'proj')]];
  for (const [label, arg, want] of cases) {
    let sb;
    const r = ch.runCodexCase({ id: 'L20-' + label, setup: d => { sb = d; cfg(d, 'AGENT=codex\r\n'); }, args: d => [arg(d)] });
    assert.strictEqual(r.codexRuns.length, 1, label);
    assert.strictEqual(r.codexRuns[0].cwd, want(sb), label);
  }
});

test('UT_Launch_FolderReadOnce: A40, the launcher never expands a %NAME% in the folder a second time', () => {
  // Windows passes the folder through one cmd before the launcher starts, which already expands
  // the variables of the user's environment. TERMINAL_COLOR is not one of them: the launcher sets
  // it itself, so only a second reading inside the launcher could expand it.
  let p;
  const r = ch.runCodexCase({ id: 'L21-percent', setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [p = folder(d, 'x %TERMINAL_COLOR% y')] });
  assert.strictEqual(r.codexRuns.length, 1);
  assert.strictEqual(r.codexRuns[0].cwd, p);
});

test('UT_Launch_Phase2NeedsValidId: A45, the tab step with no id or a bad id deletes nothing and starts nothing', () => {
  let other;
  const r0 = ch.runCodexCase({ id: 'L22-phase2id', skipPhase2: true, input: '\r\n', setup: d => {
    cfg(d);
    other = ch.codexModule(d).createLaunch({ agent: 'codex', workdir: folder(d, 'proj') }, d.env);   // another tab's launch
  }, args: () => ['LAUNCH', 'not-an-id'] });
  const d = r0.d, bat = path.join(d.kivun, 'claudecode-launchpad.bat');
  for (const args of [['--run-codex'], ['--run-codex', ''], ['--run-codex', '..'], ['--run-codex', 'ABC']]) {
    h.runBat(bat, args, { cwd: d.user, env: d.env, input: '\r\nexit\r\n' });
    assert.ok(fs.existsSync(path.join(d.kivun, 'launch', other)), JSON.stringify(args) + ": another tab's launch folder is kept");
    assert.ok(fs.existsSync(path.join(d.kivun, 'config.txt')), JSON.stringify(args) + ': config.txt is kept');
  }
  assert.strictEqual(fx.records({ log: d.codexLog }).filter(x => !x.args.includes('--version')).length, 0, 'Codex never started');
});

test('UT_Launch_EmptyConfigNoGuess: A49, config.txt left empty on a Codex PC gives a message, not a guessed agent', () => {
  const r = ch.runCodexCase({ id: 'L23-empty', skipPhase2: true, input: '\r\n', setup: d => {
    fs.writeFileSync(path.join(d.kivun, 'config.txt'), '');
    fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');
  }, args: d => [folder(d, 'proj')] });
  assert.ok(!r.standIns.some(s => s.name === 'claude' || s.name === 'wt'), 'neither agent started, no tab opened');
  assert.strictEqual(r.codexRuns.length, 0);
});

test('UT_Launch_EmptyConfigClaudeOnly: A49, a Claude-only PC with an empty config.txt starts Claude, as v3.2.2 does', () => {
  const r = ch.runCodexCase({ id: 'L24-empty-claude', setup: d => fs.writeFileSync(path.join(d.kivun, 'config.txt'), ''), args: d => [folder(d, 'proj')] });
  assert.ok(r.standIns.some(s => s.name === 'claude'));
  assert.strictEqual(r.codexRuns.length, 0);
});

test('UT_Launch_ConfigBeingRewritten: A49, a right-click waits for the config.txt the picker is rewriting', () => {
  let p;
  const r = ch.runCodexCase({ id: 'L25-rewrite', setup: d => {
    const f = path.join(d.kivun, 'config.txt');
    fs.writeFileSync(f, '');
    cp.spawn(process.execPath, ['-e', 'setTimeout(() => require("fs").writeFileSync(' + JSON.stringify(f) + ', "RESPONSE_LANGUAGE=english\\r\\nAGENT=codex\\r\\n"), 1500)'], { stdio: 'ignore', windowsHide: true });
  }, args: d => [p = folder(d, 'proj')] });
  assert.strictEqual(r.codexRuns.length, 1, 'Codex, as the finished file says');
  assert.strictEqual(r.codexRuns[0].cwd, p);
});
