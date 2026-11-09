// agent-helpers.js: building Antigravity's argument array, shared by the picker's preview and the runner.
// ES5 code, so the same rules run in the picker.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const fx = require('./copilot-fixture');
const AH = require(path.join(process.env.KIVUN_SOURCE || path.resolve(__dirname, '..'), 'agent-helpers.js'));

const compose = launch => AH.composeAntigravity(Object.assign({ conv: 'fresh', model: null, customFlags: '', antigravityFlags: '', startup: [], statusLine: false, relaunch: false }, launch));

test('UT_Antigravity_ComposeDefaults: a plain launch has no options at all', () => {
  assert.deepStrictEqual(compose({}), { args: [], errors: [], notices: [], fatal: [] });
});

test('UT_Antigravity_RefusedOptions: each is removed, named, and fatal', () => {
  const cases = [
    ['--dangerously-skip-permissions', '--dangerously-skip-permissions'],
    ['--settings x', '--settings'],
    ['--settings={}', '--settings={}'],
    ['--remote-control', '--remote-control'],
    ['--remote-agent', '--remote-agent'],
    ['--mode auto', '--mode auto'],
    ['--mode=auto', '--mode=auto']
  ];
  for (const [flags, shown] of cases) {
    const r = compose({ customFlags: '--sandbox ' + flags });
    assert.strictEqual(r.fatal.length, 1, flags);
    assert.strictEqual(r.errors[0], 'Launchpad does not start Antigravity with ' + shown + '.', flags);
    assert.ok(!r.args.includes('--mode') && !r.args.includes('auto') && !r.args.includes('--mode=auto'), flags);
    assert.ok(r.args.includes('--sandbox'), flags);
  }
  assert.deepStrictEqual(compose({ customFlags: '--mode auto' }).args, [], 'both tokens go');
  assert.strictEqual(compose({ antigravityFlags: '--remote-agent' }).fatal.length, 1, 'ANTIGRAVITY_FLAGS in config.txt too');
});

// agy reads its options with Go's flag package: -mode is --mode (C1).
test('UT_Antigravity_RefusedSingleDash: one dash is refused exactly like two', () => {
  const cases = [
    ['-dangerously-skip-permissions', '-dangerously-skip-permissions'],
    ['-mode auto', '-mode auto'],
    ['-mode=auto', '-mode=auto'],
    ['-settings {}', '-settings'],
    ['-settings={}', '-settings={}'],
    ['-remote-control', '-remote-control'],
    ['-remote-agent', '-remote-agent']
  ];
  for (const [flags, shown] of cases) {
    const r = compose({ customFlags: '--sandbox ' + flags });
    assert.deepStrictEqual(r.fatal, ['Launchpad does not start Antigravity with ' + shown + '.'], flags);
    assert.deepStrictEqual(r.args, ['--sandbox'], flags + ': removed, with its value');
  }
  assert.deepStrictEqual(compose({ customFlags: '--settings x --sandbox' }).fatal, ['Launchpad does not start Antigravity with --settings.'], 'the value goes with the option');
  assert.deepStrictEqual(compose({ customFlags: '--settings x --sandbox' }).args, ['--sandbox']);
  assert.strictEqual(compose({ antigravityFlags: '-remote-control' }).fatal.length, 1, 'ANTIGRAVITY_FLAGS in config.txt too');
  assert.deepStrictEqual(compose({ customFlags: '-mode plan' }).args, ['-mode', 'plan'], '-mode plan stays the user\'s');
  assert.deepStrictEqual(compose({ customFlags: '-mode=accept-edits' }).fatal, []);
});

test('UT_Antigravity_ConversationAndPromptSingleDash: one dash, or two on a one-letter name, is caught as well', () => {
  for (const flag of ['-continue', '--c', '-conversation abc', '-conversation=abc']) {
    const r = compose({ customFlags: flag });
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.strictEqual(r.errors[0], 'Choose "continue last" or "pick from history" in the picker instead of typing ' + flag.split(/[ =]/)[0] + '.', flag);
  }
  for (const flag of ['-print', '-prompt', '-prompt-interactive', '--i', '--p', '-prompt=hi']) {
    const r = compose({ customFlags: flag.includes('=') ? flag : flag + ' x' });   // --prompt=hi x would make x a command word
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.strictEqual(r.errors[0], 'Use the startup message box instead of typing ' + flag.split('=')[0] + '.', flag);
  }
});

test('UT_Antigravity_ModelSingleDash: -model counts as --model', () => {
  assert.deepStrictEqual(compose({ customFlags: '-model a --model b' }).errors, ['The custom options name a model more than once.']);
  assert.deepStrictEqual(compose({ customFlags: '-model=a -model b' }).fatal, ['The custom options name a model more than once.']);
  assert.deepStrictEqual(compose({ model: 'gemini-x', customFlags: '-model other' }).args, ['-model', 'other'], 'the options box wins, once');
  assert.deepStrictEqual(compose({ model: 'gemini-x', customFlags: '-model=other' }).args, ['-model=other']);
});

// agy --sandbox changelog runs the changelog command, so a word that is not an option's value is refused (I1).
test('UT_Antigravity_CommandWords: a word that would run one of agy\'s own commands is refused, and fatal', () => {
  const own = w => 'Launchpad does not start Antigravity with ' + w + ': it would run one of Antigravity\'s own commands.';
  const cases = [
    ['remote-control start', 'remote-control'],
    ['changelog', 'changelog'],
    ['--sandbox changelog', 'changelog'],
    ['plugin install x', 'plugin'],
    ['mcp add foo', 'mcp'],
    ['install', 'install'],
    ['mic-serve', 'mic-serve'],
    ['--model gemini-x update', 'update'],
    ['--sandbox "remote-control start"', '"remote-control start"']
  ];
  for (const [flags, word] of cases) {
    const r = compose({ customFlags: flags, startup: ['hello'] });
    assert.deepStrictEqual(r.fatal, [own(word)], flags);
  }
  assert.deepStrictEqual(compose({ antigravityFlags: 'mic-serve' }).fatal, [own('mic-serve')], 'ANTIGRAVITY_FLAGS in config.txt too');
  const both = compose({ customFlags: '-remote-control changelog' });
  assert.deepStrictEqual(both.fatal, ['Launchpad does not start Antigravity with -remote-control.', own('changelog')], 'a boolean option takes no value');
  assert.deepStrictEqual(compose({ customFlags: '-c false' }).fatal.length, 2, '-c takes no value: false is a word');
});

// Follow-up A: a value-taking option at the very end would take Launchpad's own -i as its value, and
// agy would read the startup message ("install") as one of its commands.
test('UT_Antigravity_OptionWithoutValue: a value-taking option at the end is refused, and fatal', () => {
  for (const flag of ['--model', '-mode', '--add-dir']) {
    const r = compose({ customFlags: '--sandbox ' + flag, startup: ['install'] });
    assert.deepStrictEqual(r.fatal, ['The custom options end with ' + flag + ', which needs a value.'], flag);
  }
  assert.deepStrictEqual(compose({ antigravityFlags: '--effort' }).fatal, ['The custom options end with --effort, which needs a value.'], 'ANTIGRAVITY_FLAGS in config.txt too');
  const ok = compose({ customFlags: '--model x', startup: ['install'] });
  assert.deepStrictEqual(ok.fatal, []);
  assert.deepStrictEqual(ok.args, ['--model', 'x', '-i', 'install']);
  assert.deepStrictEqual(compose({ customFlags: '--model=x' }).fatal, [], 'a --name=value option has its value');
  assert.deepStrictEqual(compose({ customFlags: '--model --sandbox' }).fatal, [], '--sandbox is --model\'s value, as Go reads it');
});

// Follow-up B: Go's flag package stops reading options at a lone - or --.
test('UT_Antigravity_EndOfOptions: a lone - or -- is refused', () => {
  const r = compose({ customFlags: '-- changelog' });
  assert.deepStrictEqual(r.fatal, ['Launchpad does not start Antigravity with --.',
    'Launchpad does not start Antigravity with changelog: it would run one of Antigravity\'s own commands.']);
  assert.deepStrictEqual(compose({ customFlags: '--sandbox -' }).fatal, ['Launchpad does not start Antigravity with -.']);
  assert.deepStrictEqual(compose({ customFlags: '--sandbox -', startup: ['hi'] }).args, ['--sandbox', '-i', 'hi'], 'removed, as the other refused options');
  assert.deepStrictEqual(compose({ customFlags: '--' }).fatal, ['Launchpad does not start Antigravity with --.']);
});

// Follow-up C: the mode's value is compared without regard to case.
test('UT_Antigravity_ModeAutoAnyCase: auto in any case is refused; other modes stay', () => {
  assert.deepStrictEqual(compose({ customFlags: '--mode AUTO' }).fatal, ['Launchpad does not start Antigravity with --mode AUTO.']);
  assert.deepStrictEqual(compose({ customFlags: '-mode=Auto' }).fatal, ['Launchpad does not start Antigravity with -mode=Auto.']);
  assert.deepStrictEqual(compose({ customFlags: '--mode AUTO' }).args, []);
  const plan = compose({ customFlags: '--mode Plan' });
  assert.deepStrictEqual(plan.fatal, []);
  assert.deepStrictEqual(plan.args, ['--mode', 'Plan']);
});

test('UT_Antigravity_OptionValues: the value of an option that takes one is not a command word', () => {
  const ok = [
    ['--model gemini-x', ['--model', 'gemini-x']],
    ['--mode plan', ['--mode', 'plan']],
    ['--effort high', ['--effort', 'high']],
    ['--agent foo', ['--agent', 'foo']],
    ['-model changelog', ['-model', 'changelog']],
    ['--add-dir "C:\\a b" --project p --log-file f.log', ['--add-dir', 'C:\\a b', '--project', 'p', '--log-file', 'f.log']],
    ['--model=gemini-x --sandbox', ['--model=gemini-x', '--sandbox']],
    ['--output-format text --input-format text --json-schema s --print-timeout 0s', ['--output-format', 'text', '--input-format', 'text', '--json-schema', 's', '--print-timeout', '0s']]
  ];
  for (const [flags, args] of ok) {
    const r = compose({ customFlags: flags });
    assert.deepStrictEqual(r.fatal, [], flags);
    assert.deepStrictEqual(r.args, args, flags);
  }
  assert.deepStrictEqual(compose({ customFlags: '--model=x changelog' }).fatal.length, 1, 'a --name=value option carries its own value');
});

test('UT_Antigravity_AllowedOptions: plan, accept-edits, model, effort and sandbox are kept', () => {
  assert.deepStrictEqual(compose({ customFlags: '--mode plan' }).args, ['--mode', 'plan']);
  assert.deepStrictEqual(compose({ customFlags: '--mode accept-edits --effort high --sandbox' }).args, ['--mode', 'accept-edits', '--effort', 'high', '--sandbox']);
  assert.strictEqual(compose({ customFlags: '--mode plan --sandbox' }).fatal.length, 0);
});

test('UT_Antigravity_Conversation: last gives -c first; fresh and pick give none', () => {
  assert.deepStrictEqual(compose({ conv: 'last', model: 'm1', customFlags: '--sandbox' }).args, ['-c', '--model', 'm1', '--sandbox']);
  assert.deepStrictEqual(compose({ conv: 'fresh' }).args, []);
  const r = compose({ conv: 'pick', startup: ['hello'] });
  assert.deepStrictEqual(r.args, []);
  assert.deepStrictEqual(r.notices, ['The startup message is not sent when you pick a conversation from the list.']);
  assert.deepStrictEqual(compose({ conv: 'pick' }).notices, [], 'no text, no notice');
});

test('UT_Antigravity_Model: the field is passed once; the options box wins; two models are refused', () => {
  assert.deepStrictEqual(compose({ model: 'gemini-x' }).args, ['--model', 'gemini-x']);
  assert.deepStrictEqual(compose({ model: 'gemini-x', customFlags: '--model other' }).args, ['--model', 'other']);
  const r = compose({ customFlags: '--model a --model=b' });
  assert.deepStrictEqual(r.errors, ['The custom options name a model more than once.']);
  assert.strictEqual(r.fatal.length, 1);
});

test('UT_Antigravity_StatusLine: exactly --settings and the value, before the user\'s flags', () => {
  assert.strictEqual(AH.ANTIGRAVITY_STATUSLINE, '{"statusLine":{"type":"command","command":"antigravity-statusline.cmd","enabled":true,"stack_with_default":true}}');
  assert.deepStrictEqual(compose({ statusLine: true, customFlags: '--sandbox' }).args, ['--settings', AH.ANTIGRAVITY_STATUSLINE, '--sandbox']);
  assert.deepStrictEqual(compose({ statusLine: false, customFlags: '--sandbox' }).args, ['--sandbox']);
  assert.deepStrictEqual(compose({ statusLine: true, conv: 'last', model: 'm' }).args, ['-c', '--model', 'm', '--settings', AH.ANTIGRAVITY_STATUSLINE]);
  assert.strictEqual(compose({ statusLine: true }).fatal.length, 0);
});

test('UT_Antigravity_Startup: joined, sent with -i even with a leading - or /, one line only', () => {
  assert.deepStrictEqual(compose({ startup: ['hello'] }).args, ['-i', 'hello']);
  assert.deepStrictEqual(compose({ startup: ['  one ', '', 'two'] }).args, ['-i', 'one two']);
  assert.deepStrictEqual(compose({ startup: ['-x go'] }).args, ['-i', '-x go']);
  assert.deepStrictEqual(compose({ startup: ['/help', 'me'] }).args, ['-i', '/help me']);
  const c = compose({ startup: ['a\u0007b'] });
  assert.deepStrictEqual(c.args, []);
  assert.deepStrictEqual(c.errors, ['The startup message can only be one line.']);
  assert.deepStrictEqual(c.notices, ['startup message not sent']);
  assert.deepStrictEqual(c.fatal, [], 'a startup problem does not stop the launch');
  assert.deepStrictEqual(compose({ startup: ['hello'], relaunch: true }).args, []);
  assert.deepStrictEqual(AH.antigravityStartup([' ', '']), { text: null });
});

test('UT_Antigravity_ConversationAndPromptOptions: one error each, once, and the option stays', () => {
  for (const flag of ['-c', '--continue', '--conversation', '--conversation=abc']) {
    const r = compose({ customFlags: flag });
    // --conversation alone also ends the options without its value (follow-up A)
    assert.strictEqual(r.fatal.length, flag === '--conversation' ? 2 : 1, flag);
    assert.match(r.errors[0], /^Choose "continue last" or "pick from history" in the picker instead of typing --?[a-z]+\.$/);
    assert.ok(r.args.includes(flag), flag + ' stays, as Copilot\'s do');
  }
  for (const flag of ['-i', '--prompt-interactive', '-p', '--print', '--prompt', '--prompt=hi']) {
    const r = compose({ customFlags: flag.includes('=') ? flag : flag + ' x' });   // --prompt=hi x would make x a command word
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.match(r.errors[0], /^Use the startup message box instead of typing /);
  }
  assert.strictEqual(compose({ customFlags: '-c --continue' }).errors.length, 1, 'told once');
  assert.strictEqual(compose({ customFlags: '-p a --print b' }).errors.length, 1, 'told once');
});

test('UT_Antigravity_UnclosedQuote: the error is reported and no user flags are sent', () => {
  const r = compose({ customFlags: '--sandbox "oops' });
  assert.strictEqual(r.errors.length, 1);
  assert.deepStrictEqual(r.args, []);
  assert.strictEqual(r.fatal.length, 1);
});

test('UT_Antigravity_Fields: the settings come from profile.antigravity', () => {
  assert.deepStrictEqual(AH.antigravityFields({}), { model: '', conv: 'fresh', customFlags: '', startupCmds: '', envVars: '' });
  assert.deepStrictEqual(AH.antigravityFields({ antigravity: { model: 'm', conv: 'last', customFlags: '-x', startupCmds: 's', envVars: 'A=1' } }),
    { model: 'm', conv: 'last', customFlags: '-x', startupCmds: 's', envVars: 'A=1' });
});

test('UT_Antigravity_LanguageLine: the same function as Copilot\'s', () => {
  assert.strictEqual(AH.antigravityLanguageLine, AH.copilotLanguageLine);
});

test('UT_Antigravity_ResolveAgent: four agents, counts and missing', () => {
  const none = { claude: false, codex: false, copilot: false, antigravity: false };
  let r = AH.resolveAgent('antigravity', Object.assign({}, none, { antigravity: true }));
  assert.deepStrictEqual(r, { agent: 'antigravity', missing: false, showChoice: false });
  r = AH.resolveAgent('antigravity', Object.assign({}, none, { claude: true }));
  assert.deepStrictEqual(r, { agent: 'antigravity', missing: true, showChoice: true });
  r = AH.resolveAgent('antigravity', { claude: true, codex: true, copilot: true, antigravity: true });
  assert.deepStrictEqual(r, { agent: 'antigravity', missing: false, showChoice: true });
  r = AH.resolveAgent(undefined, { claude: true, antigravity: true });
  assert.deepStrictEqual(r, { agent: 'claude', missing: false, showChoice: true });
  r = AH.resolveAgent('gemini', { claude: true });
  assert.deepStrictEqual(r, { agent: 'claude', missing: false, showChoice: false });
});

test('UT_Antigravity_SetProfileAgent: stored like the others, and removed for Claude', () => {
  const p = AH.setProfileAgent({ name: 'x' }, 'antigravity');
  assert.deepStrictEqual(p, { name: 'x', agent: 'antigravity' });
  assert.deepStrictEqual(AH.setProfileAgent(p, 'claude'), { name: 'x' });
});

test('UT_Antigravity_SetAgent: the one writer of AGENT knows Antigravity; unknown agents are still refused', () => {
  const d = fx.makeEnv('agent'), cc = require(path.join(fx.SOURCE, 'configure-codex.js'));
  const cfg = () => fs.readFileSync(path.join(d.kivun, 'config.txt'), 'utf8');
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), 'AGENT=codex\r\n');
  assert.strictEqual(cc.setAgent('antigravity', d.env), true);
  assert.match(cfg(), /AGENT=antigravity/);
  assert.strictEqual(cc.effectiveAgent(cfg()), 'antigravity');
  assert.strictEqual(cc.setAgent('antigravity', d.env), false, 'already antigravity: nothing written');
  assert.throws(() => cc.setAgent('gemini', d.env), /claude, codex, copilot or antigravity/);
  assert.strictEqual(cc.setAgent('claude', d.env), true);
});

test('UT_Antigravity_ES5: agent-helpers.js uses no ES6 syntax', () => {
  const src = fs.readFileSync(path.join(process.env.KIVUN_SOURCE || path.resolve(__dirname, '..'), 'agent-helpers.js'), 'utf8').replace(/\/\/.*$/gm, '');   // comments may hold anything
  assert.ok(!/=>/.test(src), 'arrow function');
  assert.ok(!/\blet\s/.test(src), 'let');
  assert.ok(!/\bconst\s/.test(src), 'const');
  assert.ok(!/`/.test(src), 'template string');
});
