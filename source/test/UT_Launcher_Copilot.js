// The real launcher (claudecode-launchpad.bat) on the Copilot path, end to end and hidden. Most cases
// run without Windows Terminal, so they need no compiled stand-in. The two that check the new tab use
// the wt.exe stand-in, as the Codex cases do.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ch = require('./launcher/copilot-harness');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };
const pickerLaunch = (d, data) => ch.copilotModule().createLaunch(Object.assign({ agent: 'copilot' }, data), d.env);
const LEGACY = ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt'];
const run = c => ch.runCopilotCase(Object.assign({ mode: 'fallback', input: 'exit\r\n' }, c));

test('UT_LauncherCopilot_RightClick: OPEN-COPILOT starts Copilot in the folder, whatever AGENT says', () => {
  for (const [label, config] of [['claude', 'AGENT=claude\r\n'], ['none', ''], ['codex', 'AGENT=codex\r\n'], ['copilot', 'AGENT=copilot\r\n']]) {
    let p;
    const r = run({ id: 'CP01-' + label, setup: d => cfg(d, config), args: d => ['OPEN-COPILOT', p = folder(d, 'proj')] });
    assert.strictEqual(r.copilotRuns.length, 1, label);
    assert.strictEqual(r.copilotRuns[0].cwd, p, label);
    assert.strictEqual(r.claudeIn, null, label);
    assert.deepStrictEqual(r.codexRuns, [], label);
  }
});

test('UT_LauncherCopilot_OtherEntries: with AGENT=copilot, the Claude and Codex entries still start their own agent', () => {
  let p;
  const cl = run({ id: 'CP02-claude', setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => ['OPEN-CLAUDE', p = folder(d, 'proj')] });
  assert.strictEqual(cl.claudeIn, p);
  assert.deepStrictEqual(cl.copilotRuns, []);
  const cx = run({ id: 'CP02-codex', setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => ['OPEN-CODEX', p = folder(d, 'proj')] });
  assert.deepStrictEqual(cx.codexRuns.map(x => x.cwd), [p]);
  assert.deepStrictEqual(cx.copilotRuns, []);
});

test('UT_LauncherCopilot_SendToFollowsAgent: a folder alone follows AGENT, in all three directions', () => {
  let p;
  const cp = run({ id: 'CP03-copilot', setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.deepStrictEqual(cp.copilotRuns.map(x => x.cwd), [p]);
  const cl = run({ id: 'CP03-claude', setup: d => cfg(d), args: d => [p = folder(d, 'proj')] });
  assert.strictEqual(cl.claudeIn, p);
  assert.deepStrictEqual(cl.copilotRuns, []);
  const cx = run({ id: 'CP03-codex', setup: d => cfg(d, 'AGENT=codex\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.deepStrictEqual(cx.codexRuns.map(x => x.cwd), [p]);
  assert.deepStrictEqual(cx.copilotRuns, []);
});

test('UT_LauncherCopilot_ReadfileIsClaude: a Claude picker launch starts Claude even when AGENT=copilot', () => {
  let p;
  const r = run({ id: 'CP04-readfile', setup: d => { cfg(d, 'AGENT=copilot\r\n'); fs.writeFileSync(path.join(d.kivun, 'kivun-workdir.txt'), p = folder(d, 'proj')); }, args: () => ['READFILE'] });
  assert.strictEqual(r.claudeIn, p);
  assert.deepStrictEqual(r.copilotRuns, []);
});

test('UT_LauncherCopilot_PickerLaunch: LAUNCH-COPILOT <id> carries the picker\'s choices, with the text exact', () => {
  let id, p;
  const text = 'He said "go" & 50% done! ^ (now) שלום';
  const r = run({ id: 'CP05-picker', setup: d => { cfg(d); p = folder(d, 'proj'); id = pickerLaunch(d, { workdir: p, model: 'gpt-a', startup: [text], env: { MY_PROFILE_VAR: 'v' } }); }, args: () => ['LAUNCH-COPILOT', id] });
  assert.strictEqual(r.copilotRuns.length, 1);
  assert.deepStrictEqual(r.copilotRuns[0].args, ['--model', 'gpt-a', '-i', text]);
  assert.strictEqual(r.copilotRuns[0].cwd, p);
  assert.strictEqual(r.copilotRuns[0].env.MY_PROFILE_VAR, 'v');
});

test('UT_LauncherCopilot_FolderNames: ! % ^ & ( ) and Hebrew reach Copilot exactly, and a trailing backslash is dropped', () => {
  for (const [i, name] of ['a!b', '50% off', 'x & y', 'c^d', '(paren)', 'פרויקט בעברית'].entries()) {
    let p;
    const r = run({ id: 'CP06-' + i, setup: d => cfg(d), args: d => ['OPEN-COPILOT', p = folder(d, name)] });
    assert.deepStrictEqual(r.copilotRuns.map(x => x.cwd), [p], name);
  }
  let p;
  const r = run({ id: 'CP06-slash', setup: d => cfg(d), args: d => { p = folder(d, 'proj'); return ['OPEN-COPILOT', p + '\\']; } });
  assert.deepStrictEqual(r.copilotRuns.map(x => x.cwd), [p]);
});

test('UT_LauncherCopilot_ClaudeUntouched: a Copilot launch never touches Claude\'s hand-off files or config.txt', () => {
  let id;
  const r = run({ id: 'CP07-isolation', setup: d => {
    cfg(d);
    for (const n of LEGACY) fs.writeFileSync(path.join(d.kivun, n), 'claude data ' + n);
    id = pickerLaunch(d, { workdir: folder(d, 'proj') });
  }, args: () => ['LAUNCH-COPILOT', id] });
  assert.strictEqual(r.copilotRuns.length, 1);
  for (const n of LEGACY) assert.strictEqual(fs.readFileSync(path.join(r.d.kivun, n), 'utf8'), 'claude data ' + n, n);
  assert.match(fs.readFileSync(path.join(r.d.kivun, 'config.txt'), 'utf8'), /^RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n$/);
});

test('UT_LauncherCopilot_ScriptPolicyOnlyForCopilot: set for Copilot\'s session, and never for Claude', () => {
  let p;
  const cp = run({ id: 'CP08-copilot', setup: d => cfg(d), args: d => ['OPEN-COPILOT', p = folder(d, 'proj')] });
  assert.strictEqual(cp.copilotRuns[0].env.PSExecutionPolicyPreference, 'RemoteSigned');
  let log;
  const cl = run({ id: 'CP08-claude', setup: d => {
    cfg(d);
    log = path.join(d.root, 'claude-env.txt');
    fs.writeFileSync(path.join(d.bin, 'claude.cmd'), '@set PSExecutionPolicyPreference > "' + log + '" 2>&1\r\n');
  }, args: d => ['OPEN-CLAUDE', folder(d, 'proj')] });
  assert.ok(cl);
  assert.doesNotMatch(fs.readFileSync(log, 'utf8'), /RemoteSigned/);
});

test('UT_LauncherCopilot_LanguageOnlyByEnvironment: Hebrew reaches Copilot through its folder variable, with no extra option', () => {
  const r = run({ id: 'CP09-lang', setup: d => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\n'), args: d => ['OPEN-COPILOT', folder(d, 'proj')] });
  assert.deepStrictEqual(r.copilotRuns[0].args, []);
  const dir = r.copilotRuns[0].env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
  assert.ok(dir && fs.existsSync(path.join(dir, '.github', 'instructions', 'language.instructions.md')), dir);
});

test('UT_LauncherCopilot_SessionEnd: the launch folder is removed when the session ends; typing copilot relaunches without the message', () => {
  let id;
  const r = run({ id: 'CP10-end', input: 'exit 43\r\nexit\r\n', setup: d => { cfg(d); id = pickerLaunch(d, { workdir: folder(d, 'proj'), startup: ['hello'] }); }, args: () => ['LAUNCH-COPILOT', id] });
  assert.strictEqual(r.copilotRuns.length, 2, 'first start and one relaunch');
  assert.deepStrictEqual(r.copilotRuns[0].args, ['-i', 'hello']);
  assert.deepStrictEqual(r.copilotRuns[1].args, [], 'relaunch has no startup text');
  assert.deepStrictEqual(r.launches, [], 'launch folder removed');
});

test('UT_LauncherCopilot_BadId: anything but a 32-character lowercase hex id stops before Copilot', () => {
  for (const bad of ['ABC', '..\\x', 'g'.repeat(32), 'a'.repeat(31)]) {
    const r = run({ id: 'CP11-badid', input: '\r\n', setup: d => cfg(d), args: () => ['LAUNCH-COPILOT', bad] });
    assert.deepStrictEqual(r.copilotRuns, [], bad);
    assert.strictEqual(r.claudeIn, null, bad);
  }
});

test('UT_LauncherCopilot_NotInstalled: a message in the tab, and never a silent switch to Claude', () => {
  const r = run({ id: 'CP12-none', copilot: false, setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => [folder(d, 'proj')] });
  assert.deepStrictEqual(r.copilotRuns, []);
  assert.strictEqual(r.claudeIn, null);
  assert.match(r.p1.stdout, /Copilot was not found/);
});

test('UT_LauncherCopilot_MissingFolder: an unreachable folder gets a plain message, and Copilot is not started', () => {
  let id;
  const r = run({ id: 'CP13-missing', input: '\r\n', setup: d => { cfg(d); id = pickerLaunch(d, { workdir: path.join(d.work, 'gone') }); }, args: () => ['LAUNCH-COPILOT', id] });
  assert.deepStrictEqual(r.copilotRuns, []);
  assert.match(r.p1.stdout, /Copilot was NOT started/);
});

test('UT_LauncherCopilot_EmptyConfig: a Copilot PC whose settings file is empty says so instead of guessing', () => {
  const r = run({ id: 'CP14-empty', input: '\r\n', setup: d => { fs.writeFileSync(path.join(d.kivun, 'config.txt'), ''); fs.writeFileSync(path.join(d.kivun, 'kivun-copilot-path.txt'), '{}'); }, args: d => [folder(d, 'proj')] });
  assert.deepStrictEqual(r.copilotRuns, []);
  assert.strictEqual(r.claudeIn, null);
  assert.match(r.p1.stdout, /settings file is empty/);
});

test('UT_LauncherCopilot_Tab: with Windows Terminal, the tab is named for the folder and phase 2 is --run-copilot <id>', () => {
  let p;
  const r = ch.runCopilotCase({ id: 'CP15-tab', input: 'exit\r\n', setup: d => cfg(d, 'AGENT=copilot\r\n'), args: d => [p = folder(d, 'proj')] });
  assert.ok(r.wt, 'a tab was requested');
  assert.deepStrictEqual(r.wt.args.slice(r.wt.args.indexOf('--title'), r.wt.args.indexOf('--title') + 2), ['--title', 'proj']);
  assert.strictEqual(r.phase2.command[1], '--run-copilot');
  assert.match(r.phase2.command[2], /^[0-9a-f]{32}$/);
  assert.deepStrictEqual(r.copilotRuns.map(x => x.cwd), [p]);
});

test('UT_LauncherCopilot_MissingFolderTab: with Windows Terminal, the message opens in its own tab', () => {
  let id;
  const r = ch.runCopilotCase({ id: 'CP16-missingtab', skipPhase2: true, setup: d => { cfg(d); id = pickerLaunch(d, { workdir: path.join(d.work, 'gone') }); }, args: () => ['LAUNCH-COPILOT', id] });
  assert.deepStrictEqual(r.copilotRuns, []);
  assert.ok(r.wt.args.includes('Folder not found'));
  assert.ok(r.wt.args.some(a => /configure-copilot\.js/.test(a)));
});
