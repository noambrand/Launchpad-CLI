// configure-copilot.js theme: Copilot's "default" theme, which uses the terminal's own colors, set at
// install time unless the user chose a theme (Noam, 2026-11-07), and taken out again on uninstall.
// Copilot's standard "github" theme paints its own background over Launchpad's terminal color. The
// rules are the status line items' rules: only plain JSON is edited, a user's choice is never changed,
// and only what Launchpad added goes.
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
// The installer's order: the status line items, then the theme.
function installSteps(m, env) { m.addStatusLine(env); m.addTheme(env); }

// ---- Setting it
test('UT_CopilotTheme_NewFile: no settings file, so one is made with just the theme', () => {
  const { d, m } = withSettings('th-new');
  m.addTheme(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'default' });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)], { created: true, keys: [], theme: 'default' });
});

test('UT_CopilotTheme_WithStatusLine: in the installer\'s order, one file and one record hold both', () => {
  const { d, m } = withSettings('th-both');
  installSteps(m, d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { footer: { showContextWindow: true, showQuota: true }, theme: 'default' });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)], { created: true, keys: ITEMS, theme: 'default' });
});

test('UT_CopilotTheme_KeepsTheRest: the user\'s other settings stay as they are', () => {
  const { d, m } = withSettings('th-rest', JSON.stringify({ model: 'gpt-x', footer: { showBranch: false } }, null, 2));
  m.addTheme(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { model: 'gpt-x', footer: { showBranch: false }, theme: 'default' });
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)], { created: false, keys: [], theme: 'default' });
});

test('UT_CopilotTheme_UserChoiceKept: any theme the user set stays, under either name, and nothing is recorded', () => {
  const cases = {
    github: '{"theme":"github"}',
    dim: '{"theme":"dim"}',
    ownDefault: '{"theme":"default"}',
    unknownValue: '{"theme":"dark"}',
    // Copilot reads theme, then the older name colorMode, so a theme added beside it would win.
    olderName: '{"colorMode":"dim"}',
  };
  for (const [name, text] of Object.entries(cases)) {
    const { d, m } = withSettings('th-choice-' + name, text);
    const t0 = fs.statSync(settingsFile(d)).mtimeMs;
    m.addTheme(d.env);
    assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text, name);
    assert.strictEqual(fs.statSync(settingsFile(d)).mtimeMs, t0, name);
    assert.ok(!fs.existsSync(recordFile(d)), name + ': nothing to record');
  }
});

test('UT_CopilotTheme_NotPlainJsonLeftAlone: comments, trailing commas, empty or odd files are left exactly as they are', () => {
  const cases = {
    comment: '{\n  // my own note\n  "model": "x"\n}\n',
    trailingComma: '{"model":"x",}',
    empty: '',
    array: '[]',
    footerNumber: '{"footer":5}',
  };
  for (const [name, text] of Object.entries(cases)) {
    const { d, m } = withSettings('th-odd-' + name, text);
    const out = m.addTheme(d.env);
    assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text, name);
    assert.ok(!fs.existsSync(recordFile(d)), name + ': nothing recorded');
    assert.match(out.join(' '), /left it as it is/, name);
    const r = fx.cli(d, ['theme']);
    assert.strictEqual(r.status, 0, name + ': the install goes on');
  }
});

test('UT_CopilotTheme_Idempotent: a second install changes nothing and records nothing twice', () => {
  const { d, m } = withSettings('th-twice', '{"model":"x"}');
  installSteps(m, d.env);
  const text = fs.readFileSync(settingsFile(d), 'utf8'), t0 = fs.statSync(settingsFile(d)).mtimeMs, rec = fs.readFileSync(recordFile(d), 'utf8');
  installSteps(m, d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), text);
  assert.strictEqual(fs.statSync(settingsFile(d)).mtimeMs, t0);
  assert.strictEqual(fs.readFileSync(recordFile(d), 'utf8'), rec);
});

test('UT_CopilotTheme_KeepsBomAndLineEnds: a file saved with a BOM and Windows line ends keeps both', () => {
  const { d, m } = withSettings('th-bom', '\uFEFF{\r\n  "model": "x"\r\n}\r\n');
  m.addTheme(d.env);
  const out = fs.readFileSync(settingsFile(d), 'utf8');
  assert.ok(out.startsWith('\uFEFF'), 'BOM kept');
  assert.ok(!/[^\r]\n/.test(out), 'every line ends with CRLF');
  assert.deepStrictEqual(readJson(settingsFile(d)), { model: 'x', theme: 'default' });
});

test('UT_CopilotTheme_HonorsCopilotHome: a custom COPILOT_HOME gets the theme, and the default folder nothing', () => {
  const { d, m } = withSettings('th-home');
  const other = path.join(d.root, 'elsewhere');
  m.addTheme(Object.assign({}, d.env, { COPILOT_HOME: other }));
  assert.deepStrictEqual(readJson(path.join(other, 'settings.json')), { theme: 'default' });
  assert.ok(!fs.existsSync(settingsFile(d)));
});

test('UT_CopilotTheme_Cli: the installer\'s step prints what it did and exits 0', () => {
  const { d } = withSettings('th-cli');
  const r = fx.cli(d, ['theme']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /theme set to default/);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'default' });
});

test('UT_CopilotTheme_UnreadableRecordStops: a damaged record means nothing is changed', () => {
  const { d } = withSettings('th-badrecord', '{"model":"x"}');
  fs.writeFileSync(recordFile(d), 'not json');
  const r = fx.cli(d, ['theme']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /kivun-copilot-changes\.json is unreadable/);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), '{"model":"x"}');
});

// ---- Taking it out
test('UT_CopilotTheme_UninstallNewFile: a file Launchpad made for both, still untouched, is deleted', () => {
  const { d, m } = withSettings('th-un-new');
  installSteps(m, d.env);
  m.uninstall(d.env);
  assert.ok(!fs.existsSync(settingsFile(d)));
  assert.ok(!fs.existsSync(recordFile(d)), 'the record goes too');
});

test('UT_CopilotTheme_UninstallExistingFile: the user\'s file is back to what it was', () => {
  const before = { model: 'x', footer: { showBranch: false } };
  const { d, m } = withSettings('th-un-existing', JSON.stringify(before));
  installSteps(m, d.env);
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), before);
});

test('UT_CopilotTheme_UninstallKeepsUserTheme: a theme the user picked later stays, and Launchpad\'s items still go', () => {
  const { d, m } = withSettings('th-un-changed');
  installSteps(m, d.env);
  const now = readJson(settingsFile(d));
  now.theme = 'dim';
  fs.writeFileSync(settingsFile(d), JSON.stringify(now));
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'dim' });
});

test('UT_CopilotTheme_UninstallOnlyTheTheme: status line items the user had chosen stay, and only the theme goes', () => {
  const before = { footer: { showContextWindow: true, showQuota: true } };
  const { d, m } = withSettings('th-un-only', JSON.stringify(before));
  installSteps(m, d.env);
  assert.deepStrictEqual(readJson(recordFile(d)).files[settingsFile(d)], { created: false, keys: [], theme: 'default' });
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), before);
  assert.ok(!fs.existsSync(recordFile(d)));
});

test('UT_CopilotTheme_UninstallLeavesOwnDefault: a "default" the user set before the install stays', () => {
  const { d, m } = withSettings('th-un-own', '{"theme":"default"}');
  installSteps(m, d.env);
  m.uninstall(d.env);
  assert.deepStrictEqual(readJson(settingsFile(d)), { theme: 'default' });
});

test('UT_CopilotTheme_UninstallInterruptedRun: a theme recorded but never written leaves the file untouched', () => {
  // The record is written before the settings file, so a crash between them leaves this.
  const { d, m } = withSettings('th-un-crash', '{"model":"x"}');
  fs.writeFileSync(recordFile(d), JSON.stringify({ version: 1, files: { [settingsFile(d)]: { created: false, keys: [], theme: 'default' } } }));
  const t0 = fs.statSync(settingsFile(d)).mtimeMs;
  m.uninstall(d.env);
  assert.strictEqual(fs.readFileSync(settingsFile(d), 'utf8'), '{"model":"x"}');
  assert.strictEqual(fs.statSync(settingsFile(d)).mtimeMs, t0);
  assert.ok(!fs.existsSync(recordFile(d)));
});

// ---- The installer
const NSI_FILE = process.env.KIVUN_NSI || path.resolve(fx.SOURCE, '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi');
const NSI = fs.readFileSync(NSI_FILE, 'utf8').replace(/\r\n/g, '\n');
const between = (text, from, to) => { const i = text.indexOf(from); assert.ok(i >= 0, from); const j = text.indexOf(to, i); assert.ok(j > i, to); return text.slice(i, j); };

test('UT_CopilotTheme_InstallerSetsIt: after the status line items, only once Copilot installed', () => {
  const sec = between(NSI, 'Section /o "!Install GitHub Copilot (Required)" SecCopilot', '\nSectionEnd');
  const ok = between(sec, '  ${If} $0 == 0\n', '  ${EndIf}\n\n');
  const items = ok.indexOf('configure-copilot.js" statusline\'');
  const theme = ok.indexOf('configure-copilot.js" theme\'');
  assert.ok(items >= 0 && theme > items, 'the theme step runs after the status line step, inside the success branch');
});

test('UT_CopilotTheme_UninstallerNoteNamesIt: if Launchpad\'s changes can\'t be taken out, the note names the theme too', () => {
  const un = NSI.slice(NSI.indexOf('Section "Uninstall"'));
  const run = un.indexOf('configure-copilot.js" uninstall\'');
  assert.ok(run >= 0);
  assert.match(un.slice(run, un.indexOf('/SD IDOK', run)), /theme/);
});
