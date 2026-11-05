// configure-codex.js: launch folders, starting Codex, finding Codex, language detection, commit
// (requirements: "User text never passes through cmd", "Nothing is switched silently", D18;
// acceptance A7, A10, A23, A29, A38, A39).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./codex-fixture');

function launch(d, data) { return fx.load().createLaunch(Object.assign({ agent: 'codex', workdir: d.work }, data), d.env); }
function runLaunch(d, id, extraEnv, more) { return fx.cli(d, ['run', id].concat(more || []), extraEnv); }
const lastRun = d => fx.records(d).filter(r => !r.args.includes('--version') && !r.args.includes('models') && !r.args.includes('prompt-input')).pop();

const MATRIX = ['שלום עולם', 'مرحبا', 'emoji 🎉', 'two  spaces', 'a "quoted" word', 'ends with \\', 'backslash quote \\"', '%PATH%', '!x!', 'caret ^ here', '& | < >', "'''triple'''", '-dash first'];

test('UT_Run_ArgvExact: every startup message reaches Codex byte-identical', () => {
  const d = fx.makeEnv('run-argv');
  for (const text of MATRIX) {
    const id = launch(d, { startup: [text] });
    const r = runLaunch(d, id);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const rec = lastRun(d);
    const expected = text[0] === '-' ? ['--', text] : [text];
    assert.deepStrictEqual(rec.args, fx.withDaemonFlag(d, expected), JSON.stringify(text));
    assert.strictEqual(rec.cwd, d.work);
  }
});

test('UT_Run_ArgvExact: flags, language line, profile environment and model as composed', () => {
  const d = fx.makeEnv('run-flags');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=nko\r\nCODEX_FLAGS=--search\r\nAGENT=codex\r\n');
  const id = launch(d, { conv: 'last', model: 'gpt-a', customFlags: '--add-dir "C:\\A B" -c "x=%Y%"', env: { MY_PROFILE_VAR: 'v a l', OPENAI_API_KEY: 'sk-test' } });
  assert.strictEqual(runLaunch(d, id).status, 0);
  const rec = lastRun(d);
  assert.deepStrictEqual(rec.args, fx.withDaemonFlag(d, ['resume', '--last', '-m', 'gpt-a', '-c', "developer_instructions='''Always respond in N'Ko.'''", '--search', '--add-dir', 'C:\\A B', '-c', 'x=%Y%']));
  assert.strictEqual(rec.env.MY_PROFILE_VAR, 'v a l');
  assert.strictEqual(rec.env.OPENAI_API_KEY, 'sk-test');
  assert.strictEqual(rec.pathHead, d.prefix, "Codex's folder first on PATH, for Codex only");
  const preview = JSON.parse(fx.cli(d, ['compose', id]).stdout);
  assert.deepStrictEqual(preview.args, rec.args, 'preview equals what was started');
});

test('UT_Run_NeverSpawnsCmd: the npm codex.cmd shim is never used', () => {
  const d = fx.makeEnv('run-nocmd');
  assert.strictEqual(runLaunch(d, launch(d, {})).status, 0);
  assert.ok(!fs.readFileSync(d.log, 'utf8').includes('cmdShimUsed'));
});

test('UT_Run_IdValidated: anything but 32 lowercase hex characters is refused', () => {
  const d = fx.makeEnv('run-id');
  for (const bad of ['..\\..\\x', 'ABCDEF0123456789ABCDEF0123456789', '1234', 'g'.repeat(32)]) {
    assert.notStrictEqual(runLaunch(d, bad).status, 0, bad);
  }
  assert.strictEqual(fx.records(d).filter(r => !r.args.includes('--version')).length, 0, 'Codex never started');
});

test('UT_Run_ExitCodePassedThrough', () => {
  const d = fx.makeEnv('run-exit');
  assert.strictEqual(runLaunch(d, launch(d, {}), { FAKE_CODEX_EXIT: '7' }).status, 7);
});

test('UT_Run_Relaunch_NoStartupText: same options, no first message', () => {
  const d = fx.makeEnv('run-relaunch');
  const id = launch(d, { conv: 'last', model: 'gpt-a', startup: ['hello'] });
  assert.strictEqual(runLaunch(d, id, {}, ['--relaunch']).status, 0);
  assert.deepStrictEqual(lastRun(d).args, fx.withDaemonFlag(d, ['resume', '--last', '-m', 'gpt-a']));
});

test('UT_Launch_ResumeNoHistory_Codex: continue last is passed as resume --last (Codex starts fresh itself)', () => {
  const d = fx.makeEnv('run-last');
  assert.strictEqual(runLaunch(d, launch(d, { conv: 'last' })).status, 0);
  assert.deepStrictEqual(lastRun(d).args, fx.withDaemonFlag(d, ['resume', '--last']));
});

test('UT_Run_ShortCodexHomeNoDaemonFlag: a normal short Codex home gets no --no-daemon', () => {
  const d = fx.makeEnv('run-short');
  const env = Object.assign({}, d.env, { CODEX_HOME: 'C:\\c' });
  const cc = fx.load();
  const id = cc.createLaunch({ agent: 'codex', workdir: d.work }, env);
  assert.deepStrictEqual(cc.plan(id, env, false, null).compose.args, []);
});

test('UT_Run_LongCodexHomeAddsNoDaemon', () => {
  const d = fx.makeEnv('run-nodaemon');
  const long = path.join(d.root, 'x'.repeat(90));
  fs.mkdirSync(long, { recursive: true });
  assert.strictEqual(runLaunch(d, launch(d, {}), { CODEX_HOME: long }).status, 0);
  assert.deepStrictEqual(lastRun(d).args, ['--no-daemon']);
});

test('UT_Launch_NonPickerCodexFolder: prepare makes a launch folder from config, info gives its folder', () => {
  const d = fx.makeEnv('run-prepare');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'CODEX_STARTUP_CMD=say hi\r\nCODEX_FLAGS=--search\r\n');
  const p = fx.cli(d, ['prepare', d.work]);
  assert.strictEqual(p.status, 0);
  const id = p.stdout.trim();
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.strictEqual(fx.cli(d, ['info', id, 'workdir']).stdout.trim(), d.work);
  assert.strictEqual(runLaunch(d, id).status, 0);
  assert.deepStrictEqual(lastRun(d).args, fx.withDaemonFlag(d, ['--search', 'say hi']));
});

test('UT_Launch_CleanupOld: only old folders whose tab is gone are deleted', () => {
  const d = fx.makeEnv('run-cleanup');
  const cc = fx.load();
  const old = Date.now() - 25 * 60 * 60 * 1000;
  const mk = (owner, age) => { const id = cc.createLaunch({ workdir: d.work }, d.env); const dir = path.join(d.kivun, 'launch', id);
    if (owner !== undefined) fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: owner })); fs.utimesSync(dir, age / 1000, age / 1000); return dir; };
  const deadOld = mk(999999, old), aliveOld = mk(process.pid, old), noOwnerOld = mk(undefined, old), fresh = mk(999999, Date.now());
  assert.strictEqual(cc.cleanupLaunches(d.env), 2);
  assert.ok(!fs.existsSync(deadOld) && !fs.existsSync(noOwnerOld));
  assert.ok(fs.existsSync(aliveOld), 'a tab still open (even waiting at the codex prompt) keeps its folder');
  assert.ok(fs.existsSync(fresh));
});

test('UT_Run_OwnerIsTheTab: owner.json names the parent process (the phase-2 cmd), not the runner', () => {
  const d = fx.makeEnv('run-owner');
  const id = launch(d, {});
  assert.strictEqual(runLaunch(d, id).status, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d.kivun, 'launch', id, 'owner.json'), 'utf8')).pid, process.pid);
});

test('UT_Launch_Concurrent: launches created at the same moment get separate folders and data', () => {
  const d = fx.makeEnv('run-concurrent');
  const cp = require('child_process');
  const kids = [];
  for (let i = 0; i < 6; i++) kids.push(cp.spawn(process.execPath, ['-e', `
    const go = Date.now() + 700; while (Date.now() < go) {}
    process.stdout.write(require(${JSON.stringify(fx.MODULE)}).createLaunch({ workdir: 'w${i}' }))`], { env: d.env }));
  const ids = kids.map(k => new Promise(res => { let o = ''; k.stdout.on('data', x => o += x); k.on('exit', () => res(o.trim())); }));
  return Promise.all(ids).then(list => {
    assert.strictEqual(new Set(list).size, 6);
    list.forEach((id, i) => assert.strictEqual(fx.load().readLaunch(id, d.env).workdir, 'w' + i));
  });
});

test('UT_Launch_Concurrent: two runs held at the same step at once keep their own arguments', async () => {
  const d = fx.makeEnv('run-overlap');
  const cp = require('child_process');
  const a = launch(d, { startup: ['first'] }), b = launch(d, { startup: ['second'] });
  const start = id => cp.spawn(process.execPath, [fx.MODULE, 'run', id], { env: Object.assign({}, d.env, { KIVUN_TEST_PAUSE: 'run-before-start' }), windowsHide: true, stdio: 'ignore' });
  const ka = start(a);
  const reached = path.join(d.pause, 'run-before-start.reached');
  while (!fs.existsSync(reached)) fx.sleep(50);
  fs.unlinkSync(reached);
  const kb = start(b);
  while (!fs.existsSync(reached)) fx.sleep(50);         // both are now inside the same step
  fs.writeFileSync(path.join(d.pause, 'run-before-start.release'), '');
  await Promise.all([ka, kb].map(k => new Promise(res => k.on('exit', res))));
  const runs = fx.records(d).filter(r => r.args.includes('first') || r.args.includes('second')).map(r => r.args[r.args.length - 1]).sort();
  assert.deepStrictEqual(runs, ['first', 'second']);
});

test('UT_Language_ExistingInstructionsKept: user settings, untrusted project, git root, -p file', () => {
  const cases = {
    user: d => fs.writeFileSync(path.join(d.codexHome, 'config.toml'), "developer_instructions = '''mine'''\n"),
    project: d => { fs.mkdirSync(path.join(d.work, '.codex')); fs.writeFileSync(path.join(d.work, '.codex', 'config.toml'), 'developer_instructions = "p"\n'); },
    gitRoot: d => { fs.mkdirSync(path.join(d.root, '.git')); fs.mkdirSync(path.join(d.root, '.codex')); fs.writeFileSync(path.join(d.root, '.codex', 'config.toml'), 'developer_instructions = "r"\n'); },
    profileFile: d => fs.writeFileSync(path.join(d.codexHome, 'work.config.toml'), 'developer_instructions = "w"\n'),
  };
  for (const [name, setup] of Object.entries(cases)) {
    const d = fx.makeEnv('lang-' + name);
    fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
    setup(d);
    const id = launch(d, { customFlags: name === 'profileFile' ? '-p work' : '' });
    const out = JSON.parse(fx.cli(d, ['compose', id]).stdout);
    assert.ok(!out.args.some(a => a.startsWith('developer_instructions')), name + ': language line must be skipped');
    assert.ok(out.notices.some(n => /already contain your own instructions/.test(n)), name + ': picker note');
  }
});

test('UT_Language_PromptInputDetects and UT_Language_DetectorFailureSkipsOverride', () => {
  const user = JSON.stringify([{ role: 'developer', content: [{ text: 'Be brief.' }, { text: '<skills_instructions>' }] }]);
  for (const [label, envx, expectLine] of [['none found', {}, true], ['found', { FAKE_PROMPT_INPUT: user }, false], ['garbage', { FAKE_PROMPT_INPUT: 'oops' }, false]]) {
    const d = fx.makeEnv('lang-pi-' + label.replace(' ', ''));
    fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
    const out = JSON.parse(fx.cli(d, ['compose', launch(d, {})], envx).stdout);
    assert.strictEqual(out.args.includes("developer_instructions='''Always respond in Hebrew.'''"), expectLine, label);
  }
});

test('UT_Language_EnglishSkipsCheck and UT_Language_CacheInvalidation', () => {
  const d = fx.makeEnv('lang-cache');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=english\r\n');
  const id = launch(d, {});
  fx.cli(d, ['compose', id]);
  assert.strictEqual(fx.records(d).filter(r => r.args.includes('prompt-input')).length, 0, 'English: no check at all');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'RESPONSE_LANGUAGE=hebrew\r\n');
  fx.cli(d, ['compose', id]); fx.cli(d, ['compose', id]);
  assert.strictEqual(fx.records(d).filter(r => r.args.includes('prompt-input')).length, 1, 'second run reuses the cached answer');
  fs.writeFileSync(path.join(d.codexHome, 'config.toml'), 'model = "x"\n');
  fx.cli(d, ['compose', id]);
  assert.strictEqual(fx.records(d).filter(r => r.args.includes('prompt-input')).length, 2, 'a settings change triggers a new check');
});

test('UT_PathCache_Revalidate: a cache whose file changed is rebuilt; nothing usable gives a plain message', () => {
  const d = fx.makeEnv('run-cache');
  assert.strictEqual(fx.cli(d, ['commit']).status, 0);
  const cacheFile = path.join(d.kivun, 'kivun-codex-path.txt');
  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert.strictEqual(cache.version, '0.166.0');
  fs.appendFileSync(cache.nativeExe, 'changed');
  const versionCalls = () => fx.records(d).filter(r => r.args.includes('--version')).length;
  const before = versionCalls();
  assert.strictEqual(runLaunch(d, launch(d, {})).status, 0);
  assert.strictEqual(versionCalls(), before + 1, 'changed file: Codex checked again');
  const after = versionCalls();
  assert.strictEqual(runLaunch(d, launch(d, {})).status, 0);
  assert.strictEqual(versionCalls(), after, 'unchanged file: cache trusted');
  // A second Kivun folder with no cache, and a Codex that is too old.
  const k2 = { KIVUN_DIR: path.join(d.root, 'k2') };
  const id2 = fx.load().createLaunch({ agent: 'codex', workdir: d.work }, Object.assign({}, d.env, k2));
  const r = runLaunch(d, id2, Object.assign({ FAKE_CODEX_VERSION: '0.150.0' }, k2));
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout, /older than 0\.166\.0/);
});

test('UT_Install_CommitKillPoints: stopped before the cache, before AGENT, or not at all', () => {
  const cp = require('child_process');
  for (const step of ['commit-before-cache', 'commit-before-agent', 'set-agent-before-rename']) {
    const d = fx.makeEnv('commit-' + step);
    const cfg = path.join(d.kivun, 'config.txt');
    fs.writeFileSync(cfg, 'RESPONSE_LANGUAGE=english\r\n');
    const child = cp.spawn(process.execPath, [fx.MODULE, 'commit'], { env: Object.assign({}, d.env, { KIVUN_TEST_PAUSE: step }), windowsHide: true, stdio: 'ignore' });
    while (!fs.existsSync(path.join(d.pause, step + '.reached'))) fx.sleep(50);
    child.kill();
    fx.sleep(400);
    assert.strictEqual(fs.readFileSync(cfg, 'utf8'), 'RESPONSE_LANGUAGE=english\r\n', step + ': AGENT not committed, old file whole');
    assert.strictEqual(fx.cli(d, ['commit']).status, 0, step + ': rerun commits');
    assert.match(fs.readFileSync(cfg, 'utf8'), /\r\nAGENT=codex\r\n$/);
  }
});

test('UT_Install_Fail_Fresh: commit with no usable Codex exits 5 and leaves AGENT alone', () => {
  const d = fx.makeEnv('commit-missing', { fakeCodex: false });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'X=1\r\n');
  assert.strictEqual(fx.cli(d, ['commit']).status, 5);
  assert.strictEqual(fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8'), 'X=1\r\n');
});
