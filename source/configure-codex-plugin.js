// configure-codex-plugin.js (v3.6.0)
// "Let Claude hand work to Codex": turns OpenAI's Codex add-on for Claude Code on or off for the
// installer. Launchpad ships its own copy in plugins\codex (codex@launchpad-plugins), changed so Claude
// uses Codex only when the user asks (docs\CODEX-ADDON.md). Node built-ins only.
//
// Modes (node configure-codex-plugin.js <mode>):
//   install   turn the add-on on. Exit 0 when it is on; 3 when the user already has OpenAI's own copy
//             (left as it is, so no command is defined twice); 4 when Claude Code or Codex isn't on this
//             PC; 1 on any other failure
//   remove    the user unticked it: remember that, and take Launchpad's copy out if this script put it
//             in. Exit 0, or 1 when the copy could not be taken out
//
// Records in %LOCALAPPDATA%\Kivun, read by the installer:
//   kivun-codex-plugin.txt      Launchpad's copy is on (written after Claude lists it)
//   kivun-codex-plugin-off.txt  the user unticked it, so the next run starts unticked
//
// Claude is started with an argument array and no shell. Only a claude.cmd (an npm copy) needs cmd.exe;
// its arguments are fixed words and Launchpad's own folder, quoted, and a folder with a quote or a % in
// its name is refused rather than passed through cmd. What this relies on was measured on a real PC:
// docs\STEP0-results-codex-plugin.md.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ID = 'codex@launchpad-plugins';
const MARKETPLACE = 'launchpad-plugins';
const EXIT = { OK: 0, FAILED: 1, OWN_COPY: 3, NOT_HERE: 4 };
const TIMEOUT = 120000;

function paths(env) {
  env = env || process.env;
  const home = env.USERPROFILE || env.HOME;
  const kivun = env.KIVUN_DIR || path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Kivun');
  return {
    home,
    kivun,
    plugins: path.join(kivun, 'plugins'),
    codexPath: path.join(kivun, 'kivun-codex-path.txt'),
    record: path.join(kivun, 'kivun-codex-plugin.txt'),
    off: path.join(kivun, 'kivun-codex-plugin-off.txt'),
    log: path.join(kivun, 'codex-plugin-setup.log'),
  };
}

function log(p, line) {
  try { fs.mkdirSync(p.kivun, { recursive: true }); fs.appendFileSync(p.log, new Date().toISOString() + ' ' + line + '\r\n'); } catch (e) { /* logging never blocks */ }
}
function say(p, line) { console.log(line); log(p, line); }
function remove(file) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }

// ---------------------------------------------------------------- finding and starting Claude Code
// The order the installer uses: the native copy in .local\bin, then PATH, then npm's folder.
function findClaude(env) {
  env = env || process.env;
  if (env.KIVUN_TEST_CLAUDE) return { kind: 'js', file: env.KIVUN_TEST_CLAUDE };   // the tests' stand-in
  const p = paths(env);
  const native = path.join(p.home, '.local', 'bin', 'claude.exe');
  if (fs.existsSync(native)) return { kind: 'exe', file: native };
  const dirs = String(env.PATH || env.Path || '').split(';').filter(Boolean);
  if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'npm'));
  for (const dir of dirs) {
    for (const [name, kind] of [['claude.exe', 'exe'], ['claude.cmd', 'cmd']]) {
      const file = path.join(dir.replace(/"/g, ''), name);
      if (fs.existsSync(file)) return { kind, file };
    }
  }
  return null;
}

// cmd.exe line for a claude.cmd: every part quoted. null when a part can't be passed safely.
function cmdLine(file, args) {
  const parts = [file].concat(args);
  if (parts.some(a => /["%\r\n]/.test(a))) return null;
  return '"' + parts.map(a => '"' + a + '"').join(' ') + '"';
}

function runClaude(c, args, env) {
  const opts = { encoding: 'utf8', windowsHide: true, timeout: TIMEOUT, env: env || process.env };
  let r;
  if (c.kind === 'js') r = cp.spawnSync(process.execPath, [c.file].concat(args), opts);
  else if (c.kind === 'exe') r = cp.spawnSync(c.file, args, opts);
  else {
    const line = cmdLine(c.file, args);
    if (!line) return { status: null, stdout: '', stderr: 'a path holds a quote or a %, so it is not passed through cmd.exe' };
    r = cp.spawnSync(env && env.ComSpec || process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line], Object.assign({ windowsVerbatimArguments: true }, opts));
  }
  return { status: r.status, stdout: r.stdout || '', stderr: (r.stderr || '') + (r.error ? r.error.message : '') };
}

// The installed plugins, from `claude plugin list --json` (an array of { id, enabled, ... }). null when
// the list can't be read: nothing is changed then.
function listPlugins(c, env, p) {
  const r = runClaude(c, ['plugin', 'list', '--json'], env);
  if (r.status !== 0) { log(p, 'plugin list failed (' + r.status + '): ' + r.stderr.trim()); return null; }
  const text = r.stdout.trim();
  const at = text.indexOf('[');
  try {
    const list = JSON.parse(at >= 0 ? text.slice(at) : text);
    if (!Array.isArray(list)) throw new Error('not a list');
    return list.filter(x => x && typeof x.id === 'string');
  } catch (e) {
    log(p, 'plugin list was not readable: ' + e.message);
    return null;
  }
}

// OpenAI's own copy (or any other plugin called codex): its commands have the same names.
const otherCodex = list => list.find(x => /^codex@/.test(x.id) && x.id !== ID);

// ---------------------------------------------------------------- modes
function install(env) {
  env = env || process.env;
  const p = paths(env);
  const c = findClaude(env);
  if (!c) { say(p, 'Claude Code is not on this PC, so Claude-to-Codex was not set up'); return EXIT.NOT_HERE; }
  if (!fs.existsSync(p.codexPath)) { say(p, 'Codex is not on this PC, so Claude-to-Codex was not set up'); return EXIT.NOT_HERE; }

  let list = listPlugins(c, env, p);
  if (!list) { say(p, 'Could not read the list of Claude Code add-ons'); return EXIT.FAILED; }
  const own = otherCodex(list);
  if (own) {
    say(p, 'Claude already has ' + own.id + ', so Launchpad left it as it is');
    remove(p.off);
    return EXIT.OWN_COPY;
  }
  if (!list.some(x => x.id === ID)) {
    // Registered by every Claude install already; again is harmless (exit 0), and needed when Claude
    // came from somewhere else.
    let r = runClaude(c, ['plugin', 'marketplace', 'add', p.plugins], env);
    if (r.status !== 0) { say(p, 'Could not add Launchpad\'s add-on folder to Claude (' + r.status + '): ' + r.stderr.trim()); return EXIT.FAILED; }
    r = runClaude(c, ['plugin', 'install', ID, '--scope', 'user'], env);
    if (r.status !== 0) { say(p, 'Could not turn on the Codex add-on (' + r.status + '): ' + r.stderr.trim()); return EXIT.FAILED; }
    list = listPlugins(c, env, p);
    if (!list || !list.some(x => x.id === ID)) { say(p, 'Claude does not list the Codex add-on after installing it'); return EXIT.FAILED; }
  }
  fs.mkdirSync(p.kivun, { recursive: true });
  fs.writeFileSync(p.record, ID + '\r\n');
  remove(p.off);
  say(p, 'Claude can now hand work to Codex: /codex:review and /codex:rescue');
  return EXIT.OK;
}

function removeMode(env) {
  env = env || process.env;
  const p = paths(env);
  fs.mkdirSync(p.kivun, { recursive: true });
  fs.writeFileSync(p.off, 'unticked\r\n');
  if (!fs.existsSync(p.record)) return EXIT.OK;   // Launchpad never put it in: nothing to take out
  const c = findClaude(env);
  if (!c) { remove(p.record); say(p, 'Claude Code is not on this PC any more'); return EXIT.OK; }
  let list = listPlugins(c, env, p);
  if (!list) { say(p, 'Could not read the list of Claude Code add-ons'); return EXIT.FAILED; }
  if (list.some(x => x.id === ID)) {
    const r = runClaude(c, ['plugin', 'uninstall', ID, '--scope', 'user'], env);
    list = listPlugins(c, env, p);
    if (r.status !== 0 || !list || list.some(x => x.id === ID)) { say(p, 'Could not turn off the Codex add-on (' + r.status + '): ' + r.stderr.trim()); return EXIT.FAILED; }
  }
  remove(p.record);
  say(p, 'Claude-to-Codex is off');
  return EXIT.OK;
}

function main(argv, env) {
  const mode = argv[0];
  try {
    if (mode === 'install') return install(env);
    if (mode === 'remove') return removeMode(env);
  } catch (e) {
    log(paths(env), mode + ': ' + (e && e.stack || e));
    console.log('Claude-to-Codex: ' + (e && e.message || e));
    return EXIT.FAILED;
  }
  console.error('Usage: node configure-codex-plugin.js install|remove');
  return 2;
}

module.exports = { ID, EXIT, paths, findClaude, cmdLine, listPlugins, install, remove: removeMode, main };

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env);
