#!/usr/bin/env node
// reminder.js - the repeating "you're needed" nag for Claude Code.
//
//   node reminder.js arm      -> start nagging (replays permission.wav every N min)
//   node reminder.js disarm   -> stop nagging
//   node reminder.js wait T   -> internal: the detached waiter loop (token T)
//
// `arm` writes a fresh token to .nag.lock and spawns a DETACHED background Node
// process that sleeps one interval, plays the permission clip, and repeats. `disarm`
// deletes the lock so the waiter exits at its next check. Re-arming overwrites the
// token, so any older waiter sees a mismatch and quietly dies (only one nag lives).
//
// Interval: config.json "repeat_minutes" (default 2). Env REMIND_INTERVAL=<sec>
// overrides for testing. A hard cap of MAX_REPEATS bounds the worst case so a
// missed disarm can never nag forever. Never throws; always exits 0.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;
const LOCK = path.join(DIR, '.nag.lock');
const MAX_REPEATS = 15;

function cfg() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
  } catch (_) {
    return {};
  }
}
function enabled() {
  return cfg().enabled !== false;
}
// The repeat reminder is OFF by default — only an explicit "repeat_enabled": true
// (or `voice.js repeat on`) arms it, so users are never nagged unless they opt in.
function repeatEnabled() {
  return cfg().repeat_enabled === true;
}
function intervalMs() {
  const env = process.env.REMIND_INTERVAL;
  if (env && !isNaN(parseFloat(env))) return Math.max(1, parseFloat(env)) * 1000;
  const m = parseFloat(cfg().repeat_minutes);
  return Math.max(5, isNaN(m) ? 120 : m * 60) * 1000;
}
function readToken() {
  try {
    return fs.readFileSync(LOCK, 'utf8').trim();
  } catch (_) {
    return null;
  }
}
function newToken() {
  return `${Date.now()}-${process.pid}`;
}

function arm() {
  if (!enabled() || !repeatEnabled()) return;
  const token = newToken();
  try {
    fs.writeFileSync(LOCK, token);
  } catch (_) {
    return;
  }
  try {
    const child = spawn(process.execPath, [__filename, 'wait', token], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (_) {
    /* ignore */
  }
}

function disarm() {
  try {
    if (fs.existsSync(LOCK)) fs.unlinkSync(LOCK);
  } catch (_) {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wait(token) {
  let player;
  try {
    player = require('./play.js');
  } catch (_) {
    player = null;
  }
  for (let i = 0; i < MAX_REPEATS; i++) {
    await sleep(intervalMs());
    if (!enabled()) break;
    if (readToken() !== token) break; // disarmed, or a newer nag took over
    try {
      const wav = player && player.clip('permission');
      if (wav) player.play(wav);
    } catch (_) {
      /* ignore */
    }
  }
}

function main() {
  const cmd = (process.argv[2] || '').toLowerCase();
  if (cmd === 'arm') arm();
  else if (cmd === 'disarm') disarm();
  else if (cmd === 'wait' && process.argv[3]) return wait(process.argv[3]);
}

Promise.resolve()
  .then(main)
  .catch(() => {});
module.exports = { arm, disarm };
