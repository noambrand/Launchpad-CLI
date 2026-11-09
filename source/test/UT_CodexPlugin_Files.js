// v3.6.0: the Codex add-on Launchpad ships in source\plugins\codex. It is OpenAI's codex-plugin-cc at the
// release pinned in codex.upstream, with Launchpad's changes made by tools\codex-addon-patch.js and
// nothing else, so Claude uses Codex only when the user asks (Noam's decision, 2026-11-10). CI also
// rebuilds it from the pinned release and compares (validate-codex-addon.yml).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const fx = require('./codex-plugin-fixture');

const PLUGINS = path.join(fx.SOURCE, 'plugins');
const DIR = path.join(PLUGINS, 'codex');
const PATCH = require(path.join(fx.REPO, 'tools', 'codex-addon-patch.js'));

function files(root) {
  const out = [];
  (function walk(rel) {
    for (const n of fs.readdirSync(path.join(root, rel))) {
      const r = rel ? rel + '/' + n : n;
      if (fs.statSync(path.join(root, r)).isDirectory()) walk(r); else out.push(r);
    }
  })('');
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
const read = rel => fs.readFileSync(path.join(DIR, rel), 'utf8');
const frontMatter = text => { const m = /^---\n([\s\S]*?)\n---\n/.exec(text); assert.ok(m, 'front matter'); return m[1]; };

test('UT_CodexAddon_Checksums: every shipped file matches codex.sha256, and no file is missing or extra', () => {
  const list = fs.readFileSync(path.join(PLUGINS, 'codex.sha256'), 'utf8').trim().split('\n').map(l => { const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l); assert.ok(m, l); return [m[2], m[1]]; });
  assert.deepStrictEqual(files(DIR), list.map(x => x[0]));
  for (const [rel, hash] of list) assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, rel))).digest('hex'), hash, rel);
});

test('UT_CodexAddon_Pinned: codex.upstream names OpenAI\'s repository, the release, its commit and the folder; versions agree', () => {
  const [url, tag, commit, sub, ...rest] = fs.readFileSync(path.join(PLUGINS, 'codex.upstream'), 'utf8').trim().split(/\s+/);
  assert.strictEqual(url, 'https://github.com/openai/codex-plugin-cc');
  assert.match(tag, /^v\d+\.\d+\.\d+$/);
  assert.match(commit, /^[0-9a-f]{40}$/);
  assert.strictEqual(sub, 'plugins/codex');
  assert.deepStrictEqual(rest, []);
  assert.strictEqual('v' + JSON.parse(read('.claude-plugin/plugin.json')).version, tag);
});

test('UT_CodexAddon_ChangesMade: tools\\codex-addon-patch.js finds every change already made', () => {
  const r = PATCH.apply(DIR, false);
  assert.deepStrictEqual(r.missing, []);
  assert.deepStrictEqual(r.changed, [], 'not made: ' + r.changed.join('; '));
  assert.strictEqual(r.already.length, PATCH.CHANGES.length);
});

test('UT_CodexAddon_OnlyWhenAsked: no command runs by Claude\'s own choice, and the helper says to wait for the user', () => {
  for (const n of fs.readdirSync(path.join(DIR, 'commands'))) {
    assert.match(frontMatter(read('commands/' + n).replace(/\r\n/g, '\n')), /^disable-model-invocation: true$/m, n);
  }
  const agent = read('agents/codex-rescue.md');
  assert.match(frontMatter(agent), /^description: Use only when the user asks for Codex, for example with \/codex:rescue\. Never use it on your own initiative\./m);
  for (const n of fs.readdirSync(path.join(DIR, 'agents'))) assert.doesNotMatch(read('agents/' + n), /proactive|without waiting for the user|do not wait for the user/i, n);
  // The skills are not shown to the user and only describe how the helper works.
  for (const n of fs.readdirSync(path.join(DIR, 'skills'))) assert.match(frontMatter(read('skills/' + n + '/SKILL.md')), /^user-invocable: false$/m, n);
});

test('UT_CodexAddon_PatchToolOnUpstreamText: on OpenAI\'s text it makes exactly the shipped files, a second run changes nothing', () => {
  const tmp = path.join(fx.ROOT, 'codex-plugin', 'patch-tool');
  fx.rmrf(tmp);
  fs.cpSync(DIR, tmp, { recursive: true });
  for (const c of PATCH.CHANGES) {               // back to OpenAI's text
    const f = path.join(tmp, c.file);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(c.to, c.from));
  }
  const first = PATCH.apply(tmp, true);
  assert.deepStrictEqual([first.changed.length, first.missing.length], [PATCH.CHANGES.length, 0]);
  for (const rel of files(DIR)) assert.ok(fs.readFileSync(path.join(tmp, rel)).equals(fs.readFileSync(path.join(DIR, rel))), rel);
  const second = PATCH.apply(tmp, true);
  assert.deepStrictEqual([second.changed.length, second.already.length], [0, PATCH.CHANGES.length]);
});

test('UT_CodexAddon_PatchToolStopsOnNewText: an upstream text it doesn\'t know stops it, and nothing is written', () => {
  const tmp = path.join(fx.ROOT, 'codex-plugin', 'patch-tool-new');
  fx.rmrf(tmp);
  fs.cpSync(DIR, tmp, { recursive: true });
  const agent = path.join(tmp, 'agents', 'codex-rescue.md');
  fs.writeFileSync(agent, fs.readFileSync(agent, 'utf8').replace(PATCH.CHANGES[0].to, 'description: Use proactively, in a new wording\n'));
  const rescue = path.join(tmp, 'commands', 'rescue.md');
  fs.writeFileSync(rescue, fs.readFileSync(rescue, 'utf8').replace(PATCH.CHANGES[2].to, PATCH.CHANGES[2].from));
  const before = fs.readFileSync(rescue, 'utf8');
  const r = PATCH.apply(tmp, true);
  assert.strictEqual(r.missing.length, 1, r.missing.join('; '));
  assert.strictEqual(fs.readFileSync(rescue, 'utf8'), before, 'all or nothing');
});

test('UT_CodexAddon_ReviewGateOff: the automatic review after every reply stays off; nothing in Launchpad turns it on', () => {
  assert.match(read('scripts/lib/state.mjs'), /stopReviewGate: false/, 'off unless the user turns it on');
  const nsi = fs.readFileSync(path.join(fx.REPO, 'ClaudeCode_Launchpad_CLI_Setup.nsi'), 'utf8');
  for (const [name, text] of [['installer', nsi], ['configure-codex-plugin.js', fs.readFileSync(path.join(fx.SOURCE, 'configure-codex-plugin.js'), 'utf8')]]) {
    assert.doesNotMatch(text, /enable-review-gate|stopReviewGate/, name);
  }
});

test('UT_CodexAddon_Catalog: Launchpad\'s catalog lists rtl-terminal as before, then codex from ./codex', () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGINS, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(m.name, 'launchpad-plugins');
  assert.deepStrictEqual(m.plugins.map(p => [p.name, p.source]), [['rtl-terminal', './rtl-terminal'], ['codex', './codex']]);
  assert.match(m.plugins[1].description, /OpenAI's codex-plugin-cc v\d+\.\d+\.\d+, Apache-2\.0; changed so Claude uses Codex only when asked/);
});

test('UT_CodexAddon_LicenseKept: OpenAI\'s LICENSE and NOTICE ship beside the add-on', () => {
  assert.match(read('LICENSE'), /Apache License/);
  assert.match(read('NOTICE'), /OpenAI/);
});

test('UT_CodexAddon_NoPowerShell: the add-on\'s own code starts no PowerShell (Codex itself may use it)', () => {
  for (const rel of files(DIR).filter(f => /\.(mjs|js|json)$/.test(f))) assert.doesNotMatch(read(rel), /powershell|pwsh/i, rel);
});
