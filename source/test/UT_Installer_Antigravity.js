// The installer's Antigravity parts (REQUIREMENTS-antigravity-option C4, D3, D4, D8, D12). As in
// UT_Installer_Agent.js and UT_Installer_Copilot.js, the real sections and functions are cut out of the
// script, compiled with makensis into a small silent installer, and run against a sealed folder with the
// real configure-antigravity.js, a stand-in agy.exe, and stand-ins for install.cmd and the other helpers.
// Nothing touches this PC's real Launchpad, and no window opens. Registry writes are checked in the
// script, not by running it: a real run would write to the real registry of whoever runs the tests.
// install.cmd /antigravity runs for real, with a stand-in configure-antigravity.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./antigravity-fixture');

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
const section = start => cut(NSI, start, '\nSectionEnd', false);
const func = name => cut(NSI, 'Function ' + name + '\n', '\nFunctionEnd', false);
const seams = s => s.replace(/ExecWait ('[^\n]*') (\$\d)/g, 'nsExec::Exec $1\n  Pop $2')
  .replace(/\$PROFILE\b/g, '$TestProfile').replace(/\$LOCALAPPDATA\b/g, '$TestLocal').replace(/\$PROGRAMFILES(64)?\b/g, '$TestProgramFiles');
// A label (the configuration page notes, the finish page text) shows && as one &.
const shown = s => s.replace(/&&/g, '&');
function defineValue(name) {
  const m = NSI.match(new RegExp('^!define ' + name + ' "(.*)"$', 'm'));
  assert.ok(m, '!define ' + name);
  return m[1];
}
const isAscii = s => !/[^\x00-\x7f]/.test(s);

const SEC_AGY = 'Section /o "!Install Antigravity CLI (Required)" SecAntigravity';
const SEC_AGY_MENU = 'Section "-Right-click entries for Antigravity" SecAntigravityMenu';
const UNINSTALL_MARK = "  ; v3.5.0: Launchpad's plugin folder in Antigravity's settings";
const PLUGIN_FILES = ['plugin.json', 'hooks.json', 'hook.cmd', 'antigravity-hook.js'];
// D12: what every Antigravity note and the finish page must say, as shown on screen: clear the tick,
// then Down, Right and Enter on Done, keys in words. The screen comes after the sign-in, not first.
const DATA_USE = [/'Terms of Service & Data Use'/, /press Enter to clear the tick/, /\(Google uses what you type while it is ticked\)/,
  /\), then (the )?Down( arrow)?, (the )?Right( arrow)? and Enter on Done\./];
const NOT_SAID = [/first screen/i, /right arrow and Enter/];

// ---------------------------------------------------------------- the compiled test installer
function testScript(out) {
  const defines = NSI.split('\n').filter(l => /^!define (PRODUCT_NAME|PRODUCT_DESCRIPTION|FINISH_TEXT_)/.test(l));
  const preselect = cut(NSI, '  ; v3.3.0: start from the agent this PC already uses', '  Call ApplyAgentChoice\n', false);
  // .onInit's own calls, in its own order (all three).
  const calls = cut(NSI, '  Call ApplyAgentChoice\n', '\nFunctionEnd', false);
  const agentClaude = cut(NSI, 'Section "-Use Claude Code" SecAgentClaude\n', '\nSectionEnd\n', true);
  const secCodex = cut(NSI, 'Section /o "!Install Codex (Required)" SecCodex\n', '\nSectionEnd\n', true);
  const secCopilot = cut(NSI, 'Section /o "!Install GitHub Copilot (Required)" SecCopilot\n', '\nSectionEnd\n', true);
  const secAgy = cut(NSI, SEC_AGY + '\n', '\nSectionEnd\n', true);
  const apply = ['ApplyAgentChoice', 'ApplyCopilotChoice', 'ApplyAntigravityChoice'].map(n => cut(NSI, 'Function ' + n + '\n', '\nFunctionEnd\n', true));
  const uninst = cut(NSI, UNINSTALL_MARK, 'launchpad"\n', true);
  return [
    'Unicode True',
    '!include "LogicLib.nsh"', '!include "FileFunc.nsh"', '!include "Sections.nsh"', '!include "TextFunc.nsh"',
    'Name "AntigravityTest"', 'OutFile "' + out + '"', 'RequestExecutionLevel user', 'SilentInstall silent', 'InstallDir "$TEMP\\unused"',
    ...defines,
    'Var ConfigAgent', 'Var NodeExe', 'Var CodexOK', 'Var CopilotOK', 'Var AntigravityOK', 'Var FinishText',
    'Var TestProfile', 'Var TestLocal', 'Var TestProgramFiles',
    'Function .onInit',
    '  ReadEnvStr $INSTDIR TEST_INSTDIR', '  ReadEnvStr $TestProfile TEST_PROFILE', '  ReadEnvStr $TestLocal TEST_LOCALAPPDATA', '  ReadEnvStr $TestProgramFiles TEST_PROGRAMFILES',
    '  StrCpy $CodexOK ""', '  StrCpy $CopilotOK ""', '  StrCpy $AntigravityOK ""',
    seams(preselect),
    '  ReadEnvStr $R8 TEST_CHOICE',
    '  ${If} $R8 != ""', '    StrCpy $ConfigAgent $R8', '  ${EndIf}',
    calls,
    '  Call TestSelectUninstall',
    'FunctionEnd',
    'Function Note', '  Exch $9', '  FileOpen $8 "$INSTDIR\\nsis-report.txt" a', '  FileSeek $8 0 END', '  FileWrite $8 "$9$\\r$\\n"', '  FileClose $8', '  Pop $9', 'FunctionEnd',
    '!macro NOTE text', '  Push "${text}"', '  Call Note', '!macroend',
    'Section "!Install Claude Code (Required)" SecClaudeCode', '  SectionIn RO', '  ReadEnvStr $NodeExe TEST_NODE', '  !insertmacro NOTE "claude-section-ran"', 'SectionEnd',
    agentClaude, seams(secCodex), seams(secCopilot), seams(secAgy),
    // The real one writes to the registry; this one only says it ran. Selected by default, as the real one.
    SEC_AGY_MENU, '  !insertmacro NOTE "agy-menu-ran"', 'SectionEnd',
    'Section "-report" SecReport',
    '  !insertmacro NOTE "agent=$ConfigAgent"', '  !insertmacro NOTE "codexok=$CodexOK"', '  !insertmacro NOTE "copilotok=$CopilotOK"', '  !insertmacro NOTE "agyok=$AntigravityOK"',
    '  SectionGetText ${SecClaudeCode} $0', '  !insertmacro NOTE "claude-text=$0"',
    '  SectionGetText ${SecCodex} $0', '  !insertmacro NOTE "codex-text=$0"',
    '  SectionGetText ${SecCopilot} $0', '  !insertmacro NOTE "copilot-text=$0"',
    '  SectionGetText ${SecAntigravity} $0', '  !insertmacro NOTE "agy-text=$0"',
    '  FileOpen $8 "$INSTDIR\\finish.txt" w', '  FileWriteUTF16LE $8 $FinishText', '  FileClose $8',
    'SectionEnd',
    // (A section named "Uninstall" would become the uninstaller itself, hence this name.)
    'Section /o "-test of the Antigravity uninstall step" SecUninstall', seams(uninst), '  !insertmacro NOTE "uninstall-continued"', 'SectionEnd',
    ...apply,
    'Function TestSelectUninstall',
    '  ReadEnvStr $R8 TEST_UNINSTALL',
    '  ${If} $R8 == "1"',
    '    !insertmacro UnselectSection ${SecClaudeCode}', '    !insertmacro UnselectSection ${SecAgentClaude}', '    !insertmacro UnselectSection ${SecCodex}',
    '    !insertmacro UnselectSection ${SecCopilot}', '    !insertmacro UnselectSection ${SecAntigravity}', '    !insertmacro UnselectSection ${SecAntigravityMenu}',
    '    !insertmacro UnselectSection ${SecReport}', '    !insertmacro SelectSection ${SecUninstall}',
    '  ${EndIf}',
    'FunctionEnd',
  ].join('\r\n') + '\r\n';
}

let EXE = null;
function build() {
  if (EXE) return EXE;
  const dir = path.join(fx.ROOT, 'nsis-antigravity');
  fx.rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'antigravity-test.exe');
  const script = path.join(dir, 'antigravity-test.nsi');
  fs.writeFileSync(script, '\uFEFF' + testScript(exe));
  const r = cp.spawnSync(MAKENSIS, ['/V2', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.strictEqual(r.status, 0, 'makensis failed:\n' + r.stdout + r.stderr);
  assert.ok(!/warning/i.test(r.stdout), 'makensis warnings:\n' + r.stdout);
  return (EXE = exe);
}

const STUB_JS = name => "require('fs').appendFileSync(process.env.STUB_CALLS, JSON.stringify({ s: '" + name + "', a: process.argv.slice(2) }) + '\\n');\n";

// A sealed install folder (its path has a space), the real configure-*.js files, a stand-in agy.exe at
// %LOCALAPPDATA%\agy\bin (opts.stub: false for none), and stand-ins for the rest.
function sandbox(name, opts) {
  opts = opts || {};
  const d = fx.makeAgyEnv('nsis ' + name, { stub: opts.stub });
  d.kivun = d.env.KIVUN_DIR = path.join(d.root, 'Kivun');
  fs.mkdirSync(path.join(d.kivun, 'sounds'), { recursive: true });
  d.calls = path.join(d.root, 'calls.jsonl');
  for (const f of ['configure-antigravity.js', 'configure-codex.js', 'configure-copilot.js', 'agent-helpers.js', 'antigravity-hook.js']) fs.copyFileSync(path.join(fx.SOURCE, f), path.join(d.kivun, f));
  fs.writeFileSync(path.join(d.kivun, 'sounds', 'configure-sound-hooks.js'), STUB_JS('sounds'));
  fs.writeFileSync(path.join(d.kivun, 'apply-wt-settings.js'), STUB_JS('wt'));
  fs.writeFileSync(path.join(d.kivun, 'apply-terminal-color.js'), STUB_JS('color'));
  fs.writeFileSync(path.join(d.kivun, 'install.cmd'), '@echo off\r\n>>"%STUB_CALLS%" echo install.cmd^|%~1^|%~2\r\nexit /b %STUB_INSTALL_EXIT%\r\n');
  if (opts.claudeInstalled) {
    fs.mkdirSync(path.join(d.home, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(d.home, '.local', 'bin', 'claude.exe'), '');
  }
  for (const [opt, file] of [['codexInstalled', 'kivun-codex-path.txt'], ['copilotInstalled', 'kivun-copilot-path.txt'], ['antigravityInstalled', 'kivun-antigravity-path.txt']]) {
    if (opts[opt]) fs.writeFileSync(path.join(d.kivun, file), '{}');
  }
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), opts.config !== undefined ? opts.config : 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\n');
  return d;
}

function runInstaller(d, env) {
  const r = cp.spawnSync(build(), [], {
    env: Object.assign({}, d.env, {
      TEST_INSTDIR: d.kivun, TEST_PROFILE: d.home, TEST_LOCALAPPDATA: path.dirname(d.kivun), TEST_NODE: process.execPath, TEST_PROGRAMFILES: process.env.ProgramFiles,
      STUB_CALLS: d.calls, STUB_INSTALL_EXIT: '0', TEMP: d.root, TMP: d.root, TEST_CHOICE: 'antigravity',
    }, env || {}),
    windowsHide: true, timeout: 180000,
  });
  const rep = path.join(d.kivun, 'nsis-report.txt');
  const notes = fs.existsSync(rep) ? fs.readFileSync(rep, 'utf8').split('\r\n').filter(Boolean) : [];
  const calls = fs.existsSync(d.calls) ? fs.readFileSync(d.calls, 'utf8').split(/\r?\n/).filter(Boolean)
    .map(l => l[0] === '{' ? JSON.parse(l) : { s: l.split('|')[0], a1: l.split('|')[1], a2: l.split('|')[2] }) : [];
  const finishFile = path.join(d.kivun, 'finish.txt');
  const get = k => { const l = notes.find(x => x.startsWith(k + '=')); return l === undefined ? undefined : l.slice(k.length + 1); };
  return {
    status: r.status, notes, calls, get,
    finish: fs.existsSync(finishFile) ? fs.readFileSync(finishFile, 'utf16le') : undefined,
    config: fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'),
  };
}
const agentOf = text => { const m = String(text).match(/^AGENT=(.*)$/m); return m ? m[1].replace(/\r$/, '') : undefined; };
const pluginThere = d => PLUGIN_FILES.filter(f => fs.existsSync(path.join(d.pluginDir, f)));

// ---------------------------------------------------------------- compiled and run: choosing Antigravity
test('UT_InstallerAgy_FreshSuccess: installed, sounds, plugin, terminal, verified, then AGENT; no other agent section runs', { skip: SKIP }, () => {
  const d = sandbox('fresh');
  const r = runInstaller(d);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.get('agyok'), '1', r.notes.join(' | '));
  assert.strictEqual(r.get('agent'), 'antigravity');
  assert.ok(!r.notes.includes('claude-section-ran'), 'Claude section skipped');
  assert.strictEqual(r.get('codexok'), '', 'Codex section skipped');
  assert.strictEqual(r.get('copilotok'), '', 'Copilot section skipped');
  assert.deepStrictEqual([r.get('claude-text'), r.get('codex-text'), r.get('copilot-text'), r.get('agy-text')], ['', '', '', 'Install Antigravity CLI (Required)']);
  assert.deepStrictEqual(r.calls.map(c => c.s), ['install.cmd', 'sounds', 'wt', 'color']);
  assert.strictEqual(r.calls[0].a1, '/antigravity');
  assert.ok(/node\.exe$/i.test(r.calls[0].a2) && fs.existsSync(r.calls[0].a2), 'node.exe passed whole although both paths have spaces: ' + r.calls[0].a2);
  assert.deepStrictEqual(r.calls[1].a, ['--deploy-only'], 'the shared sounds only, no Claude settings');
  assert.deepStrictEqual(pluginThere(d), PLUGIN_FILES, 'configure-antigravity.js install wrote the plugin');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-antigravity-path.txt')), 'commit cached the verified path');
  assert.strictEqual(agentOf(r.config), 'antigravity');
  assert.strictEqual(r.finish, defineValue('FINISH_TEXT_ANTIGRAVITY'), 'the finish page gets the Antigravity text (its label shows && as &)');
  assert.ok(r.notes.includes('agy-menu-ran'));
});

test('UT_InstallerAgy_UpgradeKeepsAntigravity: an existing AGENT=antigravity is preselected', { skip: SKIP }, () => {
  const d = sandbox('upgrade', { config: 'RESPONSE_LANGUAGE=english\r\nAGENT=antigravity\r\n' });
  const r = runInstaller(d, { TEST_CHOICE: '' });
  assert.strictEqual(r.get('agent'), 'antigravity', r.notes.join(' | '));
  assert.strictEqual(r.get('agyok'), '1');
  assert.ok(!r.notes.includes('claude-section-ran'));
});

test('UT_InstallerAgy_PreselectIsExact: AGENT=Antigravity (other case) means Claude, as the launcher reads it', { skip: SKIP }, () => {
  const d = sandbox('preselect case', { config: 'AGENT=Antigravity\r\n', claudeInstalled: true });
  const r = runInstaller(d, { TEST_CHOICE: '' });
  assert.strictEqual(r.get('agent'), 'claude');
  assert.strictEqual(r.get('agyok'), '', 'SecAntigravity must not run');
  assert.strictEqual(r.get('agy-text'), '', 'Antigravity section hidden');
});

test('UT_InstallerAgy_FailClaudePresent: nothing changes, and nothing is configured for an Antigravity that did not install', { skip: SKIP }, () => {
  const d = sandbox('fail claude', { claudeInstalled: true });
  const r = runInstaller(d, { STUB_INSTALL_EXIT: '7' });
  assert.strictEqual(r.get('agyok'), '0');
  assert.deepStrictEqual(r.calls.map(c => c.s), ['install.cmd', 'wt', 'color']);
  assert.strictEqual(r.config, 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\n', 'config.txt byte-identical');
  assert.deepStrictEqual(pluginThere(d), []);
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-antigravity-path.txt')));
});

for (const [other, opt] of [['codex', 'codexInstalled'], ['copilot', 'copilotInstalled']]) {
  test(`UT_InstallerAgy_FailWith_${other}: a PC with a verified ${other} keeps it`, { skip: SKIP }, () => {
    const d = sandbox('fail ' + other, { config: 'AGENT=' + other + '\r\n', [opt]: true });
    const r = runInstaller(d, { STUB_INSTALL_EXIT: '7' });
    assert.strictEqual(r.get('agyok'), '0');
    assert.strictEqual(agentOf(r.config), other);
  });
}

test('UT_InstallerAgy_FailFreshPC: no agent on the PC, AGENT records Antigravity so the launcher shows the repair message', { skip: SKIP }, () => {
  const d = sandbox('fail fresh');
  const r = runInstaller(d, { STUB_INSTALL_EXIT: '7', PATH: path.dirname(process.execPath) + ';' + path.join(process.env.SystemRoot, 'System32') });
  assert.strictEqual(r.get('agyok'), '0');
  assert.strictEqual(agentOf(r.config), 'antigravity');
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-antigravity-path.txt')), 'no false "installed"');
});

test('UT_InstallerAgy_CommitNeedsVerifiedCopy: install.cmd says 0 but no agy verifies, so AGENT is not switched', { skip: SKIP }, () => {
  const d = sandbox('unverified', { stub: false, claudeInstalled: true });
  const r = runInstaller(d);
  assert.strictEqual(r.get('agyok'), '0', r.notes.join(' | '));
  assert.strictEqual(agentOf(r.config), undefined);
});

// ---------------------------------------------------------------- compiled and run: the other agents
test('UT_InstallerAgy_ClaudeChosenOnAntigravityPC: choosing Claude switches the launcher back', { skip: SKIP }, () => {
  const d = sandbox('back to claude', { config: 'RESPONSE_LANGUAGE=english\r\nAGENT=antigravity\r\nCLAUDE_FLAGS=\r\n', antigravityInstalled: true });
  const r = runInstaller(d, { TEST_CHOICE: 'claude' });
  assert.ok(r.notes.includes('claude-section-ran'), r.notes.join(' | '));
  assert.strictEqual(r.get('agyok'), '');
  assert.strictEqual(r.get('agy-text'), '');
  assert.strictEqual(r.config, 'RESPONSE_LANGUAGE=english\r\nAGENT=claude\r\nCLAUDE_FLAGS=\r\n');
  assert.ok(r.notes.includes('agy-menu-ran'), 'the right-click step still runs for an already verified copy');
});

test('UT_InstallerAgy_CopilotChosen: ApplyAntigravityChoice leaves Copilot\'s choice alone', { skip: SKIP }, () => {
  const d = sandbox('copilot chosen', { claudeInstalled: true });
  const r = runInstaller(d, { TEST_CHOICE: 'copilot', STUB_INSTALL_EXIT: '6' });
  assert.strictEqual(r.get('copilotok'), '0', 'SecCopilot ran');
  assert.strictEqual(r.get('copilot-text'), 'Install GitHub Copilot (Required)');
  assert.strictEqual(r.get('agyok'), '');
  assert.strictEqual(r.get('agy-text'), '');
  assert.match(r.finish, /^GitHub Copilot is ready\./);
});

// Item 8 of the brief: the "another agent already here?" checks of Codex and Copilot know every agent.
for (const [chosen, exit, other, opt] of [
  ['codex', '5', 'copilot', 'copilotInstalled'], ['codex', '5', 'antigravity', 'antigravityInstalled'], ['copilot', '6', 'antigravity', 'antigravityInstalled'],
]) {
  test(`UT_InstallerAgy_OtherAgentCheck_${chosen}_${other}: ${chosen} failing on a PC with a verified ${other} keeps ${other}`, { skip: SKIP }, () => {
    const d = sandbox(chosen + ' fail ' + other, { config: 'AGENT=' + other + '\r\n', [opt]: true });
    const r = runInstaller(d, { TEST_CHOICE: chosen, STUB_INSTALL_EXIT: exit });
    assert.strictEqual(r.get(chosen + 'ok'), '0', r.notes.join(' | '));
    assert.strictEqual(agentOf(r.config), other);
  });
}

// ---------------------------------------------------------------- compiled and run: uninstall
function installPlugin(d) {
  fx.seedHook(d);
  const r = fx.cli(d, ['install']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(pluginThere(d), PLUGIN_FILES);
}

test('UT_InstallerAgy_UninstallRemovesPlugin: the four files and the folder go, with no Node; the rest of .gemini stays', { skip: SKIP }, () => {
  const d = sandbox('uninstall');
  installPlugin(d);
  const keep = [path.join(d.home, '.gemini', 'antigravity-cli', 'settings.json'), path.join(d.home, '.gemini', 'config', 'plugins', 'other', 'plugin.json')];
  for (const f of keep) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{}'); }
  const r = runInstaller(d, { TEST_UNINSTALL: '1', PATH: path.join(process.env.SystemRoot, 'System32') });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.notes, ['uninstall-continued']);
  assert.ok(!fs.existsSync(d.pluginDir), 'plugin folder removed');
  for (const f of keep) assert.ok(fs.existsSync(f), 'kept: ' + f);
});

test('UT_InstallerAgy_UninstallKeepsUserFile: a file of the user\'s in the plugin folder keeps the folder', { skip: SKIP }, () => {
  const d = sandbox('uninstall user file');
  installPlugin(d);
  fs.writeFileSync(path.join(d.pluginDir, 'mine.txt'), 'x');
  const r = runInstaller(d, { TEST_UNINSTALL: '1' });
  assert.deepStrictEqual(r.notes, ['uninstall-continued']);
  assert.deepStrictEqual(fs.readdirSync(d.pluginDir), ['mine.txt']);
});

test('UT_InstallerAgy_UninstallNothingThere: no plugin folder is no problem', { skip: SKIP }, () => {
  const d = sandbox('uninstall none');
  const r = runInstaller(d, { TEST_UNINSTALL: '1' });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.notes, ['uninstall-continued']);
});

// ---------------------------------------------------------------- checked in the script: the page
test('UT_InstallerAgy_ChoiceOnPage: four radios in two rows of two, Antigravity (Google) last', () => {
  const page = func('ConfigPage');
  const radios = [...page.matchAll(/\$\{NSD_Create(First|Additional)RadioButton\} (\S+) (\S+) (\S+) (\S+) "([^"]*)"\n\s*Pop (\$\w+)/g)]
    .map(m => ({ kind: m[1], x: m[2], y: m[3], text: m[6], v: m[7] }));
  assert.deepStrictEqual(radios.map(r => [r.text, r.v]), [
    ['Claude Code (Anthropic)', '$AgentClaudeRadio'], ['Codex (OpenAI)', '$AgentCodexRadio'],
    ['GitHub Copilot', '$AgentCopilotRadio'], ['Antigravity (Google)', '$AgentAntigravityRadio'],
  ]);
  assert.deepStrictEqual(radios.map(r => r.kind), ['First', 'Additional', 'Additional', 'Additional'], 'one group');
  assert.ok(radios[0].y === radios[1].y && radios[2].y === radios[3].y && radios[0].y !== radios[2].y, 'two rows');
  assert.ok(radios[0].x === radios[2].x && radios[1].x === radios[3].x, 'two columns');
  assert.match(page, /\$\{NSD_OnClick\} \$AgentAntigravityRadio AgentRadioClicked/);
  assert.match(page, /\$\{ElseIf\} \$ConfigAgent == "antigravity"\n\s*\$\{NSD_Check\} \$AgentAntigravityRadio\n\s*ShowWindow \$AgentAntigravityNote \$\{SW_SHOW\}/);
  assert.match(page, /ShowWindow \$AgentAntigravityNote \$\{SW_HIDE\}/);
  const click = func('AgentRadioClicked');
  assert.match(click, /\$\{NSD_GetState\} \$AgentAntigravityRadio \$0\n\s*\$\{If\} \$0 == \$\{BST_CHECKED\}\n\s*ShowWindow \$AgentAntigravityNote \$\{SW_SHOW\}\n\s*\$\{Else\}\n\s*ShowWindow \$AgentAntigravityNote \$\{SW_HIDE\}/);
  const leave = func('ConfigPageLeave');
  assert.match(leave, /\$\{NSD_GetState\} \$AgentAntigravityRadio (\$\d)\n[\s\S]*\$\{ElseIf\} \1 == \$\{BST_CHECKED\}\n\s*StrCpy \$ConfigAgent "antigravity"/);
});

// MUI's pages are 300 x 140 dialog units. A closed drop list is about 14u tall, whatever height it is given.
test('UT_InstallerAgy_PageLayout: every control inside the page, none overlapping (the notes share one place)', () => {
  const W = 300, H = 140, DROPLIST = 14;
  const page = func('ConfigPage');
  const unit = (v, whole) => {
    if (v === '0') return 0;
    let m = /^(\d+)u$/.exec(v); if (m) return Number(m[1]);
    m = /^(\d+)%$/.exec(v); if (m) return whole * Number(m[1]) / 100;
    assert.fail('a size in pixels does not scale with the dialog font: ' + v);
  };
  const controls = [...page.matchAll(/\$\{NSD_Create(\w+)\} (\S+) (\S+) (\S+) (\S+) [^\n]*\n\s*Pop (\$\w+)/g).map(m => {
    const r = { kind: m[1], v: m[6], x: unit(m[2], W), y: unit(m[3], H), w: unit(m[4], W), h: unit(m[5], H) };
    if (r.kind === 'DropList') r.h = DROPLIST;
    return r;
  })];
  assert.ok(controls.length >= 12, 'controls found: ' + controls.length);
  for (const c of controls) assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= W && c.y + c.h <= H, 'outside the page: ' + JSON.stringify(c));
  const notes = controls.filter(c => /Note$/.test(c.v));
  assert.deepStrictEqual(notes.map(c => c.v), ['$AgentCodexNote', '$AgentCopilotNote', '$AgentAntigravityNote']);
  for (const n of notes) assert.deepStrictEqual([n.x, n.y, n.w, n.h], [notes[0].x, notes[0].y, notes[0].w, notes[0].h], 'one place for the notes');
  assert.ok(notes[0].h >= 24, 'three lines of text (8u each) fit in a note');
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      if (/Note$/.test(controls[i].v) && /Note$/.test(controls[j].v)) continue;
      assert.ok(!overlap(controls[i], controls[j]), 'overlap: ' + JSON.stringify(controls[i]) + ' and ' + JSON.stringify(controls[j]));
    }
  }
});

test('UT_InstallerAgy_NoteSaysDataUse: the note shown for Antigravity carries D12\'s instruction', () => {
  const m = func('ConfigPage').match(/\$\{NSD_CreateLabel\} [^\n]* "([^"]*)"\n\s*Pop \$AgentAntigravityNote/);
  assert.ok(m, 'the Antigravity note');
  for (const re of DATA_USE) assert.match(shown(m[1]), re);
  for (const re of NOT_SAID) assert.doesNotMatch(shown(m[1]), re);
  assert.match(shown(m[1]), /then the Down arrow, the Right arrow and Enter on Done\.$/, 'the note has room for the keys in full');
  assert.ok(isAscii(m[1]));
});

test('UT_InstallerAgy_FinishText: "Antigravity CLI is ready." and the first-run steps, short enough for the finish page', () => {
  const text = shown(defineValue('FINISH_TEXT_ANTIGRAVITY'));
  assert.ok(text.startsWith('Antigravity CLI is ready. '), text);
  for (const re of [/Google OAuth/, /sign in in the browser/, /paste the code/, ...DATA_USE, /then Down, Right and Enter on Done\./, /folder trust question/]) assert.match(text, re);
  for (const re of NOT_SAID) assert.doesNotMatch(text, re);
  assert.ok(text.indexOf('Google OAuth') < text.indexOf('Terms of Service') && text.indexOf('Done') < text.indexOf('folder trust'), 'in the order Antigravity asks');
  // With the two check boxes MUI shows the finish text in 195u x 40u, about five lines: this length was
  // checked on screen. NSIS's own limit for a string is 1024 characters.
  assert.ok(text.length <= 290, 'the finish page shows about five lines: ' + text.length + ' characters');
  assert.ok(isAscii(text));
});

// ---------------------------------------------------------------- checked in the script: the choice
test('UT_InstallerAgy_ApplyChoice: selects SecAntigravity and SecAntigravityMenu, unselects the other agents; called last', () => {
  const fn = func('ApplyAntigravityChoice');
  const [yes, no] = fn.split('\n  ${Else}\n');
  assert.match(yes, /\$\{If\} \$ConfigAgent == "antigravity"/);
  for (const s of ['SecClaudeCode', 'SecCodex', 'SecCopilot']) {
    assert.ok(yes.includes('!insertmacro UnselectSection ${' + s + '}'), s);
    assert.ok(yes.includes('SectionSetText ${' + s + '} ""'), s + ' hidden');
  }
  for (const s of ['SecAntigravity', 'SecAntigravityMenu']) assert.ok(yes.includes('!insertmacro SelectSection ${' + s + '}'), s);
  assert.ok(yes.includes('StrCpy $FinishText "${FINISH_TEXT_ANTIGRAVITY}"'));
  assert.ok(no.includes('!insertmacro UnselectSection ${SecAntigravity}') && no.includes('SectionSetText ${SecAntigravity} ""'));
  assert.ok(!fn.includes('UnselectSection ${SecAntigravityMenu}'), 'the entries of an already verified copy are written on every run');
  assert.ok(!/^Section \/o[^\n]*SecAntigravityMenu$/m.test(NSI), 'SecAntigravityMenu is selected by default, as SecCopilotMenu is');
  for (const name of ['ApplyAgentChoice', 'ApplyCopilotChoice']) assert.ok(!func(name).includes('SecAntigravity'), name + ' is compiled on its own by the other installer tests');
  for (const name of ['.onInit', 'ConfigPageLeave']) {
    const f = func(name);
    const at = ['Call ApplyAgentChoice', 'Call ApplyCopilotChoice', 'Call ApplyAntigravityChoice'].map(c => f.indexOf(c));
    assert.ok(at[0] >= 0 && at[0] < at[1] && at[1] < at[2], name + ': ' + at.join(','));
  }
  assert.match(func('.onInit'), /\$\{ElseIf\} \$0 S== "antigravity"\n\s*StrCpy \$ConfigAgent "antigravity"/);
});

test('UT_InstallerAgy_SectionDescription: the components page describes the Antigravity section', () => {
  assert.match(NSI, /!insertmacro MUI_DESCRIPTION_TEXT \$\{SecAntigravity\} "[^"]*Antigravity[^"]*"/);
});

// ---------------------------------------------------------------- checked in the script: files and registry
test('UT_InstallerAgy_FilesShipped: the four new files are installed by SecCore, which runs before SecAntigravity', () => {
  const SEC_CORE = 'Section "!Core Components (Required)" SecCore';
  const core = section(SEC_CORE);
  for (const f of ['configure-antigravity.js', 'antigravity-hook.js', 'antigravity-statusline.js', 'antigravity-statusline.cmd']) {
    assert.ok(core.includes(`  File "source\\${f}"\n`), f);
    assert.ok(fs.existsSync(path.join(fx.SOURCE, f)), 'source\\' + f + ' exists');
  }
  assert.ok(NSI.indexOf(SEC_CORE) < NSI.indexOf(SEC_AGY), 'antigravity-hook.js is in $INSTDIR before configure-antigravity.js install copies it');
  // configure-antigravity.js needs these beside it.
  for (const f of ['configure-codex.js', 'configure-copilot.js', 'agent-helpers.js']) assert.ok(core.includes(`  File "source\\${f}"\n`), f);
});

test('UT_InstallerAgy_SectionSteps: install.cmd /antigravity, then sounds, plugin, commit, as SecCopilot does; no registry', () => {
  const sec = section(SEC_AGY);
  const steps = [
    `ExecWait 'cmd /c ""$INSTDIR\\install.cmd" /antigravity "$NodeExe""' $0`,
    `"$INSTDIR\\sounds\\configure-sound-hooks.js" --deploy-only'`,
    `"$INSTDIR\\configure-antigravity.js" install'`,
    `"$INSTDIR\\configure-antigravity.js" commit'`,
    `"$INSTDIR\\configure-codex.js" set-agent antigravity'`,
  ].map(s => { assert.ok(sec.includes(s), s); return sec.indexOf(s); });
  assert.deepStrictEqual(steps, steps.slice().sort((a, b) => a - b), 'in this order');
  assert.doesNotMatch(sec, /(WriteReg|DeleteReg)/, 'the installer tests run this section for real');
});

test('UT_InstallerAgy_RightClickEntries: Antigravity\'s entries need the verified copy, and name their agent', () => {
  const menu = section(SEC_AGY_MENU);
  assert.ok(menu.indexOf('${FileExists} "$INSTDIR\\kivun-antigravity-path.txt"') < menu.indexOf('WriteRegStr'), 'checked before anything is written');
  const want = [
    'WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadAntigravity" "" "Open with Antigravity CLI"',
    'WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadAntigravity" "Icon" "$INSTDIR\\claude_icon.ico"',
    `WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadAntigravity\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" OPEN-ANTIGRAVITY "%1"'`,
    'WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadAntigravity" "" "Open Antigravity CLI here"',
    'WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadAntigravity" "Icon" "$INSTDIR\\claude_icon.ico"',
    `WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadAntigravity\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" OPEN-ANTIGRAVITY "%V"'`,
  ];
  assert.deepStrictEqual(menu.split('\n').map(l => l.trim()).filter(l => /^WriteReg/.test(l)), want);
  assert.ok(menu.indexOf('.local\\bin\\claude.exe') < menu.indexOf('DeleteRegKey'), 'Claude looked for before its entries are removed');
  for (const key of ['Directory', 'Directory\\Background']) assert.ok(menu.includes(`DeleteRegKey HKCU "Software\\Classes\\${key}\\shell\\ClaudeCodeLaunchpad"\n`), key);
});

test('UT_InstallerAgy_Uninstall: exactly the plugin files and keys go, with no Node, outside the range UT_Installer_Agent compiles', () => {
  const un = NSI.slice(NSI.indexOf('Section "Uninstall"'));
  const block = cut(NSI, UNINSTALL_MARK, 'launchpad"\n', true);
  const lines = block.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
  assert.deepStrictEqual(lines, [
    ...PLUGIN_FILES.map(f => `Delete "$PROFILE\\.gemini\\config\\plugins\\launchpad\\${f}"`),
    'RMDir "$PROFILE\\.gemini\\config\\plugins\\launchpad"',
  ]);
  assert.ok(un.includes(block), 'in the uninstall section');
  for (const key of ['Directory', 'Directory\\Background']) assert.ok(un.includes(`  DeleteRegKey HKCU "Software\\Classes\\${key}\\shell\\ClaudeCodeLaunchpadAntigravity"\n`), key);
  const agentCutStart = un.indexOf('  ; v3.3.0: take out only'), agentCutEnd = un.indexOf('  ; Unregister the bundled plugins BEFORE');
  assert.ok(agentCutStart >= 0 && agentCutEnd > agentCutStart);
  for (const at of [un.indexOf(UNINSTALL_MARK), un.indexOf('ClaudeCodeLaunchpadAntigravity')]) assert.ok(at > agentCutEnd, 'after UT_Installer_Agent\'s cut');
  assert.doesNotMatch(un, /configure-antigravity/, 'no Node needed');
  assert.doesNotMatch(un, /RMDir \/r[^\n]*\.gemini/i, 'sign-in and conversations are the user\'s');
  assert.doesNotMatch(un, /agy[^\n]*uninstall|\\agy\\/i, 'Antigravity itself stays');
});

// ---------------------------------------------------------------- config.txt
test('UT_InstallerAgy_ConfigKeys: the written config.txt and the template have the same keys, with the new ones after CODEX_*', () => {
  const written = [];
  for (const m of NSI.matchAll(/^\s*FileWrite \$0 "([A-Z_]+)=/gm)) if (written[written.length - 1] !== m[1]) written.push(m[1]);
  const templateText = fs.readFileSync(path.join(fx.SOURCE, 'config.txt'), 'utf8');
  const template = [...templateText.matchAll(/^([A-Z_]+)=/gm)].map(m => m[1]);
  assert.deepStrictEqual(written, template);
  const i = template.indexOf('CODEX_STARTUP_CMD');
  assert.deepStrictEqual(template.slice(i + 1, i + 5), ['COPILOT_FLAGS', 'COPILOT_STARTUP_CMD', 'ANTIGRAVITY_FLAGS', 'ANTIGRAVITY_STARTUP_CMD']);
  for (const text of [templateText, NSI]) {
    const start = text.indexOf('# AI agent for launches');
    const comment = text.slice(start, text.indexOf('AGENT=', start));
    for (const a of ['claude', 'codex', 'copilot', 'antigravity']) assert.match(comment, new RegExp('\\b' + a + ' = '), a);
  }
  // Only a first install writes it: an upgrade keeps the user's config.txt.
  const at = NSI.indexOf('FileWrite $0 "ANTIGRAVITY_FLAGS=');
  const guard = NSI.lastIndexOf('${If} $ConfigExisted == "1"', at);
  assert.ok(guard >= 0 && NSI.indexOf('Preserving existing config.txt', guard) < NSI.indexOf('${Else}', guard));
  assert.ok(NSI.indexOf('${Else}', guard) < at && at < NSI.indexOf('FileClose $0', guard), 'in the first-install branch');
});

test('UT_InstallerAgy_TextFiles: install.cmd and config.txt stay CRLF and ASCII; the new installer lines are ASCII', () => {
  for (const f of ['install.cmd', 'config.txt']) {
    const b = fs.readFileSync(path.join(fx.SOURCE, f));
    assert.ok(isAscii(b.toString('latin1')), f + ' is ASCII');
    assert.ok(!/(^|[^\r])\n/.test(b.toString('latin1')), f + ' is CRLF');
  }
  for (const l of NSI.split('\n').filter(x => /antigravity/i.test(x))) assert.ok(isAscii(l), l);
});

// ---------------------------------------------------------------- install.cmd /antigravity, run for real
// A stand-in configure-antigravity.js records how it was called and exits with STANDIN_EXIT.
const STANDIN = "require('fs').appendFileSync(process.env.STANDIN_LOG, JSON.stringify({ args: process.argv.slice(2), node: process.execPath }) + '\\n');\n" +
  'process.exitCode = Number(process.env.STANDIN_EXIT || 0);\n';

function installCmd(name, args, extra) {
  const d = fx.makeEnv('cmd ' + name);
  const lad = path.join(d.root, 'lad');
  const kivun = path.join(lad, 'Kivun');
  fs.mkdirSync(kivun, { recursive: true });
  fs.copyFileSync(path.join(fx.SOURCE, 'install.cmd'), path.join(kivun, 'install.cmd'));
  fs.writeFileSync(path.join(kivun, 'configure-antigravity.js'), STANDIN);
  // install.cmd adds the PATH stored in the registry, where this PC's real Node would be found: here
  // `reg` finds nothing.
  const noReg = path.join(d.root, 'no-reg');
  fs.mkdirSync(noReg, { recursive: true });
  fs.writeFileSync(path.join(noReg, 'reg.cmd'), '@exit /b 1\r\n');
  const log = path.join(d.root, 'standin.jsonl');
  // noNode: System32 only, so `where node.exe` runs and finds nothing.
  const PATH = noReg + ';' + (extra && extra.noNode ? path.join(process.env.SystemRoot, 'System32') : d.env.PATH);
  if (extra) delete extra.noNode;
  const env = Object.assign({}, d.env, { PATH, LOCALAPPDATA: lad, TEMP: path.join(d.root, 'tmp'), TMP: path.join(d.root, 'tmp'), STANDIN_LOG: log, STANDIN_EXIT: '0' }, extra || {});
  delete env.KIVUN_DIR; delete env.KIVUN_LOG;      // install.cmd sets both itself
  fs.mkdirSync(env.TEMP, { recursive: true });
  const line = '/d /s /c ""' + path.join(kivun, 'install.cmd') + '"' + args.map(a => ' "' + a + '"').join('') + '"';
  const r = cp.spawnSync(env.ComSpec, [line], { env, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 120000 });
  const installLog = path.join(kivun, 'install-log.txt');
  return {
    status: r.status, stdout: r.stdout,
    log: fs.existsSync(installLog) ? fs.readFileSync(installLog, 'utf8') : '',
    standin: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
  };
}

test('UT_InstallerAgy_CmdRunsInstallAntigravity: install.cmd /antigravity "<node.exe>" runs install-antigravity with that Node', () => {
  const r = installCmd('ok', ['/antigravity', process.execPath]);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.deepStrictEqual(r.standin.map(s => s.args), [['install-antigravity']]);
  assert.strictEqual(r.standin[0].node.toLowerCase(), process.execPath.toLowerCase());
  assert.match(r.log, /install\.cmd .*\/antigravity/);
});

test('UT_InstallerAgy_CmdFindsNode: without a Node path, the Node on PATH is used', () => {
  const r = installCmd('find node', ['/antigravity']);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.deepStrictEqual(r.standin.map(s => s.args), [['install-antigravity']]);
});

for (const code of ['7', '1']) {
  test(`UT_InstallerAgy_CmdFailIs7_${code}: configure-antigravity.js failing (exit ${code}) makes install.cmd exit 7`, () => {
    const r = installCmd('fail ' + code, ['/antigravity', process.execPath], { STANDIN_EXIT: code });
    assert.strictEqual(r.status, 7, r.stdout);
    assert.strictEqual(r.standin.length, 1);
  });
}

test('UT_InstallerAgy_CmdNoNode: no Node.js at all is exit 7 with a plain message, and nothing is started', () => {
  const r = installCmd('no node', ['/antigravity'], { noNode: true });
  assert.strictEqual(r.status, 7, r.stdout);
  assert.match(r.stdout, /\[Antigravity\] ERROR: Node\.js was not found/);
  assert.deepStrictEqual(r.standin, []);
});

test('UT_InstallerAgy_CmdSeparateFlag: /antigravity has its own flag, Node path and exit code, beside /codex and /copilot', () => {
  const text = fs.readFileSync(path.join(fx.SOURCE, 'install.cmd'), 'utf8');
  assert.match(text, /if \/i "%~1"=="\/antigravity" \(\r\n\s*set "DO_ANTIGRAVITY=1"/);
  assert.match(text, /if "!DO_ANTIGRAVITY!"=="1" call :install_antigravity/);
  assert.match(text, /if "!DO_COPILOT!"=="1" call :install_copilot/);
  assert.match(text, /if "!DO_CODEX!"=="1" call :install_codex/);
  const sub = text.slice(text.indexOf(':install_antigravity\r\n'), text.indexOf('goto :eof', text.lastIndexOf('install-antigravity')));
  assert.match(sub, /"!ANTIGRAVITY_NODE!" "%~dp0configure-antigravity\.js" install-antigravity\r\nif errorlevel 1 set "EXIT_CODE=7"/);
  assert.doesNotMatch(sub, /powershell/i);
});
