// The folder picker's real script, run invisibly against a sealed folder (handout 7.7, D3, D6,
// D16, D19; acceptance A2, A4, A5, A27, A31, A38, A46).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const BASELINE_HTA = path.join(__dirname, 'picker-baseline-v3.2.2', 'folder-picker.hta');
const HTA = path.join(SOURCE, 'folder-picker.hta');
const HELPERS = path.join(SOURCE, 'agent-helpers.js');
const CONFIG = 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\nSTARTUP_CMD=\r\nAUTO_CONTINUE=false\r\n';
const CLAUDE_PROFILES = JSON.stringify({ version: 1, active: 'Work', profiles: [
  { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' },
  { name: 'Work', folder: 'C:\\old', model: 'sonnet', conv: '', customFlags: '--verbose', startupCmds: '/status', envVars: 'MY_VAR=1' }] }, null, 2);

function sandbox(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'pk', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, kivun: path.join(root, 'LAD', 'Kivun'), user: path.join(root, 'User'), work: path.join(root, 'work') };
  for (const k of ['kivun', 'user', 'work']) fs.mkdirSync(d[k], { recursive: true });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), opts.config || CONFIG);
  fs.writeFileSync(path.join(d.kivun, 'claudecode-launchpad.bat'), '@rem stand-in: the picker only checks that it exists\r\n');
  if (opts.profiles !== null) fs.writeFileSync(path.join(d.kivun, 'profiles.json'), opts.profiles || CLAUDE_PROFILES);
  if (opts.claude !== false) { fs.mkdirSync(path.join(d.user, '.local', 'bin'), { recursive: true }); fs.writeFileSync(path.join(d.user, '.local', 'bin', 'claude.exe'), ''); }
  if (opts.codex) fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');
  if (opts.models) fs.writeFileSync(path.join(d.kivun, 'kivun-codex-models.json'), JSON.stringify(opts.models));
  d.env = { USERPROFILE: d.user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' };
  return d;
}
function open(d, hta) { const p = openPicker({ hta: hta || HTA, helpers: HELPERS, kivunDir: d.kivun, env: d.env }); p.ctx.init(); return p; }
function files(dir) {
  const out = {};
  (function walk(x, rel) { for (const n of fs.readdirSync(x)) { const p = path.join(x, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) walk(p, r); else out[r] = fs.readFileSync(p, 'utf8'); } })(dir, '');
  return out;
}

test('UT_Profiles_ClaudeOnlyUnchanged: a Claude launch writes exactly what the v3.2.2 picker writes', () => {
  for (const codexToo of [false, true]) {
    const results = [];
    for (const hta of [BASELINE_HTA, HTA]) {
      const d = sandbox('claude-same', { codex: codexToo });
      const p = open(d, hta);
      p.el('path').value = d.work;
      p.ctx.ok();
      const out = files(d.kivun);
      delete out['kivun-codex-path.txt'];
      results.push({ files: JSON.parse(JSON.stringify(out).split(d.root.replace(/\\/g, '\\\\')).join('<SB>')), runs: p.runs.map(r => r.cmd.split(d.root).join('<SB>')), closed: p.state.closed });
    }
    assert.deepStrictEqual(results[1], results[0], codexToo ? 'with Codex also installed' : 'Claude only');
  }
});

test('UT_Picker_CodexLaunch: launch.json, LAUNCH <id>, and none of Claude\'s hand-off files', () => {
  const profiles = JSON.stringify({ version: 1, active: 'Default', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex',
      codex: { model: 'gpt-b', conv: 'last', customFlags: '--search', startupCmds: '' } }] }, null, 2);
  const d = sandbox('codex-launch', { codex: true, profiles, models: { source: 'online', models: [{ slug: 'gpt-a', name: 'GPT A' }, { slug: 'gpt-b', name: 'GPT B' }] } });
  const before = files(d.kivun);
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'codex');
  p.el('path').value = d.work;
  p.el('startup-cmds').value = 'Read "README" & say 50% שלום\r\nthen continue';
  p.el('env-vars').value = 'OPENAI_API_KEY=sk-test\r\nMY_VAR=a b';
  p.ctx.ok();
  assert.strictEqual(p.error(), '');
  assert.strictEqual(p.runs.length, 1);
  const m = p.runs[0].cmd.match(/^"(.+claudecode-launchpad\.bat)" "LAUNCH" "([0-9a-f]{32})"$/);
  assert.ok(m, p.runs[0].cmd);
  assert.strictEqual(p.runs[0].style, 0, 'started hidden');
  const launch = JSON.parse(fs.readFileSync(path.join(d.kivun, 'launch', m[2], 'launch.json'), 'utf8'));
  assert.deepStrictEqual(launch, { agent: 'codex', workdir: d.work, conv: 'last', model: 'gpt-b', customFlags: '--search',
    startup: ['Read "README" & say 50% שלום', 'then continue'], env: { OPENAI_API_KEY: 'sk-test', MY_VAR: 'a b' } });
  const after = files(d.kivun);
  for (const n of ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt']) assert.ok(!(n in after), n + ' must not be written');
  assert.strictEqual(after['config.txt'], before['config.txt'], 'config.txt unchanged (same color)');
  const saved = JSON.parse(after['profiles.json']).profiles[0];
  assert.strictEqual(saved.agent, 'codex');
  assert.deepStrictEqual(saved.codex, { model: 'gpt-b', conv: 'last', customFlags: '--search', startupCmds: 'Read "README" & say 50% שלום\r\nthen continue',
    envVars: 'OPENAI_API_KEY=sk-test\r\nMY_VAR=a b' }, 'Codex keeps its own environment variables (A46)');
  assert.strictEqual(saved.envVars, '', "Claude's environment variables untouched (A46)");
  assert.strictEqual(saved.model, 'opus', 'Claude fields kept');
});

test('UT_Picker_PreviewEqualsRun: the preview shows exactly the arguments the runner starts', () => {
  const d = sandbox('codex-preview', { codex: true, profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex', codex: { model: 'gpt-a', conv: 'fresh', customFlags: '-c "x=1 2"', startupCmds: '-start here' } }] }) });
  const p = open(d);
  p.el('path').value = d.work;
  p.ctx.updateFlagPreview();
  const shown = p.el('flag-effective').innerText;
  p.ctx.ok();
  const id = p.runs[0].cmd.match(/"([0-9a-f]{32})"$/)[1];
  const env = Object.assign({}, process.env, { KIVUN_DIR: d.kivun, CODEX_HOME: 'C:\\c', HOME: d.user, USERPROFILE: d.user });
  const r = cp.spawnSync(process.execPath, [path.join(SOURCE, 'configure-codex.js'), 'compose', id], { env, encoding: 'utf8', windowsHide: true });
  const args = JSON.parse(r.stdout).args;
  assert.strictEqual(shown, require(HELPERS).previewLine(args));
  assert.strictEqual(shown, '-m gpt-a -c "developer_instructions=\'\'\'Always respond in Hebrew.\'\'\'" -c "x=1 2" -- "-start here"', 'items with spaces are shown quoted');
  assert.deepStrictEqual(args, ['-m', 'gpt-a', '-c', "developer_instructions='''Always respond in Hebrew.'''", '-c', 'x=1 2', '--', '-start here']);
});

test('UT_Picker_AgentSwitch: Claude → Codex → Claude keeps each agent\'s settings apart (D16)', () => {
  const d = sandbox('switch', { codex: true, models: { source: 'bundled', models: [{ slug: 'gpt-a', name: 'GPT A' }] } });
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'claude');
  assert.strictEqual(p.el('agent-row').style.display, '', 'both installed: the choice is shown');
  p.ctx.onAgentChange('codex');
  assert.strictEqual(p.el('preview-cmd').innerText, 'codex');
  assert.strictEqual(p.el('flag-custom').value, '', 'Codex options start empty, not with Claude\'s --verbose');
  p.setRadio('codex-model', 'gpt-a');
  p.el('flag-custom').value = '--search';
  p.ctx.onAgentChange('claude');
  assert.strictEqual(p.el('flag-custom').value, '--verbose', "Claude's options are back");
  assert.strictEqual(p.el('preview-cmd').innerText, 'claude');
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.match(p.runs[p.runs.length - 1].cmd, /"READFILE"$/);
  const saved = JSON.parse(fs.readFileSync(path.join(d.kivun, 'profiles.json'), 'utf8')).profiles[1];
  assert.ok(!('agent' in saved), 'choosing Claude removes the agent field');
  assert.deepStrictEqual(saved.codex, { model: 'gpt-a', conv: 'fresh', customFlags: '--search', startupCmds: '' });
  assert.strictEqual(saved.startupCmds, '/status', "Claude's startup command kept");
});

test('UT_Picker_NewDefaultFromAgent: a first-run Default profile follows AGENT=codex; old profiles stay Claude', () => {
  const d = sandbox('first-run', { profiles: null, codex: true, config: CONFIG + 'AGENT=codex\r\n' });
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'codex');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d.kivun, 'profiles.json'), 'utf8')).profiles[0].agent, 'codex');
  const d2 = sandbox('old-profile', { codex: true, config: CONFIG + 'AGENT=codex\r\n' });
  assert.strictEqual(open(d2).ctx.currentAgent, 'claude', 'a profile without agent field is Claude');
});

test('UT_Picker_CodexMissingNoSilentSwitch: a Codex profile without Codex installed shows a note and never starts Claude', () => {
  const d = sandbox('codex-missing', { profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex' }] }) });
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'codex');
  assert.strictEqual(p.el('agent-row').style.display, '');
  assert.match(p.el('agent-note').innerText, /Codex is not installed/);
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.match(p.error(), /Codex is not installed/);
  assert.strictEqual(p.runs.length, 0);
});

test('UT_ModelUnavailable: a saved model the online list no longer offers is marked, with a note', () => {
  const d = sandbox('model-gone', { codex: true, models: { source: 'online', models: [{ slug: 'gpt-a', name: 'GPT A' }] },
    profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [{ name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex', codex: { model: 'gpt-old' } }] }) });
  const p = open(d);
  assert.match(p.el('codex-models').innerHTML, /gpt-old <span[^>]*>\(no longer offered\)/);
  assert.match(p.el('codex-notes').innerHTML, /no longer offered/);
  const d2 = sandbox('model-bundled', { codex: true, models: { source: 'bundled', models: [{ slug: 'gpt-a', name: 'GPT A' }] },
    profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [{ name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex', codex: { model: 'gpt-old' } }] }) });
  assert.doesNotMatch(open(d2).el('codex-models').innerHTML, /no longer offered/, 'only an online list can say a model is gone');
});

test('UT_Picker_CodexErrorsStopLaunch: a slash command or an unclosed quote is refused before launch', () => {
  for (const [field, value, re] of [['startup-cmds', '/status', /can't run commands at startup/], ['flag-custom', '-c "open', /quote mark/]]) {
    const d = sandbox('codex-errors', { codex: true, profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [{ name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex' }] }) });
    const p = open(d);
    p.el('path').value = d.work;
    p.el(field).value = value;
    p.ctx.ok();
    assert.match(p.error(), re);
    assert.strictEqual(p.runs.length, 0);
    assert.ok(!fs.existsSync(path.join(d.kivun, 'launch')), 'no launch folder');
  }
});

test('UT_Picker_CodexChips: quick options are added once, whole tokens compared', () => {
  const d = sandbox('codex-chips', { codex: true, profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [{ name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'codex' }] }) });
  const p = open(d);
  p.el('chip-cx-search').onclick();
  p.el('chip-cx-readonly').onclick();
  p.el('chip-cx-search').onclick();
  assert.strictEqual(p.el('flag-custom').value, '--search -s read-only');
  p.state.browse = 'D:\\Shared Docs';
  p.el('chip-cx-adddir').onclick();
  assert.strictEqual(p.el('flag-custom').value, '--search -s read-only --add-dir "D:\\Shared Docs"');
});
