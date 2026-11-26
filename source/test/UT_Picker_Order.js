// The picker's layout (Noam, 2026-11-15 and 2026-11-26): the AI's model and conversation choice are
// always visible, right under the folder; Advanced options holds the rest, the most used first and the
// developer tools (startup slash commands, environment variables) last. Numbers run in order, no gaps.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const HTA = path.join(SOURCE, 'folder-picker.hta');
const html = () => fs.readFileSync(HTA, 'utf8');

// [{num, title}] for every numbered section, in page order.
function sections() {
  const out = [];
  const re = /<span class="opt-num">(\d+)<\/span>([\s\S]*?)(?:<button|<\/div>)/g;
  let m;
  const t = html();
  while ((m = re.exec(t))) out.push({ num: Number(m[1]), title: m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() });
  return out;
}

test('UT_PickerOrder_MostUsedFirst: folder, the AI\'s model and conversation, then the advanced sections from most to least used', () => {
  const titles = sections().map(s => s.title);
  const want = [/^Type or paste/, /^Pick a folder/, /model and conversation/, /^Quick options/, /Sound alerts/, /Auto-continue/, /Terminal color/, /^Startup slash commands/, /^Environment variables/];
  assert.strictEqual(titles.length, want.length, titles.join(' | '));
  want.forEach((re, i) => assert.match(titles[i], re, 'section ' + (i + 1) + ': ' + titles.join(' | ')));
});

test('UT_PickerOrder_NumbersInOrder: the section badges read 1 to 9 down the page', () => {
  assert.deepStrictEqual(sections().map(s => s.num), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('UT_PickerOrder_ModelAlwaysVisible: model and conversation sit above Advanced options; quick options and custom flags inside it', () => {
  const t = html();
  const adv = t.indexOf('<div id="advanced-body"');
  assert.ok(adv > 0, 'Advanced options body');
  for (const id of ['name="flag-model"', 'id="codex-models"', 'id="copilot-model"', 'id="antigravity-model"', 'name="flag-conv"']) {
    assert.ok(t.indexOf(id) > 0 && t.indexOf(id) < adv, id + ' is always visible');
  }
  for (const id of ['id="claude-chips"', 'id="flag-custom"', 'id="preview-cmd"']) {
    assert.ok(t.indexOf(id) > adv, id + ' is under Advanced options');
  }
});
