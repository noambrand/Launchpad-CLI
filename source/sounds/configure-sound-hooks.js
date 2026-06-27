// configure-sound-hooks.js
// Installs the Claude Code voice-alert system for the current user:
//   1. Deploys the bundled sounds toolkit to ~/.claude/sounds (user-writable, so the
//      on/off toggle and the nag lock-file can be written at runtime). An existing
//      config.json is preserved across upgrades so the user's on/off choice survives.
//   2. Merges the Stop / Notification / UserPromptSubmit / PostToolUse hooks into
//      ~/.claude/settings.json, idempotently — re-running replaces only OUR hooks and
//      leaves every other setting (statusLine, other hooks, ...) untouched.
//
// Usage: node configure-sound-hooks.js
//   Run it from the bundled copy (e.g. $INSTDIR\sounds or $KT_SHARE/sounds); it copies
//   itself and its siblings into ~/.claude/sounds and wires the hooks to point there.
//   Safe to run on every install/upgrade. Never needs admin: it only writes under
//   the user's home.

const fs = require('fs');
const path = require('path');

const home = process.env.HOME || process.env.USERPROFILE;
const claudeDir = path.join(home, '.claude');
const destDir = path.join(claudeDir, 'sounds');
const settingsFile = path.join(claudeDir, 'settings.json');
const srcDir = __dirname;

try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) {}

// --- 1. Deploy bundle -> ~/.claude/sounds (flat folder, no subdirectories) -------
if (path.resolve(srcDir) !== path.resolve(destDir)) {
  for (const name of fs.readdirSync(srcDir)) {
    // Preserve the user's saved on/off + interval choice across upgrades.
    if (name === 'config.json' && fs.existsSync(path.join(destDir, name))) continue;
    if (name === '.nag.lock') continue;
    try {
      const s = fs.statSync(path.join(srcDir, name));
      if (s.isFile()) fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    } catch (e) {}
  }
}

// --- 2. Merge hooks into ~/.claude/settings.json (idempotent) ---------------------
const soundsDir = destDir.replace(/\\/g, '/'); // forward slashes work in every shell

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) {}

const node = (script, arg) => ({
  type: 'command',
  command: 'node "' + soundsDir + '/' + script + '" ' + arg,
  timeout: 10,
  async: true,
});

// A group is "ours" if any of its commands invokes our play.js / reminder.js.
const isOurs = (group) =>
  Array.isArray(group.hooks) &&
  group.hooks.some(
    (h) => typeof h.command === 'string' && /\/(play|reminder)\.js"/.test(h.command)
  );

settings.hooks = settings.hooks || {};
['Stop', 'Notification', 'UserPromptSubmit', 'PostToolUse'].forEach((ev) => {
  settings.hooks[ev] = (settings.hooks[ev] || []).filter((g) => !isOurs(g));
});

// done when Claude finishes a turn
settings.hooks.Stop.push({ hooks: [node('play.js', 'done')] });
// stuck + start the repeating nag when Claude is waiting for the user
settings.hooks.Notification.push({
  hooks: [node('play.js', 'stuck'), node('reminder.js', 'arm')],
});
// stop the nag the moment the user responds...
settings.hooks.UserPromptSubmit.push({ hooks: [node('reminder.js', 'disarm')] });
// ...or as soon as Claude runs another tool (e.g. after an approval)
settings.hooks.PostToolUse.push({ matcher: '', hooks: [node('reminder.js', 'disarm')] });

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
console.log('Voice alerts installed -> ' + destDir);
