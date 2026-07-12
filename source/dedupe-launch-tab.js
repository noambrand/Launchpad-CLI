// ClaudeCode Launchpad CLI - De-duplicate the tab we are about to open
// ---------------------------------------------------------------------------
// WHY: Windows Terminal's "reopen tabs on startup" (firstWindowPreference =
// persistedWindowLayout) restores the previously-saved Launchpad tab when WT
// cold-starts. The launcher then ALSO opens a fresh tab for the same project,
// so you get TWO tabs with the same project name. Turning restore off globally
// would fix the double tab but kill tab-restore for ALL the user's windows,
// which they want to keep.
//
// This script threads that needle: it removes ONLY the Launchpad tab for the
// project we are launching right now from WT's saved layout (state.json),
// leaving every other saved tab — other projects, other windows, non-Launchpad
// tabs — exactly in place. Run in phase 1 BEFORE the `wt` command, so when WT
// cold-starts it restores everything EXCEPT this project's tab, and the
// launcher's own new-tab supplies it once. Net: full restore, no duplicate.
//
// Safe by design: parses defensively and, on ANY problem (missing file, bad
// JSON, unexpected shape), does nothing and exits 0 — a de-dupe hiccup must
// never block a launch. Writes state.json only when something actually changed.
// Never calls taskkill or launches anything (a prior version of a sibling test
// killed the hosting terminal — we do not touch processes here).
//
// Usage: node dedupe-launch-tab.js "<tabTitle>" "<workingDir>"

const fs = require('fs');
const path = require('path');

const wtTab = process.argv[2] || '';
const workDir = process.argv[3] || '';

function norm(p) {
  // Case-insensitive, backslash-normalized, trailing-slash-insensitive compare
  // (Windows paths). Empty stays empty so it never matches by accident.
  if (!p) return '';
  return String(p).replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
}

// Is this saved tab the Launchpad tab for the project we are opening now?
function isThisProjectsLaunchpadTab(a) {
  if (!a || a.action !== 'newTab') return false;
  const cmd = String(a.commandline || '');
  const isLaunchpad = cmd.toLowerCase().indexOf('claudecode-launchpad.bat') !== -1;
  if (!isLaunchpad) return false; // never touch non-Launchpad tabs
  const sameDir = workDir && norm(a.startingDirectory) === norm(workDir);
  const sameTitle = wtTab && a.tabTitle === wtTab;
  return sameDir || sameTitle; // match the specific project, not all Launchpad tabs
}

function main() {
  const statePath = path.join(
    process.env.LOCALAPPDATA || '',
    'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'state.json'
  );
  if (!fs.existsSync(statePath)) return; // nothing saved yet -> nothing to dedupe

  let raw = fs.readFileSync(statePath, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return; // unparsable -> leave WT's state exactly as-is
  }

  const layouts = state && Array.isArray(state.persistedWindowLayouts)
    ? state.persistedWindowLayouts
    : null;
  if (!layouts || layouts.length === 0) return;

  let changed = false;
  const kept = [];
  for (const layout of layouts) {
    const tabs = layout && Array.isArray(layout.tabLayout) ? layout.tabLayout : null;
    if (!tabs) { kept.push(layout); continue; }

    const filtered = tabs.filter((a) => {
      if (isThisProjectsLaunchpadTab(a)) { changed = true; return false; }
      return true;
    });

    // A window with no newTab actions left can't be restored — drop the whole
    // layout entry (otherwise WT would try to restore an empty/renamed window).
    const hasTab = filtered.some((a) => a && a.action === 'newTab');
    if (!hasTab) { changed = true; continue; }

    if (filtered.length !== tabs.length) layout.tabLayout = filtered;
    kept.push(layout);
  }

  if (!changed) return;

  state.persistedWindowLayouts = kept;
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, '\t'), { encoding: 'utf8' });
    console.log('Pruned this project\'s saved tab so restore won\'t duplicate it');
  } catch (e) {
    // best-effort; never block the launch
  }
}

try {
  main();
} catch (e) {
  // Never let a de-dupe hiccup break the launch.
}
