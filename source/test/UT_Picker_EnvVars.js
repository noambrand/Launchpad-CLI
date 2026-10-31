// The folder picker keeps each agent's environment variables apart (acceptance A31, A46), with
// the picker's real script run invisibly against a sealed folder, as in UT_Picker.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const CONFIG = 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\nSTARTUP_CMD=\r\nAUTO_CONTINUE=false\r\n';

// Both agents installed; one Claude profile that has a Claude key.
function sandbox(name) {
  const root = path.join(ROOT, 'pk', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, kivun: path.join(root, 'LAD', 'Kivun'), user: path.join(root, 'User'), work: path.join(root, 'work') };
  for (const k of ['kivun', 'user', 'work']) fs.mkdirSync(d[k], { recursive: true });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), CONFIG);
  fs.writeFileSync(path.join(d.kivun, 'claudecode-launchpad.bat'), '@rem stand-in: the picker only checks that it exists\r\n');
  fs.writeFileSync(path.join(d.kivun, 'profiles.json'), JSON.stringify({ version: 1, active: 'Work', profiles: [
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' },
    { name: 'Work', folder: '', model: 'sonnet', conv: '', customFlags: '', startupCmds: '', envVars: 'ANTHROPIC_API_KEY=sk-ant' }] }, null, 2));
  fs.mkdirSync(path.join(d.user, '.local', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(d.user, '.local', 'bin', 'claude.exe'), '');
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');
  d.env = { USERPROFILE: d.user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' };
  return d;
}
function open(d) {
  const p = openPicker({ hta: path.join(SOURCE, 'folder-picker.hta'), helpers: path.join(SOURCE, 'agent-helpers.js'), kivunDir: d.kivun, env: d.env });
  p.ctx.init();
  return p;
}
const read = (d, rel) => { const f = path.join(d.kivun, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const work = d => JSON.parse(read(d, 'profiles.json')).profiles[1];

test('UT_Picker_EnvVarsPerAgent: A46, a key typed for Codex never reaches Claude, and the reverse', () => {
  const d = sandbox('env-per-agent');
  const p = open(d);
  assert.strictEqual(p.el('env-vars').value, 'ANTHROPIC_API_KEY=sk-ant');
  p.ctx.onAgentChange('codex');
  assert.strictEqual(p.el('env-vars').value, '', "Claude's variables are not shown for Codex");
  p.el('env-vars').value = 'OPENAI_API_KEY=sk-openai';
  p.el('path').value = d.work;
  p.ctx.ok();
  const id = p.runs[0].cmd.match(/"([0-9a-f]{32})"$/)[1];
  assert.deepStrictEqual(JSON.parse(read(d, path.join('launch', id, 'launch.json'))).env, { OPENAI_API_KEY: 'sk-openai' }, 'Codex gets only its own');
  assert.strictEqual(work(d).envVars, 'ANTHROPIC_API_KEY=sk-ant', "Claude's variables are kept as they were");
  assert.strictEqual(work(d).codex.envVars, 'OPENAI_API_KEY=sk-openai');

  // Next time: the profile opens in Codex mode; switched back to Claude it has only Claude's.
  const p2 = open(d);
  assert.strictEqual(p2.el('env-vars').value, 'OPENAI_API_KEY=sk-openai');
  p2.ctx.onAgentChange('claude');
  assert.strictEqual(p2.el('env-vars').value, 'ANTHROPIC_API_KEY=sk-ant');
  p2.el('path').value = d.work;
  p2.ctx.ok();
  const envFile = read(d, 'kivun-env.txt') || '';
  assert.ok(envFile.includes('ANTHROPIC_API_KEY'), envFile);
  assert.ok(!envFile.includes('OPENAI_API_KEY'), 'the Codex key never reaches Claude: ' + envFile);
  assert.ok(!('agent' in work(d)));
  assert.strictEqual(work(d).codex.envVars, 'OPENAI_API_KEY=sk-openai', 'Codex keeps its own for next time');
});
