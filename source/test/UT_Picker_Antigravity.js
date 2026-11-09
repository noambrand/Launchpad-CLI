// The folder picker's real script with Antigravity as the fourth agent, run invisibly against a sealed
// folder, as in UT_Picker_Copilot.js. Claude, Codex and Copilot must behave exactly as before.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const HELPERS = path.join(SOURCE, 'agent-helpers.js');
const AH = require(HELPERS);
const CONFIG = 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\nSTARTUP_CMD=\r\nAUTO_CONTINUE=false\r\n';
const PROFILES = JSON.stringify({ version: 1, active: 'Work', profiles: [
  { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' },
  { name: 'Work', folder: '', model: 'sonnet', conv: '', customFlags: '--verbose', startupCmds: '/status', envVars: 'ANTHROPIC_API_KEY=sk-ant' }] }, null, 2);
// D12, word for word.
const DATA_USE = 'On Antigravity\'s "Terms of Service & Data Use" screen (shown once, after the sign-in and the colour scheme), press Enter to clear the tick (Google uses what you type while it is ticked), then press the Down arrow, then the Right arrow to reach Done, and press Enter. You can also turn it off later: type /config, then Enable Telemetry.';
const CHOICE = ['agent-label', 'agent-opt-claude', 'agent-opt-codex', 'agent-opt-copilot', 'agent-opt-antigravity'];
const STATUS = ['--settings', AH.ANTIGRAVITY_STATUSLINE];

function sandbox(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'pk', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, kivun: path.join(root, 'LAD', 'Kivun'), user: path.join(root, 'User'), work: path.join(root, 'work') };
  for (const k of ['kivun', 'user', 'work']) fs.mkdirSync(d[k], { recursive: true });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), opts.config || CONFIG);
  fs.writeFileSync(path.join(d.kivun, 'claudecode-launchpad.bat'), '@rem stand-in\r\n');
  if (opts.profiles !== null) fs.writeFileSync(path.join(d.kivun, 'profiles.json'), opts.profiles || PROFILES);
  if (opts.claude !== false) { fs.mkdirSync(path.join(d.user, '.local', 'bin'), { recursive: true }); fs.writeFileSync(path.join(d.user, '.local', 'bin', 'claude.exe'), ''); }
  if (opts.codex) fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');
  if (opts.copilot) fs.writeFileSync(path.join(d.kivun, 'kivun-copilot-path.txt'), '{}');
  if (opts.antigravity !== false) fs.writeFileSync(path.join(d.kivun, 'kivun-antigravity-path.txt'), '{}');
  d.env = { USERPROFILE: d.user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' };
  return d;
}
const oneProfile = extra => JSON.stringify({ version: 1, active: 'Default', profiles: [Object.assign(
  { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' }, extra)] }, null, 2);
function open(d) { const p = openPicker({ hta: path.join(SOURCE, 'folder-picker.hta'), helpers: HELPERS, kivunDir: d.kivun, env: d.env }); p.ctx.init(); return p; }
const read = (d, rel) => { const f = path.join(d.kivun, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const saved = (d, name) => JSON.parse(read(d, 'profiles.json')).profiles.find(x => x.name === (name || 'Work'));
const lastRun = p => p.runs[p.runs.length - 1].cmd;
const launchOf = (d, p, verb) => {
  const m = lastRun(p).match(new RegExp('^"(.+claudecode-launchpad\\.bat)" "' + verb + '" "([0-9a-f]{32})"$'));
  return m ? JSON.parse(read(d, path.join('launch', m[2], 'launch.json'))) : null;
};

test('UT_PickerAntigravity_ChoiceShown: the fourth radio shows when two agents are installed, and not with one; the data-use note (D12) shows once either way', () => {
  const p = open(sandbox('ag-choice'));
  assert.strictEqual(p.el('agent-row').style.display, '', 'Claude and Antigravity: the choice is shown');
  assert.deepStrictEqual(p.radios('agent').map(r => r.value), ['claude', 'codex', 'copilot', 'antigravity']);
  assert.strictEqual(p.ctx.currentAgent, 'claude');
  p.ctx.onAgentChange('antigravity');
  for (const id of CHOICE) assert.strictEqual(p.el(id).style.display, '', 'two agents: the choice shows: ' + id);
  assert.strictEqual(p.el('agent-note').innerText, DATA_USE, 'two agents: the note is in the agent row, beside the choice');
  assert.strictEqual(p.el('agent-note').style.color, '', 'in the note\'s own style: red is for "not installed"');
  assert.ok(!p.el('codex-notes').innerHTML.includes('Enable Telemetry'), 'and not a second time in the notes box');

  // Only Antigravity: no choice to offer, but the note still shows, alone in the always-visible row.
  const only = open(sandbox('ag-only', { claude: false, profiles: oneProfile({ agent: 'antigravity' }) }));
  assert.strictEqual(only.ctx.currentAgent, 'antigravity');
  assert.strictEqual(only.el('agent-row').style.display, '', 'the row shows, for the note');
  for (const id of CHOICE) assert.strictEqual(only.el(id).style.display, 'none', 'no choice is offered: ' + id + ' hidden');
  assert.strictEqual(only.el('agent-note').innerText, DATA_USE, 'the note, word for word');
  assert.strictEqual(only.el('agent-note').style.color, '', 'not in the error red');
  assert.ok(!only.el('codex-notes').innerHTML.includes('Enable Telemetry'), 'shown once: not in the notes box');
  only.el('flag-custom').value = '--sandbox';
  only.ctx.updateFlagPreview();
  assert.ok(!only.el('codex-notes').innerHTML.includes('Enable Telemetry'), 'still once after the preview is redrawn');

  // Claude, Codex or Copilot alone: the row stays hidden, as before.
  const one = (agent, opts) => open(sandbox('ag-one-' + agent, Object.assign({ antigravity: false }, opts)));
  for (const [agent, p1] of [['claude', one('claude', {})],
    ['codex', one('codex', { claude: false, codex: true, profiles: oneProfile({ agent: 'codex' }) })],
    ['copilot', one('copilot', { claude: false, copilot: true, profiles: oneProfile({ agent: 'copilot' }) })]]) {
    assert.strictEqual(p1.ctx.currentAgent, agent);
    assert.strictEqual(p1.el('agent-row').style.display, 'none', agent + ' alone: no row');
    assert.strictEqual(p1.el('agent-note').innerText, '', agent + ': no note');
    for (const id of CHOICE) assert.strictEqual(p1.el(id).style.display, '', agent + ': the choice itself is untouched: ' + id);
  }
});

test('UT_PickerAntigravity_Wording: its own controls, the data-use note (D12) and "Launch Antigravity CLI" (C4); switching back restores Claude\'s', () => {
  const p = open(sandbox('ag-words', { codex: true, copilot: true }));
  const claude = p.el('launch-btn').innerText;
  p.ctx.onAgentChange('antigravity');
  assert.strictEqual(p.radios('agent').find(r => r.checked).value, 'antigravity');
  assert.strictEqual(p.el('launch-btn').innerText, 'Launch Antigravity CLI');
  assert.strictEqual(p.el('hint-launch').innerText, 'Launch Antigravity CLI');
  assert.strictEqual(p.el('hint-flags').innerText, 'Antigravity options + startup message');
  assert.strictEqual(p.el('flags-title').innerText, 'Antigravity options (optional):');
  assert.match(p.el('custom-help').innerText, /passed to Antigravity/);
  assert.strictEqual(p.el('preview-cmd').innerText, 'agy');
  assert.strictEqual(p.el('startup-title').innerText, 'Startup message (optional):');
  assert.match(p.el('startup-help').innerText, /Sent to Antigravity as your first message/);
  assert.strictEqual(p.el('agent-note').innerText, DATA_USE, 'the data-use note, word for word');
  for (const [id, shown] of [['antigravity-models', ''], ['claude-models', 'none'], ['codex-models', 'none'], ['copilot-models', 'none'],
    ['antigravity-chips', ''], ['claude-chips', 'none'], ['codex-chips', 'none'], ['copilot-chips', 'none'], ['codex-notes', '']]) {
    assert.strictEqual(p.el(id).style.display, shown, id);
  }
  assert.ok(!p.el('chip-ag-adddir'), 'no extra-folder chip: --add-dir changes the workspace Continue looks up (A4), untested with -c');
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('agent-note').innerText, '', 'the note is Antigravity\'s only');
  assert.strictEqual(p.el('antigravity-models').style.display, 'none');
  assert.strictEqual(p.el('copilot-models').style.display, '');
  assert.strictEqual(p.el('launch-btn').innerText, 'Launch Copilot CLI');
  p.ctx.onAgentChange('claude');
  assert.strictEqual(p.el('launch-btn').innerText, claude);
  assert.strictEqual(p.el('preview-cmd').innerText, 'claude');
  assert.strictEqual(p.el('agent-note').innerText, '');
});

test('UT_PickerAntigravity_Launch: launch.json, LAUNCH-ANTIGRAVITY <id>, and none of Claude\'s hand-off files', () => {
  const d = sandbox('ag-launch');
  const p = open(d);
  p.ctx.onAgentChange('antigravity');
  p.el('antigravity-model').value = ' Gemini 3.8 Flash ';
  p.setRadio('flag-conv', '--continue');
  p.el('flag-custom').value = '--add-dir "C:\\x" --mode plan';
  p.el('startup-cmds').value = 'hello\nthere';
  p.el('env-vars').value = 'MY_VAR=1';
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.strictEqual(p.error(), '');
  assert.strictEqual(p.runs.length, 1);
  assert.strictEqual(p.runs[0].style, 0, 'started hidden');
  const l = launchOf(d, p, 'LAUNCH-ANTIGRAVITY');
  assert.ok(l, lastRun(p));
  assert.deepStrictEqual(l, { agent: 'antigravity', workdir: d.work, conv: 'last', model: 'Gemini 3.8 Flash', customFlags: '--add-dir "C:\\x" --mode plan',
    startup: ['hello', 'there'], env: { MY_VAR: '1' } });
  for (const n of ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt']) assert.strictEqual(read(d, n), null, n);
  assert.strictEqual(p.state.closed, true);
});

test('UT_PickerAntigravity_ProfileRoundTrip: profile.antigravity and agent "antigravity" are saved, and the profile reopens on them', () => {
  const d = sandbox('ag-roundtrip');
  const p = open(d);
  assert.strictEqual(p.el('flag-custom').value, '--verbose');
  p.ctx.onAgentChange('antigravity');
  assert.strictEqual(p.el('flag-custom').value, '', 'Antigravity options start empty, not with Claude\'s --verbose');
  assert.strictEqual(p.el('env-vars').value, '', "Claude's key is not shown for Antigravity");
  assert.strictEqual(p.el('startup-cmds').value, '', "Claude's /status is not Antigravity's");
  p.el('antigravity-model').value = 'gemini-x';
  p.setRadio('flag-conv', '--resume');
  p.el('flag-custom').value = '--sandbox';
  p.el('startup-cmds').value = 'Read the README';
  p.el('env-vars').value = 'GEMINI_KEY=g';
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.ok(launchOf(d, p, 'LAUNCH-ANTIGRAVITY'), lastRun(p));
  const s = saved(d);
  assert.strictEqual(s.agent, 'antigravity');
  assert.deepStrictEqual(s.antigravity, { model: 'gemini-x', conv: 'pick', customFlags: '--sandbox', startupCmds: 'Read the README', envVars: 'GEMINI_KEY=g' });
  assert.strictEqual(s.customFlags, '--verbose', "Claude's fields are kept");
  assert.strictEqual(s.envVars, 'ANTHROPIC_API_KEY=sk-ant');
  assert.strictEqual(s.startupCmds, '/status');
  assert.ok(!('copilot' in s) && !('codex' in s), 'nothing written for the agents not used');

  const again = open(d);
  assert.strictEqual(again.ctx.currentAgent, 'antigravity');
  assert.strictEqual(again.el('antigravity-model').value, 'gemini-x');
  assert.strictEqual(again.radios('flag-conv').find(r => r.checked).value, '--resume');
  assert.strictEqual(again.el('flag-custom').value, '--sandbox');
  assert.strictEqual(again.el('startup-cmds').value, 'Read the README');
  assert.strictEqual(again.el('env-vars').value, 'GEMINI_KEY=g');
  assert.strictEqual(again.el('launch-btn').innerText, 'Launch Antigravity CLI');
  again.ctx.onAgentChange('claude');
  assert.strictEqual(again.el('env-vars').value, 'ANTHROPIC_API_KEY=sk-ant');
  again.el('path').value = d.work;
  again.ctx.ok();
  assert.match(lastRun(again), /"READFILE"$/);
  assert.ok(!('agent' in saved(d)), 'choosing Claude removes the agent field');
  assert.strictEqual(saved(d).antigravity.customFlags, '--sandbox', 'Antigravity keeps its own for next time');
  assert.ok(!(read(d, 'kivun-env.txt') || '').includes('GEMINI_KEY'), 'a key typed for Antigravity never reaches Claude');
});

test('UT_PickerAntigravity_RefusedFlagStopsLaunch: a refused option is shown and nothing starts (D14)', () => {
  for (const flag of ['--dangerously-skip-permissions', '--mode auto', '--settings x.json', '--remote-control']) {
    const d = sandbox('ag-refused', { profiles: oneProfile({ agent: 'antigravity' }) });
    const p = open(d);
    p.el('flag-custom').value = flag;
    p.ctx.updateFlagPreview();
    const shown = flag === '--mode auto' ? '--mode auto' : flag.split(' ')[0];
    assert.match(p.el('codex-notes').innerHTML, new RegExp('does not start Antigravity with ' + shown), flag);
    p.el('path').value = d.work;
    p.ctx.ok();
    assert.deepStrictEqual(p.runs, [], flag + ': nothing started');
    assert.match(p.error(), new RegExp('Launchpad does not start Antigravity with ' + shown), flag);
    assert.notStrictEqual(p.state.closed, true, 'the picker stays open to show why');
    assert.ok(!fs.existsSync(path.join(d.kivun, 'launch')), 'no launch folder');
  }
});

test('UT_PickerAntigravity_Preview: -c for continue, the startup text with -i, and Launchpad\'s status line', () => {
  const p = open(sandbox('ag-preview', { profiles: oneProfile({ agent: 'antigravity' }) }));
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, AH.previewLine(STATUS), 'fresh, no options: only the status line');
  assert.match(p.el('codex-notes').innerHTML, /status line/);
  p.setRadio('flag-conv', '--continue');
  p.el('startup-cmds').value = 'hello there';
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, AH.previewLine(['-c'].concat(STATUS, ['-i', 'hello there'])));
  p.el('startup-cmds').value = '/explain this';
  p.el('antigravity-model').value = 'gemini-x';
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, AH.previewLine(['-c', '--model', 'gemini-x'].concat(STATUS, ['-i', '/explain this'])), 'a / entry is sent as text');
  p.setRadio('flag-conv', '--resume');
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, AH.previewLine(['--model', 'gemini-x'].concat(STATUS)), 'pick: a normal start, no message');
  assert.match(p.el('codex-notes').innerHTML, /Antigravity opens normally\. Type \/resume to choose a conversation\./, 'D5');
  assert.match(p.el('codex-notes').innerHTML, /startup message is not sent/);
});

test('UT_PickerAntigravity_PreviewEqualsRun: the preview shows exactly the arguments the runner starts agy with', () => {
  const d = sandbox('ag-preview-run', { profiles: oneProfile({ agent: 'antigravity',
    antigravity: { model: 'gemini-x', conv: 'last', customFlags: '--add-dir "C:\\a b"', startupCmds: '-start here' } }) });
  const p = open(d);
  p.el('path').value = d.work;
  p.ctx.updateFlagPreview();
  const shown = p.el('flag-effective').innerText;
  p.ctx.ok();
  const id = lastRun(p).match(/"LAUNCH-ANTIGRAVITY" "([0-9a-f]{32})"$/)[1];
  const sys = process.env.SystemRoot || 'C:\\Windows';
  const env = { SystemRoot: sys, windir: sys, ComSpec: path.join(sys, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD', PATH: path.join(sys, 'System32'),
    KIVUN_DIR: d.kivun, HOME: d.user, USERPROFILE: d.user, LOCALAPPDATA: path.join(d.root, 'LAD'), APPDATA: path.join(d.root, 'AppData'), KIVUN_TEST_SCRIPT_POLICY: 'chosen' };
  const r = cp.spawnSync(process.execPath, [path.join(SOURCE, 'configure-antigravity.js'), 'compose', id], { env, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(r.status, 0, r.stderr);
  const args = JSON.parse(r.stdout).args;
  assert.deepStrictEqual(args, ['-c', '--model', 'gemini-x'].concat(STATUS, ['--add-dir', 'C:\\a b', '-i', '-start here']));
  assert.strictEqual(shown, AH.previewLine(args));
});

test('UT_PickerAntigravity_ThenCodexAndCopilot: after Antigravity, Codex and Copilot still get their own arguments (LAUNCH, LAUNCH-COPILOT)', () => {
  const d = sandbox('ag-then-others', { codex: true, copilot: true });
  const p = open(d);
  p.ctx.onAgentChange('antigravity');
  p.el('antigravity-model').value = 'gemini-x';
  p.setRadio('flag-conv', '--continue');
  p.el('flag-custom').value = '--sandbox';
  p.el('startup-cmds').value = 'hi';
  p.ctx.onAgentChange('codex');
  assert.strictEqual(p.el('preview-cmd').innerText, 'codex');
  assert.strictEqual(p.el('agent-note').innerText, '');
  assert.strictEqual(p.el('flag-custom').value, '', 'Codex options are its own');
  assert.strictEqual(p.radios('flag-conv').find(r => r.checked).value, '', "Antigravity's Continue is not Codex's");
  assert.strictEqual(p.el('codex-models').style.display, '');
  assert.strictEqual(p.el('antigravity-models').style.display, 'none');
  p.el('flag-custom').value = '--search';
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, '--search', 'composeCodex, not composeAntigravity');
  assert.doesNotMatch(p.el('codex-notes').innerHTML, /Antigravity/);
  p.el('path').value = d.work;
  p.ctx.ok();
  const cx = launchOf(d, p, 'LAUNCH');
  assert.ok(cx, lastRun(p));
  assert.strictEqual(cx.agent, 'codex');
  assert.strictEqual(cx.customFlags, '--search');
  assert.strictEqual(cx.conv, 'fresh');
  assert.deepStrictEqual(cx.startup, []);
  let s = saved(d);
  assert.strictEqual(s.agent, 'codex');
  assert.deepStrictEqual(s.antigravity, { model: 'gemini-x', conv: 'last', customFlags: '--sandbox', startupCmds: 'hi' });

  const q = open(d);
  assert.strictEqual(q.ctx.currentAgent, 'codex');
  q.ctx.onAgentChange('antigravity');
  assert.strictEqual(q.el('flag-custom').value, '--sandbox');
  q.ctx.onAgentChange('copilot');
  assert.strictEqual(q.el('preview-cmd').innerText, 'copilot');
  assert.strictEqual(q.el('flag-custom').value, '');
  q.ctx.updateFlagPreview();
  assert.match(q.el('flag-effective').innerText, /default Copilot behavior/, 'composeCopilot: no status line, no -c');
  q.el('path').value = d.work;
  q.ctx.ok();
  const cp2 = launchOf(d, q, 'LAUNCH-COPILOT');
  assert.ok(cp2, lastRun(q));
  assert.strictEqual(cp2.agent, 'copilot');
  assert.strictEqual(cp2.conv, 'fresh');
  assert.strictEqual(cp2.model, null);
  s = saved(d);
  assert.strictEqual(s.agent, 'copilot');
  assert.strictEqual(s.codex.customFlags, '--search');
  assert.strictEqual(s.antigravity.customFlags, '--sandbox');
});

test('UT_PickerAntigravity_NotInstalled: an Antigravity profile on a PC without it says so and never starts another agent', () => {
  const d = sandbox('ag-missing', { antigravity: false, profiles: oneProfile({ agent: 'antigravity' }) });
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'antigravity');
  assert.strictEqual(p.el('agent-row').style.display, '');
  assert.strictEqual(p.el('agent-note').innerText, 'Antigravity is not installed on this PC.');
  assert.strictEqual(p.el('agent-note').style.color, '#b00020', 'a real error stays red');
  for (const id of CHOICE) assert.strictEqual(p.el(id).style.display, '', 'the choice shows: ' + id);
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.match(p.error(), /Antigravity is not installed\. Run the ClaudeCode Launchpad CLI installer again and choose Antigravity\./);
  assert.deepStrictEqual(p.runs, []);
});

test('UT_PickerAntigravity_FirstRunFollowsAgent: a new Default profile follows AGENT=antigravity; old profiles stay Claude', () => {
  const d = sandbox('ag-first', { profiles: null, config: CONFIG + 'AGENT=antigravity\r\n' });
  assert.strictEqual(open(d).ctx.currentAgent, 'antigravity');
  assert.strictEqual(saved(d, 'Default').agent, 'antigravity');
  const old = sandbox('ag-old', { config: CONFIG + 'AGENT=antigravity\r\n' });
  assert.strictEqual(open(old).ctx.currentAgent, 'claude', 'a profile without an agent field is Claude');
});

test('UT_PickerAntigravity_NoHardCodedModels: nothing is offered as an Antigravity model (D16)', () => {
  const hta = fs.readFileSync(path.join(SOURCE, 'folder-picker.hta'), 'utf8');
  const i = hta.indexOf('id="antigravity-models"');
  const block = hta.slice(i, hta.indexOf('</div></div>', i));
  assert.ok(i > 0);
  assert.match(block, /id="antigravity-model"/);
  assert.doesNotMatch(block, /type="radio"/);
  assert.doesNotMatch(block, /gemini|gpt-|claude-|sonnet|opus/i);
});

test('UT_PickerAntigravity_HtmlBuilt: the generated page has the same Antigravity code', () => {
  const html = fs.readFileSync(path.join(SOURCE, 'folder-picker.html'), 'utf8');
  for (const s of ['LAUNCH-ANTIGRAVITY', 'id="antigravity-model"', 'kivun-antigravity-path.txt', "onAgentChange('antigravity')", 'Enable Telemetry']) assert.ok(html.includes(s), s);
});
