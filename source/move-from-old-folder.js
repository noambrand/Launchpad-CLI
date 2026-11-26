// move-from-old-folder.js (v3.8.0)
// Launchpad's Windows folder moved from %LOCALAPPDATA%\Kivun to %LOCALAPPDATA%\LaunchpadAI (Noam,
// 2026-11-26). The installer copies the user's data across and rewrites everything it writes itself
// (shortcuts, right-click menus, the status line, the terminal profile, the add-on catalog). This script
// repoints the few files outside the folder that hold the old path and that the install doesn't rewrite:
//   - %USERPROFILE%\.copilot\hooks\launchpad-sounds.json  (Copilot's sound alerts)
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

function files(env) {
  const wt = path.join(env.LOCALAPPDATA || '', 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState');
  return [
    path.join(env.USERPROFILE || '', '.copilot', 'hooks', 'launchpad-sounds.json'),
    path.join(wt, 'settings.json'),
    path.join(wt, 'state.json'),
  ];
}

function main(argv, env) {
  const [oldDir, newDir] = argv;
  if (!oldDir || !newDir) { console.log('Usage: node move-from-old-folder.js <old folder> <new folder>'); return 0; }
  for (const f of files(env)) {
    try {
      if (!fs.existsSync(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      const next = rewrite(text, path.resolve(oldDir), path.resolve(newDir));
      if (next === text) continue;
      fs.writeFileSync(f, next, 'utf8');
      console.log('Pointed ' + f + ' at ' + newDir);
    } catch (e) {
      console.log('Could not update ' + f + ': ' + (e && e.message));
    }
  }
  return 0;
}

module.exports = { rewrite };

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env);
