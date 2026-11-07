// configure-copilot.js statusline: two of Copilot's own status line items, turned on at install time
// (Noam, 2026-11-07), and taken out again on uninstall. Copilot's settings.json is the user's file:
// only plain JSON is edited, a key the user set is never changed, and only what Launchpad added goes.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./copilot-fixture');

const ITEMS = ['showContextWindow', 'showQuota'];
const settingsFile = d => path.join(d.copilotHome, 'settings.json');
const recordFile = d => path.join(d.kivun, 'kivun-copilot-changes.json');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
function withSettings(name, text) {
  const d = fx.makeEnv(name), m = fx.load();
  if (text !== undefined) { fs.mkdirSync(d.copilotHome, { recursive: true }); fs.writeFileSync(settingsFile(d), text); }
  return { d, m };
}

// ---- Turning them on
test('UT_CopilotStatusLine_NewFile: no settings file, so one is made with just the two items', () => {
  const { d, m } = withSettings('sl-new');
  m.addStatusLine(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { footer: { showContextWindow: true, showQuota: true } });
  const r = readJson(recordFile(d));
  assert.deepStrictEqual(r.files[settingsFile(d)], { created: true, keys: ITEMS });
});

test('UT_CopilotStatusLine_KeepsTheRest: the user\'s other settings and footer choices stay as they are', () => {
  const { d, m } = withSettings('sl-rest', JSON.stringify({ model: 'gpt-x', footer: { showBranch: false }, theme: 'dark' }, null, 2));
  m.addStatusLine(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { model: 'gpt-x', footer: { showBranch: false, showContextWindow: true, showQuota: true }, theme: 'dark' });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)], { created: false, keys: ITEMS });
});

test('UT_CopilotStatusLine_UserChoiceKept: an item the user turned off stays off, and isn\'t recorded', () => {
  const { d, m } = withSettings('sl-choice', '{"footer":{"showQuota":false}}');
  m.addStatusLine(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)).footer, { showQuota: false, showContextWindow: true });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)].keys, ['showContextWindow']);
});

test('UT_CopilotStatusLine_AllSetNothingWritten: both items already chosen, so the file isn\'t touched', () => {
  const text = '{"footer":{"showQuota":true,"showContextWindow":false}}';
  const { d, m } = withSettings('sl-allset', text);
  const t0 = fs.statSync(settingsFile(d)).mtimeMs;
  m.addStatusLine(d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text);
  assert.strictEqual(fs.statSync(settingsFile(d)).mtimeMs, t0);
  assert.ok(!fs.existsSync(recordFile(d)), 'nothing to record');
});

test('UT_CopilotStatusLine_NotPlainJsonLeftAlone: comments, trailing commas, empty or odd files are left exactly as they are', () => {
  const cases = {
    comment: '{\n  // my own note\n  "model": "x"\n}\n',
    trailingComma: '{"model":"x",}',
    empty: '',
    array: '[]',
    footerNumber: '{"footer":5}',
    footerNull: '{"footer":null}',
    footerArray: '{"footer":[]}',
  };
  for (const [name, text] of Object.entries(cases)) {
    const { d, m } = withSettings('sl-odd-' + name, text);
    const out = m.addStatusLine(d.env);
    assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text, name);
    assert.ok(!fs.existsSync(recordFile(d)), name + ': nothing recorded');
    assert.match(out.join(' '), /left it as it is/, name);
    const r = fx.cli(d, ['statusline']);
    assert.strictEqual(r.status, 0, name + ': the install goes on');
  }
});

test('UT_CopilotStatusLine_Idempotent: a second install changes nothing and records nothing twice', () => {
  const { d, m } = withSettings('sl-twice', '{"theme":"dark"}');
  m.addStatusLine(d.env);
  const text = fs.readFileSync(settingsFile(d), 'utf8'), t0 = fs.statSync(settingsFile(d)).mtimeMs, rec = fs.readFileSync(recordFile(d), 'utf8');
  m.addStatusLine(d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text);
  assert.strictEqual(fs.statSync(settingsFile(d)).mtimeMs, t0);
  assert.strictEqual(fs.readFileSync(recordFile(d), 'utf8'), rec);
});

test('UT_CopilotStatusLine_KeepsBomAndLineEnds: a file saved with a BOM and Windows line ends keeps both', () => {
  const { d, m } = withSettings('sl-bom', '\uFEFF{\r\n  "theme": "dark"\r\n}\r\n');
  m.addStatusLine(d.env);
  const out = fs.readFileSync(settingsFile(d), 'utf8');
  assert.ok(out.startsWith('\uFEFF'), 'BOM kept');
  assert.ok(!/[^\r]\n/.test(out), 'every line ends with CRLF');
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'dark', footer: { showContextWindow: true, showQuota: true } });
});

test('UT_CopilotStatusLine_HonorsCopilotHome: a custom COPILOT_HOME gets the items, and the default folder nothing', () => {
  const { d, m } = withSettings('sl-home');
  const other = path.join(d.root, 'elsewhere');
  m.addStatusLine(Object.assign({}, d.env, { COPILOT_HOME: other }));
  assert.deepStrictEqual(readJson(path.join(other, 'settings.json')).footer, { showContextWindow: true, showQuota: true });
  assert.ok(!fs.existsSync(settingsFile(d)));
});

test('UT_CopilotStatusLine_Cli: the installer\'s step prints what it did and exits 0', () => {
  const { d } = withSettings('sl-cli');
  const r = fx.cli(d, ['statusline']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /turned on/);
  assert.ok(fs.existsSync(settingsFile(d)));
});

test('UT_CopilotStatusLine_UnreadableRecordStops: a damaged record means nothing is changed', () => {
  const { d } = withSettings('sl-badrecord', '{"theme":"dark"}');
  fs.writeFileSync(recordFile(d), 'not json');
  const r = fx.cli(d, ['statusline']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /kivun-copilot-changes\.json is unreadable/);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), '{"theme":"dark"}');
});

test('UT_CopilotStatusLine_InterruptedRunRecovers: a record written just before a crash breaks nothing later', () => {
  const { d, m } = withSettings('sl-crash', '{"theme":"dark"}');
  // The record is written before the settings file, so a crash between them leaves this.
  fs.writeFileSync(recordFile(d), JSON.stringify({ version: 1, files: { [settingsFile(d)]: { created: false, keys: ITEMS } } }));
  m.addStatusLine(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)).footer, { showContextWindow: true, showQuota: true });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)].keys, ITEMS, 'not recorded twice');
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'dark' });
});

// ---- Taking them out
test('UT_CopilotStatusLine_UninstallNewFile: a file Launchpad made, still untouched, is deleted', () => {
  const { d, m } = withSettings('sl-un-new');
  m.addStatusLine(d.env);
  m.uninstall(d.env);
  assert.ok(!fs.existsSync(settingsFile(d)));
  assert.ok(!fs.existsSync(recordFile(d)), 'the record goes too');
});

test('UT_CopilotStatusLine_UninstallExistingFile: the user\'s file is back to what it was', () => {
  const { d, m } = withSettings('sl-un-existing', JSON.stringify({ theme: 'dark', footer: { showBranch: false } }));
  m.addStatusLine(d.env);
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'dark', footer: { showBranch: false } });
});

test('UT_CopilotStatusLine_UninstallKeepsUserChanges: what the user set later stays, even in a file Launchpad made', () => {
  const { d, m } = withSettings('sl-un-changed');
  m.addStatusLine(d.env);
  fs.writeFileSync(settingsFile(d), JSON.stringify({ footer: { showContextWindow: true, showQuota: false }, model: 'x' }));
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { footer: { showQuota: false }, model: 'x' });
});

test('UT_CopilotStatusLine_UninstallLeavesNewComments: a file the user has since given comments is left as it is', () => {
  const { d, m } = withSettings('sl-un-jsonc', '{"theme":"dark"}');
  m.addStatusLine(d.env);
  const text = '{\n  // mine now\n  "footer": { "showContextWindow": true, "showQuota": true }\n}\n';
  fs.writeFileSync(settingsFile(d), text);
  m.uninstall(d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text);
  assert.ok(!fs.existsSync(recordFile(d)));
});

test('UT_CopilotStatusLine_UninstallFileGone: the user deleted the file, so nothing is made again', () => {
  const { d, m } = withSettings('sl-un-gone');
  m.addStatusLine(d.env);
  fs.rmSync(settingsFile(d));
  m.uninstall(d.env);
  assert.ok(!fs.existsSync(settingsFile(d)));
  assert.ok(!fs.existsSync(recordFile(d)));
});

test('UT_CopilotStatusLine_UninstallNoRecord: without a record the user\'s file isn\'t touched; twice is fine', () => {
  const text = '{"footer":{"showContextWindow":true,"showQuota":true}}';
  const { d, m } = withSettings('sl-un-norecord', text);
  m.uninstall(d.env);
  m.uninstall(d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text);
});

test('UT_CopilotStatusLine_UninstallUsesTheRecordedFile: COPILOT_HOME changed since the install', () => {
  const { d, m } = withSettings('sl-un-moved');
  const other = path.join(d.root, 'elsewhere');
  m.addStatusLine(Object.assign({}, d.env, { COPILOT_HOME: other }));
  m.uninstall(d.env);
  assert.ok(!fs.existsSync(path.join(other, 'settings.json')));
});

// ---- The installer
const NSI_FILE = process.env.KIVUN_NSI || path.resolve(fx.SOURCE, '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi');
const NSI = fs.readFileSync(NSI_FILE, 'utf8').replace(/\r\n/g, '\n');
const between = (text, from, to) => { const i = text.indexOf(from); assert.ok(i >= 0, from); const j = text.indexOf(to, i); assert.ok(j > i, to); return text.slice(i, j); };

test('UT_CopilotStatusLine_InstallerTurnsThemOn: after the sound hooks, only once Copilot installed', () => {
  const sec = between(NSI, 'Section /o "!Install GitHub Copilot (Required)" SecCopilot', '\nSectionEnd');
  const ok = between(sec, '  ${If} $0 == 0\n', '  ${EndIf}\n\n');
  const hooks = ok.indexOf('configure-copilot.js" install\'');
  const items = ok.indexOf('configure-copilot.js" statusline\'');
  assert.ok(hooks >= 0 && items > hooks, 'the statusline step runs after the hooks, inside the success branch');
});

test('UT_CopilotStatusLine_UninstallerTakesThemOut: with a record, before the install folder (and the record) is deleted', () => {
  const un = NSI.slice(NSI.indexOf('Section "Uninstall"'));
  const check = un.indexOf('${If} ${FileExists} "$LOCALAPPDATA\\Kivun\\kivun-copilot-changes.json"');
  const run = un.indexOf('configure-copilot.js" uninstall\'');
  assert.ok(check >= 0 && run > check, 'runs only when there is a record');
  assert.ok(run < un.indexOf('RMDir /r "$INSTDIR"'), 'before the folder holding the record is deleted');
});
