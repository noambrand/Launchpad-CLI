// Test fixture for "Let Claude hand work to Codex" (v3.6.0): a sealed Kivun folder and fake home, and a
// stand-in for Claude Code's `claude plugin` commands that keeps its add-on list in a JSON file and
// records every call. Nothing touches this PC's real Claude Code.
'use strict';
const fs = require('fs'), path = require('path');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const REPO = path.resolve(SOURCE, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(REPO, '.test-run');
const ID = 'codex@launchpad-plugins';

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }

// The stand-in claude: `plugin list --json`, `plugin marketplace add <dir>`, `plugin install <id> --scope
// user`, `plugin uninstall <id> --scope user`. State: { plugins: [ids], marketplaces: [dirs], fail: {verb:
// true}, badList: true }. A call is recorded as its argument array.
const FAKE_CLAUDE = `'use strict';
const fs = require('fs');
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CLAUDE_CALLS, JSON.stringify(a) + '\\n');
const st = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_STATE, 'utf8'));
st.fail = st.fail || {};
const save = () => fs.writeFileSync(process.env.FAKE_CLAUDE_STATE, JSON.stringify(st));
const key = a.slice(0, a[1] === 'marketplace' ? 3 : 2).join(' ');
if (st.fail[key]) { process.stderr.write('stand-in failure: ' + key); process.exit(1); }
if (key === 'plugin list') {
  if (st.badList) { process.stdout.write('not json'); process.exit(0); }
  process.stdout.write(JSON.stringify(st.plugins.map(id => ({ id, version: '1.0.6', scope: 'user', enabled: true }))));
  process.exit(0);
}
if (key === 'plugin marketplace add') { if (!st.marketplaces.includes(a[3])) st.marketplaces.push(a[3]); save(); process.exit(0); }
if (key === 'plugin install') {
  if (!st.marketplaces.length) { process.stderr.write('marketplace not found'); process.exit(1); }
  if (!st.plugins.includes(a[2])) st.plugins.push(a[2]); save(); process.exit(0);
}
if (key === 'plugin uninstall') {
  if (!st.plugins.includes(a[2])) { process.stderr.write('not installed'); process.exit(1); }
  st.plugins = st.plugins.filter(x => x !== a[2]); save(); process.exit(0);
}
process.stderr.write('stand-in claude: unknown command ' + a.join(' '));
process.exit(2);
`;

// opts.plugins: ids already installed; opts.codex: Codex on this PC (kivun-codex-path.txt); opts.hebrew:
// the Kivun folder's path has Hebrew and a space; opts.fail, opts.badList: see FAKE_CLAUDE.
function makeEnv(name, opts) {
  opts = opts || {};
  const root = path.join(ROOT, 'codex-plugin', name);
  rmrf(root);
  const home = path.join(root, 'h');
  const kivun = path.join(root, opts.hebrew ? '\u05E7\u05D9\u05D1\u05D5\u05DF \u05D1\u05D3\u05D9\u05E7\u05D4' : 'Kivun');
  for (const dir of [home, kivun, path.join(root, 'ad')]) fs.mkdirSync(dir, { recursive: true });
  const d = { root, home, kivun, state: path.join(root, 'claude-state.json'), calls: path.join(root, 'claude-calls.jsonl'), fake: path.join(root, 'fake-claude.js') };
  fs.writeFileSync(d.fake, FAKE_CLAUDE);
  fs.writeFileSync(d.state, JSON.stringify({ plugins: opts.plugins || [], marketplaces: opts.marketplaces || [], fail: opts.fail || {}, badList: !!opts.badList }));
  if (opts.codex !== false) fs.writeFileSync(path.join(kivun, 'kivun-codex-path.txt'), '{}');
  const sys = process.env.SystemRoot || 'C:\\Windows';
  d.env = {
    SystemRoot: sys, windir: sys, ComSpec: path.join(sys, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [path.join(sys, 'System32'), path.dirname(process.execPath)].join(';'),
    USERPROFILE: home, HOME: home, LOCALAPPDATA: path.join(root, 'lad'), APPDATA: path.join(root, 'ad'), KIVUN_DIR: kivun,
    KIVUN_TEST_CLAUDE: d.fake, FAKE_CLAUDE_STATE: d.state, FAKE_CLAUDE_CALLS: d.calls,
  };
  if (opts.noClaude) delete d.env.KIVUN_TEST_CLAUDE;
  return d;
}

const calls = d => fs.existsSync(d.calls) ? fs.readFileSync(d.calls, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const state = d => JSON.parse(fs.readFileSync(d.state, 'utf8'));
const has = (d, name) => fs.existsSync(path.join(d.kivun, name));

module.exports = { SOURCE, REPO, ROOT, ID, rmrf, makeEnv, calls, state, has };
