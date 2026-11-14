// The picker's Voice row (spec docs/superpowers/specs/2026-11-15-voice-picker-design.md): Male /
// Female, one chip per voice of that gender, Preview. The picker's real script runs invisibly
// against a sealed folder (picker-sim.js), with a stand-in sounds folder under the fake user.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { openPicker } = require('./picker-sim');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const ROOT = process.env.KIVUN_TEST_ROOT || path.join(SOURCE, '..', '.test-run');
const HTA = path.join(SOURCE, 'folder-picker.hta');
const HELPERS = path.join(SOURCE, 'agent-helpers.js');
const INDEX = path.join(SOURCE, 'sounds', 'voices', 'voices.json');
const CONFIG = 'RESPONSE_LANGUAGE=hebrew\r\nTERMINAL_COLOR=kivun\r\nCLAUDE_FLAGS=\r\nSTARTUP_CMD=\r\nAUTO_CONTINUE=false\r\n';

// opts.sound = config.json object; opts.index: undefined = the real voices.json, null = none.
function sandbox(name, opts) {
  const root = path.join(ROOT, 'pkv', name);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const d = { root, kivun: path.join(root, 'LAD', 'Kivun'), user: path.join(root, 'User') };
  d.sounds = path.join(d.user, '.claude', 'sounds');
  for (const p of [d.kivun, path.join(d.sounds, 'voices'), path.join(d.user, '.local', 'bin')]) fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), CONFIG);
  fs.writeFileSync(path.join(d.kivun, 'claudecode-launchpad.bat'), '@rem stand-in\r\n');
  fs.writeFileSync(path.join(d.user, '.local', 'bin', 'claude.exe'), '');
  fs.writeFileSync(path.join(d.sounds, 'config.json'), JSON.stringify(opts.sound, null, 2));
  if (opts.index === undefined) fs.copyFileSync(INDEX, path.join(d.sounds, 'voices', 'voices.json'));
  for (const f of opts.files || []) {
    fs.mkdirSync(path.dirname(path.join(d.sounds, f)), { recursive: true });
    fs.writeFileSync(path.join(d.sounds, f), 'RIFF');
  }
  d.env = { USERPROFILE: d.user, LOCALAPPDATA: path.join(root, 'LAD'), PATH: 'C:\\Windows\\System32' };
  return d;
}
function open(d) { const p = openPicker({ hta: HTA, helpers: HELPERS, kivunDir: d.kivun, env: d.env }); p.ctx.init(); return p; }
const soundCfg = d => JSON.parse(fs.readFileSync(path.join(d.sounds, 'config.json'), 'utf8'));
// The chips as [{label, active}] in order.
function chips(p) {
  const html = p.el('snd-voice-chips').innerHTML;
  return [...html.matchAll(/<button\b[^>]*class="voice-chip( active)?"[^>]*>([^<]*)<\/button>/g)].map(m => ({ label: m[2], active: !!m[1] }));
}
const checked = (p, name) => (p.radios(name).find(r => r.checked) || {}).value;

test('UT_PickerVoice_DefaultIsAdam: no pick shows Male with Adam selected, and writes nothing', () => {
  const d = sandbox('default', { sound: { enabled: true, mode: 'regular' } });
  const before = fs.readFileSync(path.join(d.sounds, 'config.json'), 'utf8');
  const p = open(d);
  assert.strictEqual(checked(p, 'snd-gender'), 'male');
  const c = chips(p);
  assert.deepStrictEqual(c.map(x => x.label), ['Adam', 'Will', 'Eric', 'Chris', 'Jon', 'Vincent', 'Hale', 'Original']);
  assert.deepStrictEqual(c.filter(x => x.active).map(x => x.label), ['Adam']);
  assert.strictEqual(fs.readFileSync(path.join(d.sounds, 'config.json'), 'utf8'), before);
});

test('UT_PickerVoice_FemaleSelectsBella: clicking Female saves Bella and lists the women', () => {
  const d = sandbox('female', { sound: { enabled: true, mode: 'regular' } });
  const p = open(d);
  p.setRadio('snd-gender', 'female');
  p.ctx.onSoundGenderChange();
  assert.strictEqual(soundCfg(d).voice, 'bella');
  const c = chips(p);
  assert.deepStrictEqual(c.map(x => x.label), ['Bella', 'Laura', 'Jessica']);
  assert.deepStrictEqual(c.filter(x => x.active).map(x => x.label), ['Bella']);
});

test('UT_PickerVoice_ChipSaves: a voice chip saves that voice and keeps the other keys', () => {
  const d = sandbox('chip', { sound: { enabled: true, mode: 'funny', x: 1 } });
  const p = open(d);
  p.ctx.onSoundVoiceChip(2);
  const cfg = soundCfg(d);
  assert.strictEqual(cfg.voice, 'eric');
  assert.strictEqual(cfg.x, 1);
  assert.strictEqual(cfg.mode, 'funny');
  assert.deepStrictEqual(chips(p).filter(x => x.active).map(x => x.label), ['Eric']);
});

test('UT_PickerVoice_OtherSwitchesDontPin: Sounds On/Off and the pack never write a voice', () => {
  const d = sandbox('nopin', { sound: { enabled: true, mode: 'regular' } });
  const p = open(d);
  p.setRadio('snd-enabled', 'off');
  p.ctx.onSoundEnabledChange();
  p.setRadio('snd-mode', 'funny');
  p.ctx.onSoundModeChange();
  const cfg = soundCfg(d);
  assert.strictEqual(cfg.enabled, false);
  assert.strictEqual(cfg.mode, 'funny');
  assert.ok(!('voice' in cfg), 'voice must stay unset');
});

test('UT_PickerVoice_UnknownShowsDefault: a voice that does not ship shows Adam selected', () => {
  const d = sandbox('unknown', { sound: { enabled: true, voice: 'zed' } });
  const p = open(d);
  assert.strictEqual(checked(p, 'snd-gender'), 'male');
  assert.deepStrictEqual(chips(p).filter(x => x.active).map(x => x.label), ['Adam']);
});

test('UT_PickerVoice_NoIndex: without voices.json only the Original voice is offered', () => {
  const d = sandbox('noindex', { sound: { enabled: true }, index: null });
  const p = open(d);
  assert.deepStrictEqual(chips(p), [{ label: 'Original', active: true }]);
});

test('UT_PickerVoice_PreviewPlaysSelected: Preview plays the chosen voice and pack, hidden', () => {
  const d = sandbox('preview', { sound: { enabled: true, mode: 'funny', voice: 'bella' },
    files: ['voices/bella/funny/permission.wav', 'funny/permission.wav', 'regular/permission.wav'] });
  const p = open(d);
  p.ctx.previewVoice();
  const run = p.runs[p.runs.length - 1];
  assert.strictEqual(run.style, 0);
  assert.ok(run.cmd.includes('play.vbs'), run.cmd);
  assert.ok(run.cmd.includes('voices\\bella\\funny\\permission.wav'), run.cmd);
});

test('UT_PickerVoice_SameGenderKeepsPick: clicking the gender already shown keeps the picked voice', () => {
  const d = sandbox('samegender', { sound: { enabled: true, voice: 'eric' } });
  const p = open(d);
  p.setRadio('snd-gender', 'male');
  p.ctx.onSoundGenderChange();
  assert.strictEqual(soundCfg(d).voice, 'eric');
  assert.deepStrictEqual(chips(p).filter(x => x.active).map(x => x.label), ['Eric']);
});
