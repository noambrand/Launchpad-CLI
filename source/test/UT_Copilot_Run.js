// configure-copilot.js: finding a conversation, the language file, the script policy, starting Copilot,
// and the settings it adds (Copilot Step 0, S4, S6, S7, S8; Noam's decisions of 2026-11-06).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./copilot-fixture');

const launch = (m, d, data) => m.createLaunch(Object.assign({ agent: 'copilot', workdir: d.work }, data), d.env);

// ---- Continue: Noam said no to a record of Launchpad's own, so only Copilot's folders are read.
test('UT_Copilot_FindNewest: the newest conversation of exactly this folder', () => {
  const d = fx.makeEnv('find-newest'), m = fx.load();
  fx.addSession(d, 'old', d.work, '2026-01-01T00:00:00Z');
  fx.addSession(d, 'new', d.work, '2026-03-01T00:00:00Z');
  fx.addSession(d, 'elsewhere', path.join(d.root, 'other'), '2026-09-01T00:00:00Z');
  assert.strictEqual(m.findConversation(d.work, d.env), 'new');
});

test('UT_Copilot_FindSkipsEmpty: a session opened and left with no message is never chosen', () => {
  const d = fx.makeEnv('find-empty'), m = fx.load();
  fx.addSession(d, 'real', d.work, '2026-01-01T00:00:00Z');
  fx.addSession(d, 'empty', d.work, '2026-09-01T00:00:00Z', false);
  assert.strictEqual(m.findConversation(d.work, d.env), 'real');
});

test('UT_Copilot_FindNeverAnotherFolder: no conversation here means none, whatever other folders hold', () => {
  const d = fx.makeEnv('find-none'), m = fx.load();
  fx.addSession(d, 'elsewhere', path.join(d.root, 'other'), '2026-09-01T00:00:00Z');
  fx.addSession(d, 'sub', path.join(d.work, 'sub'), '2026-09-01T00:00:00Z');
  assert.strictEqual(m.findConversation(d.work, d.env), null);
});

test('UT_Copilot_FindSameFolderWrittenDifferently: case and a trailing backslash don\'t matter', () => {
  const d = fx.makeEnv('find-case'), m = fx.load();
  fx.addSession(d, 'x', d.work, '2026-01-01T00:00:00Z');
  assert.strictEqual(m.findConversation(d.work.toUpperCase() + '\\', d.env), 'x');
});

test('UT_Copilot_FindDriveRoot: a drive root matches itself and nothing under it', () => {
  const d = fx.makeEnv('find-root'), m = fx.load();
  fx.addSession(d, 'root', 'C:\\', '2026-01-01T00:00:00Z');
  fx.addSession(d, 'under', 'C:\\x', '2026-09-01T00:00:00Z');
  assert.strictEqual(m.findConversation('C:\\', d.env), 'root');
});

test('UT_Copilot_FindQuotedYaml: a folder name that YAML writes in quotes is still found', () => {
  const d = fx.makeEnv('find-quoted'), m = fx.load();
  const single = path.join(d.root, "it's"), dbl = path.join(d.root, 'a # b');
  fx.addSession(d, 'single', `'${single.replace(/'/g, "''")}'`, '2026-01-01T00:00:00Z');
  fx.addSession(d, 'double', JSON.stringify(dbl), '2026-01-01T00:00:00Z');
  assert.strictEqual(m.findConversation(single, d.env), 'single');
  assert.strictEqual(m.findConversation(dbl, d.env), 'double');
});

test('UT_Copilot_FindSafeWhenFormatChanges: unreadable or unexpected files mean a new conversation, never an error', () => {
  const d = fx.makeEnv('find-broken'), m = fx.load();
  assert.strictEqual(m.findConversation(d.work, d.env), null, 'no session folder at all');
  fx.addSession(d, 'good', d.work, '2026-01-01T00:00:00Z');
  const bad = path.join(d.copilotHome, 'session-state', 'bad');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'workspace.yaml'), '\u0000 not yaml at all');
  fs.writeFileSync(path.join(bad, 'events.jsonl'), 'x');
  fs.writeFileSync(path.join(d.copilotHome, 'session-state', 'a-file-not-a-folder'), 'x');
  assert.strictEqual(m.findConversation(d.work, d.env), 'good');
  fs.rmSync(path.join(d.copilotHome, 'session-state', 'good', 'workspace.yaml'));
  assert.strictEqual(m.findConversation(d.work, d.env), null);
});

test('UT_Copilot_FindWritesNothing: Launchpad keeps no record of its own (Noam, 2026-11-06)', () => {
  const d = fx.makeEnv('find-readonly'), m = fx.load();
  fx.addSession(d, 'x', d.work, '2026-01-01T00:00:00Z');
  const before = fs.readdirSync(d.kivun);
  m.findConversation(d.work, d.env);
  assert.deepStrictEqual(fs.readdirSync(d.kivun), before);
});

test('UT_Copilot_ContinueEndToEnd: continue reopens this folder\'s conversation; with none it says so and starts new', () => {
  const d = fx.makeEnv('continue-e2e'), m = fx.load();
  fx.addSession(d, 'mine', d.work, '2026-01-01T00:00:00Z');
  fx.addSession(d, 'other', path.join(d.root, 'o'), '2026-09-01T00:00:00Z');
  let pl = m.plan(launch(m, d, { conv: 'last' }), d.env);
  assert.deepStrictEqual(pl.compose.args, ['--session-id', 'mine']);
  fs.mkdirSync(path.join(d.root, 'n'));
  pl = m.plan(m.createLaunch({ agent: 'copilot', workdir: path.join(d.root, 'n'), conv: 'last' }, d.env), d.env);
  assert.deepStrictEqual(pl.compose.args, []);
  assert.match(pl.compose.notices.join(' '), /No earlier Copilot conversation in this folder/);
});

// ---- Language
test('UT_Copilot_LanguageFile: the one file form Copilot applies, in a folder Launchpad owns, passed by environment', () => {
  const d = fx.makeEnv('lang-file'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  const pl = m.plan(launch(m, d), d.env);
  const dir = pl.runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
  assert.ok(dir.startsWith(d.kivun), dir);
  const text = fs.readFileSync(path.join(dir, '.github', 'instructions', 'language.instructions.md'), 'utf8');
  assert.match(text, /^---\napplyTo: "\*\*"\n---\n/);
  assert.match(text, /Always respond in Hebrew/);
  assert.deepStrictEqual(pl.compose.args, [], 'never an option on the command line');
});

test('UT_Copilot_LanguageEnglish: no language line, nothing written, nothing set', () => {
  const d = fx.makeEnv('lang-english'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n');
  const pl = m.plan(launch(m, d), d.env);
  assert.strictEqual(pl.runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, undefined);
  assert.ok(!fs.existsSync(path.join(d.kivun, 'copilot-language')));
});

test('UT_Copilot_LanguageKeepsUserDirs: a folder the user already set stays, with ours added', () => {
  const d = fx.makeEnv('lang-keep'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=arabic\r\n');
  const env = Object.assign({}, d.env, { COPILOT_CUSTOM_INSTRUCTIONS_DIRS: 'C:\\mine' });
  const parts = m.plan(launch(m, d), env).runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS.split(',');
  assert.strictEqual(parts[0], 'C:\\mine');
  assert.ok(parts[1].startsWith(d.kivun));
});

test('UT_Copilot_LanguageCommaInPath: Copilot splits that variable on commas, so such a path gets a plain note, not a wrong folder', () => {
  const d = fx.makeEnv('lang-comma'), m = fx.load();
  const kivun = path.join(d.root, 'a,b');
  fs.mkdirSync(kivun);
  fs.writeFileSync(path.join(kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  const env = Object.assign({}, d.env, { KIVUN_DIR: kivun });
  const pl = m.plan(m.createLaunch({ agent: 'copilot', workdir: d.work }, env), env);
  assert.strictEqual(pl.runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, undefined);
  assert.match(pl.compose.notices.join(' '), /comma/);
});

// ---- Script policy: npm inside Copilot, no install (Noam, 2026-11-06)
test('UT_Copilot_ScriptPolicySet: nobody chose a policy, so local scripts may run for this session', () => {
  const d = fx.makeEnv('policy-none'), m = fx.load();
  assert.strictEqual(m.plan(launch(m, d), d.env).runEnv.PSExecutionPolicyPreference, 'RemoteSigned');
});

test('UT_Copilot_ScriptPolicyChosen: a policy someone chose is left alone', () => {
  const d = fx.makeEnv('policy-chosen', { scriptPolicy: 'chosen' }), m = fx.load();
  assert.strictEqual(m.plan(launch(m, d), d.env).runEnv.PSExecutionPolicyPreference, undefined);
});

test('UT_Copilot_ScriptPolicyAlreadySet: the variable set by the user or their profile wins', () => {
  const d = fx.makeEnv('policy-set'), m = fx.load();
  assert.strictEqual(m.plan(launch(m, d), Object.assign({}, d.env, { PSExecutionPolicyPreference: 'AllSigned' })).runEnv.PSExecutionPolicyPreference, 'AllSigned');
  assert.strictEqual(m.plan(launch(m, d, { env: { PSExecutionPolicyPreference: 'Restricted' } }), d.env).runEnv.PSExecutionPolicyPreference, 'Restricted');
});

test('UT_Copilot_ScriptPolicyUnsure: when the registry can\'t be read, nothing is loosened on a guess', () => {
  const d = fx.makeEnv('policy-unsure'), m = fx.load();
  const env = Object.assign({}, d.env, { PATH: path.join(d.root, 'nothing-here'), SystemRoot: path.join(d.root, 'no-windows') });
  delete env.KIVUN_TEST_SCRIPT_POLICY;
  assert.strictEqual(m.scriptPolicyChosen(env), true);
});

test('UT_Copilot_ScriptPolicyDetect: reads the registry on this PC without failing', () => {
  const d = fx.makeEnv('policy-real'), m = fx.load();
  const env = Object.assign({}, process.env);
  delete env.KIVUN_TEST_SCRIPT_POLICY;
  assert.strictEqual(typeof m.scriptPolicyChosen(env), 'boolean');
  assert.ok(d);
});

// ---- Starting
test('UT_Copilot_RunExactArguments: an argument array through Node, never the cmd shim, in the chosen folder', () => {
  const d = fx.makeEnv('run-exact'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n');
  const text = 'שלום "quoted" & 100% ^ !x';
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work, startup: [text], model: 'm', env: { MY_PROFILE_VAR: 'v1' } }, d.env);
  assert.strictEqual(fx.cli(d, ['run', id]).status, 0);
  const rec = fx.records(d).filter(r => !r.args.includes('--version'));
  assert.strictEqual(rec.length, 1);
  assert.deepStrictEqual(rec[0].args, ['--model', 'm', '-i', text]);
  assert.strictEqual(fs.realpathSync(rec[0].cwd), fs.realpathSync(d.work));
  assert.strictEqual(rec[0].env.MY_PROFILE_VAR, 'v1');
  assert.ok(!fx.records(d).some(r => r.cmdShimUsed));
});

test('UT_Copilot_RunRefused: a refused option means Copilot is not started, and the reason is shown', () => {
  const d = fx.makeEnv('run-refused'), m = fx.load();
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work, customFlags: '--yolo' }, d.env);
  const r = fx.cli(d, ['run', id]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /does not start Copilot with --yolo/);
  assert.match(r.stdout, /was not started/);
  assert.deepStrictEqual(fx.records(d).filter(x => !x.args.includes('--version')), []);
});

test('UT_Copilot_RunRelaunch: --relaunch leaves the first message out', () => {
  const d = fx.makeEnv('run-relaunch'), m = fx.load();
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work, startup: ['hello'] }, d.env);
  fx.cli(d, ['run', id, '--relaunch']);
  assert.deepStrictEqual(fx.records(d).filter(r => !r.args.includes('--version'))[0].args, []);
});

test('UT_Copilot_RunMissing: no Copilot gives a plain repair message', () => {
  const d = fx.makeEnv('run-missing', { fakeCopilot: false }), m = fx.load();
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work }, d.env);
  const r = fx.cli(d, ['run', id]);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /Copilot was not found/);
  assert.match(r.stdout, /installer again and choose/);
});

test('UT_Copilot_RunTooOld: a version below the minimum is not started', () => {
  const d = fx.makeEnv('run-old'), m = fx.load();
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work }, d.env);
  const r = fx.cli(d, ['run', id], { FAKE_COPILOT_VERSION: '1.0.65' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /older than 1\.0\.105/);
});

test('UT_Copilot_PrepareRightClick: the clicked folder and config.txt\'s options, passed by environment like Codex', () => {
  const d = fx.makeEnv('prepare'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\nCOPILOT_FLAGS=--add-dir C:\\x\r\nCOPILOT_STARTUP_CMD=hello\r\n');
  const out = fx.cli(d, ['prepare'], { KV_FOLDER: d.work + '\\' }).stdout.trim();
  assert.match(out, /^[0-9a-f]{32}$/);
  assert.deepStrictEqual(m.readLaunch(out, d.env).workdir, d.work);
  assert.deepStrictEqual(m.plan(out, d.env).compose.args, ['--add-dir', 'C:\\x', '-i', 'hello']);
  assert.strictEqual(fx.cli(d, ['info', out, 'workdir']).stdout.trim(), d.work);
  assert.strictEqual(fx.cli(d, ['check', out]).status, 0);
});

test('UT_Copilot_ComposeMode: the picker and the tests see exactly what run would start', () => {
  const d = fx.makeEnv('compose'), m = fx.load();
  const id = m.createLaunch({ agent: 'copilot', workdir: d.work, startup: ['hello'] }, d.env);
  const j = JSON.parse(fx.cli(d, ['compose', id]).stdout);
  assert.deepStrictEqual(j.args, ['-i', 'hello']);
});

// ---- Settings: one file Launchpad owns, nothing else
test('UT_Copilot_InstallHooks: one Launchpad file, no shell, the two sounds', () => {
  const d = fx.makeEnv('hooks'), m = fx.load();
  m.install(d.env);
  const f = path.join(d.copilotHome, 'hooks', 'launchpad-sounds.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(j.version, 1);
  assert.deepStrictEqual(Object.keys(j.hooks).sort(), ['agentStop', 'notification']);
  for (const [event, sound] of [['agentStop', 'done'], ['notification', 'permission']]) {
    const h = j.hooks[event][0];
    assert.strictEqual(h.exec, 'node');
    assert.ok(h.args[0].endsWith('copilot-sound.js'), h.args[0]);
    assert.strictEqual(h.args[1], sound);
    assert.ok(!('command' in h) && !('powershell' in h) && !('bash' in h), 'no shell');
  }
  assert.deepStrictEqual(fs.readdirSync(d.copilotHome), ['hooks'], 'touches nothing else in the Copilot folder');
});

test('UT_Copilot_InstallIdempotent: run twice, the file is identical and not rewritten', () => {
  const d = fx.makeEnv('hooks-twice'), m = fx.load();
  m.install(d.env);
  const f = path.join(d.copilotHome, 'hooks', 'launchpad-sounds.json');
  const t0 = fs.statSync(f).mtimeMs, text = fs.readFileSync(f, 'utf8');
  m.install(d.env);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), text);
  assert.strictEqual(fs.statSync(f).mtimeMs, t0);
});

test('UT_Copilot_Uninstall: only Launchpad\'s file goes; the user\'s own hooks and sessions stay; running twice is fine', () => {
  const d = fx.makeEnv('uninstall'), m = fx.load();
  m.install(d.env);
  const mine = path.join(d.copilotHome, 'hooks', 'my-own.json');
  fs.writeFileSync(mine, '{}');
  fx.addSession(d, 'x', d.work, '2026-01-01T00:00:00Z');
  m.uninstall(d.env);
  m.uninstall(d.env);
  assert.ok(!fs.existsSync(path.join(d.copilotHome, 'hooks', 'launchpad-sounds.json')));
  assert.ok(fs.existsSync(mine));
  assert.ok(fs.existsSync(path.join(d.copilotHome, 'session-state', 'x', 'events.jsonl')));
});

test('UT_Copilot_HonorsCopilotHome: a user with their own COPILOT_HOME keeps everything there', () => {
  const d = fx.makeEnv('home'), m = fx.load();
  const other = path.join(d.root, 'elsewhere');
  const env = Object.assign({}, d.env, { COPILOT_HOME: other });
  m.install(env);
  assert.ok(fs.existsSync(path.join(other, 'hooks', 'launchpad-sounds.json')));
  fx.addSession({ copilotHome: other }, 'y', d.work, '2026-01-01T00:00:00Z');
  assert.strictEqual(m.findConversation(d.work, env), 'y');
});

// ---- The installer's commit point
test('UT_Copilot_Commit: verified, cached, then AGENT; unverified leaves AGENT alone', () => {
  const d = fx.makeEnv('commit'), m = fx.load();
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n');
  assert.strictEqual(fx.cli(d, ['commit']).status, 0);
  assert.match(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), /^AGENT=copilot\r$/m);
  assert.ok(fs.existsSync(path.join(d.kivun, 'kivun-copilot-path.txt')));
  assert.ok(m);
  const e = fx.makeEnv('commit-fail', { fakeCopilot: false });
  fs.writeFileSync(path.join(e.kivun, 'config.txt'), 'AGENT=claude\r\n');
  assert.notStrictEqual(fx.cli(e, ['commit']).status, 0);
  assert.match(fs.readFileSync(path.join(e.kivun, 'config.txt'), 'utf8'), /AGENT=claude/);
});

test('UT_Copilot_SetAgentThreeWays: the one writer of AGENT knows Copilot; unknown agents are still refused', () => {
  const d = fx.makeEnv('agent'), cc = require(path.join(fx.SOURCE, 'configure-codex.js'));
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'AGENT=codex\r\n');
  assert.strictEqual(cc.setAgent('copilot', d.env), true);
  assert.strictEqual(cc.effectiveAgent(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8')), 'copilot');
  assert.strictEqual(cc.setAgent('copilot', d.env), false, 'already copilot: nothing written');
  assert.throws(() => cc.setAgent('gemini', d.env));
  assert.strictEqual(cc.setAgent('claude', d.env), true);
});
