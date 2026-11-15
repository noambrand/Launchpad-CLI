// The picker's Advanced options order (Noam, 2026-11-15): the everyday sections (sounds,
// terminal color, auto-continue) come before the developer ones (startup slash commands,
// environment variables), which go last. Numbers run in order with no gaps.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const HTA = path.join(SOURCE, 'folder-picker.hta');

// [{num, title}] for every numbered section, in page order.
function sections() {
  const html = fs.readFileSync(HTA, 'utf8');
  const out = [];
  const re = /<span class="opt-num">(\d+)<\/span>([\s\S]*?)(?:<button|<\/div>)/g;
  let m;
  while ((m = re.exec(html))) out.push({ num: Number(m[1]), title: m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() });
  return out;
}

test('UT_PickerOrder_DevToolsLast: sounds, color and auto-continue come before startup commands and env vars', () => {
  const titles = sections().map(s => s.title);
  const want = [/^Type or paste/, /^Pick a folder/, /flags/, /Sound alerts/, /Terminal color/, /Auto-continue/, /^Startup slash commands/, /^Environment variables/];
  assert.strictEqual(titles.length, want.length, titles.join(' | '));
  want.forEach((re, i) => assert.match(titles[i], re, 'section ' + (i + 1) + ': ' + titles.join(' | ')));
});

test('UT_PickerOrder_NumbersInOrder: the section badges read 1 to 8 down the page', () => {
  assert.deepStrictEqual(sections().map(s => s.num), [1, 2, 3, 4, 5, 6, 7, 8]);
});
