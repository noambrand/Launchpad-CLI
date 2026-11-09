// v3.6.0 "Let Claude hand work to Codex" in the installer. As in the other installer tests, the real
// sections and functions are cut out of the script, compiled with makensis into a small silent installer,
// and run against a sealed folder: here with the real configure-codex-plugin.js and the stand-in claude
// of codex-plugin-fixture.js. The components page is played by calling ComponentsPre (TEST_PAGE=1) and,
// for the user's click, unticking the section (TEST_UNTICK=1). Nothing touches this PC's real Launchpad.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-plugin-fixture');

const NSI_FILE = process.env.KIVUN_NSI || path.resolve(fx.SOURCE, '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi');
const NSI = fs.readFileSync(NSI_FILE, 'utf8').replace(/\r\n/g, '\n');
const MAKENSIS = process.env.MAKENSIS || path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'NSIS', 'makensis.exe');
const SKIP = fs.existsSync(MAKENSIS) ? false : 'makensis not found (' + MAKENSIS + ')';

function cut(text, start, end, includeEnd) {
  const i = text.indexOf(start);
  assert.ok(i >= 0, 'not found in the installer script: ' + start);
  const j = text.indexOf(end, i + start.length);
  assert.ok(j >= 0, 'end not found after: ' + start);
  return text.slice(i, includeEnd ? j + end.length : j);
}
const func = name => cut(NSI, 'Function ' + name + '\n', '\nFunctionEnd\n', true);
const seams = s => s.replace(/\$PROFILE\b/g, '$TestProfile').replace(/\$LOCALAPPDATA\b/g, '$TestLocal').replace(/\$PROGRAMFILES(64)?\b/g, '$TestProgramFiles');
const SEC = 'Section "Let Claude hand work to Codex" SecCodexPlugin';
const SEC_OFF = 'Section "-Claude-to-Codex off" SecCodexPluginOff';
const PREFIX = 'Claude can now hand work to Codex: in Claude, type /codex:review or /codex:rescue.\r\n\r\n';

function testScript(out) {
  return [
    'Unicode True',
    '!include "LogicLib.nsh"', '!include "Sections.nsh"',
    'Name "CodexPluginTest"', 'OutFile "' + out + '"', 'RequestExecutionLevel user', 'SilentInstall silent', 'InstallDir "$TEMP\\unused"',
    'Var ConfigAgent', 'Var NodeExe', 'Var FinishText', 'Var CodexPluginFits', 'Var CodexPluginShown',
    'Var TestProfile', 'Var TestLocal', 'Var TestProgramFiles',
    'Function .onInit',
    '  ReadEnvStr $INSTDIR TEST_INSTDIR', '  ReadEnvStr $TestProfile TEST_PROFILE', '  ReadEnvStr $TestLocal TEST_LOCALAPPDATA', '  ReadEnvStr $TestProgramFiles TEST_PROGRAMFILES',
    '  ReadEnvStr $ConfigAgent TEST_CHOICE', '  StrCpy $FinishText "base text"', '  StrCpy $CodexPluginShown ""',
    '  Call TestPage',
    'FunctionEnd',
    'Function Note', '  Exch $9', '  FileOpen $8 "$INSTDIR\\nsis-report.txt" a', '  FileSeek $8 0 END', '  FileWrite $8 "$9$\\r$\\n"', '  FileClose $8', '  Pop $9', 'FunctionEnd',
    '!macro NOTE text', '  Push "${text}"', '  Call Note', '!macroend',
    seams(cut(NSI, SEC + '\n', '\nSectionEnd\n', true)),
    seams(cut(NSI, SEC_OFF + '\n', '\nSectionEnd\n', true)),
    'Section "-report" SecReport',
    '  !insertmacro NOTE "shown=$CodexPluginShown"', '  !insertmacro NOTE "fits=$CodexPluginFits"',
    '  SectionGetText ${SecCodexPlugin} $0', '  !insertmacro NOTE "text=$0"',
    '  ${If} ${SectionIsSelected} ${SecCodexPlugin}', '    !insertmacro NOTE "selected=1"', '  ${Else}', '    !insertmacro NOTE "selected=0"', '  ${EndIf}',
    '  FileOpen $8 "$INSTDIR\\finish.txt" w', '  FileWriteUTF16LE $8 $FinishText', '  FileClose $8',
    'SectionEnd',
    ...['CodexPluginFits', 'ComponentsPre', 'FindNodeExe'].map(n => seams(func(n))),
    // The components page: shown (ComponentsPre), the user's untick, and Back then on again.
    'Function TestPage',
    '  ReadEnvStr $R8 TEST_PAGE',
    '  ${If} $R8 == "1"', '    Call ComponentsPre',
    '    ReadEnvStr $R9 TEST_UNTICK', '    ${If} $R9 == "1"', '      !insertmacro UnselectSection ${SecCodexPlugin}', '    ${EndIf}',
    '    ReadEnvStr $R9 TEST_BACK', '    ${If} $R9 == "1"', '      Call ComponentsPre', '    ${EndIf}',
    '  ${EndIf}',
    'FunctionEnd',
  ].join('\r\n') + '\r\n';
}

let EXE = null;
function build() {
  if (EXE) return EXE;
  const dir = path.join(fx.ROOT, 'nsis-codex-plugin');
  fx.rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'codex-plugin-test.exe');
  const script = path.join(dir, 'codex-plugin-test.nsi');
  fs.writeFileSync(script, '\uFEFF' + testScript(exe));
  const r = cp.spawnSync(MAKENSIS, ['/V2', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.strictEqual(r.status, 0, 'makensis failed:\n' + r.stdout + r.stderr);
  assert.ok(!/warning/i.test(r.stdout), 'makensis warnings:\n' + r.stdout);
  return (EXE = exe);
}

// opts: choice (the agent chosen now), claude (a Claude Code already here), codex (a Codex already here),
// plus the fixture's options for the stand-in claude.
function sandbox(name, opts) {
  opts = opts || {};
  const d = fx.makeEnv('nsis ' + name, Object.assign({}, opts, { codex: !!opts.codex }));
  fs.copyFileSync(path.join(fx.SOURCE, 'configure-codex-plugin.js'), path.join(d.kivun, 'configure-codex-plugin.js'));
  if (opts.claude) {
    fs.mkdirSync(path.join(d.home, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(d.home, '.local', 'bin', 'claude.exe'), '');
  }
  return d;
}

function runInstaller(d, env) {
  const r = cp.spawnSync(build(), [], {
    env: Object.assign({}, d.env, {
      TEST_INSTDIR: d.kivun, TEST_PROFILE: d.home, TEST_LOCALAPPDATA: path.join(d.root, 'lad'), TEST_PROGRAMFILES: path.join(d.root, 'pf'),
      TEMP: d.root, TMP: d.root, TEST_CHOICE: 'claude', TEST_PAGE: '1',
    }, env || {}),
    windowsHide: true, timeout: 180000,
  });
  const rep = path.join(d.kivun, 'nsis-report.txt');
  const notes = fs.existsSync(rep) ? fs.readFileSync(rep, 'utf8').split('\r\n').filter(Boolean) : [];
  const get = k => { const l = notes.find(x => x.startsWith(k + '=')); return l === undefined ? undefined : l.slice(k.length + 1); };
  const finishFile = path.join(d.kivun, 'finish.txt');
  return { status: r.status, notes, get, finish: fs.existsSync(finishFile) ? fs.readFileSync(finishFile, 'utf16le') : undefined };
}
const verbs = d => fx.calls(d).map(a => a.slice(0, a[1] === 'marketplace' ? 3 : 2).join(' '));

// ---------------------------------------------------------------- compiled and run: when the tick shows
test('UT_InstallerCodexPlugin_ClaudeNowCodexBefore: shown and ticked; the add-on goes on; the finish page says how to use it', { skip: SKIP }, () => {
  const d = sandbox('claude now', { codex: true });
  const r = runInstaller(d);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual([r.get('shown'), r.get('text'), r.get('selected')], ['1', 'Let Claude hand work to Codex', '1'], r.notes.join(' | '));
  assert.deepStrictEqual(verbs(d), ['plugin list', 'plugin marketplace add', 'plugin install', 'plugin list']);
  assert.deepStrictEqual(fx.state(d).plugins, [fx.ID]);
  assert.strictEqual(r.finish, PREFIX + 'base text');
});

test('UT_InstallerCodexPlugin_CodexNowClaudeBefore: Codex chosen on a PC that has Claude: shown, and on', { skip: SKIP }, () => {
  const d = sandbox('codex now', { claude: true });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');   // what SecCodex leaves when it verified Codex
  const r = runInstaller(d, { TEST_CHOICE: 'codex' });
  assert.deepStrictEqual([r.get('shown'), r.get('selected')], ['1', '1'], r.notes.join(' | '));
  assert.deepStrictEqual(fx.state(d).plugins, [fx.ID]);
});

test('UT_InstallerCodexPlugin_OtherAgentBothHere: Copilot chosen with Claude and Codex already here: shown, and on', { skip: SKIP }, () => {
  const d = sandbox('copilot now', { claude: true, codex: true });
  const r = runInstaller(d, { TEST_CHOICE: 'copilot' });
  assert.deepStrictEqual([r.get('shown'), r.get('selected')], ['1', '1']);
  assert.deepStrictEqual(fx.state(d).plugins, [fx.ID]);
});

for (const [name, opts, choice] of [
  ['ClaudeOnly', {}, 'claude'],
  ['CodexOnly', {}, 'codex'],
  ['CopilotWithClaudeOnly', { claude: true }, 'copilot'],
]) {
  test('UT_InstallerCodexPlugin_Hidden' + name + ': without both agents the tick is hidden and nothing runs (no Claude, no Node, no record)', { skip: SKIP }, () => {
    const d = sandbox('hidden ' + name, opts);
    const r = runInstaller(d, { TEST_CHOICE: choice });
    assert.deepStrictEqual([r.get('shown'), r.get('text'), r.get('selected')], ['0', '', '0'], r.notes.join(' | '));
    assert.deepStrictEqual(fx.calls(d), []);
    for (const f of ['kivun-codex-plugin.txt', 'kivun-codex-plugin-off.txt', 'codex-plugin-setup.log']) assert.ok(!fx.has(d, f), f);
    assert.strictEqual(r.finish, 'base text', 'the finish page is unchanged');
  });
}

// ---------------------------------------------------------------- the user's untick
test('UT_InstallerCodexPlugin_UntickTakesItOut: unticked after an earlier install: Launchpad\'s copy goes, and the untick is remembered', { skip: SKIP }, () => {
  const d = sandbox('untick', { codex: true, plugins: [fx.ID], marketplaces: ['x'] });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-plugin.txt'), fx.ID + '\r\n');
  const r = runInstaller(d, { TEST_UNTICK: '1' });
  assert.strictEqual(r.get('selected'), '0');
  assert.deepStrictEqual(verbs(d), ['plugin list', 'plugin uninstall', 'plugin list']);
  assert.deepStrictEqual(fx.state(d).plugins, []);
  assert.ok(fx.has(d, 'kivun-codex-plugin-off.txt') && !fx.has(d, 'kivun-codex-plugin.txt'));
  assert.strictEqual(r.finish, 'base text');
});

test('UT_InstallerCodexPlugin_UntickedLastTime: the next run shows it unticked and installs nothing', { skip: SKIP }, () => {
  const d = sandbox('unticked before', { codex: true });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-plugin-off.txt'), 'unticked\r\n');
  const r = runInstaller(d);
  assert.deepStrictEqual([r.get('shown'), r.get('text'), r.get('selected')], ['1', 'Let Claude hand work to Codex', '0']);
  assert.deepStrictEqual(fx.calls(d), [], 'no record, so Claude is not started');
  assert.ok(fx.has(d, 'kivun-codex-plugin-off.txt'));
});

test('UT_InstallerCodexPlugin_BackAndForth: going Back to the configuration page and on again keeps the user\'s untick', { skip: SKIP }, () => {
  const d = sandbox('back', { codex: true });
  const r = runInstaller(d, { TEST_UNTICK: '1', TEST_BACK: '1' });
  assert.strictEqual(r.get('selected'), '0');
  assert.deepStrictEqual(fx.state(d).plugins, []);
});

// ---------------------------------------------------------------- a silent install (no pages)
test('UT_InstallerCodexPlugin_Silent: with both agents it goes on; after an untick, or without both agents, nothing runs', { skip: SKIP }, () => {
  const on = sandbox('silent on', { codex: true });
  runInstaller(on, { TEST_PAGE: '' });
  assert.deepStrictEqual(fx.state(on).plugins, [fx.ID]);
  const off = sandbox('silent off', { codex: true });
  fs.writeFileSync(path.join(off.kivun, 'kivun-codex-plugin-off.txt'), 'unticked\r\n');
  runInstaller(off, { TEST_PAGE: '' });
  assert.deepStrictEqual(fx.calls(off), []);
  const alone = sandbox('silent alone', {});
  const r = runInstaller(alone, { TEST_PAGE: '' });
  assert.deepStrictEqual(fx.calls(alone), []);
  assert.strictEqual(r.finish, 'base text');
});

// ---------------------------------------------------------------- outcomes that are not "on"
test('UT_InstallerCodexPlugin_OwnCopyOrFailure: OpenAI\'s own copy, or a failed install: no record, the finish page unchanged, the installer goes on', { skip: SKIP }, () => {
  const own = sandbox('own copy', { codex: true, plugins: ['codex@openai-codex'] });
  const a = runInstaller(own);
  assert.strictEqual(a.status, 0);
  assert.deepStrictEqual(fx.state(own).plugins, ['codex@openai-codex']);
  assert.strictEqual(a.finish, 'base text');
  const bad = sandbox('install fails', { codex: true, fail: { 'plugin install': true } });
  const b = runInstaller(bad);
  assert.strictEqual(b.status, 0, 'a warning, not a stop');
  assert.ok(!fx.has(bad, 'kivun-codex-plugin.txt'));
  assert.strictEqual(b.finish, 'base text');
});

// ---------------------------------------------------------------- checked in the script
test('UT_InstallerCodexPlugin_Placement: after every agent section and Git; ComponentsPre runs before the components page', () => {
  const at = s => { const i = NSI.indexOf(s); assert.ok(i >= 0, s); return i; };
  for (const s of ['SecClaudeCode', 'SecCodex', 'SecCodexMenu', 'SecCopilot', 'SecAntigravity', 'SecAntigravityMenu', 'SecGit']) {
    assert.ok(at(new RegExp('^Section [^\\n]* ' + s + '$', 'm').exec(NSI)[0]) < at(SEC), s + ' runs first');
  }
  assert.ok(at(SEC) < at(SEC_OFF), 'the off step right after');
  assert.match(NSI, /!define MUI_PAGE_CUSTOMFUNCTION_PRE ComponentsPre\n!insertmacro MUI_PAGE_COMPONENTS\n/);
  assert.doesNotMatch(NSI, /^Section \/o "Let Claude hand work to Codex"/m, 'ticked by default');
});

test('UT_InstallerCodexPlugin_LockedCutsUntouched: .onInit, ConfigPageLeave and the Apply functions don\'t mention it (other tests compile them alone)', () => {
  for (const name of ['.onInit', 'ConfigPageLeave', 'ApplyAgentChoice', 'ApplyCopilotChoice', 'ApplyAntigravityChoice']) {
    assert.doesNotMatch(func(name), /CodexPlugin/, name);
  }
});

test('UT_InstallerCodexPlugin_Shipped: SecCore installs the helper and the add-on folder; the uninstaller already removes the catalog', () => {
  const core = cut(NSI, 'Section "!Core Components (Required)" SecCore', '\nSectionEnd', false);
  assert.ok(core.includes('  File "source\\configure-codex-plugin.js"\n'));
  assert.ok(core.includes('File /r /x tests /x *.sha256 /x *.upstream "source\\plugins\\*.*"'), 'plugins\\codex comes with the plugins folder');
  const un = NSI.slice(NSI.indexOf('Section "Uninstall"'));
  assert.ok(un.indexOf('plugin marketplace remove launchpad-plugins') < un.indexOf('RMDir /r "$INSTDIR"'), 'removing the catalog takes codex@launchpad-plugins out with it');
  assert.doesNotMatch(un, /CodexPlugin|codex-plugin/, 'no extra uninstall step');
});

test('UT_InstallerCodexPlugin_Description: the components page says what it does, that Claude asks first, and the limits', () => {
  const m = NSI.match(/!insertmacro MUI_DESCRIPTION_TEXT \$\{SecCodexPlugin\} "([^"]*)"/);
  assert.ok(m);
  for (const re of [/\/codex:review/, /\/codex:rescue/, /only when you ask/, /Codex limits/]) assert.match(m[1], re);
});

test('UT_InstallerCodexPlugin_Ascii: the new installer lines are ASCII', () => {
  const block = cut(NSI, SEC + '\n', '\nSectionEnd\n', true) + cut(NSI, SEC_OFF + '\n', '\nSectionEnd\n', true) + func('CodexPluginFits') + func('ComponentsPre') + func('FindNodeExe');
  assert.ok(!/[^\x00-\x7f]/.test(block));
});
