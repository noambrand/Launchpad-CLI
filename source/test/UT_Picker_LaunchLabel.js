// The picker's launch button names what it will start, and the hint above it agrees. The wording is
// Noam's decision (2026-11-05), a deliberate change from v3.2.2's "Launch ClaudeCode Launchpad CLI".
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const CLAUDE_LABEL = 'Launch ClaudeCode CLI', CLAUDE_HINT = 'Claude flags + startup commands';

function open(name, profile) {
  const root = path.join(ROOT, 'pl', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const kivun = path.join(root, 'LAD', 'Kivun'), user = path.join(root, 'User');
  fs.mkdirSync(kivun, { recursive: true });
  fs.mkdirSync(path.join(user, '.local', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(user, '.local', 'bin', 'claude.exe'), '');
  fs.writeFileSync(path.join(kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n');
  fs.writeFileSync(path.join(kivun, 'claudecode-launchpad.bat'), '@rem stand-in\r\n');
  fs.writeFileSync(path.join(kivun, 'kivun-codex-path.txt'), '{}');
  fs.writeFileSync(path.join(kivun, 'profiles.json'), JSON.stringify({ version: 1, active: 'Default', profiles: [Object.assign(
    { name: 'Default', folder: '', model: 'opus', conv: '', customFlags: '', startupCmds: '', envVars: '' }, profile)] }));
  const p = openPicker({ hta: path.join(SOURCE, 'folder-picker.hta'), helpers: path.join(SOURCE, 'agent-helpers.js'), kivunDir: kivun,
    env: { USERPROFILE: user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' } });
  p.ctx.init();
  return p;
}
const shown = p => [p.el('launch-btn').innerText, p.el('hint-launch').innerText, p.el('hint-flags').innerText];
const CLAUDE = [CLAUDE_LABEL, CLAUDE_LABEL, CLAUDE_HINT], CODEX = ['Launch Codex CLI', 'Launch Codex CLI', 'Codex options + startup message'];

test('UT_Picker_LaunchLabel: each agent has its own wording, and switching back restores it', () => {
  const p = open('switch');
  assert.deepStrictEqual(shown(p), CLAUDE);
  p.ctx.onAgentChange('codex');
  assert.deepStrictEqual(shown(p), CODEX);
  p.ctx.onAgentChange('claude');
  assert.deepStrictEqual(shown(p), CLAUDE);
});

test('UT_Picker_LaunchLabel: a profile saved on Codex opens already saying Codex', () => {
  assert.deepStrictEqual(shown(open('saved', { agent: 'codex', codex: { model: '', conv: 'fresh', customFlags: '', startupCmds: '' } })), CODEX);
});

test('UT_Picker_LaunchLabel: the old wording is gone from the page, and the rest of the hint is v3.2.2\'s', () => {
  const page = f => fs.readFileSync(f, 'utf8').replace(/<[^>]+>/g, '');
  const line = t => t.split(/\r?\n/).find(l => l.includes('then click'));
  const base = page(path.join(__dirname, 'picker-baseline-v3.2.2', 'folder-picker.hta')), now = page(path.join(SOURCE, 'folder-picker.hta'));
  assert.ok(!now.includes('Launch ClaudeCode Launchpad CLI'));
  assert.strictEqual(line(now), line(base).replace('Launch ClaudeCode Launchpad CLI', CLAUDE_LABEL));
});
