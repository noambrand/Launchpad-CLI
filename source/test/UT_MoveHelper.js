// move-from-old-folder.js: after the installer moves Launchpad from %LOCALAPPDATA%\Kivun to
// %LOCALAPPDATA%\LaunchpadAI (2026-11-26), it repoints the files outside the folder that the normal
// install doesn't rewrite: Copilot's sound hook, and Windows Terminal's settings.json (a profile icon set
// by Fix WT Icon) and state.json (saved tabs). Runs against a sealed folder.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const HELPER = path.join(SOURCE, 'move-from-old-folder.js');
const OLD = 'C:\\Users\\U\\AppData\\Local\\Kivun';
const NEW = 'C:\\Users\\U\\AppData\\Local\\LaunchpadAI';
const esc = s => s.replace(/\\/g, '\\\\');   // the JSON spelling: doubled backslashes

test('UT_MoveHelper_RewritesBothSpellings: raw and JSON-escaped old paths both point at the new folder', () => {
  const { rewrite } = require(HELPER);
  const text = '"' + esc(OLD) + '\\\\copilot-sound.js" ' + OLD + '\\claudecode-launchpad.bat';
  assert.strictEqual(rewrite(text, OLD, NEW), '"' + esc(NEW) + '\\\\copilot-sound.js" ' + NEW + '\\claudecode-launchpad.bat');
});

test('UT_MoveHelper_CaseAndEnd: a different letter case and a path that ends at a quote are found too', () => {
  const { rewrite } = require(HELPER);
  assert.strictEqual(rewrite('"' + OLD.toLowerCase() + '"', OLD, NEW), '"' + NEW + '"');
});

test('UT_MoveHelper_LeavesKivunWsl: Kivun Terminal\'s Kivun-WSL folder and a longer name are left alone', () => {
  const { rewrite } = require(HELPER);
  const text = OLD + '-WSL\\kivun.bat ' + OLD + 'Extra\\x';
  assert.strictEqual(rewrite(text, OLD, NEW), text);
});

test('UT_MoveHelper_UnicodePath: a user folder with Hebrew and a space survives, and the file stays valid JSON', () => {
  const { rewrite } = require(HELPER);
  const old = 'C:\\Users\\\u05E0\u05D5\u05E2\u05DD \u05DB\u05D4\u05DF\\AppData\\Local\\Kivun';
  const neu = 'C:\\Users\\\u05E0\u05D5\u05E2\u05DD \u05DB\u05D4\u05DF\\AppData\\Local\\LaunchpadAI';
  const json = JSON.stringify({ args: [old + '\\copilot-sound.js'] });
  const out = rewrite(json, old, neu);
  assert.deepStrictEqual(JSON.parse(out), { args: [neu + '\\copilot-sound.js'] });
});

// The three files in a sealed USERPROFILE / LOCALAPPDATA.
function sandbox(name) {
  const root = path.join(ROOT, 'movehelper', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { user: path.join(root, 'User'), lad: path.join(root, 'LAD') };
  d.old = path.join(d.lad, 'Kivun');
  d.neu = path.join(d.lad, 'LaunchpadAI');
  d.hook = path.join(d.user, '.copilot', 'hooks', 'launchpad-sounds.json');
  d.wt = path.join(d.lad, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState');
  d.claudeSettings = path.join(d.user, '.claude', 'settings.json');
  d.known = path.join(d.user, '.claude', 'plugins', 'known_marketplaces.json');
  // Claude Code is a stand-in that records its arguments: this PC's real Claude is never started.
  d.calls = path.join(root, 'claude-calls.jsonl');
  d.fakeClaude = path.join(root, 'fake-claude.js');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(d.fakeClaude, "require('fs').appendFileSync(" + JSON.stringify(d.calls) + ", JSON.stringify(process.argv.slice(2)) + '\\n');\n");
  return d;
}
function run(d, extra) {
  const env = Object.assign({}, process.env, { USERPROFILE: d.user, LOCALAPPDATA: d.lad, KIVUN_TEST_CLAUDE: d.fakeClaude }, extra || {});
  delete env.CLAUDE_CONFIG_DIR;
  if (!extra || !('COPILOT_HOME' in extra)) delete env.COPILOT_HOME;
  const r = cp.spawnSync(process.execPath, [HELPER, d.old, d.neu], { env, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
}
const calls = d => fs.existsSync(d.calls) ? fs.readFileSync(d.calls, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
const write = (f, obj) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj, null, 4)); };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

test('UT_MoveHelper_Files: the Copilot hook, a WT profile icon and a saved tab point at the new folder', () => {
  const d = sandbox('files');
  write(d.hook, { hooks: { sessionEnd: [{ type: 'command', args: [d.old.replace(/\\/g, '/') + '/copilot-sound.js'] }, { type: 'command', args: [path.join(d.old, 'copilot-sound.js')] }] } });
  write(path.join(d.wt, 'settings.json'), { profiles: { list: [{ name: 'ClaudeCode Launchpad CLI', icon: path.join(d.old, 'claude_icon.ico') }, { name: 'Ubuntu', icon: 'ms-appx:///x.png' }] } });
  write(path.join(d.wt, 'state.json'), { persistedWindowLayouts: [{ tabLayout: [{ action: 'newTab', commandline: '"' + path.join(d.old, 'claudecode-launchpad.bat') + '" --run' }] }] });
  run(d);
  const hook = read(d.hook).hooks.sessionEnd;
  assert.strictEqual(hook[0].args[0], d.neu.replace(/\\/g, '/') + '/copilot-sound.js');
  assert.strictEqual(hook[1].args[0], path.join(d.neu, 'copilot-sound.js'));
  const s = read(path.join(d.wt, 'settings.json')).profiles.list;
  assert.strictEqual(s[0].icon, path.join(d.neu, 'claude_icon.ico'));
  assert.strictEqual(s[1].icon, 'ms-appx:///x.png');
  assert.strictEqual(read(path.join(d.wt, 'state.json')).persistedWindowLayouts[0].tabLayout[0].commandline,
    '"' + path.join(d.neu, 'claudecode-launchpad.bat') + '" --run');
});

test('UT_MoveHelper_ClaudeStatusLine: Claude\'s status line points at the new folder, whichever agent was chosen', () => {
  const d = sandbox('statusline');
  write(d.claudeSettings, { statusLine: { type: 'command', command: 'node "' + d.old.replace(/\\/g, '/') + '/statusline.mjs"' }, theme: 'light' });
  run(d);
  const s = read(d.claudeSettings);
  assert.strictEqual(s.statusLine.command, 'node "' + d.neu.replace(/\\/g, '/') + '/statusline.mjs"');
  assert.strictEqual(s.theme, 'light');
});

test('UT_MoveHelper_UnexpandedForm: %LOCALAPPDATA%\\Kivun, written that way, becomes %LOCALAPPDATA%\\LaunchpadAI', () => {
  const d = sandbox('unexpanded');
  write(path.join(d.wt, 'state.json'), { tabs: [{ commandline: '"%LOCALAPPDATA%\\Kivun\\claudecode-launchpad.bat" --run' }], other: '%LOCALAPPDATA%\\Kivun-WSL\\x' });
  run(d);
  const s = read(path.join(d.wt, 'state.json'));
  assert.strictEqual(s.tabs[0].commandline, '"%LOCALAPPDATA%\\LaunchpadAI\\claudecode-launchpad.bat" --run');
  assert.strictEqual(s.other, '%LOCALAPPDATA%\\Kivun-WSL\\x');
});

test('UT_MoveHelper_CopilotHome: with COPILOT_HOME set, the sound hook is read from there', () => {
  const d = sandbox('copilothome');
  const home = path.join(d.user, 'cop');
  const hook = path.join(home, 'hooks', 'launchpad-sounds.json');
  write(hook, { args: [path.join(d.old, 'copilot-sound.js')] });
  run(d, { COPILOT_HOME: home });
  assert.deepStrictEqual(read(hook).args, [path.join(d.neu, 'copilot-sound.js')]);
});

test('UT_MoveHelper_CatalogMoved: when Claude\'s add-on catalog was added from the old folder, it is added again from the new one', () => {
  const d = sandbox('catalog');
  write(d.known, { 'launchpad-plugins': { source: { source: 'directory', path: path.join(d.old, 'plugins') }, installLocation: path.join(d.old, 'plugins') } });
  run(d);
  assert.deepStrictEqual(calls(d), [['plugin', 'marketplace', 'add', path.join(d.neu, 'plugins')]]);
});

test('UT_MoveHelper_CatalogElsewhere: a catalog that isn\'t in the old folder, or none, means Claude is not started', () => {
  const d = sandbox('catalog-none');
  run(d);
  write(d.known, { 'launchpad-plugins': { source: { source: 'directory', path: 'D:\\mine\\plugins' } } });
  run(d);
  assert.deepStrictEqual(calls(d), []);
});

test('UT_MoveHelper_NothingThere: missing files are skipped, exit 0, and nothing is created', () => {
  const d = sandbox('none');
  fs.mkdirSync(d.lad, { recursive: true });
  run(d);
  assert.ok(!fs.existsSync(d.hook));
  assert.ok(!fs.existsSync(d.wt));
});

test('UT_MoveHelper_UnchangedNotWritten: a file without the old folder keeps its bytes and its time', () => {
  const d = sandbox('unchanged');
  const f = path.join(d.wt, 'settings.json');
  fs.mkdirSync(d.wt, { recursive: true });
  fs.writeFileSync(f, '// comment kept\n{ "profiles": { "list": [] } }\n');
  const before = fs.statSync(f).mtimeMs;
  run(d);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '// comment kept\n{ "profiles": { "list": [] } }\n');
  assert.strictEqual(fs.statSync(f).mtimeMs, before);
});
