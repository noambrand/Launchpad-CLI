// ClaudeCode Launchpad CLI - Apply Windows Terminal color scheme + profile keys
// Closes WT first (it overwrites settings while running), then ensures the Noam
// color scheme exists and the ClaudeCode Launchpad profile carries the right
// keys (commandline, colorScheme, font, etc.).
//
// Post-v2.6.6 fix: rewritten to parse settings.json as real JSON instead of string-
// splicing. The old string-insertion approach (a) was NOT idempotent — its
// only guard was a text search for "colorScheme", so repeated installs
// appended the same keys 4x into one profile object — and (b) never wrote a
// "commandline", so a materialized profile whose fragment-merge hiccuped fell
// back to the default profile (cmd.exe) and launched WITHOUT claude. Both bugs
// are gone now: we read -> JSON.parse -> mutate object -> JSON.stringify, which
// is inherently idempotent (setting a key that already has the right value is a
// no-op) and collapses any pre-existing duplicate keys.
//
// Bails safely (leaves the file untouched) if settings.json can't be parsed,
// after taking a timestamped backup first.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const settingsPath = path.join(
  process.env.LOCALAPPDATA,
  'Packages',
  'Microsoft.WindowsTerminal_8wekyb3d8bbwe',
  'LocalState',
  'settings.json'
);

if (!fs.existsSync(settingsPath)) {
  console.log('Windows Terminal settings not found');
  process.exit(0);
}

// Close Windows Terminal so it doesn't overwrite our changes
try {
  execSync('taskkill /f /im WindowsTerminal.exe', { stdio: 'ignore' });
} catch (e) {
  // WT may not be running
}

// Brief pause for WT to fully close
try {
  execSync('timeout /t 1 /nobreak', { stdio: 'ignore' });
} catch (e) {}

// Read + strip a UTF-8 BOM if present (JSON.parse chokes on it)
let raw = fs.readFileSync(settingsPath, 'utf8');
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

// Back up before touching anything
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
try {
  fs.copyFileSync(settingsPath, settingsPath + '.backup_' + stamp);
} catch (e) {
  // non-fatal; continue
}

let settings;
try {
  settings = JSON.parse(raw);
} catch (e) {
  // Settings may contain comments (JSONC) or be hand-edited/malformed.
  // Do NOT risk corrupting it with a blind write — leave it alone.
  console.log('Could not parse settings.json (JSONC/malformed?); leaving it untouched: ' + e.message);
  process.exit(0);
}

let changed = false;

const NOAM_SCHEME = {
  name: 'Noam',
  background: '#C8E6FF',
  foreground: '#0C0C0C',
  cursorColor: '#0050C8',
  selectionBackground: '#32FFF1',
  black: '#0C0C0C',
  red: '#C50F1F',
  green: '#13A10E',
  yellow: '#C19C00',
  blue: '#0000A0',
  purple: '#881798',
  cyan: '#005AA0',
  white: '#CCCCCC',
  brightBlack: '#000000',
  brightRed: '#FF1328',
  brightGreen: '#0F800B',
  brightYellow: '#AB8A00',
  brightBlue: '#000078',
  brightPurple: '#691275',
  brightCyan: '#003C8C',
  brightWhite: '#5E5E5E',
};

// --- 1. Ensure the Noam color scheme exists (top-level "schemes" array) ---
if (!Array.isArray(settings.schemes)) settings.schemes = [];
if (!settings.schemes.some((s) => s && s.name === 'Noam')) {
  settings.schemes.push(NOAM_SCHEME);
  changed = true;
  console.log('Added Noam color scheme');
}

// --- 2. Ensure the ClaudeCode Launchpad profile carries the right keys ---
// The WT fragment already defines this profile; this only matters once WT has
// "materialized" it into settings.json (which happens when the user customizes
// it). We set keys only when missing/different, so this is idempotent.
const list =
  settings.profiles && Array.isArray(settings.profiles.list)
    ? settings.profiles.list
    : null;

if (list) {
  const profile = list.find(
    (p) =>
      p &&
      (p.source === 'ClaudeCodeLaunchpad' ||
        (typeof p.name === 'string' && p.name.indexOf('ClaudeCode Launchpad') !== -1))
  );

  if (profile) {
    const want = {
      commandline: 'cmd /c claude', // critical: without this a hiccupped merge falls back to cmd.exe = no claude
      colorScheme: 'Noam',
      cursorShape: 'bar',
      scrollbarState: 'visible',
      // Lock the tab title so Claude can't overwrite it with "Claude Code";
      // the launcher passes a per-tab --title with the project folder name.
      suppressApplicationTitle: true,
    };
    for (const key of Object.keys(want)) {
      if (profile[key] !== want[key]) {
        profile[key] = want[key];
        changed = true;
      }
    }
    // Remove the old static tabTitle so the launcher's per-tab --title (the
    // project folder name) is authoritative. Older installs had it pinned.
    if ('tabTitle' in profile) {
      delete profile.tabTitle;
      changed = true;
    }
    // font is an object; set only if absent (don't stomp a user's custom font)
    if (!profile.font) {
      profile.font = { face: 'Cascadia Mono', size: 11 };
      changed = true;
    }
    if (changed) console.log('Updated ClaudeCode Launchpad CLI profile');
  } else {
    console.log('Launchpad profile not materialized yet; fragment provides it');
  }
}

// --- Write back as UTF-8 (no BOM), the encoding Windows Terminal expects ---
if (changed) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), { encoding: 'utf8' });
  console.log('Settings saved');
} else {
  console.log('No changes needed');
}
