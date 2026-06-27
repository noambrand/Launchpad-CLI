#!/usr/bin/env node
// voice.js - turn the Claude Code voice alerts on/off and tune them.
//
//   node voice.js on            -> enable all alerts
//   node voice.js off           -> silence all alerts (and stop any nag)
//   node voice.js status        -> print current settings
//   node voice.js every <min>   -> set the nag repeat interval, in minutes
//   node voice.js test [name]   -> play a clip now (default: done)
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
function status() {
  const d = load();
  console.log('Voice alerts: ' + (d.enabled === false ? 'OFF' : 'ON'));
  console.log('Nag repeat:   every ' + (d.repeat_minutes || 2) + ' minute(s)');
  console.log('Folder:       ' + DIR);
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
  } else if (cmd === 'every' && process.argv[3]) {
    const n = parseInt(process.argv[3], 10);
    if (!isNaN(n) && n > 0) {
      d.repeat_minutes = n;
      save(d);
      console.log('Nag now repeats every ' + n + ' minute(s).');
    } else {
      console.log('Give a number of minutes, e.g.  node voice.js every 3');
    }
  } else if (cmd === 'test') {
    const name = process.argv[3] || 'done';
    try {
      const player = require('./play.js');
      const wav = player.clip(name);
      if (wav) {
        player.play(wav);
        console.log('Played ' + name + '.wav');
      } else {
        console.log('No clip named ' + name + '.wav');
      }
    } catch (_) {
      console.log('Could not play ' + name + '.wav');
    }
  } else {
    status();
  }
}

main();
