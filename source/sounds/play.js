#!/usr/bin/env node
// play.js <name> - play a Claude Code alert clip (done | permission | waiting | save).
// Cross-platform, dependency-free, and never-fail: any error just stays silent and
// exits 0, so a Claude Code hook can never break or slow a session.
//
//   Windows : cscript play.vbs  (Windows Media Player COM, no PowerShell)
//   macOS   : afplay
//   Linux   : paplay || aplay   (best effort; see README - WSL audio is a stub)
//
// Two clip sets live in regular/<name>.wav and funny/<name>.wav. config.json "mode"
// ("regular" | "funny") picks the set; resolution falls back funny -> regular -> flat
// so a missing funny clip never goes silent unexpectedly.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;

function cfg() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
  } catch (_) {
    return {};
  }
}

function enabled() {
  // Default ON. Only an explicit "enabled": false silences sounds.
  return cfg().enabled !== false;
}

function mode() {
  const m = String(cfg().mode || 'regular').toLowerCase();
  return m === 'funny' || m === 'regular' ? m : 'regular';
}

// Return the path of <name>.wav for the active mode (funny -> regular -> flat), or null.
function resolve(name) {
  const safe = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!safe) return null;
  for (const cand of [path.join(mode(), safe), path.join('regular', safe), safe]) {
    const p = path.join(DIR, cand + '.wav');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function play(wav) {
  try {
    let cmd, args;
    if (process.platform === 'win32') {
      cmd = 'cscript';
      args = ['//nologo', path.join(DIR, 'play.vbs'), wav];
    } else if (process.platform === 'darwin') {
      cmd = 'afplay';
      args = [wav];
    } else {
      // Linux / WSL: best effort. Try paplay, fall back to aplay.
      cmd = 'sh';
      args = ['-c', `paplay "${wav}" 2>/dev/null || aplay "${wav}" 2>/dev/null || true`];
    }
    const child = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {}); // missing player -> stay silent
  } catch (_) {
    /* never throw */
  }
}

function main() {
  if (process.argv.length < 3 || !enabled()) return;
  const wav = resolve(process.argv[2]);
  if (wav) play(wav);
}

try {
  main();
} catch (_) {
  /* never throw */
}
// `clip` kept as an alias of resolve for callers (reminder.js).
module.exports = { play, resolve, clip: resolve, mode, enabled };
