// configure-codex.js: config.txt and AGENT (requirements: invariants "Claude is the default",
// "One writer, one commit point for AGENT"; acceptance A2, A25).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./codex-fixture');

const TEMPLATE = '# ClaudeCode Launchpad CLI Configuration\r\n# comment with KEY=VALUE inside\r\nRESPONSE_LANGUAGE=hebrew\r\nCLAUDE_FLAGS=--model opus --append-system-prompt "a=b"\r\nSTARTUP_CMD=\r\n';

test('UT_Config_SetValue keeps every other byte (CRLF, comments, values containing =)', () => {
  const cc = fx.load();
  const out = cc.setConfigValue(TEMPLATE, 'CLAUDE_FLAGS', '--verbose');
  assert.strictEqual(out, TEMPLATE.replace('CLAUDE_FLAGS=--model opus --append-system-prompt "a=b"', 'CLAUDE_FLAGS=--verbose'));
  const appended = cc.setConfigValue(TEMPLATE, 'AGENT', 'codex');
  assert.strictEqual(appended, TEMPLATE + 'AGENT=codex\r\n');
});

test('UT_Config_SetValue keeps a BOM, LF line ends, and a missing final newline', () => {
  const cc = fx.load();
  assert.strictEqual(cc.setConfigValue('\uFEFFA=1\nB=2', 'C', '3'), '\uFEFFA=1\nB=2\nC=3\n');
  assert.strictEqual(cc.setConfigValue('\uFEFFA=1\nB=2\n', 'A', 'x'), '\uFEFFA=x\nB=2\n');
});

test('UT_Config_ParseConfig reads like the batch file (comments skipped, value keeps =)', () => {
  const cc = fx.load();
  const m = cc.parseConfig(TEMPLATE);
  assert.strictEqual(m.get('CLAUDE_FLAGS'), '--model opus --append-system-prompt "a=b"');
  assert.strictEqual(m.get('STARTUP_CMD'), '');
  assert.ok(!m.has('# comment with KEY'));
});

test('UT_Config_FirstInstallAgentEmpty: AGENT= means Claude, and choosing Claude writes nothing', () => {
  const d = fx.makeEnv('cfg-empty');
  const cc = fx.load();
  const file = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(file, TEMPLATE + 'AGENT=\r\n');
  assert.strictEqual(cc.effectiveAgent(fs.readFileSync(file, 'utf8')), 'claude');
  const before = fs.readFileSync(file);
  assert.strictEqual(cc.setAgent('claude', d.env), false);
  assert.deepStrictEqual(fs.readFileSync(file), before);
});

test('UT_Agent_SetAgentOnlyWriter: Claude upgrade without AGENT stays byte-identical; codex is written once', () => {
  const d = fx.makeEnv('cfg-writer');
  const cc = fx.load();
  const file = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(file, TEMPLATE);
  const before = fs.readFileSync(file);
  assert.strictEqual(cc.setAgent('claude', d.env), false);
  assert.deepStrictEqual(fs.readFileSync(file), before, 'Claude with no AGENT key must not touch config.txt');
  assert.strictEqual(cc.setAgent('codex', d.env), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), TEMPLATE + 'AGENT=codex\r\n');
  assert.strictEqual(cc.setAgent('codex', d.env), false, 'already codex: nothing written');
  assert.throws(() => cc.setAgent('gemini', d.env));
});

test('UT_Agent_BackToClaude: Claude chosen where AGENT=codex writes claude in place', () => {
  const d = fx.makeEnv('cfg-back');
  const cc = fx.load();
  const file = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(file, TEMPLATE + 'AGENT=codex\r\n');
  assert.strictEqual(cc.setAgent('claude', d.env), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), TEMPLATE + 'AGENT=claude\r\n');
});

test('UT_Agent_AtomicBusyFile: a busy config.txt is retried, then left whole', () => {
  const d = fx.makeEnv('cfg-busy');
  const cc = fx.load();
  const file = path.join(d.kivun, 'config.txt');
  fs.writeFileSync(file, TEMPLATE);
  const realRename = fs.renameSync;
  let calls = 0;
  try {
    fs.renameSync = () => { calls++; const e = new Error('busy'); e.code = 'EBUSY'; throw e; };
    assert.throws(() => cc.setAgent('codex', d.env));
    assert.strictEqual(calls, 6, 'five retries after the first try');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), TEMPLATE, 'old file left whole');
    assert.deepStrictEqual(fs.readdirSync(d.kivun).filter(n => n.endsWith('.tmp')), [], 'temp file cleaned up');
    calls = 0;
    fs.renameSync = (a, b) => { if (++calls < 3) { const e = new Error('busy'); e.code = 'EPERM'; throw e; } return realRename(a, b); };
    assert.strictEqual(cc.setAgent('codex', d.env), true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), TEMPLATE + 'AGENT=codex\r\n');
  } finally { fs.renameSync = realRename; }
});

test('UT_Agent_SetAgentCli: the command-line mode writes the same way', () => {
  const d = fx.makeEnv('cfg-cli');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), TEMPLATE);
  const r = fx.cli(d, ['set-agent', 'codex']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), /\r\nAGENT=codex\r\n$/);
  assert.notStrictEqual(fx.cli(d, ['set-agent', 'other']).status, 0);
});
