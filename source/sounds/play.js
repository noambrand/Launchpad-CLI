#!/usr/bin/env node
// play.js <name> - play a Claude Code alert clip (<name>.wav from this folder).
// Cross-platform, dependency-free, and never-fail: any error just stays silent
// and exits 0, so a Claude Code hook can never break or slow a session.
//
//   Windows : cscript play.vbs  (Windows Media Player COM, no PowerShell)
//   macOS   : afplay
//   Linux   : paplay || aplay   (best effort; see README - WSL audio is a stub)
//
// The on/off switch and settings live in config.json next to this file.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIR = __dirname;

function enabled() {
  // Default ON. Only an explicit "enabled": false silences sounds.
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
    return c.enabled !== false;
  } catch (_) {
    return true;
  }
}

function clip(name) {
  const safe = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!safe) return null;
  const p = path.join(DIR, safe + '.wav');
  return fs.existsSync(p) ? p : null;
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
  const wav = clip(process.argv[2]);
  if (wav) play(wav);
}

try {
  main();
} catch (_) {
  /* never throw */
}
module.exports = { play, clip, enabled };
