// v3.8.0: Launchpad moved from %LOCALAPPDATA%\Kivun to %LOCALAPPDATA%\LaunchpadAI (Noam, 2026-11-26).
// The installer's CopyFromOldFolder (run in .onInit, before the upgrade checks read the install folder)
// and its "-Move from the old folder" section are cut out of the real script, compiled with makensis
// into a small silent installer, and run against a sealed folder. Nothing touches this PC's Launchpad,
// its Claude Code or its Windows Terminal: $LOCALAPPDATA, $PROFILE and $APPDATA point into the sandbox,
// and Claude is a stand-in that records its arguments.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const NSI = process.env.KIVUN_NSI || path.resolve(SOURCE, '..', 'ClaudeCode_Launchpad_CLI_Setup.nsi');
const MAKENSIS = process.env.MAKENSIS || path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'NSIS', 'makensis.exe');
const SKIP = fs.existsSync(MAKENSIS) ? false : 'makensis not found (' + MAKENSIS + ')';

function cut(text, start, end) {
  const i = text.indexOf(start);
  assert.ok(i >= 0, 'not found in the installer script: ' + start);
  const j = text.indexOf(end, i + start.length);
  assert.ok(j >= 0, 'end not found after: ' + start);
  return text.slice(i, j + end.length);
}
const seams = s => s.replace(/\$LOCALAPPDATA\b/g, '$TestLocal').replace(/\$PROFILE\b/g, '$TestProfile').replace(/\$APPDATA\b/g, '$TestAppData');

function testScript(out) {
  const t = fs.readFileSync(NSI, 'utf8').replace(/\r\n/g, '\n');
  const defines = t.split('\n').filter(l => /^!define (INSTALL_DIR|OLD_DIR) /.test(l)).map(seams);
  assert.strictEqual(defines.length, 2, 'INSTALL_DIR and OLD_DIR defines');
  const funcs = cut(t, '; ---- v3.8.0: the move from the old folder (start) ----\n', '; ---- v3.8.0: the move from the old folder (end) ----\n');
  const move = cut(t, 'Section "-Move from the old folder" SecMoveOld\n', '\nSectionEnd\n');
  return [
    'Unicode True', '!include "LogicLib.nsh"',
    'Name "FolderMoveTest"', 'OutFile "' + out + '"', 'RequestExecutionLevel user', 'SilentInstall silent',
    ...defines,
    'Var TestLocal', 'Var TestProfile', 'Var TestAppData', 'Var NodeExe',
    'Function .onInit',
    '  ReadEnvStr $TestLocal TEST_LOCALAPPDATA', '  ReadEnvStr $TestProfile TEST_PROFILE', '  ReadEnvStr $TestAppData TEST_APPDATA',
    // TEST_INSTDIR stands for a /D= folder; TEST_FINAL_INSTDIR for a folder picked on the Directory page.
    '  StrCpy $INSTDIR "${INSTALL_DIR}"', '  ReadEnvStr $R8 TEST_INSTDIR', '  ${If} $R8 != ""', '    StrCpy $INSTDIR $R8', '  ${EndIf}',
    '  Call CopyFromOldFolder',
    '  ReadEnvStr $R8 TEST_STOP_AFTER_COPY', '  ${If} $R8 == "1"', '    Quit', '  ${EndIf}',
    '  ReadEnvStr $R8 TEST_FINAL_INSTDIR', '  ${If} $R8 != ""', '    StrCpy $INSTDIR $R8', '  ${EndIf}',
    'FunctionEnd',
    'Function FindNodeExe', '  ReadEnvStr $NodeExe TEST_NODE', 'FunctionEnd',
    seams(funcs),
    'Section "-core" SecCore', '  Call CopyAgainIntoFinalFolder', 'SectionEnd',
    // The real install copies the program files between the two steps; the launcher is the one the
    // copy step checks for.
    'Section "-files" SecFiles', '  SetOutPath "$INSTDIR"',
    '  ReadEnvStr $R9 TEST_HELPER', '  CopyFiles /SILENT "$R9" "$INSTDIR"', '  ReadEnvStr $R9 TEST_PLUGIN_HELPER', '  CopyFiles /SILENT "$R9" "$INSTDIR"',
    '  FileOpen $8 "$INSTDIR\\claudecode-launchpad.bat" w', '  FileWrite $8 "@rem new$\\r$\\n"', '  FileClose $8',
    '  ${IfNot} ${FileExists} "$INSTDIR\\config.txt"', '    FileOpen $8 "$INSTDIR\\config.txt" w', '    FileWrite $8 "AGENT=$\\r$\\n"', '    FileClose $8', '  ${EndIf}',
    'SectionEnd',
    seams(move),
    // A non-admin installer can't schedule a delete for the next restart; nothing may ask for one.
    'Section "-reboot" SecReboot', '  StrCpy $R9 "0"', '  IfRebootFlag 0 +2', '  StrCpy $R9 "1"',
    '  FileOpen $8 "$TestLocal\\reboot-flag.txt" w', '  FileWrite $8 "$R9"', '  FileClose $8', 'SectionEnd',
  ].join('\r\n') + '\r\n';
}

let EXE = null;
function build() {
  if (EXE) return EXE;
  const dir = path.join(ROOT, 'nsis-foldermove');
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'foldermove-test.exe'), script = path.join(dir, 'foldermove-test.nsi');
  fs.writeFileSync(script, '\uFEFF' + testScript(exe));
  const r = cp.spawnSync(MAKENSIS, ['/V2', script], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.strictEqual(r.status, 0, 'makensis failed:\n' + r.stdout + r.stderr);
  assert.ok(!/warning/i.test(r.stdout), 'makensis warnings:\n' + r.stdout);
  return (EXE = exe);
}

// A sealed LOCALAPPDATA (with a space), user profile and APPDATA. opts.old: files in OLD ({rel: text});
// opts.neu: files already in NEW; opts.catalog: Claude recorded its add-on catalog in OLD\plugins.
// Claude Code is a stand-in (KIVUN_TEST_CLAUDE) that records its arguments, and PATH holds no Claude.
function sandbox(name, opts) {
  const root = path.join(ROOT, 'foldermove', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, lad: path.join(root, 'Local Data'), profile: path.join(root, 'profile'), appdata: path.join(root, 'Roaming') };
  d.old = path.join(d.lad, 'Kivun');
  d.neu = path.join(d.lad, 'LaunchpadAI');
  d.calls = path.join(root, 'claude-calls.txt');
  for (const k of ['lad', 'profile', 'appdata']) fs.mkdirSync(d[k], { recursive: true });
  for (const [dir, set] of [[d.old, opts.old], [d.neu, opts.neu]]) {
    for (const [rel, text] of Object.entries(set || {})) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    }
  }
  d.fakeClaude = path.join(root, 'fake-claude.js');
  fs.writeFileSync(d.fakeClaude, "require('fs').appendFileSync(" + JSON.stringify(d.calls) + ", JSON.stringify(process.argv.slice(2)) + '\\n');\n");
  if (opts.catalog) {
    const known = path.join(d.profile, '.claude', 'plugins', 'known_marketplaces.json');
    fs.mkdirSync(path.dirname(known), { recursive: true });
    fs.writeFileSync(known, JSON.stringify({ 'launchpad-plugins': { source: { source: 'directory', path: path.join(d.old, 'plugins') } } }));
  }
  return d;
}
function run(d, env) {
  const r = cp.spawnSync(build(), [], {
    env: Object.assign({}, process.env, {
      TEST_LOCALAPPDATA: d.lad, TEST_PROFILE: d.profile, TEST_APPDATA: d.appdata, TEST_NODE: process.execPath,
      TEST_HELPER: path.join(SOURCE, 'move-from-old-folder.js'), TEST_PLUGIN_HELPER: path.join(SOURCE, 'configure-codex-plugin.js'),
      USERPROFILE: d.profile, LOCALAPPDATA: d.lad, APPDATA: d.appdata, KIVUN_TEST_CLAUDE: d.fakeClaude, CLAUDE_CONFIG_DIR: '', COPILOT_HOME: '',
      PATH: [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), path.dirname(process.execPath)].join(';'),
    }, env || {}),
    windowsHide: true, timeout: 120000,
  });
  // Quit in .onInit (TEST_STOP_AFTER_COPY) ends an NSIS installer with exit code 2, as a cancel does.
  const want = env && env.TEST_STOP_AFTER_COPY === '1' ? 2 : 0;
  assert.strictEqual(r.status, want, 'installer exit ' + r.status);
}
const read = f => fs.readFileSync(f, 'utf8');
const claudeCalls = d => fs.existsSync(d.calls) ? read(d.calls).split('\n').filter(Boolean).map(JSON.parse) : [];
const rebootAsked = d => read(path.join(d.lad, 'reboot-flag.txt')) === '1';
const OLD_INSTALL = {
  'claudecode-launchpad.bat': '@rem old\r\n',
  'config.txt': 'AGENT=codex\r\nRESPONSE_LANGUAGE=hebrew\r\n',
  'profiles.json': '{"version":1,"active":"Work","profiles":[{"name":"Work"}]}',
  'kivun-codex-path.txt': '{"path":"C:\\\\codex"}',
  'kivun-codex-plugin-off.txt': 'unticked\r\n',
  'copilot-language\\he\\copilot-instructions.md': 'answer in Hebrew',
  'install-log.txt': 'old log',
  'launch\\x1\\launch.json': '{}',
  'ratelimit-0123abcd.json': '{}',
};

test('UT_FolderMove_CopiesData: settings, profiles and records reach LaunchpadAI; Kivun is removed', { skip: SKIP }, () => {
  const d = sandbox('copies', { old: OLD_INSTALL, catalog: true });
  run(d);
  for (const f of ['config.txt', 'profiles.json', 'kivun-codex-path.txt', 'kivun-codex-plugin-off.txt', 'install-log.txt', 'copilot-language\\he\\copilot-instructions.md']) {
    assert.strictEqual(read(path.join(d.neu, f)), OLD_INSTALL[f], f);
  }
  assert.ok(!fs.existsSync(path.join(d.neu, 'launch')), 'one-launch folders are not copied');
  assert.ok(!fs.existsSync(path.join(d.neu, 'ratelimit-0123abcd.json')), 'rate-limit state is not copied');
  assert.ok(!fs.existsSync(d.old), 'the old folder is removed');
  assert.deepStrictEqual(claudeCalls(d), [['plugin', 'marketplace', 'add', path.join(d.neu, 'plugins')]]);
  assert.strictEqual(rebootAsked(d), false, 'no restart is asked for');
});

test('UT_FolderMove_CopyBeforeChecks: the copy is done in .onInit, before any section runs', { skip: SKIP }, () => {
  const d = sandbox('oninit', { old: OLD_INSTALL });
  run(d, { TEST_STOP_AFTER_COPY: '1' });
  assert.match(read(path.join(d.neu, 'config.txt')), /^AGENT=codex/);
  assert.ok(fs.existsSync(d.old), 'nothing is removed before the install');
});

test('UT_FolderMove_FreshInstall: no Kivun folder: nothing is copied, Kivun is never created, Claude is not called', { skip: SKIP }, () => {
  const d = sandbox('fresh', {});
  run(d);
  assert.ok(!fs.existsSync(d.old));
  assert.strictEqual(read(path.join(d.neu, 'config.txt')), 'AGENT=\r\n', 'only the fresh config the install writes');
  assert.ok(!fs.existsSync(path.join(d.neu, 'profiles.json')));
  assert.deepStrictEqual(claudeCalls(d), []);
});

test('UT_FolderMove_DoneOnceOnly: once LaunchpadAI has its launcher, a left-over Kivun folder never overwrites it', { skip: SKIP }, () => {
  const d = sandbox('once', { old: OLD_INSTALL, neu: { 'claudecode-launchpad.bat': '@rem new\r\n', 'config.txt': 'AGENT=claude\r\n' } });
  run(d, { TEST_STOP_AFTER_COPY: '1' });
  assert.strictEqual(read(path.join(d.neu, 'config.txt')), 'AGENT=claude\r\n');
});

test('UT_FolderMove_CancelledThenAgain: after a cancelled run, the next run copies Kivun\'s newer settings again', { skip: SKIP }, () => {
  const d = sandbox('again', { old: Object.assign({}, OLD_INSTALL, { 'config.txt': 'AGENT=copilot\r\n' }), neu: { 'config.txt': 'AGENT=codex\r\n' } });
  run(d, { TEST_STOP_AFTER_COPY: '1' });
  assert.strictEqual(read(path.join(d.neu, 'config.txt')), 'AGENT=copilot\r\n');
});

test('UT_FolderMove_KivunWslUntouched: Kivun Terminal\'s Kivun-WSL folder stays', { skip: SKIP }, () => {
  const d = sandbox('wsl', { old: OLD_INSTALL });
  fs.mkdirSync(path.join(d.lad, 'Kivun-WSL'), { recursive: true });
  fs.writeFileSync(path.join(d.lad, 'Kivun-WSL', 'kivun-terminal.bat'), '@rem sister product\r\n');
  run(d);
  assert.strictEqual(read(path.join(d.lad, 'Kivun-WSL', 'kivun-terminal.bat')), '@rem sister product\r\n');
});

test('UT_FolderMove_NotLaunchpad: a Kivun folder without Launchpad\'s launcher is not Launchpad\'s, so it stays', { skip: SKIP }, () => {
  const d = sandbox('other', { old: { 'notes.txt': 'someone else' } });
  run(d);
  assert.strictEqual(read(path.join(d.old, 'notes.txt')), 'someone else');
  assert.ok(!fs.existsSync(path.join(d.neu, 'notes.txt')));
});

test('UT_FolderMove_InstallIntoOldFolder: installing into Kivun itself (a /D= folder) keeps it and everything in it', { skip: SKIP }, () => {
  const d = sandbox('into-old', { old: OLD_INSTALL });
  run(d, { TEST_INSTDIR: d.old });
  for (const f of ['config.txt', 'profiles.json', 'kivun-codex-path.txt']) assert.strictEqual(read(path.join(d.old, f)), OLD_INSTALL[f], f);
  assert.ok(!fs.existsSync(d.neu), 'nothing is copied anywhere else');
});

test('UT_FolderMove_FolderPickedLater: a folder picked on the Directory page gets the settings; the first copy and Kivun go', { skip: SKIP }, () => {
  const d = sandbox('picked', { old: OLD_INSTALL });
  const mine = path.join(d.lad, 'My Launchpad');
  run(d, { TEST_FINAL_INSTDIR: mine });
  for (const f of ['config.txt', 'profiles.json', 'kivun-codex-plugin-off.txt']) assert.strictEqual(read(path.join(mine, f)), OLD_INSTALL[f], f);
  assert.ok(!fs.existsSync(d.neu), 'the copy made before the folder was picked is removed');
  assert.ok(!fs.existsSync(d.old), 'the old folder is removed once the settings are in the picked folder');
});

test('UT_FolderMove_LeftoverWithoutLauncher: a Kivun folder whose launcher is gone but VERSION is left is removed', { skip: SKIP }, () => {
  const d = sandbox('leftover', { old: { 'VERSION': '3.7.0', 'statusline.mjs': '//' }, neu: { 'claudecode-launchpad.bat': '@rem new\r\n', 'config.txt': 'AGENT=claude\r\n' } });
  run(d);
  assert.ok(!fs.existsSync(d.old));
  assert.strictEqual(read(path.join(d.neu, 'config.txt')), 'AGENT=claude\r\n');
});

// The real script, not the test's: the copy runs in .onInit before the agent is read, and in SecCore
// after the open windows are closed and before config.txt is checked.
test('UT_FolderMove_RealOrder: CopyFromOldFolder before the AGENT read in .onInit; CopyAgainIntoFinalFolder after the closer in SecCore', () => {
  const t = fs.readFileSync(NSI, 'utf8').replace(/\r\n/g, '\n');
  const init = cut(t, 'Function .onInit\n', '\nFunctionEnd\n');
  assert.ok(init.indexOf('Call CopyFromOldFolder') >= 0 && init.indexOf('Call CopyFromOldFolder') < init.indexOf('${ConfigRead} "$INSTDIR\\config.txt" "AGENT="'));
  const core = cut(t, 'Section "!Core Components (Required)" SecCore\n', '\nSectionEnd\n');
  const closer = core.indexOf('close-launchers.js"\''), again = core.indexOf('Call CopyAgainIntoFinalFolder'), existed = core.indexOf('StrCpy $ConfigExisted "0"');
  assert.ok(closer >= 0 && again > closer && existed > again, 'closer, then the copy, then ConfigExisted');
  const code = t.split('\n').filter(l => !/^\s*;/.test(l)).join('\n');
  assert.ok(!/\/REBOOTOK/.test(code), 'no delete waits for a restart: the installer has no admin rights to schedule one');
});
