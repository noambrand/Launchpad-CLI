// The installer's agent logic (handout 7.8; D8, D13, D17, D18; acceptance A2, A4, A13, A14, A25,
// A39). The Codex and agent parts of ClaudeCode_Launchpad_CLI_Setup.nsi are cut out of the real
// script, compiled with makensis into a small silent installer, and run against a sealed folder:
// the real configure-codex.js, a fake Codex, and stand-ins for install.cmd and the other helpers.
// Nothing touches this PC's real Launchpad, and no window opens.
// Test seams, applied to the cut-out text only: ExecWait becomes nsExec::Exec with the same
// command line (hidden), $PROFILE / $LOCALAPPDATA point into the sealed folder, and $PROGRAMFILES
// (both views) to the folder a test names (by default this PC's Program Files, where Node is).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = require('./codex-fixture');

const NSI = process.env.KIVUN_NSI || path.resolve(fx.SOURCE, '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi');
const MAKENSIS = process.env.MAKENSIS || path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'NSIS', 'makensis.exe');
const HAVE_NSIS = fs.existsSync(MAKENSIS);
const SKIP = HAVE_NSIS ? false : 'makensis not found (' + MAKENSIS + ')';

function cut(text, start, end, includeEnd) {
  const i = text.indexOf(start);
  assert.ok(i >= 0, 'not found in the installer script: ' + start);
  const j = text.indexOf(end, i + start.length);
  assert.ok(j >= 0, 'end not found after: ' + start);
  return text.slice(i, includeEnd ? j + end.length : j);
}
function seams(s) {
  return s.replace(/ExecWait ('[^\n]*') (\$\d)/g, 'nsExec::Exec $1\n  Pop $2')
    .replace(/\$PROFILE\b/g, '$TestProfile').replace(/\$LOCALAPPDATA\b/g, '$TestLocal')
    .replace(/\$PROGRAMFILES(64)?\b/g, '$TestProgramFiles');
}

function testScript(out) {
  const t = fs.readFileSync(NSI, 'utf8').replace(/\r\n/g, '\n');
  const defines = t.split('\n').filter(l => /^!define (PRODUCT_NAME|PRODUCT_DESCRIPTION|FINISH_TEXT_)/.test(l));
  const preselect = cut(t, '  ; v3.3.0: start from the agent this PC already uses', '  Call ApplyAgentChoice\n', true);
  const apply = cut(t, 'Function ApplyAgentChoice\n', '\nFunctionEnd\n', true);
  const agentClaude = cut(t, 'Section "-Use Claude Code" SecAgentClaude\n', '\nSectionEnd\n', true);
  const secCodex = cut(t, 'Section /o "!Install Codex (Required)" SecCodex\n', '\nSectionEnd\n', true);
  const uninst = cut(t, '  ; v3.3.0: take out only what Launchpad added', '  ; Unregister the bundled plugins BEFORE', false);
  return [
    'Unicode True',
    '!include "LogicLib.nsh"', '!include "FileFunc.nsh"', '!include "Sections.nsh"', '!include "TextFunc.nsh"',
    'Name "AgentTest"', 'OutFile "' + out + '"', 'RequestExecutionLevel user', 'SilentInstall silent', 'InstallDir "$TEMP\\unused"',
    ...defines,
    'Var ConfigAgent', 'Var NodeExe', 'Var CodexOK', 'Var FinishText', 'Var TestProfile', 'Var TestLocal', 'Var TestProgramFiles',
    'Function .onInit',
    '  ReadEnvStr $INSTDIR TEST_INSTDIR', '  ReadEnvStr $TestProfile TEST_PROFILE', '  ReadEnvStr $TestLocal TEST_LOCALAPPDATA', '  ReadEnvStr $TestProgramFiles TEST_PROGRAMFILES',
    '  StrCpy $CodexOK ""',
    seams(preselect),
    '  ReadEnvStr $R8 TEST_CHOICE',
    '  ${If} $R8 != ""', '    StrCpy $ConfigAgent $R8', '    Call ApplyAgentChoice', '  ${EndIf}',
    '  Call TestSelectUninstall',
    'FunctionEnd',
    'Function Note', '  Exch $9', '  FileOpen $8 "$INSTDIR\\nsis-report.txt" a', '  FileSeek $8 0 END', '  FileWrite $8 "$9$\\r$\\n"', '  FileClose $8', '  Pop $9', 'FunctionEnd',
    '!macro NOTE text', '  Push "${text}"', '  Call Note', '!macroend',
    // The real SecClaudeCode is untouched by v3.3.0 (D17); here it only says it ran and, like the
    // real one, leaves $NodeExe set for the step after it.
    'Section "!Install Claude Code (Required)" SecClaudeCode', '  SectionIn RO', '  ReadEnvStr $NodeExe TEST_NODE', '  !insertmacro NOTE "claude-section-ran"', 'SectionEnd',
    agentClaude, seams(secCodex),
    'Section "-report" SecReport',
    '  !insertmacro NOTE "agent=$ConfigAgent"', '  !insertmacro NOTE "codexok=$CodexOK"',
    '  SectionGetText ${SecClaudeCode} $0', '  !insertmacro NOTE "claude-text=$0"',
    '  SectionGetText ${SecCodex} $0', '  !insertmacro NOTE "codex-text=$0"',
    '  FileOpen $8 "$INSTDIR\\finish.txt" w', '  FileWriteUTF16LE $8 $FinishText', '  FileClose $8',
    'SectionEnd',
    // (A section named "Uninstall" would become the uninstaller itself, hence this name.)
    'Section /o "-test of the uninstall step" SecUninstall', seams(uninst), '  !insertmacro NOTE "uninstall-continued"', 'SectionEnd',
    apply,
    'Function TestSelectUninstall',
    '  ReadEnvStr $R8 TEST_UNINSTALL',
    '  ${If} $R8 == "1"',
    '    !insertmacro UnselectSection ${SecClaudeCode}', '    !insertmacro UnselectSection ${SecCodex}', '    !insertmacro UnselectSection ${SecAgentClaude}',
    '    !insertmacro UnselectSection ${SecReport}', '    !insertmacro SelectSection ${SecUninstall}',
    '  ${EndIf}',
    'FunctionEnd',
  ].join('\r\n') + '\r\n';
}

let EXE = null;
function build() {
  if (EXE) return EXE;
  const dir = path.join(fx.ROOT, 'nsis');
  fx.rmrf(dir);
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'agent-test.exe');
  const script = path.join(dir, 'agent-test.nsi');
  fs.writeFileSync(script, '\uFEFF' + testScript(exe));
  const r = cp.spawnSync(MAKENSIS, ['/V2', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.strictEqual(r.status, 0, 'makensis failed:\n' + r.stdout + r.stderr);
  assert.ok(!/warning/i.test(r.stdout), 'makensis warnings:\n' + r.stdout);
  return (EXE = exe);
}

const STUB_JS = name => "require('fs').appendFileSync(process.env.STUB_CALLS, JSON.stringify({ s: '" + name + "', a: process.argv.slice(2) }) + '\\n');\n";
const CLAUDE_TEMPLATE = () => fs.readFileSync(path.join(fx.SOURCE, 'config.txt'));

// A sealed install folder with a space in its path, the real configure-codex.js, and stand-ins.
function sandbox(name, opts) {
  opts = opts || {};
  const d = fx.makeEnv('nsis ' + name, { fakeCodex: opts.fakeCodex });
  // The installer looks for the change record in %LOCALAPPDATA%\Kivun, so the folder is named so.
  d.kivun = d.env.KIVUN_DIR = path.join(d.root, 'Kivun');
  fs.mkdirSync(d.kivun, { recursive: true });
  d.calls = path.join(d.root, 'calls.jsonl');
  d.profile = path.join(d.root, 'profile');
  fs.mkdirSync(path.join(d.kivun, 'sounds'), { recursive: true });
  for (const f of ['configure-codex.js', 'agent-helpers.js']) fs.copyFileSync(path.join(fx.SOURCE, f), path.join(d.kivun, f));
  fs.writeFileSync(path.join(d.kivun, 'sounds', 'configure-sound-hooks.js'), STUB_JS('sounds'));
  fs.writeFileSync(path.join(d.kivun, 'apply-wt-settings.js'), STUB_JS('wt'));
  fs.writeFileSync(path.join(d.kivun, 'apply-terminal-color.js'), STUB_JS('color'));
  fs.writeFileSync(path.join(d.kivun, 'install.cmd'), '@echo off\r\n>>"%STUB_CALLS%" echo install.cmd^|%~1^|%~2\r\nexit /b %STUB_INSTALL_EXIT%\r\n');
  if (opts.claudeInstalled) {
    fs.mkdirSync(path.join(d.profile, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(d.profile, '.local', 'bin', 'claude.exe'), '');
  }
  if (opts.config !== undefined) fs.writeFileSync(path.join(d.kivun, 'config.txt'), opts.config);
  return d;
}

function runInstaller(d, env) {
  const r = cp.spawnSync(build(), [], {
    env: Object.assign({}, d.env, {
      TEST_INSTDIR: d.kivun, TEST_PROFILE: d.profile, TEST_LOCALAPPDATA: path.dirname(d.kivun), TEST_NODE: process.execPath, TEST_PROGRAMFILES: process.env.ProgramFiles,
      STUB_CALLS: d.calls, STUB_INSTALL_EXIT: '0', TEMP: d.root, TMP: d.root,
    }, env || {}),
    windowsHide: true, timeout: 180000,
  });
  const rep = path.join(d.kivun, 'nsis-report.txt');
  const lines = fs.existsSync(rep) ? fs.readFileSync(rep, 'utf8').split('\r\n').filter(Boolean) : [];
  const calls = fs.existsSync(d.calls) ? fs.readFileSync(d.calls, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l[0] === '{' ? JSON.parse(l) : { s: l.split('|')[0], a1: l.split('|')[1], a2: l.split('|')[2] }) : [];
  const finishFile = path.join(d.kivun, 'finish.txt');
  const finish = fs.existsSync(finishFile) ? fs.readFileSync(finishFile, 'utf16le') : undefined;
  const get = k => { const l = lines.find(x => x.startsWith(k + '=')); return l === undefined ? undefined : l.slice(k.length + 1); };
  return { status: r.status, lines, calls, get, finish, config: () => fs.readFileSync(path.join(d.kivun, 'config.txt')) };
}
const agentOf = buf => { const m = String(buf).match(/^AGENT=(.*)$/m); return m ? m[1].replace(/\r$/, '') : undefined; };
const names = calls => calls.map(c => c.s);
// v3.2.2's MUI_FINISHPAGE_TEXT, as the page shows it.
const FINISH_V322 = 'ClaudeCode Launchpad CLI has been installed successfully.\r\n\r\nClaude Code installer for Windows\r\n\r\n' +
  "TIP: Pin it to your taskbar for one-click access — click Start, type 'ClaudeCode Launchpad CLI', right-click the result and choose 'Pin to taskbar'. No need to hunt for the desktop icon.\r\n\r\n" +
  'You will need an Anthropic API key to use Claude Code.\r\nGet one at: https://console.anthropic.com/';

test('UT_Installer_ClaudeFreshInstall: v3.2.2 path, nothing of Codex runs, config.txt untouched', { skip: SKIP }, () => {
  const d = sandbox('claude fresh', { config: CLAUDE_TEMPLATE(), claudeInstalled: true });
  const before = CLAUDE_TEMPLATE();
  const r = runInstaller(d);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.lines.slice(0, 1), ['claude-section-ran']);
  assert.strictEqual(r.get('agent'), 'claude');
  assert.strictEqual(r.get('codexok'), '', 'SecCodex must not run');
  assert.strictEqual(r.get('claude-text'), 'Install Claude Code (Required)');
  assert.strictEqual(r.get('codex-text'), '', 'Codex section hidden for Claude');
  assert.strictEqual(r.finish, FINISH_V322, 'the Claude finish text is exactly the v3.2.2 one');
  assert.deepStrictEqual(r.calls, [], 'no install.cmd /codex and no helper call');
  assert.deepStrictEqual(r.config(), before, 'A2: config.txt byte-identical');
});

test('UT_Installer_ClaudeUpgradeNoAgentKey: AGENT missing means Claude, and the set-agent step writes nothing', { skip: SKIP }, () => {
  const v322 = Buffer.from('RESPONSE_LANGUAGE=hebrew\r\nCLAUDE_FLAGS=--model opus\r\n');
  const d = sandbox('claude upgrade', { config: v322, claudeInstalled: true });
  const r = runInstaller(d);
  assert.strictEqual(r.get('agent'), 'claude');
  assert.deepStrictEqual(r.config(), v322);
});

test('UT_Installer_UpgradePreselectsCodex: AGENT=codex keeps Codex, Claude section skipped (D17)', { skip: SKIP }, () => {
  const d = sandbox('codex upgrade', { config: 'RESPONSE_LANGUAGE=english\r\nAGENT=codex\r\n', claudeInstalled: true });
  const r = runInstaller(d);
  assert.strictEqual(r.status, 0);
  assert.ok(!r.lines.includes('claude-section-ran'), 'SecClaudeCode must not run for Codex');
  assert.strictEqual(r.get('agent'), 'codex');
  assert.strictEqual(r.get('codexok'), '1');
  assert.strictEqual(r.get('claude-text'), '', 'Claude section hidden for Codex');
  assert.strictEqual(r.get('codex-text'), 'Install Codex (Required)');
  assert.ok(r.finish.startsWith('Codex is ready.'), r.finish);
  assert.strictEqual(agentOf(r.config()), 'codex');
});

test('UT_Installer_PreselectIsExact: AGENT=Codex (other case) or with a trailing space means Claude, as the launcher reads it', { skip: SKIP }, () => {
  for (const [i, v] of ['Codex', 'codex '].entries()) {
    const d = sandbox('preselect ' + i, { config: 'RESPONSE_LANGUAGE=english\r\nAGENT=' + v + '\r\n', claudeInstalled: true });
    const r = runInstaller(d);
    assert.strictEqual(r.get('agent'), 'claude', JSON.stringify(v));
  }
});

test('UT_Installer_CodexFreshSuccess: install, sounds bundle only, Codex settings, terminal, then AGENT=codex last', { skip: SKIP }, () => {
  const d = sandbox('codex fresh', { config: CLAUDE_TEMPLATE() });
  const r = runInstaller(d, { TEST_CHOICE: 'codex' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.get('codexok'), '1');
  const inst = r.calls.find(c => c.s === 'install.cmd');
  assert.ok(inst, 'install.cmd was called');
  assert.strictEqual(inst.a1, '/codex');
  assert.ok(/node\.exe$/i.test(inst.a2) && fs.existsSync(inst.a2), 'node.exe passed whole although both paths have spaces: ' + inst.a2);
  assert.deepStrictEqual(names(r.calls), ['install.cmd', 'sounds', 'wt', 'color']);
  assert.deepStrictEqual(r.calls[1].a, ['--deploy-only']);
  assert.ok(fs.existsSync(path.join(d.codexHome, 'hooks.json')), 'sound hooks configured');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-codex-models.json')), 'model list cached at install');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-codex-path.txt')), 'commit cached the verified path');
  assert.strictEqual(agentOf(r.config()), 'codex');
});

test('UT_Installer_CodexFailClaudePresent: A25, nothing changes and no Codex settings are written', { skip: SKIP }, () => {
  const d = sandbox('codex fail claude', { config: CLAUDE_TEMPLATE(), claudeInstalled: true });
  const before = CLAUDE_TEMPLATE();
  const r = runInstaller(d, { TEST_CHOICE: 'codex', STUB_INSTALL_EXIT: '5' });
  assert.strictEqual(r.get('codexok'), '0');
  assert.deepStrictEqual(names(r.calls), ['install.cmd', 'wt', 'color']);
  assert.deepStrictEqual(r.config(), before, 'AGENT unchanged, config.txt byte-identical');
  assert.ok(!fs.existsSync(path.join(d.codexHome, 'hooks.json')));
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-codex-path.txt')));
});

test('UT_Installer_CodexFailFreshPC: A14, no agent on the PC, AGENT records Codex so the launcher shows the repair message', { skip: SKIP }, () => {
  const d = sandbox('codex fail fresh', { config: CLAUDE_TEMPLATE() });
  const r = runInstaller(d, { TEST_CHOICE: 'codex', STUB_INSTALL_EXIT: '5' });
  assert.strictEqual(r.get('codexok'), '0');
  assert.strictEqual(agentOf(r.config()), 'codex');
  assert.ok(!fs.existsSync(path.join(d.kivun, 'kivun-codex-path.txt')), 'no false "installed"');
});

test('UT_Installer_CommitNeedsVerifiedCodex: install.cmd says 0 but no Codex verifies, so AGENT is not switched (D18, A39)', { skip: SKIP }, () => {
  const d = sandbox('codex unverified', { config: CLAUDE_TEMPLATE(), claudeInstalled: true, fakeCodex: false });
  const before = CLAUDE_TEMPLATE();
  const r = runInstaller(d, { TEST_CHOICE: 'codex' });
  assert.strictEqual(r.get('codexok'), '0');
  assert.deepStrictEqual(r.config(), before);
});

test('UT_Installer_ClaudeChosenOnCodexPC: D13, set-agent claude switches the launcher back', { skip: SKIP }, () => {
  const d = sandbox('back to claude', { config: 'RESPONSE_LANGUAGE=english\r\nAGENT=codex\r\nCLAUDE_FLAGS=\r\n', claudeInstalled: true });
  const r = runInstaller(d, { TEST_CHOICE: 'claude' });
  assert.ok(r.lines.includes('claude-section-ran'));
  assert.strictEqual(r.get('codexok'), '');
  assert.strictEqual(String(r.config()), 'RESPONSE_LANGUAGE=english\r\nAGENT=claude\r\nCLAUDE_FLAGS=\r\n');
});

test('UT_Installer_UninstallRemovesCodexEntries: A13, recorded entries go, then the uninstall continues', { skip: SKIP }, () => {
  const d = sandbox('uninstall', { config: CLAUDE_TEMPLATE() });
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  const hooks = path.join(d.codexHome, 'hooks.json');
  assert.ok(fs.readFileSync(hooks, 'utf8').includes('play.js'));
  const r = runInstaller(d, { TEST_UNINSTALL: '1' });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.lines, ['uninstall-continued']);
  assert.ok(!fs.readFileSync(hooks, 'utf8').includes('play.js'), 'our hooks removed');
});

test('UT_Installer_UninstallStopsOnFailure: the record survives, nothing after the Codex step runs', { skip: SKIP }, () => {
  const d = sandbox('uninstall fail', { config: CLAUDE_TEMPLATE() });
  fs.writeFileSync(path.join(d.kivun, 'kivun-codex-changes.json'), '{ not json');
  const r = runInstaller(d, { TEST_UNINSTALL: '1' });
  assert.notStrictEqual(r.status, 0, 'the uninstaller reports a stop');
  assert.deepStrictEqual(r.lines, [], 'stopped before deleting anything');
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-codex-changes.json')));
});

test('UT_Installer_UninstallWithoutNode: A44, Node.js removed first: a plain message, and the uninstall still finishes', { skip: SKIP }, () => {
  const d = sandbox('uninstall no node', { config: CLAUDE_TEMPLATE() });
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  const noNode = path.join(d.root, 'no program files');
  fs.mkdirSync(noNode, { recursive: true });
  const r = runInstaller(d, { TEST_UNINSTALL: '1', TEST_PROGRAMFILES: noNode, PATH: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.lines, ['uninstall-continued'], 'the uninstall goes on');
});

test('UT_Installer_UninstallWithoutRecord: a Claude-only PC needs no Node at uninstall', { skip: SKIP }, () => {
  const d = sandbox('uninstall none', { config: CLAUDE_TEMPLATE() });
  const r = runInstaller(d, { TEST_UNINSTALL: '1', PATH: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(r.lines, ['uninstall-continued']);
});
