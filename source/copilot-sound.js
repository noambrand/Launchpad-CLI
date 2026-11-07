// copilot-sound.js <done|permission>
// Copilot's hooks call this. It decides whether this event should make a sound, then hands over to
// the same player Claude and Codex use, without waiting for the clip to finish. It prints nothing,
// because Copilot reads a hook's output as a decision, and it never fails, so a sound problem can't
// disturb a session (Copilot Step 0, S7).
//
//   done        agentStop: fires once at the end of a turn, and not after an interrupt.
//   permission  notification: this event also covers shell completion and other messages, so only
//               permission_prompt counts. Copilot's permissionRequest event was not usable: it also
//               fires when no prompt is shown.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function wanted(sound, event) {
  if (sound === 'permission') return event.notification_type === 'permission_prompt';
  if (sound === 'done') return !event.stopReason || event.stopReason === 'end_turn';
  return false;
}

function main() {
  const sound = process.argv[2];
  let event = {};
  try { event = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { /* no usable payload */ }
  if (!event || typeof event !== 'object' || !wanted(sound, event)) return;
  const home = process.env.HOME || process.env.USERPROFILE;
  const player = process.env.KIVUN_SOUND_PLAYER || path.join(home, '.claude', 'sounds', 'play.js');
  if (!fs.existsSync(player)) return;
  // No pipes: a pipe to the player would keep this hook alive, and Copilot waiting, until the clip
  // ends. Started in the session's folder, because that is how the player's log names the project.
  const cwd = event.cwd && fs.existsSync(event.cwd) ? event.cwd : undefined;
  const child = cp.spawn(process.execPath, [player, sound], { detached: true, windowsHide: true, stdio: 'ignore', cwd });
  child.on('error', () => {});
  child.unref();
}

if (require.main === module) {
  try { main(); } catch (e) { /* never fail */ }
}
module.exports = { wanted };
