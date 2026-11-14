#!/usr/bin/env node
// play.js <name> - play a Claude Code alert clip (done | error | permission | waiting | save).
// Cross-platform, dependency-free, and never-fail: any error just stays silent and
// exits 0, so a Claude Code hook can never break or slow a session.
//
//   Windows : cscript play.vbs  (Windows Media Player COM, no PowerShell)
//   macOS   : afplay
//   Linux   : paplay || aplay   (best effort; see README - WSL audio is a stub)
//
// Voices: the first Launchpad voice ("original") lives in regular/<name>.wav and
// funny/<name>.wav; every other voice in voices/<id>/regular|funny/<name>.wav, listed by
// voices/voices.json. config.json "voice" picks the voice (no "voice" = the index's
// default, Adam) and "mode" ("regular" | "funny") the pack. Resolution falls back
// voice -> original same pack -> original regular -> flat, so an alert never goes silent.
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

// The parsed voices/voices.json, or null when it is missing or broken.
function loadIndex() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'voices', 'voices.json'), 'utf8'));
    return idx && typeof idx === 'object' && Array.isArray(idx.voices) ? idx : null;
  } catch (_) {
    return null;
  }
}

function voiceDir(id) {
  try {
    return fs.statSync(path.join(DIR, 'voices', id)).isDirectory();
  } catch (_) {
    return false;
  }
}

const cleanId = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');

// The voice for "no pick": the index's default, else Adam, else the original clips.
function defaultVoice() {
  const idx = loadIndex();
  const d = cleanId(idx && idx.default);
  if (d && (d === 'original' || voiceDir(d))) return d;
  return voiceDir('adam') ? 'adam' : 'original';
}

// The voice that plays: config.json "voice" when it ships here, otherwise the default.
// With an index, the voice must also be listed in it: an update copies folders in but
// never deletes, so a dropped voice's folder can linger, and the picker (which reads only
// the index) would then show the default while the dropped voice played.
function voice() {
  const v = cleanId(cfg().voice);
  if (v === 'original') return v;
  const idx = loadIndex();
  const listed = !idx || idx.voices.some((x) => x && x.id === v);
  if (v && listed && voiceDir(v)) return v;
  return defaultVoice();
}

// Return the path of <name>.wav for the active voice and mode, or null.
function resolve(name) {
  const safe = String(name || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!safe) return null;
  const v = voice();
  const cands = v === 'original' ? [] : [path.join('voices', v, mode(), safe)];
  for (const cand of cands.concat([path.join(mode(), safe), path.join('regular', safe), safe])) {
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
function logEvent(name, played, ctx) {
  try {
    if (!ctx) ctx = hookContext();
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
  let name = process.argv[2];
  // Read the hook payload ONCE (stdin can only be read once) and reuse it for
  // both reclassification and logging.
  const ctx = hookContext();
  // A 'permission' hook that is really an AskUserQuestion or ExitPlanMode prompt
  // is not a true allow-this-tool request — play the gentler 'waiting' clip so
  // "permission required" only ever means a real tool permission.
  if (name === 'permission' &&
      (ctx.tool_name === 'AskUserQuestion' || ctx.tool_name === 'ExitPlanMode')) {
    name = 'waiting';
  }
  const wav = resolve(name);
  if (!wav) return logEvent(name, '(no matching clip)', ctx);
  if (!enabled()) return logEvent(name, '(sound OFF - not played: ' + path.basename(wav) + ')', ctx);
  logEvent(name, wav, ctx);
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
module.exports = { play, resolve, clip: resolve, mode, enabled, voice, defaultVoice, loadIndex };
