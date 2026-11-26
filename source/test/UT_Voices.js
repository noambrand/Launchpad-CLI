// Voices (spec docs/superpowers/specs/2026-11-15-voice-picker-design.md): the shipped voice set,
// play.js choosing the clip, and voice.js. Runs on Windows and macOS (build-and-test-mac.yml),
// so no cmd here, and nothing here plays a sound.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const SOUNDS = path.join(SOURCE, 'sounds');
const INDEX = path.join(SOUNDS, 'voices', 'voices.json');
const IDS = ['jon', 'adam', 'will', 'eric', 'chris', 'vincent', 'hale', 'original', 'jessica', 'bella', 'laura'];
const FEMALE = ['bella', 'laura', 'jessica'];
const CLIPS = ['done', 'error', 'permission', 'waiting', 'save'];

// channels, bits and rate from a WAV file's "fmt " chunk.
function wavFormat(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.toString('ascii', 0, 4), 'RIFF', file + ' is not a RIFF file');
  assert.strictEqual(b.toString('ascii', 8, 12), 'WAVE', file + ' is not a WAVE file');
  for (let p = 12; p + 8 <= b.length; p += 8 + b.readUInt32LE(p + 4) + (b.readUInt32LE(p + 4) % 2)) {
    if (b.toString('ascii', p, p + 4) === 'fmt ') {
      return { channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    }
  }
  assert.fail(file + ' has no fmt chunk');
}

test('UT_Voices_IndexShape: the 11 voices in order, each default first: Jon and Jessica', () => {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  assert.deepStrictEqual(index.voices.map(v => v.id), IDS);
  assert.strictEqual(index.default, 'jon');
  assert.strictEqual(index.default_female, 'jessica');
  for (const v of index.voices) {
    assert.strictEqual(v.gender, FEMALE.includes(v.id) ? 'female' : 'male', v.id);
    assert.ok(v.label && v.description, v.id + ' has a label and a description');
  }
});

test('UT_Voices_EveryClipPresent: every new voice has all 10 clips, mono 16-bit 44.1 kHz', () => {
  for (const id of IDS.filter(i => i !== 'original')) {
    for (const pack of ['regular', 'funny']) {
      for (const clip of CLIPS) {
        const f = path.join(SOUNDS, 'voices', id, pack, clip + '.wav');
        assert.ok(fs.existsSync(f), 'missing ' + path.relative(SOUNDS, f));
        assert.deepStrictEqual(wavFormat(f), { channels: 1, rate: 44100, bits: 16 }, path.relative(SOUNDS, f));
      }
    }
  }
});

test('UT_Voices_ShippedConfigHasNoVoice: a fresh install has no pick, so it gets the default', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(SOUNDS, 'config.json'), 'utf8'));
  assert.ok(!('voice' in cfg), 'config.json must not set "voice"');
});

// ---- play.js choosing the clip --------------------------------------------------------
// A throwaway sounds folder: the real scripts, the given config.json, an index (the real one
// unless told otherwise: null = none, a string = written as is) and 4-byte stand-in clips.
const ROOT = path.join(os.tmpdir(), 'kivun-voices-ut');
let bundles = 0;
function bundle(files, config, index) {
  const dir = path.join(ROOT, 'b' + process.pid + '-' + (++bundles));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(path.join(dir, 'voices'), { recursive: true });
  for (const s of ['play.js', 'voice.js', 'reminder.js']) fs.copyFileSync(path.join(SOUNDS, s), path.join(dir, s));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config || {}, null, 2) + '\n');
  if (index === undefined) fs.copyFileSync(INDEX, path.join(dir, 'voices', 'voices.json'));
  else if (index !== null) fs.writeFileSync(path.join(dir, 'voices', 'voices.json'), index);
  for (const f of files || []) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), 'RIFF');
  }
  // The real path: on macOS the temp folder /var/... is a link to /private/var/..., and
  // require() gives play.js the real one as __dirname, so paths must be compared on it.
  return fs.realpathSync(dir);
}
const player = dir => require(path.join(dir, 'play.js'));
const ORIGINAL_SET = CLIPS.flatMap(c => ['regular/' + c + '.wav', 'funny/' + c + '.wav']);
const VOICE_SET = id => CLIPS.flatMap(c => ['voices/' + id + '/regular/' + c + '.wav', 'voices/' + id + '/funny/' + c + '.wav']);

test('UT_Voices_DefaultIsJon: no voice in config.json plays Jon', () => {
  const dir = bundle(['voices/jon/regular/done.wav', 'regular/done.wav'], { enabled: true, mode: 'regular' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'jon', 'regular', 'done.wav'));
  assert.strictEqual(player(dir).voice(), 'jon');
});

test('UT_Voices_ChosenVoiceAndPack: the chosen voice in the chosen pack', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon'), VOICE_SET('bella')), { voice: 'bella', mode: 'funny' });
  assert.strictEqual(player(dir).resolve('permission'), path.join(dir, 'voices', 'bella', 'funny', 'permission.wav'));
});

test('UT_Voices_MissingClipFallsBackToOriginal: a clip the voice lacks plays the Original clip', () => {
  const files = ORIGINAL_SET.concat(VOICE_SET('bella').filter(f => f !== 'voices/bella/funny/save.wav'));
  const dir = bundle(files, { voice: 'bella', mode: 'funny' });
  assert.strictEqual(player(dir).resolve('save'), path.join(dir, 'funny', 'save.wav'));
});

test('UT_Voices_UnknownVoiceUsesDefault: a voice that does not ship plays Jon', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon')), { voice: 'zed' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'jon', 'regular', 'done.wav'));
});

test('UT_Voices_BadIdStaysInside: a voice id with ../ never leaves the sounds folder', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon'), ['x/regular/done.wav']), { voice: '../../x' });
  const got = player(dir).resolve('done');
  assert.strictEqual(got, path.join(dir, 'voices', 'jon', 'regular', 'done.wav'));
  assert.ok(got.startsWith(dir + path.sep));
});

test('UT_Voices_OriginalUsesTopFolders: "original" plays the first Launchpad clips', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon')), { voice: 'original' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'regular', 'done.wav'));
});

test('UT_Voices_NoIndexStillPlays: without voices.json Jon still plays, else the Original', () => {
  const withJon = bundle(ORIGINAL_SET.concat(VOICE_SET('jon')), {}, null);
  assert.strictEqual(player(withJon).resolve('done'), path.join(withJon, 'voices', 'jon', 'regular', 'done.wav'));
  const without = bundle(ORIGINAL_SET, {}, null);
  assert.strictEqual(player(without).resolve('done'), path.join(without, 'regular', 'done.wav'));
});

test('UT_Voices_BrokenIndex: a broken voices.json is treated as missing', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon')), { voice: 'bella' }, '{oops');
  assert.strictEqual(player(dir).loadIndex(), null);
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'jon', 'regular', 'done.wav'));
});

// ---- voice.js -------------------------------------------------------------------------
function voiceJs(dir, args, input) {
  const r = require('child_process').spawnSync(process.execPath, [path.join(dir, 'voice.js'), ...args],
    { cwd: dir, input: input == null ? '' : input, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, 'voice.js ' + args.join(' ') + ' exited ' + r.status + ': ' + r.stderr);
  return r.stdout;
}
const readCfg = dir => fs.readFileSync(path.join(dir, 'config.json'), 'utf8');

test('UT_VoiceJs_SetsVoice: "voice bella" saves Bella and keeps the other settings', () => {
  const dir = bundle(VOICE_SET('bella'), { enabled: true, mode: 'funny', x: 1 });
  const out = voiceJs(dir, ['voice', 'Bella']);
  const cfg = JSON.parse(readCfg(dir));
  assert.strictEqual(cfg.voice, 'bella');
  assert.strictEqual(cfg.mode, 'funny');
  assert.strictEqual(cfg.x, 1);
  assert.match(out, /Bella/);
});

test('UT_VoiceJs_RejectsUnknown: an unknown voice changes nothing and shows the usage', () => {
  const dir = bundle([], { enabled: true, mode: 'regular' });
  const before = readCfg(dir);
  const out = voiceJs(dir, ['voice', 'zed']);
  assert.strictEqual(readCfg(dir), before);
  assert.match(out, /Usage/);
});

test('UT_VoiceJs_StatusDefault: with no pick, status shows Jon as the default', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: true, mode: 'regular' });
  assert.match(voiceJs(dir, ['status']), /Voice:\s+Jon \(default\)/);
});

test('UT_VoiceJs_ChooseByNumber: "choose" then 9 picks the 9th voice, Jessica', () => {
  const dir = bundle(VOICE_SET('jon').concat(VOICE_SET('jessica')), { enabled: true });
  voiceJs(dir, ['choose'], '9\n');
  assert.strictEqual(JSON.parse(readCfg(dir)).voice, 'jessica');
});

test('UT_VoiceJs_ChooseEmptyKeeps: "choose" then Enter changes nothing', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: true });
  const before = readCfg(dir);
  assert.match(voiceJs(dir, ['choose'], '\n'), /No change\./);
  assert.strictEqual(readCfg(dir), before);
});

test('UT_Voices_DroppedVoiceUsesDefault: a voice no longer in voices.json plays Jon, even if its folder was left behind', () => {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  idx.voices = idx.voices.filter(v => v.id !== 'hale');
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('jon'), VOICE_SET('hale')), { voice: 'hale' }, JSON.stringify(idx));
  assert.strictEqual(player(dir).voice(), 'jon');
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'jon', 'regular', 'done.wav'));
  assert.match(voiceJs(dir, ['status']), /Voice:\s+Jon \(default\)/);
});


// ---- the idle alert ("Attention required") --------------------------------------------
// Claude Code sends "Claude is waiting for your input" about a minute after every reply, also when the
// reply asked nothing and the work goes on by itself (Noam, 2026-11-26). The waiting clip plays only
// when the last reply asks something. Sound is off in these bundles, so alerts.log tells what happened.
function idle(dir, transcriptLines) {
  const t = path.join(dir, 'transcript.jsonl');
  if (transcriptLines) fs.writeFileSync(t, transcriptLines.map(x => JSON.stringify(x)).join('\n') + '\n');
  const payload = { hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input',
    session_id: 's1', cwd: dir, transcript_path: transcriptLines === null ? undefined : t };
  const r = require('child_process').spawnSync(process.execPath, [path.join(dir, 'play.js'), 'waiting'],
    { input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, r.stderr);
  const log = fs.readFileSync(path.join(dir, 'alerts.log'), 'utf8').trim().split('\n');
  return log[log.length - 1];
}
const said = text => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const toolCall = () => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: {} }] } });
const user = text => ({ type: 'user', message: { role: 'user', content: text } });

test('UT_Voices_IdleNoQuestion: after a reply that asks nothing, the idle notification plays no clip', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: false });
  const line = idle(dir, [user('go'), toolCall(), said('The Mac check is running again. I\'ll merge when it passes.')]);
  assert.match(line, /alert=waiting .*wav=\(no question in the last reply - not played\)/);
});

test('UT_Voices_IdleQuestion: after a reply that asks something, the idle clip is due (here: sound off)', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: false });
  const line = idle(dir, [user('go'), said('Done.\n\n> ### \u2753 Question: Should I merge PR #66 now?'), toolCall()]);
  assert.match(line, /wav=\(sound OFF - not played: waiting\.wav\)/);
});

test('UT_Voices_IdleUnknown: without a readable transcript the idle clip is due, as before', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: false });
  assert.match(idle(dir, null), /wav=\(sound OFF - not played: waiting\.wav\)/);
});

test('UT_Voices_PermissionUntouched: a real permission prompt is never held back by the question check', () => {
  const dir = bundle(VOICE_SET('jon'), { enabled: false });
  const t = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(t, JSON.stringify(said('Running the tests now.')) + '\n');
  const r = require('child_process').spawnSync(process.execPath, [path.join(dir, 'play.js'), 'permission'],
    { input: JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' }, transcript_path: t }), encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'alerts.log'), 'utf8'), /alert=permission .*wav=\(sound OFF - not played: permission\.wav\)/);
});
