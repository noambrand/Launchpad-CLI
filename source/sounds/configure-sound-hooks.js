// configure-sound-hooks.js
// Installs the Claude Code voice-alert system for the current user:
//   1. Deploys the bundled sounds toolkit (including the regular/ and funny/ clip
//      sets) to ~/.claude/sounds — user-writable, so the on/off + mode switches and
//      the nag lock-file can be written at runtime. An existing config.json is
//      preserved across upgrades so the user's choices survive.
//   2. Merges the hooks into ~/.claude/settings.json, idempotently — re-running
//      replaces only OUR hooks and leaves every other setting untouched:
//        PermissionRequest -> permission (the numbered confirm; interactive only)
//        Notification(idle) -> waiting + arm the (off-by-default) repeat reminder
//        UserPromptSubmit / PostToolUse -> disarm the reminder
//      'done' and 'save' are intentionally NOT bound to any event — they are on-demand
//      (the assistant plays them). 'Stop' fires at the end of every turn, not at true
//      task completion, so binding 'done' there made it announce on every turn.
//
// Usage: node configure-sound-hooks.js
//   Run it from the bundled copy; it deploys into ~/.claude/sounds and wires the
//   hooks to point there. Safe on every install/upgrade. Never needs admin.

const fs = require('fs');
const path = require('path');

const home = process.env.HOME || process.env.USERPROFILE;
const claudeDir = path.join(home, '.claude');
const destDir = path.join(claudeDir, 'sounds');
const settingsFile = path.join(claudeDir, 'settings.json');
const srcDir = __dirname;

try { fs.mkdirSync(destDir, { recursive: true }); } catch (e) {}

// --- 1. Deploy bundle -> ~/.claude/sounds (recursive: top files + regular/ funny/) --
function copyInto(src, dst) {
  try { fs.mkdirSync(dst, { recursive: true }); } catch (e) {}
  for (const name of fs.readdirSync(src)) {
    if (name === '.nag.lock') continue;
    const sp = path.join(src, name);
    const dp = path.join(dst, name);
    let st;
    try { st = fs.statSync(sp); } catch (e) { continue; }
    if (st.isDirectory()) {
      copyInto(sp, dp);
    } else if (st.isFile()) {
      // Preserve the user's saved settings across upgrades.
      if (name === 'config.json' && fs.existsSync(dp)) continue;
      try { fs.copyFileSync(sp, dp); } catch (e) {}
    }
  }
}
if (path.resolve(srcDir) !== path.resolve(destDir)) copyInto(srcDir, destDir);

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
['Stop', 'PermissionRequest', 'Notification', 'UserPromptSubmit', 'PostToolUse'].forEach(
  (ev) => {
    settings.hooks[ev] = (settings.hooks[ev] || []).filter((g) => !isOurs(g));
  }
);

// NOTE: 'done' and 'save' are on-demand only — the assistant runs `node play.js done` /
// `node play.js save` when it has genuinely finished or needs you to act by hand. They are
// deliberately NOT wired to a hook: 'Stop' fires at the end of EVERY turn, not at true task
// completion, so binding 'done' there made it announce constantly. 'Stop' is still purged
// above, so upgrading from an older build that wired it removes that stale hook.
// permission — the numbered confirm; fires only on a real interactive prompt
settings.hooks.PermissionRequest.push({ hooks: [node('play.js', 'permission')] });
// waiting — ~60s idle / you stepped away; also arms the (off-by-default) repeat reminder.
// matcher "idle_prompt" keeps this off the permission notification (that's PermissionRequest).
settings.hooks.Notification.push({
  matcher: 'idle_prompt',
  hooks: [node('play.js', 'waiting'), node('reminder.js', 'arm')],
});
// stop the nag the moment the user responds...
settings.hooks.UserPromptSubmit.push({ hooks: [node('reminder.js', 'disarm')] });
// ...or as soon as Claude runs another tool
settings.hooks.PostToolUse.push({ matcher: '', hooks: [node('reminder.js', 'disarm')] });

// Drop any event we emptied (e.g. Stop, now that 'done' is on-demand) so we never leave a
// bare "Stop": [] behind. Events we still use keep their freshly-pushed groups; any other
// hooks the user had on these events were preserved by the "ours"-only filter above.
['Stop', 'PermissionRequest', 'Notification', 'UserPromptSubmit', 'PostToolUse'].forEach(
  (ev) => {
    if (Array.isArray(settings.hooks[ev]) && settings.hooks[ev].length === 0)
      delete settings.hooks[ev];
  }
);

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
console.log('Voice alerts installed -> ' + destDir);
