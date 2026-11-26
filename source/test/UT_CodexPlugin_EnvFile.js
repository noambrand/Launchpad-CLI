// The Codex add-on's session-start hook writes three variables into the file Claude Code names in
// CLAUDE_ENV_FILE. Claude Code hands it the same file on every resume and compact; OpenAI's hook appended,
// so on a real PC (2026-11-26) the file reached 75 lines, was cut mid-line, and every shell command in that
// Claude session failed. Launchpad's copy keeps one line per variable (tools\codex-addon-patch.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-plugin-fixture');

const HOOK = path.join(fx.SOURCE, 'plugins', 'codex', 'scripts', 'session-lifecycle-hook.mjs');
const DIR = path.join(fx.ROOT, 'codex-envfile');

function start(envFile, input) {
  const r = cp.spawnSync(process.execPath, [HOOK, 'SessionStart'], {
    input: JSON.stringify(input),
    env: Object.assign({}, process.env, { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_DATA: 'C:/data/codex' }),
    encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
}
const lines = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
const INPUT = { session_id: 'abc-123', transcript_path: 'C:\\Users\\u\\.claude\\projects\\p\\abc-123.jsonl' };

function freshFile(name, text) {
  fs.mkdirSync(DIR, { recursive: true });
  const f = path.join(DIR, name);
  fs.rmSync(f, { force: true });
  if (text != null) fs.writeFileSync(f, text);
  return f;
}

test('UT_CodexEnvFile_RepeatStartsKeepThreeLines: five starts in one session leave the three lines once', () => {
  const f = freshFile('repeat.sh');
  for (let i = 0; i < 5; i++) start(f, INPUT);
  assert.deepStrictEqual(lines(f), [
    "export CODEX_COMPANION_SESSION_ID='abc-123'",
    "export CODEX_COMPANION_TRANSCRIPT_PATH='C:\\Users\\u\\.claude\\projects\\p\\abc-123.jsonl'",
    "export CLAUDE_PLUGIN_DATA='C:/data/codex'",
  ]);
});

test('UT_CodexEnvFile_GrownFileShrinks: a file grown by the old hook goes back to three lines, other lines kept', () => {
  const old = "export CODEX_COMPANION_SESSION_ID='abc-123'\nexport CLAUDE_PLUGIN_DATA='C:/data/codex'\n";
  const f = freshFile('grown.sh', 'export OTHER=1\n' + old.repeat(25));
  start(f, INPUT);
  const got = lines(f);
  assert.strictEqual(got.length, 4, got.join('\n'));
  assert.strictEqual(got[0], 'export OTHER=1');
  assert.strictEqual(got.filter(l => l.startsWith('export CODEX_COMPANION_SESSION_ID=')).length, 1);
});

test('UT_CodexEnvFile_NewSessionReplaces: a new session id replaces the old one instead of adding a second', () => {
  const f = freshFile('replace.sh');
  start(f, INPUT);
  start(f, Object.assign({}, INPUT, { session_id: 'def-456' }));
  const ids = lines(f).filter(l => l.startsWith('export CODEX_COMPANION_SESSION_ID='));
  assert.deepStrictEqual(ids, ["export CODEX_COMPANION_SESSION_ID='def-456'"]);
});
