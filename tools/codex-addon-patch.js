// codex-addon-patch.js (v3.6.0)
// Makes Launchpad's changes to OpenAI's Codex add-on for Claude Code (openai/codex-plugin-cc), so Claude
// uses Codex only when the user asks (Noam's decision, 2026-11-10). Run on a copy of the add-on's
// plugins/codex folder from the release named in source\plugins\codex.upstream:
//
//   node tools\codex-addon-patch.js <folder>           make the changes (again is fine: already made = no change)
//   node tools\codex-addon-patch.js <folder> --check   exit 0 only when every change is already made
//
// Each change names the exact upstream text it replaces. When a new upstream release changes that text,
// this stops with an error instead of shipping a half-changed add-on: read the new text, then update
// CHANGES here and docs\CODEX-ADDON.md together. Node built-ins only.
'use strict';
const fs = require('fs');
const path = require('path');

const ONLY_WHEN_ASKED = 'disable-model-invocation: true';

const CHANGES = [
  {
    file: 'agents/codex-rescue.md',
    why: 'the helper\'s description decides whether Claude starts it on its own',
    from: 'description: Proactively use when Claude Code is stuck, wants a second implementation or diagnosis pass, needs a deeper root-cause investigation, or should hand a substantial coding task to Codex through the shared runtime\n',
    to: 'description: Use only when the user asks for Codex, for example with /codex:rescue. Never use it on your own initiative. Hands an investigation, a fix or a coding task to Codex through the shared runtime\n',
  },
  {
    file: 'agents/codex-rescue.md',
    why: 'the same rule inside the helper',
    from: '- Do not wait for the user to explicitly ask for Codex. Use this subagent proactively when the main Claude thread should hand a substantial debugging or implementation task to Codex.\n',
    to: '- Run only when the user asked for Codex. Never start on your own initiative.\n',
  },
  {
    file: 'commands/rescue.md',
    why: 'Claude may not run /codex:rescue by itself; the user still can',
    from: 'allowed-tools: Bash(node:*), AskUserQuestion, Agent\n---\n',
    to: ONLY_WHEN_ASKED + '\nallowed-tools: Bash(node:*), AskUserQuestion, Agent\n---\n',
  },
  {
    file: 'commands/setup.md',
    why: 'Claude may not run /codex:setup by itself (it can turn on the review gate); the user still can',
    from: 'allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion\n---\n',
    to: ONLY_WHEN_ASKED + '\nallowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion\n---\n',
  },
];

// Returns { changed: [...], already: [...], missing: [...] }; writes only when write is true and
// nothing is missing, so a folder is either fully changed or left as it was.
function apply(dir, write) {
  const result = { changed: [], already: [], missing: [] };
  const texts = {};
  for (const c of CHANGES) {
    const file = path.join(dir, c.file);
    if (!(c.file in texts)) {
      if (!fs.existsSync(file)) { result.missing.push(c.file + ' (file not found)'); continue; }
      texts[c.file] = fs.readFileSync(file, 'utf8');
    }
    const t = texts[c.file];
    // c.to is looked for first: for the two command files it contains c.from.
    if (t.includes(c.to)) { result.already.push(c.file + ': ' + c.why); continue; }
    if (t.split(c.from).length !== 2) { result.missing.push(c.file + ': upstream text not found once (' + c.why + ')'); continue; }
    texts[c.file] = t.replace(c.from, c.to);
    result.changed.push(c.file + ': ' + c.why);
  }
  if (write && result.missing.length === 0) {
    for (const f of Object.keys(texts)) fs.writeFileSync(path.join(dir, f), texts[f]);
  }
  return result;
}

module.exports = { CHANGES, ONLY_WHEN_ASKED, apply };

if (require.main === module) {
  const dir = process.argv[2];
  const check = process.argv.includes('--check');
  if (!dir || !fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) {
    console.error('Usage: node tools\\codex-addon-patch.js <the add-on\'s plugins/codex folder> [--check]');
    process.exit(2);
  }
  const r = apply(dir, !check);
  for (const s of r.already) console.log('already made: ' + s);
  for (const s of r.changed) console.log((check ? 'NOT made:     ' : 'made:         ') + s);
  for (const s of r.missing) console.error('FAILED:       ' + s);
  if (r.missing.length) process.exit(1);
  if (check && r.changed.length) process.exit(1);
}
