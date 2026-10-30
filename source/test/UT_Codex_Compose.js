// configure-codex.js: building Codex's argument array (requirements: "User text never passes
// through cmd", "Existing developer instructions are never replaced"; acceptance A10, A17, A28).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fx = require('./codex-fixture');
const cc = fx.load();

test('UT_Tokenizer_Exact: whitespace splits, quotes group and are removed, nothing else is special', () => {
  assert.deepStrictEqual(cc.tokenize('--search  -c "a b" x\\y %PATH% !v! ^&'), ['--search', '-c', 'a b', 'x\\y', '%PATH%', '!v!', '^&']);
  assert.deepStrictEqual(cc.tokenize('a""b ""'), ['ab', '']);
  assert.deepStrictEqual(cc.tokenize(''), []);
  assert.throws(() => cc.tokenize('-c "open'), e => e.code === 'UNCLOSED_QUOTE');
});

test('UT_Startup_EntriesJoined: several startup entries become one first message', () => {
  assert.deepStrictEqual(cc.startupText(['  hello ', '', 'world']), { text: 'hello world' });
  assert.deepStrictEqual(cc.startupText([]), { text: null });
  assert.deepStrictEqual(cc.startupText('only one'), { text: 'only one' });
});

test('UT_Startup_SlashRejected and line breaks rejected', () => {
  assert.strictEqual(cc.startupText(['/status']).error, 'SLASH');
  assert.strictEqual(cc.startupText(['line1\nline2']).error, 'CONTROL');
  assert.strictEqual(cc.startupText(['tab\there']).error, 'CONTROL');
});

test('UT_Startup_InvalidTextNotInjected: an invalid startup message is dropped, never sent', () => {
  const r = cc.compose({ conv: 'fresh', startup: ['/status'] });
  assert.deepStrictEqual(r.args, []);
  assert.strictEqual(r.errors.length, 1);
});

test('UT_Startup_LeadingDash: a message starting with - goes after --', () => {
  assert.deepStrictEqual(cc.compose({ startup: ['-hello'] }).args, ['--', '-hello']);
  assert.deepStrictEqual(cc.compose({ startup: ['hello -x'] }).args, ['hello -x']);
});

test('UT_Language_TomlLiteralAscii: every language line is ASCII and a TOML literal', () => {
  for (const code of Object.keys(cc.LANGUAGES)) {
    const line = cc.languageLine(code);
    assert.match(line, /^Always respond in [ -~]+\.$/, code);
    assert.ok(!line.includes("'''"), code);
    assert.strictEqual(cc.languageArg(line), "developer_instructions='''" + line + "'''");
  }
  assert.strictEqual(cc.languageLine('nko'), "Always respond in N'Ko.");
  assert.strictEqual(cc.languageLine('english'), null);
  assert.strictEqual(cc.languageLine('klingon'), null);
});

test('UT_Compose_Order: conversation first, then model, language, user options, message last', () => {
  const r = cc.compose({ conv: 'last', model: 'gpt-a', language: 'hebrew', codexFlags: '--search', customFlags: '--add-dir "D:\\My Docs"', startup: ['go'] });
  assert.deepStrictEqual(r.args, ['resume', '--last', '-m', 'gpt-a', '-c', "developer_instructions='''Always respond in Hebrew.'''", '--search', '--add-dir', 'D:\\My Docs', 'go']);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(cc.compose({ conv: 'fresh', noDaemon: true }).args, ['--no-daemon']);
  assert.deepStrictEqual(cc.compose({ conv: 'pick' }).args, ['resume']);
});

test('UT_Compose_UserModelWins: one -m only, the custom one', () => {
  assert.deepStrictEqual(cc.compose({ model: 'gpt-a', customFlags: '-m gpt-z' }).args, ['-m', 'gpt-z']);
  assert.deepStrictEqual(cc.compose({ model: 'gpt-a', customFlags: '--model=gpt-z' }).args, ['--model=gpt-z']);
  const dup = cc.compose({ codexFlags: '-m a', customFlags: '-m b' });
  assert.strictEqual(dup.errors.length, 1, 'two -m: Codex refuses to start, so it is an error');
});

test('UT_Compose_UserInstructionsWin: no language line when the options carry developer_instructions', () => {
  const r = cc.compose({ language: 'hebrew', customFlags: '-c "developer_instructions=Be brief"' });
  assert.deepStrictEqual(r.args, ['-c', 'developer_instructions=Be brief']);
  assert.deepStrictEqual(cc.compose({ language: 'hebrew', skipLanguage: true }).args, []);
});

test('UT_Compose_ResumeOwnedByConversation, dangerous and bad approval flags refused', () => {
  const r1 = cc.compose({ customFlags: 'resume --last' });
  assert.deepStrictEqual(r1.args, []);
  assert.strictEqual(r1.errors.length, 1);
  const r2 = cc.compose({ customFlags: '--search --dangerously-bypass-approvals-and-sandbox --yolo --dangerously-bypass-hook-trust' });
  assert.deepStrictEqual(r2.args, ['--search']);
  assert.strictEqual(r2.errors.length, 1);
  assert.strictEqual(cc.compose({ customFlags: '-a untrusted' }).errors.length, 1);
  assert.strictEqual(cc.compose({ customFlags: '--ask-for-approval=on-failure' }).errors.length, 1);
  assert.deepStrictEqual(cc.compose({ customFlags: '-a never' }).errors, []);
  assert.strictEqual(cc.compose({ customFlags: '-c "open' }).errors.length, 1);
});

test('UT_Compose_PickNoStartup and relaunch without startup text', () => {
  const p = cc.compose({ conv: 'pick', startup: ['hi'] });
  assert.deepStrictEqual(p.args, ['resume']);
  assert.strictEqual(p.notices.length, 1);
  assert.deepStrictEqual(cc.compose({ conv: 'last', startup: ['hi'], relaunch: true }).args, ['resume', '--last']);
});
