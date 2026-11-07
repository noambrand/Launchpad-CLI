// The installer's Copilot parts. As in UT_Installer_Agent.js, the real sections are cut out of the
// script, compiled with makensis into a small silent installer, and run against a sealed folder with
// the real configure-copilot.js, a fake Copilot, and stand-ins for install.cmd and the other helpers.
// Nothing touches this PC's real Launchpad, and no window opens. Registry writes are checked in the
// script, not by running it: a real run would write to the real registry of whoever runs the tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./copilot-fixture');

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
const seams = s => s.replace(/ExecWait ('[^\n]*') (\$\d)/g, 'nsExec::Exec $1\n  Pop $2')
  .replace(/\$PROFILE\b/g, '$TestProfile').replace(/\$LOCALAPPDATA\b/g, '$TestLocal').replace(/\$PROGRAMFILES(64)?\b/g, '$TestProgramFiles');

function testScript(out) {
  const defines = NSI.split('\n').filter(l => /^!define (PRODUCT_NAME|PRODUCT_DESCRIPTION|FINISH_TEXT_)/.test(l));
  const secCopilot = cut(NSI, 'Section /o "!Install GitHub Copilot (Required)" SecCopilot\n', '\nSectionEnd\n', true);
  const agentClaude = cut(NSI, 'Section "-Use Claude Code" SecAgentClaude\n', '\nSectionEnd\n', true);
  const applyCopilot = cut(NSI, 'Function ApplyCopilotChoice\n', '\nFunctionEnd\n', true);
  const preselect = cut(NSI, '  ; v3.3.0: start from the agent this PC already uses', '  Call ApplyAgentChoice\n', false);
  return [
    'Unicode True',
    '!include "LogicLib.nsh"', '!include "FileFunc.nsh"', '!include "Sections.nsh"', '!include "TextFunc.nsh"',
    'Name "CopilotTest"', 'OutFile "' + out + '"', 'RequestExecutionLevel user', 'SilentInstall silent', 'InstallDir "$TEMP\\unused"',
    ...defines,
    'Var ConfigAgent', 'Var NodeExe', 'Var CopilotOK', 'Var FinishText', 'Var TestProfile', 'Var TestLocal', 'Var TestProgramFiles',
    'Function .onInit',
    '  ReadEnvStr $INSTDIR TEST_INSTDIR', '  ReadEnvStr $TestProfile TEST_PROFILE', '  ReadEnvStr $TestLocal TEST_LOCALAPPDATA', '  ReadEnvStr $TestProgramFiles TEST_PROGRAMFILES',
    '  StrCpy $CopilotOK ""',
    seams(preselect),
    '  ReadEnvStr $R8 TEST_CHOICE',
    '  ${If} $R8 != ""', '    StrCpy $ConfigAgent $R8', '  ${EndIf}',
    '  Call ApplyCopilotChoice',
    'FunctionEnd',
    'Function Note', '  Exch $9', '  FileOpen $8 "$INSTDIR\\nsis-report.txt" a', '  FileSeek $8 0 END', '  FileWrite $8 "$9$\\r$\\n"', '  FileClose $8', '  Pop $9', 'FunctionEnd',
    '!macro NOTE text', '  Push "${text}"', '  Call Note', '!macroend',
    'Section "!Install Claude Code (Required)" SecClaudeCode', '  SectionIn RO', '  ReadEnvStr $NodeExe TEST_NODE', '  !insertmacro NOTE "claude-section-ran"', 'SectionEnd',
    agentClaude,
    'Section /o "!Install Codex (Required)" SecCodex', '  !insertmacro NOTE "codex-section-ran"', 'SectionEnd',
    seams(secCopilot),
    'Section "-report" SecReport',
    '  !insertmacro NOTE "agent=$ConfigAgent"', '  !insertmacro NOTE "copilotok=$CopilotOK"',
    '  SectionGetText ${SecCopilot} $0', '  !insertmacro NOTE "copilot-text=$0"',
    '  FileOpen $8 "$INSTDIR\\finish.txt" w', '  FileWriteUTF16LE $8 $FinishText', '  FileClose $8',
    'SectionEnd',
    applyCopilot,
  ].join('\r\n') + '\r\n';
}

let EXE = null;
function build() {
  if (EXE) return EXE;
  const dir = path.join(fx.ROOT, 'nsis-copilot');
  fx.rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'copilot-test.exe');
  const script = path.join(dir, 'copilot-test.nsi');
  fs.writeFileSync(script, '\uFEFF' + testScript(exe));
  const r = cp.spawnSync(MAKENSIS, ['/V2', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.strictEqual(r.status, 0, 'makensis failed:\n' + r.stdout + r.stderr);
  assert.ok(!/warning/i.test(r.stdout), 'makensis warnings:\n' + r.stdout);
  return (EXE = exe);
}

const STUB_JS = name => "require('fs').appendFileSync(process.env.STUB_CALLS, JSON.stringify({ s: '" + name + "', a: process.argv.slice(2) }) + '\\n');\n";

function sandbox(name, opts) {
  opts = opts || {};
  const d = fx.makeEnv('nsis ' + name, { fakeCopilot: opts.fakeCopilot });
  d.kivun = d.env.KIVUN_DIR = path.join(d.root, 'Kivun');
  fs.mkdirSync(path.join(d.kivun, 'sounds'), { recursive: true });
  d.calls = path.join(d.root, 'calls.jsonl');
  d.profile = path.join(d.root, 'profile');
  for (const f of ['configure-copilot.js', 'configure-codex.js', 'agent-helpers.js', 'copilot-sound.js']) fs.copyFileSync(path.join(fx.SOURCE, f), path.join(d.kivun, f));
  fs.writeFileSync(path.join(d.kivun, 'sounds', 'configure-sound-hooks.js'), STUB_JS('sounds'));
  fs.writeFileSync(path.join(d.kivun, 'apply-wt-settings.js'), STUB_JS('wt'));
  fs.writeFileSync(path.join(d.kivun, 'apply-terminal-color.js'), STUB_JS('color'));
  fs.writeFileSync(path.join(d.kivun, 'install.cmd'), '@echo off\r\n>>"%STUB_CALLS%" echo install.cmd^|%~1^|%~2\r\nexit /b %STUB_INSTALL_EXIT%\r\n');
  if (opts.claudeInstalled) {
    fs.mkdirSync(path.join(d.profile, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(d.profile, '.local', 'bin', 'claude.exe'), '');
  }
  if (opts.codexInstalled) fs.writeFileSync(path.join(d.kivun, 'kivun-codex-path.txt'), '{}');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), opts.config !== undefined ? opts.config : 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\n');
  return d;
}
function runInstaller(d, env) {
  const r = cp.spawnSync(build(), [], {
    env: Object.assign({}, d.env, { TEST_INSTDIR: d.kivun, TEST_PROFILE: d.profile, TEST_LOCALAPPDATA: path.dirname(d.kivun), TEST_NODE: process.execPath, TEST_PROGRAMFILES: process.env.ProgramFiles,
      STUB_CALLS: d.calls, STUB_INSTALL_EXIT: '0', TEMP: d.root, TMP: d.root, TEST_CHOICE: 'copilot' }, env || {}),
    windowsHide: true, timeout: 180000,
  });
  const rep = path.join(d.kivun, 'nsis-report.txt');
  const notes = fs.existsSync(rep) ? fs.readFileSync(rep, 'utf8').split('\r\n').filter(Boolean) : [];
  const calls = fs.existsSync(d.calls) ? fs.readFileSync(d.calls, 'utf8').split(/\r?\n/).filter(Boolean) : [];
  return { status: r.status, notes, calls, config: fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8') };
}

// ---- Compiled and run
test('UT_InstallerCopilot_FreshSuccess: chosen, installed, hook file written, verified, then AGENT', { skip: SKIP }, () => {
  const d = sandbox('fresh');
  const r = runInstaller(d);
  assert.ok(r.notes.includes('copilotok=1'), r.notes.join(' | '));
  assert.ok(!r.notes.includes('claude-section-ran'), 'Claude section skipped');
  assert.ok(!r.notes.includes('codex-section-ran'), 'Codex section skipped');
  assert.match(r.config, /^AGENT=copilot\r$/m);
  assert.ok(r.calls.some(c => /^install\.cmd\|\/copilot\|/.test(c)), 'install.cmd /copilot ran with Node');
  assert.ok(r.calls.some(c => /"s":"sounds"/.test(c) && /--deploy-only/.test(c)), 'the shared sounds were deployed, with no Claude settings');
  assert.ok(fs.existsSync(path.join(d.copilotHome, 'hooks', 'launchpad-sounds.json')));
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-copilot-path.txt')));
  assert.match(fs.readFileSync(path.join(d.kivun, 'finish.txt'), 'utf16le'), /\/login/);
});

test('UT_InstallerCopilot_NotVerifiedWithClaude: install.cmd says 0 but no Copilot verifies, so nothing changes', { skip: SKIP }, () => {
  const d = sandbox('unverified', { fakeCopilot: false, claudeInstalled: true });
  const r = runInstaller(d);
  assert.ok(r.notes.includes('copilotok=0'), r.notes.join(' | '));
  assert.doesNotMatch(r.config, /AGENT=/, 'Launchpad keeps starting the agent it used before');
});

test('UT_InstallerCopilot_FailWithCodex: a PC with Codex keeps Codex', { skip: SKIP }, () => {
  const d = sandbox('with-codex', { config: 'AGENT=codex\r\n', codexInstalled: true });
  const r = runInstaller(d, { STUB_INSTALL_EXIT: '6' });
  assert.ok(r.notes.includes('copilotok=0'));
  assert.match(r.config, /AGENT=codex/);
  assert.ok(!fs.existsSync(path.join(d.copilotHome, 'hooks', 'launchpad-sounds.json')), 'nothing configured for a Copilot that did not install');
});

test('UT_InstallerCopilot_FailFreshPC: no agent on the PC, AGENT records Copilot so the launcher shows the repair message', { skip: SKIP }, () => {
  const d = sandbox('fail-fresh');
  const r = runInstaller(d, { STUB_INSTALL_EXIT: '6', PATH: path.dirname(process.execPath) + ';' + path.join(process.env.SystemRoot, 'System32') });
  assert.ok(r.notes.includes('copilotok=0'));
  assert.match(r.config, /AGENT=copilot/);
});

test('UT_InstallerCopilot_ClaudeChosenAfterCopilot: choosing Claude on a Copilot PC switches the launcher back', { skip: SKIP }, () => {
  const d = sandbox('back-to-claude', { config: 'AGENT=copilot\r\n' });
  const r = runInstaller(d, { TEST_CHOICE: 'claude' });
  assert.ok(r.notes.includes('claude-section-ran'), r.notes.join(' | '));
  assert.doesNotMatch(r.config, /AGENT=copilot/);
});

test('UT_InstallerCopilot_UpgradeKeepsCopilot: an existing AGENT=copilot is preselected', { skip: SKIP }, () => {
  const d = sandbox('upgrade', { config: 'AGENT=copilot\r\n' });
  const r = runInstaller(d, { TEST_CHOICE: '' });
  assert.ok(r.notes.includes('agent=copilot'), r.notes.join(' | '));
  assert.ok(r.notes.includes('copilotok=1'));
  assert.ok(!r.notes.includes('claude-section-ran'));
});

// ---- Checked in the script
test('UT_InstallerCopilot_ChoiceOnPage: a third radio, with its own note', () => {
  assert.match(NSI, /\$\{NSD_CreateAdditionalRadioButton\}[^\n]*"GitHub Copilot"\n\s*Pop \$AgentCopilotRadio/);
  assert.match(NSI, /\$\{NSD_OnClick\} \$AgentCopilotRadio AgentRadioClicked/);
  const leave = cut(NSI, 'Function ConfigPageLeave\n', '\nFunctionEnd', false);
  assert.match(leave, /StrCpy \$ConfigAgent "copilot"/);
  assert.ok(leave.indexOf('Call ApplyAgentChoice') < leave.indexOf('Call ApplyCopilotChoice'), 'Copilot\'s choice is applied last');
  const init = cut(NSI, 'Function .onInit\n', '\nFunctionEnd', false);
  assert.ok(init.indexOf('Call ApplyAgentChoice') < init.indexOf('Call ApplyCopilotChoice'));
});

test('UT_InstallerCopilot_FilesShipped: every file Copilot needs is installed', () => {
  for (const f of ['configure-copilot.js', 'copilot-sound.js', 'configure-codex.js', 'agent-helpers.js']) assert.ok(NSI.includes(`File "source\\${f}"`), f);
});

test('UT_InstallerCopilot_RightClickEntries: Copilot\'s entries need the verified copy, and name their agent', () => {
  const menu = section('Section "-Right-click entries for Copilot" SecCopilotMenu');
  assert.ok(menu.indexOf('${FileExists} "$INSTDIR\\kivun-copilot-path.txt"') < menu.indexOf('WriteRegStr'), 'checked before anything is written');
  for (const line of [
    'WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadCopilot" "" "Open with Copilot CLI"',
    'WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadCopilot" "" "Open Copilot CLI here"',
    `WriteRegStr HKCU "Software\\Classes\\Directory\\shell\\ClaudeCodeLaunchpadCopilot\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" OPEN-COPILOT "%1"'`,
    `WriteRegStr HKCU "Software\\Classes\\Directory\\Background\\shell\\ClaudeCodeLaunchpadCopilot\\command" "" '"$INSTDIR\\claudecode-launchpad.bat" OPEN-COPILOT "%V"'`,
  ]) assert.ok(menu.includes(line), line);
  assert.ok(menu.indexOf('.local\\bin\\claude.exe') < menu.indexOf('DeleteRegKey'), 'Claude looked for before its entries are removed');
});

test('UT_InstallerCopilot_NoRegistryInTestedSections: the sections tests run for real leave the registry alone', () => {
  assert.doesNotMatch(section('Section /o "!Install GitHub Copilot (Required)" SecCopilot'), /(WriteReg|DeleteReg)/);
});

test('UT_InstallerCopilot_Uninstall: the right-click entries and Launchpad\'s one hook file go, with no Node needed; Copilot itself stays', () => {
  for (const key of ['Directory', 'Directory\\Background']) assert.ok(NSI.includes(`  DeleteRegKey HKCU "Software\\Classes\\${key}\\shell\\ClaudeCodeLaunchpadCopilot"\n`), key);
  const un = NSI.slice(NSI.indexOf('Section "Uninstall"'));
  assert.match(un, /ReadEnvStr \$0 COPILOT_HOME/, 'honors a custom Copilot folder');
  assert.match(un, /Delete "\$0\\hooks\\launchpad-sounds\.json"/);
  assert.doesNotMatch(un, /npm[^\n]*uninstall[^\n]*copilot/i);
  assert.doesNotMatch(un, /RMDir[^\n]*\.copilot/i, 'sign-in and sessions are the user\'s');
});

