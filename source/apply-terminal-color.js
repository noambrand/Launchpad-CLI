// ClaudeCode Launchpad CLI - Apply the terminal background color from config.txt
// ---------------------------------------------------------------------------
// This is the SINGLE authority for the terminal color. It reads TERMINAL_COLOR
// from the sibling config.txt and applies it two ways so the choice sticks:
//
//   1. The Windows Terminal fragment (…\Fragments\ClaudeCodeLaunchpad\…json) —
//      read by WT at COLD START, so a brand-new WT window gets the color even
//      before the profile is "materialized" into settings.json.
//   2. The materialized profile inside settings.json — WT HOT-RELOADS this, so
//      an already-open Launchpad window recolors live, and (the important bug
//      fix) TERMINAL_COLOR=default reliably UN-PINS a previously applied scheme.
//
// Supported values (case-insensitive):
//   kivun  -> #C8E6FF light blue (default look)   dark  -> #1E1E1E
//   black  -> #0C0C0C                              white -> #FFFFFF
//   default -> leave the user's own terminal theme untouched (un-pin ours)
//   #RRGGBB / #RGB -> any custom color; the text color is chosen automatically
//                     (dark text on a light background, light text on a dark one)
// Anything unrecognized is treated as `default` and a one-line warning is logged.
//
// Safe by design: never calls taskkill (so it won't nuke the user's other WT
// tabs at launch time), writes settings.json only when something actually
// changed, and leaves settings.json untouched if it can't be parsed as JSON.
// This runs at install time AND best-effort on every launch.

const fs = require('fs');
const path = require('path');

const SCHEME_NAME = 'Launchpad Color';
const PROFILE_NAME = 'ClaudeCode Launchpad CLI';

// --- Color resolution (shared spec with the batch launcher and Kivun Terminal) ---

const NAMED = {
  kivun: '#C8E6FF',
  dark: '#1E1E1E',
  black: '#0C0C0C',
  white: '#FFFFFF',
};

// 16-color ANSI palettes. Light backgrounds reuse the original "Noam" palette
// (dark, saturated colors that read on a pale background); dark backgrounds use
// the standard WT "Campbell" palette (bright colors that read on a dark one).
const LIGHT_PALETTE = {
  cursorColor: '#0050C8',
  selectionBackground: '#32FFF1',
  black: '#0C0C0C', red: '#C50F1F', green: '#13A10E', yellow: '#C19C00',
  blue: '#0000A0', purple: '#881798', cyan: '#005AA0', white: '#CCCCCC',
  brightBlack: '#000000', brightRed: '#FF1328', brightGreen: '#0F800B',
  brightYellow: '#AB8A00', brightBlue: '#000078', brightPurple: '#691275',
  brightCyan: '#003C8C', brightWhite: '#5E5E5E',
};
const DARK_PALETTE = {
  cursorColor: '#7FD4FF',
  selectionBackground: '#264F78',
  black: '#0C0C0C', red: '#C50F1F', green: '#13A10E', yellow: '#C19C00',
  blue: '#0037DA', purple: '#881798', cyan: '#3A96DD', white: '#CCCCCC',
  brightBlack: '#767676', brightRed: '#E74856', brightGreen: '#16C60C',
  brightYellow: '#F9F1A5', brightBlue: '#3B78FF', brightPurple: '#B4009E',
  brightCyan: '#61D6D6', brightWhite: '#F2F2F2',
};

function expandHex(v) {
  // v is '#rgb' or '#rrggbb' (lowercased); return '#RRGGBB' uppercase
  let h = v.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h.toUpperCase();
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return Math.round((299 * r + 587 * g + 114 * b) / 1000);
}

function resolveColor(raw) {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  if (v === '' || v === 'default') return { useScheme: false };
  let bg;
  if (NAMED[v]) {
    bg = NAMED[v];
  } else if (/^#([0-9a-f]{6}|[0-9a-f]{3})$/.test(v)) {
    bg = expandHex(v);
  } else {
    return {
      useScheme: false,
      warn: 'Unrecognized TERMINAL_COLOR "' + String(raw).trim() + '" - leaving the terminal theme unchanged.',
    };
  }
  const light = luminance(bg) >= 128;
  return { useScheme: true, bg: bg.toUpperCase(), fg: light ? '#0C0C0C' : '#F2F2F2', light };
}

function buildScheme(resolved) {
  const p = resolved.light ? LIGHT_PALETTE : DARK_PALETTE;
  return {
    name: SCHEME_NAME,
    background: resolved.bg,
    foreground: resolved.fg,
    cursorColor: p.cursorColor,
    selectionBackground: p.selectionBackground,
    black: p.black, red: p.red, green: p.green, yellow: p.yellow,
    blue: p.blue, purple: p.purple, cyan: p.cyan, white: p.white,
    brightBlack: p.brightBlack, brightRed: p.brightRed, brightGreen: p.brightGreen,
    brightYellow: p.brightYellow, brightBlue: p.brightBlue, brightPurple: p.brightPurple,
    brightCyan: p.brightCyan, brightWhite: p.brightWhite,
  };
}

// --- Read TERMINAL_COLOR from the sibling config.txt (last non-comment wins,
//     mirroring the batch launcher's for/f loop). ---
function readConfigColor() {
  const cfg = path.join(__dirname, 'config.txt');
  let value = 'kivun'; // same default the launcher uses when the key is absent
  try {
    const text = fs.readFileSync(cfg, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t[0] === '#') continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      if (t.slice(0, eq).trim() === 'TERMINAL_COLOR') value = t.slice(eq + 1).trim();
    }
  } catch (e) {
    // config.txt missing/unreadable -> keep the kivun default
  }
  return value;
}

// --- Write the WT fragment so a cold-start window is colored correctly ---
function writeFragment(resolved) {
  const dir = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft', 'Windows Terminal', 'Fragments', 'ClaudeCodeLaunchpad'
  );
  const fragPath = path.join(dir, 'claudecode-launchpad-wt-fragment.json');

  const profile = {
    name: PROFILE_NAME,
    // Route through the launcher (not a bare `claude`) so a profile opened
    // straight from the WT dropdown gets colors, the language prompt AND the
    // exit-to-shell behavior, instead of a tab that closes the moment Claude ends.
    commandline: '"%LOCALAPPDATA%\\Kivun\\claudecode-launchpad.bat" --run',
    icon: '%LOCALAPPDATA%\\Kivun\\claude_icon.ico',
    cursorShape: 'bar',
    font: { face: 'Cascadia Mono', size: 11 },
    scrollbarState: 'visible',
    startingDirectory: '%USERPROFILE%',
    suppressApplicationTitle: true,
  };
  const frag = { profiles: [profile] };
  if (resolved.useScheme) {
    profile.colorScheme = SCHEME_NAME;
    frag.schemes = [buildScheme(resolved)];
  }

  const next = JSON.stringify(frag, null, 4) + '\n';
  try {
    let prev = null;
    try { prev = fs.readFileSync(fragPath, 'utf8'); } catch (e) {}
    if (prev === next) { console.log('Fragment already up to date'); return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fragPath, next, { encoding: 'utf8' });
    console.log('Wrote WT fragment (' + (resolved.useScheme ? SCHEME_NAME : 'no scheme') + ')');
  } catch (e) {
    console.log('Could not write WT fragment (WT may not be installed): ' + e.message);
  }
}

// --- Sync the materialized profile + scheme in settings.json (hot-reload +
//     the default-un-pin bug fix). No taskkill, write only-on-change, bail on
//     unparsable JSONC. ---
function syncSettings(resolved) {
  const settingsPath = path.join(
    process.env.LOCALAPPDATA || '',
    'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'
  );
  if (!fs.existsSync(settingsPath)) {
    console.log('Windows Terminal settings not found (nothing to hot-reload)');
    return;
  }

  let raw = fs.readFileSync(settingsPath, 'utf8');
  const hadBom = raw.charCodeAt(0) === 0xfeff;
  if (hadBom) raw = raw.slice(1);

  let settings;
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    console.log('Could not parse settings.json (JSONC/malformed?); leaving it untouched: ' + e.message);
    return;
  }

  let changed = false;

  // Upsert our scheme when a color is in use (replace values in place so a theme
  // change updates an existing entry instead of piling up duplicates).
  if (resolved.useScheme) {
    if (!Array.isArray(settings.schemes)) settings.schemes = [];
    const want = buildScheme(resolved);
    const idx = settings.schemes.findIndex((s) => s && s.name === SCHEME_NAME);
    if (idx === -1) {
      settings.schemes.push(want);
      changed = true;
    } else if (JSON.stringify(settings.schemes[idx]) !== JSON.stringify(want)) {
      settings.schemes[idx] = want;
      changed = true;
    }
  }

  // Point the materialized profile at our scheme, or un-pin it for `default`.
  const list = settings.profiles && Array.isArray(settings.profiles.list) ? settings.profiles.list : null;
  if (list) {
    const profile = list.find(
      (p) => p && (p.source === 'ClaudeCodeLaunchpad' ||
        (typeof p.name === 'string' && p.name.indexOf('ClaudeCode Launchpad') !== -1))
    );
    if (profile) {
      if (resolved.useScheme) {
        if (profile.colorScheme !== SCHEME_NAME) { profile.colorScheme = SCHEME_NAME; changed = true; }
      } else if ('colorScheme' in profile) {
        // default: remove OUR pin (also clears the legacy "Noam" pin) so the
        // user's own terminal theme shows through. THIS is the reported bug fix.
        delete profile.colorScheme;
        changed = true;
      }
    } else {
      console.log('Launchpad profile not materialized yet; fragment carries the color');
    }
  }

  if (changed) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), { encoding: 'utf8' });
    console.log('Updated Windows Terminal settings (' + (resolved.useScheme ? SCHEME_NAME : 'un-pinned scheme') + ')');
  } else {
    console.log('Windows Terminal settings already correct');
  }
}

function main() {
  const rawColor = readConfigColor();
  const resolved = resolveColor(rawColor);
  if (resolved.warn) console.log('WARNING: ' + resolved.warn);
  console.log('TERMINAL_COLOR=' + rawColor + ' -> ' +
    (resolved.useScheme ? resolved.bg + ' / ' + resolved.fg : 'default (theme untouched)'));
  writeFragment(resolved);
  syncSettings(resolved);
}

try {
  main();
} catch (e) {
  // Never let a color hiccup break the launch.
  console.log('apply-terminal-color: non-fatal error: ' + (e && e.message));
}
