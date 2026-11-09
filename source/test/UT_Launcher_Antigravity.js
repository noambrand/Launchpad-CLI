// The real launcher (claudecode-launchpad.bat) on the Antigravity path, end to end and hidden. Most cases
// run without Windows Terminal, so they need no compiled wt.exe stand-in. Two use it, for the new tab.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ch = require('./launcher/antigravity-harness');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };
const real = p => fs.realpathSync.native(p);
const pickerLaunch = (d, data) => ch.antigravityModule().createLaunch(Object.assign({ agent: 'antigravity' }, data), d.env);
const LEGACY = ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt'];
const run = c => ch.runAntigravityCase(Object.assign({ mode: 'fallback', input: 'exit\r\n' }, c));
const nothingElse = (r, label) => {
  assert.strictEqual(r.claudeIn, null, label);
  assert.deepStrictEqual(r.codexRuns, [], label);
  assert.deepStrictEqual(r.copilotRuns, [], label);
};

test('UT_LauncherAntigravity_RightClick: OPEN-ANTIGRAVITY starts agy in the folder, whatever AGENT says', () => {
  for (const [label, config] of [['claude', 'AGENT=claude\r\n'], ['none', ''], ['codex', 'AGENT=codex\r\n'], ['copilot', 'AGENT=copilot\r\n'], ['agy', 'AGENT=antigravity\r\n']]) {
    let p;
    const r = run({ id: 'AG01-' + label, setup: d => cfg(d, config), args: d => ['OPEN-ANTIGRAVITY', p = folder(d, 'proj')] });
    assert.strictEqual(r.agyRuns.length, 1, label);
    assert.strictEqual(r.agyRuns[0].cwd, real(p), label);
    nothingElse(r, label);
  }
});

test('UT_LauncherAntigravity_OtherEntries: with AGENT=antigravity, the Claude, Codex and Copilot entries still start their own agent', () => {
  let p;
  const cl = run({ id: 'AG02-claude', setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => ['OPEN-CLAUDE', p = folder(d, 'proj')] });
  assert.strictEqual(cl.claudeIn, p);
  assert.deepStrictEqual(cl.agyRuns, []);
  const cx = run({ id: 'AG02-codex', setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => ['OPEN-CODEX', p = folder(d, 'proj')] });
  assert.deepStrictEqual(cx.codexRuns.map(x => x.cwd), [p]);
  assert.deepStrictEqual(cx.agyRuns, []);
  const cp = run({ id: 'AG02-copilot', setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => ['OPEN-COPILOT', p = folder(d, 'proj')] });
  assert.deepStrictEqual(cp.copilotRuns.map(x => x.cwd), [p]);
  assert.deepStrictEqual(cp.agyRuns, []);
});

test('UT_LauncherAntigravity_SendToFollowsAgent: a folder alone follows AGENT; Claude and Copilot configs never reach agy', () => {
  let p;
  const ag = run({ id: 'AG03-agy', setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.deepStrictEqual(ag.agyRuns.map(x => x.cwd), [real(p)]);
  nothingElse(ag, 'agy');
  const cl = run({ id: 'AG03-claude', setup: d => cfg(d), args: d => [p = folder(d, 'proj')] });
  assert.strictEqual(cl.claudeIn, p);
  assert.deepStrictEqual(cl.agyRuns, []);
  const cp = run({ id: 'AG03-copilot', setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.deepStrictEqual(cp.copilotRuns.map(x => x.cwd), [p]);
  assert.deepStrictEqual(cp.agyRuns, []);
});

test('UT_LauncherAntigravity_ReadfileIsClaude: a Claude picker launch starts Claude even when AGENT=antigravity', () => {
  let p;
  const r = run({ id: 'AG04-readfile', setup: d => { cfg(d, 'AGENT=antigravity\r\n'); fs.writeFileSync(path.join(d.kivun, 'kivun-workdir.txt'), p = folder(d, 'proj')); }, args: () => ['READFILE'] });
  assert.strictEqual(r.claudeIn, p);
  assert.deepStrictEqual(r.agyRuns, []);
});

test('UT_LauncherAntigravity_PickerLaunch: LAUNCH-ANTIGRAVITY <id> carries the picker choices, with the text exact', () => {
  let id, p;
  const text = 'He said "go" & 50% done! ^ (now) שלום';
  const r = run({ id: 'AG05-picker', setup: d => { cfg(d); p = folder(d, 'proj'); id = pickerLaunch(d, { workdir: p, model: 'gem-a', startup: [text], env: { MY_PROFILE_VAR: 'v' } }); }, args: () => ['LAUNCH-ANTIGRAVITY', id] });
  assert.strictEqual(r.agyRuns.length, 1);
  const a = r.agyRuns[0].args;
  assert.strictEqual(a[a.indexOf('--model') + 1], 'gem-a');
  assert.deepStrictEqual(a.slice(-2), ['-i', text]);
  assert.strictEqual(r.agyRuns[0].cwd, real(p));
  assert.strictEqual(r.agyRuns[0].env.MY_PROFILE_VAR, 'v');
  nothingElse(r, 'picker');
});

test('UT_LauncherAntigravity_FolderNames: ! % ^ & ( ) and Hebrew reach agy exactly, and a trailing backslash is dropped', () => {
  for (const [i, name] of ['a!b', '50% off', 'x & y', 'c^d', '(paren)', 'פרויקט בעברית'].entries()) {
    let p;
    const r = run({ id: 'AG06-' + i, setup: d => cfg(d), args: d => ['OPEN-ANTIGRAVITY', p = folder(d, name)] });
    assert.deepStrictEqual(r.agyRuns.map(x => x.cwd), [real(p)], name);
  }
  let p;
  const r = run({ id: 'AG06-slash', setup: d => cfg(d), args: d => { p = folder(d, 'proj'); return ['OPEN-ANTIGRAVITY', p + '\\']; } });
  assert.deepStrictEqual(r.agyRuns.map(x => x.cwd), [real(p)]);
});

test('UT_LauncherAntigravity_ClaudeUntouched: an Antigravity launch never touches Claude hand-off files or config.txt', () => {
  let id;
  const r = run({ id: 'AG07-isolation', setup: d => {
    cfg(d);
    for (const n of LEGACY) fs.writeFileSync(path.join(d.kivun, n), 'claude data ' + n);
    id = pickerLaunch(d, { workdir: folder(d, 'proj') });
  }, args: () => ['LAUNCH-ANTIGRAVITY', id] });
  assert.strictEqual(r.agyRuns.length, 1);
  for (const n of LEGACY) assert.strictEqual(fs.readFileSync(path.join(r.d.kivun, n), 'utf8'), 'claude data ' + n, n);
  assert.match(fs.readFileSync(path.join(r.d.kivun, 'config.txt'), 'utf8'), /^RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n$/);
});

test('UT_LauncherAntigravity_ClaudeLaunchLeavesAgyAlone: a Claude launch never starts agy nor creates its files', () => {
  let p;
  const r = run({ id: 'AG08-claude', setup: d => cfg(d), args: d => ['OPEN-CLAUDE', p = folder(d, 'proj')] });
  assert.strictEqual(r.claudeIn, p);
  assert.deepStrictEqual(r.agyRuns, []);
  assert.deepStrictEqual(r.launches, []);
  assert.strictEqual(fs.existsSync(path.join(r.d.kivun, 'kivun-antigravity-path.txt')), false);
});

test('UT_LauncherAntigravity_SessionEnd: the launch folder is removed when the session ends; typing agy relaunches', () => {
  let id;
  const r = run({ id: 'AG09-end', input: 'exit 43\r\nexit\r\n', setup: d => { cfg(d); id = pickerLaunch(d, { workdir: folder(d, 'proj'), startup: ['hello'] }); }, args: () => ['LAUNCH-ANTIGRAVITY', id] });
  assert.strictEqual(r.agyRuns.length, 2, 'first start and one relaunch');
  assert.deepStrictEqual(r.agyRuns[0].args.slice(-2), ['-i', 'hello']);
  assert.ok(!r.agyRuns[1].args.includes('hello'), 'relaunch has no startup text');
  assert.deepStrictEqual(r.launches, [], 'launch folder removed');
});

test('UT_LauncherAntigravity_BadId: anything but a 32-character lowercase hex id stops before agy', () => {
  for (const bad of ['ABC', '..\\x', 'g'.repeat(32), 'a'.repeat(31)]) {
    const r = run({ id: 'AG10-badid', input: '\r\n', setup: d => cfg(d), args: () => ['LAUNCH-ANTIGRAVITY', bad] });
    assert.deepStrictEqual(r.agyRuns, [], bad);
    assert.strictEqual(r.claudeIn, null, bad);
    assert.match(r.p1.stdout, /could not prepare Antigravity CLI/, bad);
  }
});

test('UT_LauncherAntigravity_BadIdPhase2: --run-antigravity with a bad id stops before agy', () => {
  const r = run({ id: 'AG11-badrun', input: '\r\n', setup: d => cfg(d), args: () => ['--run-antigravity', '..\\x'] });
  assert.deepStrictEqual(r.agyRuns, []);
  assert.match(r.p1.stdout, /could not prepare Antigravity CLI/);
});

test('UT_LauncherAntigravity_RunPhase2: --run-antigravity <id> runs agy with that launch', () => {
  let id, p;
  const r = run({ id: 'AG12-phase2', setup: d => { cfg(d); p = folder(d, 'proj'); id = pickerLaunch(d, { workdir: p }); }, args: () => ['--run-antigravity', id] });
  assert.deepStrictEqual(r.agyRuns.map(x => x.cwd), [real(p)]);
  nothingElse(r, 'phase2');
});

test('UT_LauncherAntigravity_NotInstalled: a message in the tab, and never a silent switch to Claude', () => {
  const r = run({ id: 'AG13-none', agy: false, setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => [folder(d, 'proj')] });
  assert.deepStrictEqual(r.agyRuns, []);
  assert.strictEqual(r.claudeIn, null);
  assert.match(r.p1.stdout, /Antigravity was not found/);
});

test('UT_LauncherAntigravity_MissingFolder: an unreachable folder gets a plain message, and agy is not started', () => {
  let id;
  const r = run({ id: 'AG14-missing', input: '\r\n', setup: d => { cfg(d); id = pickerLaunch(d, { workdir: path.join(d.work, 'gone') }); }, args: () => ['LAUNCH-ANTIGRAVITY', id] });
  assert.deepStrictEqual(r.agyRuns, []);
  assert.match(r.p1.stdout, /Antigravity was NOT started/);
});

test('UT_LauncherAntigravity_EmptyConfig: an Antigravity PC whose settings file is empty says so instead of guessing', () => {
  const r = run({ id: 'AG15-empty', input: '\r\n', setup: d => { fs.writeFileSync(path.join(d.kivun, 'config.txt'), ''); fs.writeFileSync(path.join(d.kivun, 'kivun-antigravity-path.txt'), '{}'); }, args: d => [folder(d, 'proj')] });
  assert.deepStrictEqual(r.agyRuns, []);
  assert.strictEqual(r.claudeIn, null);
  assert.match(r.p1.stdout, /settings file is empty/);
});

test('UT_LauncherAntigravity_Tab: with Windows Terminal, the tab is named for the folder and phase 2 is --run-antigravity <id>', () => {
  let p;
  const r = ch.runAntigravityCase({ id: 'AG16-tab', input: 'exit\r\n', setup: d => cfg(d, 'AGENT=antigravity\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.ok(r.wt, 'a tab was requested');
  assert.deepStrictEqual(r.wt.args.slice(r.wt.args.indexOf('--title'), r.wt.args.indexOf('--title') + 2), ['--title', 'proj']);
  assert.strictEqual(r.phase2.command[1], '--run-antigravity');
  assert.match(r.phase2.command[2], /^[0-9a-f]{32}$/);
  assert.deepStrictEqual(r.agyRuns.map(x => x.cwd), [real(p)]);
});

test('UT_LauncherAntigravity_MissingFolderTab: with Windows Terminal, the message opens in its own tab', () => {
  let id;
  const r = ch.runAntigravityCase({ id: 'AG17-missingtab', skipPhase2: true, setup: d => { cfg(d); id = pickerLaunch(d, { workdir: path.join(d.work, 'gone') }); }, args: () => ['LAUNCH-ANTIGRAVITY', id] });
  assert.deepStrictEqual(r.agyRuns, []);
  assert.ok(r.wt.args.includes('Folder not found'));
  assert.ok(r.wt.args.some(a => /configure-antigravity\.js/.test(a)));
});
