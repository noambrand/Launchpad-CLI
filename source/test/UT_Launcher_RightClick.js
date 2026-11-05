// The two right-click entries (Noam's decision, 2026-11-05; acceptance A6, A32, A40): each names its
// agent, whatever AGENT says. A launch with only a folder (Send To) still follows AGENT. Runs the
// real launcher hidden, without Windows Terminal, with Claude as a .cmd, so these also run on a PC
// whose Smart App Control blocks the compiled stand-ins.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ch = require('./launcher/codex-harness');

const cfg = (d, extra) => fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\n' + (extra || ''));
const folder = (d, name) => { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; };

// One launch. Returns the folder Claude ran in (null if it didn't) and the Codex runs.
function launch(id, config, args) {
  let log;
  const r = ch.runCodexCase({ id, mode: 'fallback', args, setup: d => {
    cfg(d, config);
    fs.rmSync(path.join(d.bin, 'claude.exe'), { force: true });
    log = path.join(d.root, 'claude-ran.txt');
    fs.writeFileSync(path.join(d.bin, 'claude.cmd'), '@cd > "' + log + '"\r\n');
  } });
  return { claudeIn: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : null, codexIn: r.codexRuns.map(x => x.cwd) };
}

test('UT_RightClick_CodexEntry: OPEN-CODEX starts Codex in the folder, whatever AGENT says', () => {
  for (const [label, config] of [['claude', 'AGENT=claude\r\n'], ['none', ''], ['codex', 'AGENT=codex\r\n']]) {
    let p;
    const r = launch('R01-' + label, config, d => ['OPEN-CODEX', p = folder(d, 'proj')]);
    assert.deepStrictEqual(r.codexIn, [p], label);
    assert.strictEqual(r.claudeIn, null, label);
  }
});

test('UT_RightClick_ClaudeEntry: OPEN-CLAUDE starts Claude in the folder, whatever AGENT says', () => {
  for (const [label, config] of [['codex', 'AGENT=codex\r\n'], ['none', ''], ['claude', 'AGENT=claude\r\n']]) {
    let p;
    const r = launch('R02-' + label, config, d => ['OPEN-CLAUDE', p = folder(d, 'proj')]);
    assert.strictEqual(r.claudeIn, p, label);
    assert.deepStrictEqual(r.codexIn, [], label);
  }
});

test('UT_RightClick_SendToFollowsAgent: a folder alone still follows AGENT', () => {
  let p;
  const codex = launch('R03-codex', 'AGENT=codex\r\n', d => [p = folder(d, 'proj')]);
  assert.deepStrictEqual(codex.codexIn, [p]);
  assert.strictEqual(codex.claudeIn, null);
  const claude = launch('R03-claude', '', d => [p = folder(d, 'proj')]);
  assert.strictEqual(claude.claudeIn, p);
  assert.deepStrictEqual(claude.codexIn, []);
});

test('UT_RightClick_FolderNames: Hebrew, spaces, & and a trailing backslash reach both agents exactly', () => {
  for (const [i, name] of ['פרויקט בעברית', 'x & y'].entries()) {
    let p;
    assert.deepStrictEqual(launch('R04-codex-' + i, '', d => ['OPEN-CODEX', p = folder(d, name)]).codexIn, [p], name);
    assert.strictEqual(launch('R04-claude-' + i, '', d => ['OPEN-CLAUDE', p = folder(d, name)]).claudeIn, p, name);
  }
  let p;
  assert.deepStrictEqual(launch('R04-codex-slash', '', d => ['OPEN-CODEX', (p = folder(d, 'proj')) + '\\']).codexIn, [p]);
  assert.strictEqual(launch('R04-claude-slash', '', d => ['OPEN-CLAUDE', (p = folder(d, 'proj')) + '\\']).claudeIn, p);
});

test('UT_RightClick_DriveRoot: a drive root opens both agents there', () => {
  const root = (process.env.SystemDrive || 'C:') + '\\';
  assert.deepStrictEqual(launch('R05-codex', '', () => ['OPEN-CODEX', root]).codexIn, [root]);
  assert.strictEqual(launch('R05-claude', '', () => ['OPEN-CLAUDE', root]).claudeIn, root);
});
