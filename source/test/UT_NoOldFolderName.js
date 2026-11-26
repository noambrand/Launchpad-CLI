// Launchpad's Windows folder is %LOCALAPPDATA%\LaunchpadAI (Noam, 2026-11-26; it was %LOCALAPPDATA%\Kivun).
// Runtime files find the folder from their own location, so no shipped file names the old folder, except
// the installer lines that move an old install (OLD_DIR), the helper that repoints files after the move,
// and the cleanup of the old uninstall entry. Kivun-WSL and KivunTerminal (the sister product) don't match.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const REPO = path.resolve(SOURCE, '..');
const SKIP_DIRS = new Set(['test', 'plugins', 'node_modules']);
const SKIP_EXT = new Set(['.wav', '.mp3', '.ico', '.png', '.jpg', '.exe', '.dll', '.zip', '.pkg']);
// "\Kivun" or "/Kivun" in a path, or 'Kivun' as a path part (path.join(localAppData, 'Kivun')).
const OLD = /[\\/]Kivun(?![-\w])|(['"])Kivun\1/;
const ALLOWED_FILES = new Set(['move-from-old-folder.js']);
// NSIS lines that may name the old folder: the OLD_DIR define, and the old uninstall entry's cleanup.
const ALLOWED_NSI = [/^!define OLD_DIR "\$LOCALAPPDATA\\Kivun"$/, /\\Uninstall\\Kivun"$/];

function shipped() {
  const out = [];
  (function walk(dir) {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p); continue; }
      if (!SKIP_EXT.has(path.extname(n).toLowerCase()) && !ALLOWED_FILES.has(n)) out.push(p);
    }
  })(SOURCE);
  return out;
}

test('UT_NoOldFolderName: no shipped file names %LOCALAPPDATA%\\Kivun outside the move code', () => {
  const hits = [];
  for (const f of shipped()) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      // The picker's one-time read of profiles saved before 3.8.0 is marked OLD_DATA_DIR.
      if (OLD.test(line) && !/\/\/ OLD_DATA_DIR$/.test(line)) hits.push(path.relative(REPO, f) + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
    });
  }
  const nsi = path.join(REPO, 'ClaudeCode_Launchpad_CLI_Setup.nsi');
  fs.readFileSync(nsi, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith(';') || !OLD.test(t)) return;
    if (ALLOWED_NSI.some(re => re.test(t)) || /\$\{OLD_DIR\}/.test(t)) return;
    hits.push('ClaudeCode_Launchpad_CLI_Setup.nsi:' + (i + 1) + ': ' + t.slice(0, 120));
  });
  assert.deepStrictEqual(hits, []);
});

test('UT_FolderFromOwnLocation: without KIVUN_DIR, the Codex helpers use the folder they ship in', () => {
  const env = { LOCALAPPDATA: 'C:\\nowhere', USERPROFILE: 'C:\\Users\\u' };
  assert.strictEqual(require(path.join(SOURCE, 'configure-codex.js')).paths(env).kivun, SOURCE);
  assert.strictEqual(require(path.join(SOURCE, 'configure-codex-plugin.js')).paths(env).kivun, SOURCE);
});
