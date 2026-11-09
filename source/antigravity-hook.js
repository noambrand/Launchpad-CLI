// antigravity-hook.js <session-start|stop>
// Antigravity's hooks call this (through hook.cmd) with a JSON payload on stdin. It always prints
// exactly one JSON object, because Antigravity reads stdout as the hook's answer, and it never
// fails, so a problem here can't disturb a session (Antigravity Step 0, A6, A7).
//
//   session-start  adds the language line Launchpad chose (KIVUN_ANTIGRAVITY_LANGUAGE_LINE) to the
//                  session as a system message; prints {} when there is none.
//   stop           prints {}. Plays the done sound only for Launchpad's own launches
//                  (KIVUN_ANTIGRAVITY=1) and only when the turn ended by itself
//                  (terminationReason NO_TOOL_CALL), not on a cancel, error or tool limit.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function languageLine(env) {
  const line = env.KIVUN_ANTIGRAVITY_LANGUAGE_LINE;
  return typeof line === 'string' && line !== '';
}

function wantsDone(env, payload) {
  return env.KIVUN_ANTIGRAVITY === '1' && !!payload && typeof payload === 'object' && payload.terminationReason === 'NO_TOOL_CALL';
}

// The one JSON object to print for an event.
function answer(event, env) {
  if (event === 'session-start' && languageLine(env)) {
    return { injectSteps: [{ systemMessage: { systemMessage: env.KIVUN_ANTIGRAVITY_LANGUAGE_LINE } }] };
  }
  return {};
}

function playDone(env, payload) {
  const home = env.HOME || env.USERPROFILE;
  const player = env.KIVUN_SOUND_PLAYER || path.join(home, '.claude', 'sounds', 'play.js');
  if (!fs.existsSync(player)) return;
  let cwd;
  try {
    const w = Array.isArray(payload.workspacePaths) ? payload.workspacePaths[0] : undefined;
    if (typeof w === 'string' && fs.statSync(w).isDirectory()) cwd = w;
  } catch (e) { /* no usable folder */ }
  // No pipes: a pipe would keep this hook alive, and the turn waiting, until the clip ends.
  const child = cp.spawn(process.execPath, [player, 'done'], { detached: true, windowsHide: true, stdio: 'ignore', cwd });
  child.on('error', () => {});
  child.unref();
}

function main(argv, env) {
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { /* no usable payload */ }
  const event = argv[0];
  try {
    if (event === 'stop' && wantsDone(env, payload)) playDone(env, payload);
  } catch (e) { /* never fail */ }
  return answer(event, env);
}

if (require.main === module) {
  let out = {};
  try { out = main(process.argv.slice(2), process.env); } catch (e) { /* print {} */ }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = 0;
}
module.exports = { wantsDone, answer, languageLine };
