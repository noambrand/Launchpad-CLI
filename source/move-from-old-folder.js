// move-from-old-folder.js (v3.8.0)
// Launchpad's Windows folder moved from %LOCALAPPDATA%\Kivun to %LOCALAPPDATA%\LaunchpadAI (Noam,
// 2026-11-26). The installer copies the user's data across and rewrites everything it writes itself
// (shortcuts, right-click menus, the terminal profile). This script repoints what holds the old path
// and that an install with another AI agent chosen, or the install itself, doesn't rewrite:
//   - %USERPROFILE%\.claude\settings.json                 (Claude's status line)
//   - Claude's add-on catalog, when it was added from the old folder (added again from the new one;
//     measured 2026-11-26: that moves it, and its add-ons follow)
//   - %COPILOT_HOME% or %USERPROFILE%\.copilot \hooks\launchpad-sounds.json  (Copilot's sound alerts)
//   - Windows Terminal's settings.json                    (a profile icon set by Fix WT Icon)
//   - Windows Terminal's state.json                       (saved tabs that start the old launcher)
//
//   node move-from-old-folder.js <old folder> <new folder>
//
// Writes a file only when its text changed. Never fails the install: exit 0 always. Node built-ins only.
'use strict';
const fs = require('fs');
const path = require('path');

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The old folder, written three ways (raw backslashes, JSON's doubled backslashes, forward slashes), is
// replaced by the new folder written the same way. Letter case is ignored, as Windows does. A match must
// end the folder name: Kivun-WSL (Kivun Terminal) and longer names are left alone.
function rewrite(text, oldDir, newDir) {
  const ways = [
    [oldDir.replace(/\\/g, '\\\\'), newDir.replace(/\\/g, '\\\\')],
    [oldDir, newDir],
    [oldDir.replace(/\\/g, '/'), newDir.replace(/\\/g, '/')],
  ];
  let out = text;
  for (const [from, to] of ways) {
    out = out.replace(new RegExp(escapeRe(from) + '(?=[\\\\/"\']|$)', 'gi'), () => to);
  }
  return out;
}

const claudeDir = env => env.CLAUDE_CONFIG_DIR || path.join(env.USERPROFILE || '', '.claude');

function files(env) {
  const wt = path.join(env.LOCALAPPDATA || '', 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState');
  return [
    path.join(claudeDir(env), 'settings.json'),
    path.join(env.COPILOT_HOME || path.join(env.USERPROFILE || '', '.copilot'), 'hooks', 'launchpad-sounds.json'),
    path.join(wt, 'settings.json'),
    path.join(wt, 'state.json'),
  ];
}

// Claude's add-on catalog "launchpad-plugins", when Claude Code recorded it in the old folder: add it
// again from the new one, with the same way of finding Claude as the Codex add-on step.
function moveCatalog(oldDir, newDir, env) {
  let known;
  try { known = JSON.parse(fs.readFileSync(path.join(claudeDir(env), 'plugins', 'known_marketplaces.json'), 'utf8')); } catch (e) { return; }
  const entry = known && known['launchpad-plugins'];
  const where = entry && ((entry.source && entry.source.path) || entry.installLocation);
  if (typeof where !== 'string' || rewrite(where, oldDir, newDir) === where) return;
  const CP = require(path.join(__dirname, 'configure-codex-plugin.js'));
  const c = CP.findClaude(env);
  if (!c) { console.log('Claude Code not found: its add-on catalog still names ' + oldDir); return; }
  const r = CP.runClaude(c, ['plugin', 'marketplace', 'add', path.join(newDir, 'plugins')], env);
  console.log(r.status === 0 ? 'Claude\'s add-on catalog now reads ' + path.join(newDir, 'plugins')
    : 'Could not move Claude\'s add-on catalog (' + r.status + '): ' + String(r.stderr).trim());
}

function main(argv, env) {
  const [oldArg, newArg] = argv;
  if (!oldArg || !newArg) { console.log('Usage: node move-from-old-folder.js <old folder> <new folder>'); return 0; }
  const oldDir = path.resolve(oldArg), newDir = path.resolve(newArg);
  // Saved tabs and hand-set icons can hold the folder unexpanded, as %LOCALAPPDATA%\Kivun.
  const unexpanded = env.LOCALAPPDATA && path.dirname(oldDir).toLowerCase() === path.resolve(env.LOCALAPPDATA).toLowerCase() &&
    path.dirname(newDir).toLowerCase() === path.resolve(env.LOCALAPPDATA).toLowerCase()
    ? ['%LOCALAPPDATA%\\' + path.basename(oldDir), '%LOCALAPPDATA%\\' + path.basename(newDir)] : null;
  for (const f of files(env)) {
    try {
      if (!fs.existsSync(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      let next = rewrite(text, oldDir, newDir);
      if (unexpanded) next = rewrite(next, unexpanded[0], unexpanded[1]);
      if (next === text) continue;
      fs.writeFileSync(f, next, 'utf8');
      console.log('Pointed ' + f + ' at ' + newDir);
    } catch (e) {
      console.log('Could not update ' + f + ': ' + (e && e.message));
    }
  }
  try { moveCatalog(oldDir, newDir, env); } catch (e) { console.log('Could not move Claude\'s add-on catalog: ' + (e && e.message)); }
  return 0;
}

module.exports = { rewrite };

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env);
