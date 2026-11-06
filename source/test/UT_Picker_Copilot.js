// The folder picker's real script with Copilot as the third agent, run invisibly against a sealed
// folder, as in UT_Picker.js. Claude and Codex must behave exactly as before.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const CONFIG = 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\nSTARTUP_CMD=\r\nAUTO_CONTINUE=false\r\n';
const PROFILES = JSON.stringify({ version: 1, active: 'Work', profiles: [
  { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' },
  { name: 'Work', folder: '', model: 'sonnet', conv: '', customFlags: '--verbose', startupCmds: '/status', envVars: 'ANTHROPIC_API_KEY=sk-ant' }] }, null, 2);

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
  if (opts.copilot !== false) fs.writeFileSync(path.join(d.kivun, 'kivun-copilot-path.txt'), '{}');
  d.env = { USERPROFILE: d.user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' };
  return d;
}
function open(d) { const p = openPicker({ hta: path.join(SOURCE, 'folder-picker.hta'), helpers: path.join(SOURCE, 'agent-helpers.js'), kivunDir: d.kivun, env: d.env }); p.ctx.init(); return p; }
const read = (d, rel) => { const f = path.join(d.kivun, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const saved = (d, name) => JSON.parse(read(d, 'profiles.json')).profiles.find(x => x.name === (name || 'Work'));
const launchOf = (d, p) => { const m = p.runs[p.runs.length - 1].cmd.match(/"LAUNCH-COPILOT" "([0-9a-f]{32})"$/); return m ? JSON.parse(read(d, path.join('launch', m[1], 'launch.json'))) : null; };

test('UT_PickerCopilot_Wording: the button, the hint and the options all name Copilot; switching back restores Claude\'s', () => {
  const p = open(sandbox('cp-words'));
  const claude = p.el('launch-btn').innerText;
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('launch-btn').innerText, 'Launch Copilot CLI');
  assert.strictEqual(p.el('hint-launch').innerText, 'Launch Copilot CLI');
  assert.strictEqual(p.el('hint-flags').innerText, 'Copilot options + startup message');
  assert.strictEqual(p.el('flags-title').innerText, 'Copilot options (optional):');
  assert.strictEqual(p.el('preview-cmd').innerText, 'copilot');
  assert.match(p.el('startup-help').innerText, /first message/);
  p.ctx.onAgentChange('claude');
  assert.strictEqual(p.el('launch-btn').innerText, claude);
  assert.strictEqual(p.el('preview-cmd').innerText, 'claude');
});

test('UT_PickerCopilot_OnlyItsControlsShow: no Claude models or chips, no Codex list', () => {
  const p = open(sandbox('cp-controls', { codex: true }));
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('copilot-models').style.display, '');
  assert.strictEqual(p.el('claude-models').style.display, 'none');
  assert.strictEqual(p.el('codex-models').style.display, 'none');
  assert.strictEqual(p.el('copilot-chips').style.display, '');
  assert.strictEqual(p.el('claude-chips').style.display, 'none');
  assert.strictEqual(p.el('codex-chips').style.display, 'none');
  assert.strictEqual(p.el('codex-notes').style.display, '', 'the notes box is shared');
  p.ctx.onAgentChange('codex');
  assert.strictEqual(p.el('copilot-models').style.display, 'none');
  assert.strictEqual(p.el('codex-models').style.display, '');
});

test('UT_PickerCopilot_Launch: launch.json, LAUNCH-COPILOT <id>, and none of Claude\'s hand-off files', () => {
  const d = sandbox('cp-launch');
  const p = open(d);
  p.ctx.onAgentChange('copilot');
  p.el('copilot-model').value = 'gpt-5.4';
  p.setRadio('flag-conv', '--continue');
  p.el('flag-custom').value = '--add-dir "C:\\x"';
  p.el('startup-cmds').value = 'hello\nthere';
  p.el('env-vars').value = 'MY_VAR=1';
  p.el('path').value = d.work;
  p.ctx.ok();
  const l = launchOf(d, p);
  assert.deepStrictEqual(l, { agent: 'copilot', workdir: d.work, conv: 'last', model: 'gpt-5.4', customFlags: '--add-dir "C:\\x"', startup: ['hello', 'there'], env: { MY_VAR: '1' } });
  for (const n of ['kivun-workdir.txt', 'kivun-claude-flags.txt', 'kivun-claude-startcmd.txt', 'kivun-env.txt']) assert.strictEqual(read(d, n), null, n);
  assert.strictEqual(p.state.closed, true);
});

test('UT_PickerCopilot_ProfileSeparate: Claude → Copilot → Claude keeps each agent\'s settings apart', () => {
  const d = sandbox('cp-separate');
  const p = open(d);
  assert.strictEqual(p.el('flag-custom').value, '--verbose');
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('flag-custom').value, '', 'Copilot options start empty, not with Claude\'s --verbose');
  assert.strictEqual(p.el('env-vars').value, '', "Claude's key is not shown for Copilot");
  assert.strictEqual(p.el('startup-cmds').value, '');
  p.el('copilot-model').value = 'auto';
  p.el('flag-custom').value = '--add-dir C:\\y';
  p.el('env-vars').value = 'GH_TOKEN=t';
  p.ctx.onAgentChange('claude');
  assert.strictEqual(p.el('flag-custom').value, '--verbose');
  assert.strictEqual(p.el('env-vars').value, 'ANTHROPIC_API_KEY=sk-ant');
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.match(p.runs[p.runs.length - 1].cmd, /"READFILE"$/);
  const s = saved(d);
  assert.ok(!('agent' in s), 'choosing Claude removes the agent field');
  assert.deepStrictEqual(s.copilot, { model: 'auto', conv: 'fresh', customFlags: '--add-dir C:\\y', startupCmds: '', envVars: 'GH_TOKEN=t' });
  assert.strictEqual(s.customFlags, '--verbose');
  assert.ok(!(read(d, 'kivun-env.txt') || '').includes('GH_TOKEN'), 'a key typed for Copilot never reaches Claude');
});

test('UT_PickerCopilot_ThreeAgents: all three keep their own settings, and the profile reopens on the last one used', () => {
  const d = sandbox('cp-three', { codex: true });
  const p = open(d);
  assert.strictEqual(p.el('agent-row').style.display, '', 'the choice is shown');
  p.ctx.onAgentChange('codex');
  p.el('flag-custom').value = '--search';
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('flag-custom').value, '');
  p.el('flag-custom').value = '--add-dir C:\\z';
  p.ctx.onAgentChange('codex');
  assert.strictEqual(p.el('flag-custom').value, '--search');
  p.ctx.onAgentChange('copilot');
  assert.strictEqual(p.el('flag-custom').value, '--add-dir C:\\z');
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.ok(launchOf(d, p));
  const s = saved(d);
  assert.strictEqual(s.agent, 'copilot');
  assert.strictEqual(s.codex.customFlags, '--search');
  assert.strictEqual(s.copilot.customFlags, '--add-dir C:\\z');
  assert.strictEqual(s.customFlags, '--verbose');
  const again = open(d);
  assert.strictEqual(again.ctx.currentAgent, 'copilot');
  assert.strictEqual(again.el('flag-custom').value, '--add-dir C:\\z');
  assert.strictEqual(again.el('launch-btn').innerText, 'Launch Copilot CLI');
});

test('UT_PickerCopilot_PreviewEqualsCompose: the preview shows what would start, and a refused option stops the launch', () => {
  const d = sandbox('cp-preview');
  const p = open(d);
  p.ctx.onAgentChange('copilot');
  p.el('startup-cmds').value = 'hello there';
  p.ctx.updateFlagPreview();
  assert.strictEqual(p.el('flag-effective').innerText, '-i "hello there"');
  p.el('startup-cmds').value = '';
  p.ctx.updateFlagPreview();
  assert.match(p.el('flag-effective').innerText, /default Copilot behavior/);
  p.el('flag-custom').value = '--yolo';
  p.ctx.updateFlagPreview();
  assert.match(p.el('codex-notes').innerHTML, /does not start Copilot with --yolo/);
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.deepStrictEqual(p.runs, [], 'nothing started');
  assert.notStrictEqual(p.state.closed, true, 'the picker stays open to show why');
});

test('UT_PickerCopilot_RefusesAllowAllVariable: COPILOT_ALLOW_ALL in the profile\'s variables stops the launch', () => {
  const d = sandbox('cp-env');
  const p = open(d);
  p.ctx.onAgentChange('copilot');
  p.el('env-vars').value = 'COPILOT_ALLOW_ALL=true';
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.deepStrictEqual(p.runs, []);
});

test('UT_PickerCopilot_FirstRunFollowsAgent: a new Default profile follows AGENT=copilot; old profiles stay Claude', () => {
  const d = sandbox('cp-first', { profiles: null, config: CONFIG + 'AGENT=copilot\r\n' });
  assert.strictEqual(open(d).ctx.currentAgent, 'copilot');
  assert.strictEqual(saved(d, 'Default').agent, 'copilot');
  const old = sandbox('cp-old', { config: CONFIG + 'AGENT=copilot\r\n' });
  assert.strictEqual(open(old).ctx.currentAgent, 'claude', 'a profile without an agent field is Claude');
});

test('UT_PickerCopilot_NotInstalled: a Copilot profile on a PC without Copilot says so and never starts another agent', () => {
  const d = sandbox('cp-missing', { copilot: false, profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'copilot' }] }, null, 2) });
  const p = open(d);
  assert.strictEqual(p.ctx.currentAgent, 'copilot');
  assert.strictEqual(p.el('agent-note').innerText, 'GitHub Copilot is not installed on this PC.');
  p.el('path').value = d.work;
  p.ctx.ok();
  assert.deepStrictEqual(p.runs, []);
});

test('UT_PickerCopilot_ChoiceHiddenWithOneAgent: a PC with only Copilot shows no choice', () => {
  const p = open(sandbox('cp-only', { claude: false, profiles: JSON.stringify({ version: 1, active: 'Default', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '', agent: 'copilot' }] }, null, 2) }));
  assert.strictEqual(p.el('agent-row').style.display, 'none');
});

test('UT_PickerCopilot_NoHardCodedModels: nothing is offered as a Copilot model, which would go stale', () => {
  const hta = fs.readFileSync(path.join(SOURCE, 'folder-picker.hta'), 'utf8');
  const i = hta.indexOf('id="copilot-models"');
  const block = hta.slice(i, hta.indexOf('</div></div>', i));
  assert.ok(i > 0);
  assert.doesNotMatch(block, /type="radio"/);
  assert.doesNotMatch(block, /gpt-|claude-|sonnet|opus/i);
});

test('UT_PickerCopilot_HtmlBuilt: the generated page has the same Copilot code', () => {
  const html = fs.readFileSync(path.join(SOURCE, 'folder-picker.html'), 'utf8');
  for (const s of ['LAUNCH-COPILOT', 'id="copilot-model"', 'kivun-copilot-path.txt', "onAgentChange('copilot')"]) assert.ok(html.includes(s), s);
});
