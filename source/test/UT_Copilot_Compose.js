// agent-helpers.js: building Copilot's argument array, shared by the picker's preview and the runner
// (Copilot Step 0, S4, S5, S6, S8). ES5 code, so the same rules run in the picker.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const AH = require(path.join(process.env.KIVUN_SOURCE || path.resolve(__dirname, '..'), 'agent-helpers.js'));

const compose = launch => AH.composeCopilot(Object.assign({ conv: 'fresh', model: null, customFlags: '', copilotFlags: '', startup: [], env: {} }, launch));

test('UT_Copilot_ComposeDefaults: a plain launch has no options at all', () => {
  assert.deepStrictEqual(compose({}), { args: [], errors: [], notices: [], fatal: [] });
});

test('UT_Copilot_BypassRefused: every permission bypass stops the launch and is named', () => {
  for (const flag of ['--allow-all', '--allow-all-tools', '--allow-all-paths', '--allow-all-urls', '--yolo', '--autopilot', '--allow-all=true']) {
    const r = compose({ customFlags: '--add-dir "C:\\x" ' + flag });
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.match(r.errors[0], /does not start Copilot with/);
    assert.ok(!r.args.includes(flag), flag + ' never reaches Copilot');
  }
  assert.strictEqual(compose({ copilotFlags: '--yolo' }).fatal.length, 1, 'COPILOT_FLAGS in config.txt too');
  assert.strictEqual(compose({ customFlags: '--mode autopilot' }).fatal.length, 1);
  assert.strictEqual(compose({ customFlags: '--mode=autopilot' }).fatal.length, 1);
  assert.strictEqual(compose({ customFlags: '--mode plan' }).fatal.length, 0, 'plan mode is fine');
});

test('UT_Copilot_BypassEnvRefused: COPILOT_ALLOW_ALL in a profile stops the launch, because it also trusts the folder', () => {
  const r = compose({ env: { COPILOT_ALLOW_ALL: 'true' } });
  assert.strictEqual(r.fatal.length, 1);
  assert.match(r.errors[0], /COPILOT_ALLOW_ALL/);
  assert.strictEqual(compose({ env: { copilot_allow_all: '1' } }).fatal.length, 1, 'Windows variable names ignore case');
  assert.strictEqual(compose({ env: { MY_VAR: '1' } }).fatal.length, 0);
});

test('UT_Copilot_NarrowOptionsAllowed: one named tool or folder is the user\'s own choice, and an option that only looks similar is left alone', () => {
  const r = compose({ customFlags: '--allow-tool=write --add-dir "C:\\my files" --allow-all-mcp-server-instructions' });
  assert.deepStrictEqual(r.fatal, []);
  assert.deepStrictEqual(r.args, ['--allow-tool=write', '--add-dir', 'C:\\my files', '--allow-all-mcp-server-instructions']);
});

test('UT_Copilot_ConversationOptionsRefused: the picker chooses the conversation', () => {
  for (const flag of ['--continue', '--resume', '-r', '--resume=abc', '--session-id', '--session-id=abc', '--connect']) {
    const r = compose({ customFlags: flag });
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.match(r.errors[0], /Choose "continue last" or "pick from history"/);
  }
});

test('UT_Copilot_PromptOptionsRefused: the first message has its own box', () => {
  for (const flag of ['-i', '--interactive', '-p', '--prompt', '--prompt=hi']) {
    const r = compose({ customFlags: flag + ' x' });
    assert.strictEqual(r.fatal.length, 1, flag);
    assert.match(r.errors[0], /startup message/);
  }
});

test('UT_Copilot_Model: the picker\'s model is passed once; the options box wins; two models are refused', () => {
  assert.deepStrictEqual(compose({ model: 'gpt-5.4' }).args, ['--model', 'gpt-5.4']);
  assert.deepStrictEqual(compose({ model: 'gpt-5.4', customFlags: '--model auto' }).args, ['--model', 'auto']);
  assert.strictEqual(compose({ customFlags: '--model a --model=b' }).fatal.length, 1);
});

test('UT_Copilot_Conversation: continue uses the id found on disk; none found means a new conversation; pick opens the list', () => {
  assert.deepStrictEqual(compose({ conv: 'last', sessionId: 'abc' }).args, ['--session-id', 'abc']);
  assert.deepStrictEqual(compose({ conv: 'last', sessionId: null }).args, [], 'never --continue, which can open another folder');
  assert.deepStrictEqual(compose({ conv: 'pick' }).args, ['-i', '/resume'], '--resume shows no list after a trust screen');
});

test('UT_Copilot_ContinueIsNeverPlainContinue: no conversation choice ever produces --continue or --resume', () => {
  for (const conv of ['fresh', 'last', 'pick']) {
    for (const sessionId of [null, 'abc']) {
      const a = compose({ conv, sessionId }).args;
      assert.ok(!a.includes('--continue') && !a.includes('--resume'), conv + ' ' + sessionId);
    }
  }
});

test('UT_Copilot_FirstMessage: joined into one, sent with -i, a /command is allowed alone', () => {
  assert.deepStrictEqual(compose({ startup: ['hello there'] }).args, ['-i', 'hello there']);
  assert.deepStrictEqual(compose({ startup: ['one', ' two '] }).args, ['-i', 'one two']);
  assert.deepStrictEqual(compose({ startup: ['/env'] }).args, ['-i', '/env']);
  assert.deepStrictEqual(compose({ startup: ['שלום & 100% ^ !x'] }).args, ['-i', 'שלום & 100% ^ !x'], 'argument array: nothing is reinterpreted');
  const two = compose({ startup: ['/env', 'hello'] });
  assert.deepStrictEqual(two.args, []);
  assert.match(two.errors[0], /one command/i);
  assert.deepStrictEqual(two.fatal, [], 'bad startup text is left out with a message, and Copilot still starts');
  const ctl = compose({ startup: ['a\u0007b'] });
  assert.deepStrictEqual(ctl.args, []);
  assert.deepStrictEqual(ctl.fatal, []);
});

test('UT_Copilot_FirstMessageDash: text starting with - is never read as an option', () => {
  assert.deepStrictEqual(compose({ startup: ['-hello'] }).args, ['--interactive=-hello']);
});

test('UT_Copilot_FirstMessageWithList: the list and a first message can\'t both happen, so the user is told', () => {
  const r = compose({ conv: 'pick', startup: ['hello'] });
  assert.deepStrictEqual(r.args, ['-i', '/resume']);
  assert.match(r.notices[0], /not sent/);
});

test('UT_Copilot_Relaunch: typing copilot again keeps the options and never resends the message', () => {
  assert.deepStrictEqual(compose({ startup: ['hello'], model: 'm', relaunch: true }).args, ['--model', 'm']);
  assert.deepStrictEqual(compose({ conv: 'pick', relaunch: true }).args, ['-i', '/resume']);
});

test('UT_Copilot_UnclosedQuote: a broken options box stops the launch with a plain message', () => {
  const r = compose({ customFlags: '--add-dir "C:\\x' });
  assert.strictEqual(r.fatal.length, 1);
  assert.match(r.errors[0], /quote/i);
});

test('UT_Copilot_LanguageLine: stronger than Claude and Codex wording, English adds nothing, and Claude\'s line is unchanged', () => {
  assert.match(AH.copilotLanguageLine('hebrew'), /^Always respond in Hebrew, whatever language the user writes in\./);
  assert.match(AH.copilotLanguageLine('nko'), /N'Ko/);
  assert.strictEqual(AH.copilotLanguageLine('english'), null);
  assert.strictEqual(AH.languageLine('hebrew'), 'Always respond in Hebrew.', 'the line Claude and Codex use is frozen');
});

test('UT_Copilot_ProfileFields: Copilot\'s settings live in their own part of the profile', () => {
  assert.deepStrictEqual(AH.copilotFields({ model: 'opus', customFlags: '--verbose', envVars: 'A=1' }), { model: '', conv: 'fresh', customFlags: '', startupCmds: '', envVars: '' });
  assert.deepStrictEqual(AH.copilotFields({ copilot: { model: 'm', conv: 'last', customFlags: 'f', startupCmds: 's', envVars: 'E=1' } }), { model: 'm', conv: 'last', customFlags: 'f', startupCmds: 's', envVars: 'E=1' });
});

test('UT_Copilot_ResolveAgent: three agents, and the two-agent answers are unchanged', () => {
  const all = { claude: true, codex: true, copilot: true };
  assert.deepStrictEqual(AH.resolveAgent('copilot', all), { agent: 'copilot', missing: false, showChoice: true });
  assert.deepStrictEqual(AH.resolveAgent('copilot', { claude: true, codex: false, copilot: false }), { agent: 'copilot', missing: true, showChoice: true });
  assert.deepStrictEqual(AH.resolveAgent('copilot', { claude: false, codex: false, copilot: true }), { agent: 'copilot', missing: false, showChoice: false });
  assert.deepStrictEqual(AH.resolveAgent(undefined, { claude: true, codex: false }), { agent: 'claude', missing: false, showChoice: false }, 'no copilot key at all, as in v3.3.0');
  assert.deepStrictEqual(AH.resolveAgent(undefined, { claude: true, codex: false, copilot: true }), { agent: 'claude', missing: false, showChoice: true });
  assert.deepStrictEqual(AH.resolveAgent('other', all).agent, 'claude', 'unknown means Claude');
});

test('UT_Copilot_SetProfileAgent: stored only for an agent other than Claude', () => {
  assert.strictEqual(AH.setProfileAgent({}, 'copilot').agent, 'copilot');
  assert.ok(!('agent' in AH.setProfileAgent({ agent: 'copilot' }, 'claude')));
});
