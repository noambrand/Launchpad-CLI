// ClaudeCode Launchpad CLI - Apply Windows Terminal profile keys (NON-color)
// Closes WT first (it overwrites settings while running), then ensures the
// ClaudeCode Launchpad profile carries the right keys (commandline, cursor,
// font, etc.). The terminal COLOR is owned separately by apply-terminal-color.js
// (which reads TERMINAL_COLOR from config.txt); this script no longer touches
// colorScheme so the two can't fight over settings.json.
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

// Parse Windows Terminal's JSONC settings. Fast path: strict JSON.parse. If that
// throws, strip // line and /* */ block comments (skipping any that live INSIDE a
// double-quoted string, e.g. a path) plus trailing commas, then parse again.
// Throws only when the content is truly malformed, so the caller can still bail
// safely on a corrupt file. WT's settings.json normally has // comments, and the
// old strict-only parse bailed on them — silently never applying the profile keys
// below. (Mirror of the helper in apply-terminal-color.js; kept inline because
// these installer scripts are shipped standalone with no shared require.)
function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    let out = '';
    let inStr = false, esc = false, inLine = false, inBlock = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (inStr) {
        out += c;
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '/' && n === '/') { inLine = true; i++; continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      out += c;
    }
    const cleaned = out.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(cleaned); // may still throw -> caller bails safely
  }
}

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
  settings = parseJsonc(raw);
} catch (e) {
  // Unparsable even after stripping comments -> genuinely malformed/hand-broken.
  // Do NOT risk corrupting it with a blind write — leave it alone.
  console.log('Could not parse settings.json (malformed?); leaving it untouched: ' + e.message);
  process.exit(0);
}

let changed = false;

// --- Ensure the ClaudeCode Launchpad profile carries the right keys ---
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
      // Route through the launcher (not a bare `claude`) so a profile opened
      // straight from the WT dropdown gets the language prompt AND the
      // exit-to-shell behavior; without a commandline a hiccupped fragment
      // merge would fall back to cmd.exe (no claude at all).
      commandline: '"%LOCALAPPDATA%\\Kivun\\claudecode-launchpad.bat" --run',
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
