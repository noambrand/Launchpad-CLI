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
const IDS = ['adam', 'will', 'eric', 'chris', 'jon', 'vincent', 'hale', 'original', 'bella', 'laura', 'jessica'];
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

test('UT_Voices_IndexShape: the 11 voices in order, Adam and Bella as the defaults', () => {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  assert.deepStrictEqual(index.voices.map(v => v.id), IDS);
  assert.strictEqual(index.default, 'adam');
  assert.strictEqual(index.default_female, 'bella');
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

test('UT_Voices_DefaultIsAdam: no voice in config.json plays Adam', () => {
  const dir = bundle(['voices/adam/regular/done.wav', 'regular/done.wav'], { enabled: true, mode: 'regular' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'adam', 'regular', 'done.wav'));
  assert.strictEqual(player(dir).voice(), 'adam');
});

test('UT_Voices_ChosenVoiceAndPack: the chosen voice in the chosen pack', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam'), VOICE_SET('bella')), { voice: 'bella', mode: 'funny' });
  assert.strictEqual(player(dir).resolve('permission'), path.join(dir, 'voices', 'bella', 'funny', 'permission.wav'));
});

test('UT_Voices_MissingClipFallsBackToOriginal: a clip the voice lacks plays the Original clip', () => {
  const files = ORIGINAL_SET.concat(VOICE_SET('bella').filter(f => f !== 'voices/bella/funny/save.wav'));
  const dir = bundle(files, { voice: 'bella', mode: 'funny' });
  assert.strictEqual(player(dir).resolve('save'), path.join(dir, 'funny', 'save.wav'));
});

test('UT_Voices_UnknownVoiceUsesDefault: a voice that does not ship plays Adam', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam')), { voice: 'zed' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'adam', 'regular', 'done.wav'));
});

test('UT_Voices_BadIdStaysInside: a voice id with ../ never leaves the sounds folder', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam'), ['x/regular/done.wav']), { voice: '../../x' });
  const got = player(dir).resolve('done');
  assert.strictEqual(got, path.join(dir, 'voices', 'adam', 'regular', 'done.wav'));
  assert.ok(got.startsWith(dir + path.sep));
});

test('UT_Voices_OriginalUsesTopFolders: "original" plays the first Launchpad clips', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam')), { voice: 'original' });
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'regular', 'done.wav'));
});

test('UT_Voices_NoIndexStillPlays: without voices.json Adam still plays, else the Original', () => {
  const withAdam = bundle(ORIGINAL_SET.concat(VOICE_SET('adam')), {}, null);
  assert.strictEqual(player(withAdam).resolve('done'), path.join(withAdam, 'voices', 'adam', 'regular', 'done.wav'));
  const without = bundle(ORIGINAL_SET, {}, null);
  assert.strictEqual(player(without).resolve('done'), path.join(without, 'regular', 'done.wav'));
});

test('UT_Voices_BrokenIndex: a broken voices.json is treated as missing', () => {
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam')), { voice: 'bella' }, '{oops');
  assert.strictEqual(player(dir).loadIndex(), null);
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'adam', 'regular', 'done.wav'));
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

test('UT_VoiceJs_StatusDefault: with no pick, status shows Adam as the default', () => {
  const dir = bundle(VOICE_SET('adam'), { enabled: true, mode: 'regular' });
  assert.match(voiceJs(dir, ['status']), /Voice:\s+Adam \(default\)/);
});

test('UT_VoiceJs_ChooseByNumber: "choose" then 9 picks the 9th voice, Bella', () => {
  const dir = bundle(VOICE_SET('adam').concat(VOICE_SET('bella')), { enabled: true });
  voiceJs(dir, ['choose'], '9\n');
  assert.strictEqual(JSON.parse(readCfg(dir)).voice, 'bella');
});

test('UT_VoiceJs_ChooseEmptyKeeps: "choose" then Enter changes nothing', () => {
  const dir = bundle(VOICE_SET('adam'), { enabled: true });
  const before = readCfg(dir);
  assert.match(voiceJs(dir, ['choose'], '\n'), /No change\./);
  assert.strictEqual(readCfg(dir), before);
});

test('UT_Voices_DroppedVoiceUsesDefault: a voice no longer in voices.json plays Adam, even if its folder was left behind', () => {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  idx.voices = idx.voices.filter(v => v.id !== 'hale');
  const dir = bundle(ORIGINAL_SET.concat(VOICE_SET('adam'), VOICE_SET('hale')), { voice: 'hale' }, JSON.stringify(idx));
  assert.strictEqual(player(dir).voice(), 'adam');
  assert.strictEqual(player(dir).resolve('done'), path.join(dir, 'voices', 'adam', 'regular', 'done.wav'));
  assert.match(voiceJs(dir, ['status']), /Voice:\s+Adam \(default\)/);
});
