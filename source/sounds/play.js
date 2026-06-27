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

// --- Trigger log -----------------------------------------------------------------
// Append one line per fire to alerts.log so you can see WHEN/WHY a sound played,
// WHICH project/session triggered it, and WHICH .wav ran — the debug trail for a
// phantom alert. Never throws (logging can never break a hook); self-trims to 2000.
const LOG = path.join(DIR, 'alerts.log');
const LOG_MAX_LINES = 2000;

function hookContext() {
  // Claude Code pipes a JSON payload to stdin for hook-driven calls. Read it only when
  // stdin is piped (never on a console / double-click), so we never block on a tty.
  try {
    if (process.stdin.isTTY) return {};
    const data = fs.readFileSync(0, 'utf8');
    return data && data.trim() ? JSON.parse(data) : {};
  } catch (_) {
    return {};
  }
}

function whyDetail(ctx) {
  // PermissionRequest carries tool_name + tool_input; Notification carries message.
  const bits = [];
  if (ctx.tool_name) {
    const ti = ctx.tool_input && typeof ctx.tool_input === 'object' ? ctx.tool_input : {};
    const arg = ti.command || ti.file_path || ti.path || '';
    bits.push('tool=' + ctx.tool_name + (arg ? ': ' + String(arg).slice(0, 60) : ''));
  }
  if (ctx.message) bits.push('msg=' + ctx.message);
  return bits.length ? bits.join(' ; ') : '-';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  );
}

function trimLog() {
  try {
    const parts = fs.readFileSync(LOG, 'utf8').split('\n');
    if (parts.length - 1 > LOG_MAX_LINES) {
      fs.writeFileSync(LOG, parts.slice(parts.length - 1 - LOG_MAX_LINES).join('\n'));
    }
  } catch (_) {
    /* ignore */
  }
}

// played = the .wav path that ran, or a reason string like "(sound OFF ...)".
function logEvent(name, played) {
  try {
    const ctx = hookContext();
    const event = ctx.hook_event_name || 'on-demand';
    // notification_type carries 'idle_prompt'/'permission_prompt'; permission_mode on PermissionRequest.
    const ntype = ctx.notification_type || ctx.permission_mode || '-';
    const projPath = ctx.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const session = String(ctx.session_id || '-').slice(0, 8);
    const wav = path.isAbsolute(String(played)) ? path.relative(DIR, played) : played;
    const line =
      stamp() + ' | alert=' + name + ' | event=' + event + ' | type=' + ntype +
      ' | wav=' + wav + ' | why=' + whyDetail(ctx) + ' | project=' + path.basename(projPath) +
      ' | session=' + session + ' | path=' + projPath + '\n';
    fs.appendFileSync(LOG, line);
    trimLog();
  } catch (_) {
    /* logging must never break a hook */
  }
}

function main() {
  if (process.argv.length < 3) return;
  const name = process.argv[2];
  const wav = resolve(name);
  if (!wav) return logEvent(name, '(no matching clip)');
  if (!enabled()) return logEvent(name, '(sound OFF - not played: ' + path.basename(wav) + ')');
  logEvent(name, wav);
  play(wav);
}

// Run only when invoked directly (node play.js <name>). When reminder.js / voice.js
// require() this module, main() must NOT fire — that would read stdin and log spuriously.
if (require.main === module) {
  try {
    main();
  } catch (_) {
    /* never throw */
  }
}
// `clip` kept as an alias of resolve for callers (reminder.js).
module.exports = { play, resolve, clip: resolve, mode, enabled };
