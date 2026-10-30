// configure-codex.js: the user's Codex settings (requirements: "Hooks print nothing", "Hook approval
// survives upgrades", "Launchpad never removes what it did not add"; acceptance A12, A13, A34).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./codex-fixture');
const cc = fx.load();
const P = { play: 'C:/Users/u/.claude/sounds/play.js' };

test('UT_Hooks_CommandFrozen: the exact entries of handout section 5', () => {
  const r = cc.ensureHooks(null, P);
  assert.deepStrictEqual(JSON.parse(r.text), { hooks: {
    PermissionRequest: [{ hooks: [{ type: 'command', command: 'node "C:/Users/u/.claude/sounds/play.js" permission', timeout: 10, async: true }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node "C:/Users/u/.claude/sounds/play.js" done', timeout: 10, async: true }] }],
  } });
  assert.strictEqual(r.added.length, 2);
  assert.ok(!r.text.includes('commandWindows') && !r.text.includes('matcher') && !r.text.includes('statusMessage'));
});

test('UT_Hooks_EventNamesValid: every event we write is one Codex knows', () => {
  const r = cc.ensureHooks(null, P);
  for (const e of Object.keys(JSON.parse(r.text).hooks)) assert.ok(cc.HOOK_EVENTS.includes(e), e);
});

test('UT_Hooks_Idempotent and stable position after the user\'s own entries', () => {
  const user = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'user-stop.cmd' }] }] }, other: 1 };
  const once = cc.ensureHooks(JSON.stringify(user), P);
  const obj = JSON.parse(once.text);
  assert.strictEqual(obj.hooks.Stop[0].hooks[0].command, 'user-stop.cmd', 'user entry stays first');
  assert.strictEqual(obj.hooks.Stop[1].hooks[0].command, 'node "C:/Users/u/.claude/sounds/play.js" done');
  assert.strictEqual(obj.other, 1);
  const twice = cc.ensureHooks(once.text, P);
  assert.strictEqual(twice.text, once.text);
  assert.deepStrictEqual(twice.added, []);
});

test('UT_Hooks_InvalidJsonUntouched', () => {
  for (const bad of ['{not json', '[]', '{"hooks": []}', '{"hooks": {"Stop": {}}}']) assert.ok(cc.ensureHooks(bad, P).error, bad);
});

test('UT_Hooks_RemoveOnlyOurs', () => {
  const user = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-stop.cmd' }] }] } };
  const withOurs = cc.ensureHooks(JSON.stringify(user), P);
  let t = withOurs.text;
  for (const e of withOurs.added) t = cc.removeHook(t, e);
  assert.deepStrictEqual(JSON.parse(t), user);
  // our command inside a group the user changed (an extra handler) is not ours any more
  const changed = JSON.parse(withOurs.text);
  changed.hooks.Stop[1].hooks.push({ type: 'command', command: 'extra' });
  const after = cc.removeHook(JSON.stringify(changed), withOurs.added.find(a => a.event === 'Stop'));
  assert.strictEqual(JSON.parse(after).hooks.Stop.length, 2);
});

test('UT_StatusLine_AddedOnlyWhenMissing', () => {
  const none = cc.ensureStatusLine(null);
  assert.strictEqual(none.text, '[tui]\n' + cc.STATUS_LINE + '\n');
  assert.strictEqual(none.added.table, true);
  for (const has of ['[tui]\nstatus_line = ["model"]\n', 'tui.status_line = []\n', 'model = "x"\n[tui]\n  status_line = []\n', 'tui = { status_line = [] }\n']) {
    const r = cc.ensureStatusLine(has);
    assert.strictEqual(r.text, has, has);
    assert.strictEqual(r.added, null);
  }
  const tuiOnly = cc.ensureStatusLine('model = "x"\r\n[tui]\r\ntheme = "y"\r\n');
  assert.strictEqual(tuiOnly.text, 'model = "x"\r\n[tui]\r\n' + cc.STATUS_LINE + '\r\ntheme = "y"\r\n');
  assert.strictEqual(tuiOnly.added.table, false);
  const bom = cc.ensureStatusLine('\uFEFFmodel = "x"\r\n');
  assert.strictEqual(bom.text, '\uFEFFmodel = "x"\r\n\r\n[tui]\r\n' + cc.STATUS_LINE + '\r\n');
});

test('UT_StatusLine_RemoveRestoresOriginal', () => {
  for (const original of ['', 'model = "x"\r\n', 'model = "x"\n[tui]\ntheme = "y"\n', '\uFEFFa = 1\r\n']) {
    const r = cc.ensureStatusLine(original);
    assert.strictEqual(cc.removeStatusLine(r.text, r.added), original, JSON.stringify(original));
  }
});

function writeUser(d) {
  fs.writeFileSync(path.join(d.codexHome, 'config.toml'), 'model = "mine"\r\n');
  fs.writeFileSync(path.join(d.codexHome, 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.cmd' }] }] } }, null, 2) + '\n');
}

test('UT_ExistingCodexConfig and UT_UninstallIdempotent: install adds, uninstall restores exactly', () => {
  const d = fx.makeEnv('set-roundtrip');
  writeUser(d);
  const before = { cfg: fs.readFileSync(path.join(d.codexHome, 'config.toml')), hooks: fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8') };
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  const rec = JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-codex-changes.json'), 'utf8'));
  assert.strictEqual(rec.entries.length, 3);
  assert.ok(rec.entries.every(e => e.state === 'applied'));
  assert.match(fs.readFileSync(path.join(d.codexHome, 'config.toml'), 'utf8'), /^model = "mine"\r\n/, 'user setting kept');
  const afterInstall = fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8');
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  assert.strictEqual(fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8'), afterInstall, 'second install changes nothing');
  assert.strictEqual(fx.cli(d, ['uninstall']).status, 0);
  assert.deepStrictEqual(fs.readFileSync(path.join(d.codexHome, 'config.toml')), before.cfg);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8')), JSON.parse(before.hooks));
  assert.strictEqual(fx.cli(d, ['uninstall']).status, 0, 'uninstall twice is harmless');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-codex-changes.json'), 'utf8')).entries.length, 0);
});

test('UT_Changes_OnlyOwnedEntriesRemoved: an entry the user changed or removed is left alone', () => {
  const d = fx.makeEnv('set-owned');
  writeUser(d);
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  const cfg = path.join(d.codexHome, 'config.toml');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(cc.STATUS_LINE, 'status_line = ["model"]'));
  assert.strictEqual(fx.cli(d, ['uninstall']).status, 0);
  assert.match(fs.readFileSync(cfg, 'utf8'), /status_line = \["model"\]/, "the user's edited status line stays");
});

function pausedCli(d, args, step) {
  const cp = require('child_process');
  const child = cp.spawn(process.execPath, [fx.MODULE, ...args], { env: Object.assign({}, d.env, { KIVUN_TEST_PAUSE: step }), windowsHide: true, stdio: 'ignore' });
  const until = Date.now() + 20000;
  while (!fs.existsSync(path.join(d.pause, step + '.reached')) && Date.now() < until) fx.sleep(50);
  assert.ok(fs.existsSync(path.join(d.pause, step + '.reached')), 'paused at ' + step);
  child.kill();
  fx.sleep(500);
}

for (const step of ['install-after-intent', 'install-after-edit']) {
  test('UT_Changes_InterruptedRecovery: install stopped at ' + step + ', then uninstall and repair', () => {
    for (const next of ['uninstall', 'install']) {
      const d = fx.makeEnv('set-int-' + step + '-' + next);
      writeUser(d);
      const original = { cfg: fs.readFileSync(path.join(d.codexHome, 'config.toml')), hooks: fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8') };
      pausedCli(d, ['install'], step);
      assert.strictEqual(fx.cli(d, [next]).status, 0);
      if (next === 'uninstall') {
        assert.deepStrictEqual(fs.readFileSync(path.join(d.codexHome, 'config.toml')), original.cfg);
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(d.codexHome, 'hooks.json'), 'utf8')), JSON.parse(original.hooks));
      } else {
        const rec = JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-codex-changes.json'), 'utf8'));
        assert.strictEqual(rec.entries.length, 3, 'repair ends with all three recorded');
        assert.ok(rec.entries.every(e => e.state === 'applied'));
        assert.strictEqual(fx.cli(d, ['uninstall']).status, 0);
        assert.deepStrictEqual(fs.readFileSync(path.join(d.codexHome, 'config.toml')), original.cfg);
      }
    }
  });
}

test('UT_Changes_InterruptedRecovery: uninstall stopped between its two steps, then uninstall again', () => {
  const d = fx.makeEnv('set-int-uninstall');
  writeUser(d);
  const original = fs.readFileSync(path.join(d.codexHome, 'config.toml'));
  assert.strictEqual(fx.cli(d, ['install']).status, 0);
  pausedCli(d, ['uninstall'], 'uninstall-between');
  assert.strictEqual(fx.cli(d, ['uninstall']).status, 0);
  assert.deepStrictEqual(fs.readFileSync(path.join(d.codexHome, 'config.toml')), original);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d.kivun, 'kivun-codex-changes.json'), 'utf8')).entries.length, 0);
});

test('UT_Models_VisibleOnlyInOrder', () => {
  assert.deepStrictEqual(cc.parseModels(JSON.stringify({ models: [
    { slug: 'b', display_name: 'B', visibility: 'list' }, { slug: 'h', visibility: 'hide' }, { slug: 'a', visibility: 'list' }] })),
  [{ slug: 'b', name: 'B' }, { slug: 'a', name: 'a' }]);
  assert.throws(() => cc.parseModels('not json'));
});

test('UT_Models_FailedRefreshKeepsGoodCache', () => {
  const d = fx.makeEnv('set-models');
  assert.strictEqual(fx.cli(d, ['models', '--bundled']).status, 0);
  const file = path.join(d.kivun, 'kivun-codex-models.json');
  const good = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(good.models.map(m => m.slug), ['gpt-a', 'gpt-b']);
  assert.strictEqual(good.source, 'bundled');
  assert.notStrictEqual(fx.cli(d, ['models'], { FAKE_CODEX_MODELS: 'garbage' }).status, 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), good, 'previous list kept');
});
