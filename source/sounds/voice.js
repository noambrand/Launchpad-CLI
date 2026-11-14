#!/usr/bin/env node
// voice.js - turn the Claude Code voice alerts on/off and tune them.
//
//   node voice.js on              -> enable all alerts
//   node voice.js off             -> silence all alerts (and stop any nag)
//   node voice.js mode regular    -> use the plain/professional clips
//   node voice.js mode funny      -> use the joke clips
//   node voice.js voice <name>    -> pick the voice (adam, bella, original, ...)
//   node voice.js voices          -> list the voices
//   node voice.js choose          -> list the voices and ask for a number
//   node voice.js status          -> print current settings
//   node voice.js repeat on|off   -> turn the repeat reminder on/off (OFF by default)
//   node voice.js every <min>     -> set the repeat interval (also turns repeat on)
//   node voice.js test [name]     -> play a clip now (default: done)
//   node voice.js log             -> open the trigger log (alerts.log)
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CFG = path.join(DIR, 'config.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(CFG, 'utf8'));
  } catch (_) {
    return {};
  }
}
function save(d) {
  fs.writeFileSync(CFG, JSON.stringify(d, null, 2) + '\n');
}
// ---- Voices (voices/voices.json; play.js decides which one plays) ----
function player() {
  return require('./play.js');
}
function voiceList() {
  const idx = player().loadIndex();
  const list = idx ? idx.voices.filter((v) => v && typeof v.id === 'string') : [];
  return list.length ? list : [{ id: 'original', label: 'Original', gender: 'male' }];
}
function voiceLabel(id) {
  const v = voiceList().find((x) => x.id === id);
  return v ? v.label || v.id : id;
}
function printVoices() {
  const idx = player().loadIndex() || {};
  const cur = player().voice();
  voiceList().forEach((v, i) => {
    const isDefault = v.id === idx.default || v.id === idx.default_female;
    console.log('  ' + (i + 1) + '. ' + (v.label || v.id) + ' (' + v.gender + (isDefault ? ', default' : '') + ')' +
      (v.id === cur ? '  <- current' : ''));
  });
}
// Find a voice by id/label (any case) or, when allowed, by its number in the list.
function findVoice(answer, byNumber) {
  const a = String(answer || '').trim().toLowerCase();
  if (!a) return null;
  const list = voiceList();
  if (byNumber && /^\d+$/.test(a)) return list[parseInt(a, 10) - 1] || null;
  return list.find((v) => v.id === a || String(v.label || '').toLowerCase() === a) || null;
}
function setVoice(d, v) {
  d.voice = v.id;
  save(d);
  console.log('Voice set to ' + (v.label || v.id) + '.');
}
function choose(d) {
  printVoices();
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  let answered = false;
  rl.question('Type a number and press Enter (just Enter keeps the current voice): ', (answer) => {
    answered = true;
    rl.close();
    const v = findVoice(answer, true);
    if (v) setVoice(d, v);
    else console.log('No change.');
  });
  rl.on('close', () => {
    if (!answered) console.log('\nNo change.');
  });
}

function status() {
  const d = load();
  const v = player().voice();
  const picked = String(d.voice || '').toLowerCase() === v;
  console.log('Voice alerts:    ' + (d.enabled === false ? 'OFF' : 'ON'));
  console.log('Voice:           ' + voiceLabel(v) + (picked ? '' : ' (default)'));
  console.log('Mode:            ' + String(d.mode || 'regular').toUpperCase());
  console.log('Repeat reminder: ' + (d.repeat_enabled === true ? 'ON (every ' + (d.repeat_minutes || 2) + ' min)' : 'OFF'));
  console.log('Folder:          ' + DIR);
}

function main() {
  const cmd = (process.argv[2] || 'status').toLowerCase();
  const d = load();
  if (cmd === 'on') {
    d.enabled = true;
    save(d);
    console.log('Voice alerts ON.');
  } else if (cmd === 'off') {
    d.enabled = false;
    save(d);
    try {
      require('./reminder.js').disarm();
    } catch (_) {}
    console.log('Voice alerts OFF.');
  } else if (cmd === 'mode') {
    const m = (process.argv[3] || '').toLowerCase();
    if (m === 'regular' || m === 'funny') {
      d.mode = m;
      save(d);
      console.log('Mode set to ' + m.toUpperCase() + '.');
    } else {
      console.log('Usage: node voice.js mode regular|funny');
    }
  } else if (cmd === 'voice') {
    const v = findVoice(process.argv[3], false);
    if (v) {
      setVoice(d, v);
    } else {
      console.log('Usage: node voice.js voice <name>   (one of these:)');
      printVoices();
    }
  } else if (cmd === 'voices') {
    printVoices();
  } else if (cmd === 'choose') {
    choose(d);
  } else if (cmd === 'repeat') {
    const v = (process.argv[3] || '').toLowerCase();
    if (v === 'on') {
      d.repeat_enabled = true;
      save(d);
      console.log('Repeat reminder ON (every ' + (d.repeat_minutes || 2) + ' min).');
    } else if (v === 'off') {
      d.repeat_enabled = false;
      save(d);
      try {
        require('./reminder.js').disarm();
      } catch (_) {}
      console.log('Repeat reminder OFF.');
    } else {
      console.log('Usage: node voice.js repeat on|off');
    }
  } else if (cmd === 'every' && process.argv[3]) {
    const n = parseInt(process.argv[3], 10);
    if (!isNaN(n) && n > 0) {
      d.repeat_minutes = n;
      d.repeat_enabled = true; // setting an interval means you want the reminder on
      save(d);
      console.log('Repeat reminder ON, every ' + n + ' minute(s).');
    } else {
      console.log('Give a number of minutes, e.g.  node voice.js every 3');
    }
  } else if (cmd === 'test') {
    const name = process.argv[3] || 'done';
    try {
      const player = require('./play.js');
      const wav = player.resolve(name);
      if (wav) {
        player.play(wav);
        console.log('Played ' + name + ' (' + player.mode() + ' mode).');
      } else {
        console.log('No clip named ' + name);
      }
    } catch (_) {
      console.log('Could not play ' + name + '.wav');
    }
  } else if (cmd === 'log') {
    const logPath = path.join(DIR, 'alerts.log');
    let size = 0;
    try {
      size = fs.statSync(logPath).size;
    } catch (_) {}
    if (!size) {
      console.log('No alerts logged yet. Trigger a sound, then open this again.');
      console.log('Log file: ' + logPath);
    } else {
      const { spawn } = require('child_process');
      const opener =
        process.platform === 'win32' ? 'notepad' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const showTail = () => {
        try {
          console.log(fs.readFileSync(logPath, 'utf8').split('\n').slice(-40).join('\n'));
        } catch (_) {}
      };
      try {
        const child = spawn(opener, [logPath], { stdio: 'ignore', detached: true, windowsHide: true });
        child.on('error', showTail); // no GUI opener (e.g. headless) -> print the tail
        child.unref();
        console.log('Opening alert log: ' + logPath);
      } catch (_) {
        showTail();
      }
    }
  } else {
    status();
  }
}

main();
