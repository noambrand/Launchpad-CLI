// configure-antigravity.js
// Everything Launchpad does for Google Antigravity CLI (agy.exe), in one place, as configure-copilot.js
// does for Copilot, and reusing configure-codex.js's helpers rather than copying them. Node built-ins only.
//
// Modes (node configure-antigravity.js <mode> ...):
//   install     add Launchpad's plugin folder to Antigravity's config (sound and language hooks)
//   uninstall   delete the plugin's files, and the folder if nothing else is in it
//   install-antigravity   install agy for install.cmd /antigravity: update a usable copy, else run Google's
//                         install.cmd; exit 7 on failure
//   commit               verify the installed agy, cache its path, then set AGENT to antigravity (exit 7 if none)
//   prepare [folder]     create a launch folder for a right-click / shortcut launch, print its id
//                        (the launcher passes the folder in KV_FOLDER)
//   info <id> workdir    print a launch's work folder
//   check <id>           exit 0 when the launch's work folder is reachable, 1 when not
//   missing <id>         print the 'folder could not be opened' message and wait for Enter
//   compose <id>         print the exact argument array `run` would start agy with (JSON)
//   run <id> [--relaunch]   start agy for a launch: argument array, no shell
//
// What this relies on was measured against the real Antigravity: docs\STEP0-results-antigravity.md.

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const https = require('https');
const CC = require('./configure-codex');
const AH = require('./agent-helpers');
const { scriptPolicyChosen, hasVariable } = require('./configure-copilot');
const { atomicWrite, readIfExists, compareVersions, parseConfig, createLaunch, readLaunch, cleanupLaunches, setAgent, workFolder, fileStamp, testPause, say } = CC;

const INSTALLER_URL = 'https://antigravity.google/cli/install.cmd';
const MANUAL_COMMAND = 'curl -fsSL ' + INSTALLER_URL + ' -o install.cmd && install.cmd && del install.cmd';
const FAIL = 7;                       // Antigravity's failure exit code
const POLICY_VALUE = 'RemoteSigned';
const MIN_VERSION = '1.5.3';
const HOOK_SCRIPT = 'antigravity-hook.js';
const PLUGIN_FILES = ['plugin.json', 'hooks.json', 'hook.cmd', HOOK_SCRIPT];

// ---------------------------------------------------------------- paths
function paths(env) {
  env = env || process.env;
  const base = CC.paths(env);
  // agy itself, the uninstaller ($PROFILE) and D8 all use USERPROFILE, even where HOME is set.
  const geminiHome = path.join(env.USERPROFILE || base.home, '.gemini');
  return Object.assign({}, base, {
    geminiHome,
    pluginDir: path.join(geminiHome, 'config', 'plugins', 'launchpad'),
    userSettings: path.join(geminiHome, 'antigravity-cli', 'settings.json'),
    pathCache: path.join(base.kivun, 'kivun-antigravity-path.txt'),
    log: path.join(base.kivun, 'antigravity-setup.log'),
    hookSource: path.join(base.kivun, HOOK_SCRIPT),
  });
}

// ---------------------------------------------------------------- the plugin folder
// Antigravity runs a hook command through cmd /c, breaks any quotes in it and starts it in the plugin
// folder, so the commands are relative and unquoted. The leading ".\" is needed: cmd doesn't search the
// current folder for a bare name when NoDefaultCurrentDirectoryInExePath is set. A .cmd is read in the
// console code page, so hook.cmd is ASCII.
function pluginFiles(p) {
  const json = o => JSON.stringify(o, null, 2) + '\n';
  const handler = ev => [{ type: 'command', command: '.\\hook.cmd ' + ev, timeout: 10 }];
  return {
    'plugin.json': json({ name: 'launchpad' }),
    'hooks.json': json({ launchpad: { SessionStart: handler('session-start'), Stop: handler('stop') } }),
    'hook.cmd': '@node "%~dp0' + HOOK_SCRIPT + '" %*\r\n',
    [HOOK_SCRIPT]: readIfExists(p.hookSource),
  };
}

function install(env) {
  const p = paths(env);
  const files = pluginFiles(p);
  if (files[HOOK_SCRIPT] == null) throw new Error(HOOK_SCRIPT + ' is missing from ' + p.kivun);
  fs.mkdirSync(p.pluginDir, { recursive: true });
  let changed = 0;
  for (const name of PLUGIN_FILES) {
    const file = path.join(p.pluginDir, name);
    if (readIfExists(file) === files[name]) continue;
    atomicWrite(file, files[name]);
    changed++;
  }
  if (!changed) return ['sound and language hooks already present'];
  CC.log(p, 'install: plugin files written to ' + p.pluginDir);
  return ['sound and language hooks added'];
}

function uninstall(env) {
  const p = paths(env);
  for (const name of PLUGIN_FILES) fs.rmSync(path.join(p.pluginDir, name), { force: true });
  try { fs.rmdirSync(p.pluginDir); } catch (e) { /* missing, or holds a file of the user's */ }
  CC.log(p, 'uninstall: done');
}

// ---------------------------------------------------------------- finding and checking agy
// agy.exe is a stand-alone program (not Node), so there is no Node rule. Google's installer puts it in
// %LOCALAPPDATA%\agy\bin; a copy already on PATH is the second choice. A plain `where agy.exe` looks in
// the current folder first, and `run` starts in the user's project, so "$PATH:" (where.exe's own syntax)
// limits the search to PATH.
function localAppData(env) { return env.LOCALAPPDATA || path.join(CC.paths(env).home, 'AppData', 'Local'); }

function discover(env) {
  const found = [path.join(localAppData(env), 'agy', 'bin', 'agy.exe')];
  const w = cp.spawnSync('where.exe', ['$PATH:agy.exe'], { encoding: 'utf8', windowsHide: true, env });
  const first = String(w.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
  if (first) found.push(first);
  const seen = new Set();
  return found.filter(f => { const k = f.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// { version }, or { version: null, error } with why it couldn't be started (null if it started).
function versionOf(exe, env) {
  // A file that was only just written can't be started for a moment while Windows scans it
  // (spawn fails outright, not with an exit code), so a failed start is tried again a few times.
  let r;
  for (let i = 0; i < 4; i++) {
    r = cp.spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true, env });
    if (!r.error || r.error.code === 'ETIMEDOUT') break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  const m = String(r.stdout || '').match(/\d+\.\d+\.\d+/);
  return m ? { version: m[0], error: null } : { version: null, error: r.error ? r.error.message : null };
}

// The path cache is never authority: trusted only while the file still has the same size and time.
function resolveAntigravity(env, opts) {
  env = env || process.env;
  opts = opts || {};
  const p = paths(env);
  if (!opts.noCache) {
    try {
      const c = JSON.parse(fs.readFileSync(p.pathCache, 'utf8'));
      const now = fileStamp(c.exe);
      if (now && c.stamp && now.size === c.stamp.size && now.mtime === c.stamp.mtime) return c;
    } catch (e) { /* no usable cache */ }
  }
  const problems = [];
  for (const exe of discover(env)) {
    if (!fs.existsSync(exe)) continue;
    const got = versionOf(exe, env), v = got.version;
    if (!v) { problems.push('Antigravity at ' + exe + ' did not start' + (got.error ? ': ' + got.error : '') + '.'); continue; }
    if (compareVersions(v, MIN_VERSION) < 0) { problems.push('Antigravity ' + v + ' at ' + exe + ' is older than ' + MIN_VERSION + '.'); continue; }
    const out = { exe, version: v, stamp: fileStamp(exe) };
    try { fs.mkdirSync(p.kivun, { recursive: true }); atomicWrite(p.pathCache, JSON.stringify(out, null, 2) + '\n'); } catch (e) { /* cache is optional */ }
    return out;
  }
  return { missing: true, problems };
}

// ---------------------------------------------------------------- launching
function launchFromConfig(launch, env) {
  const cfg = parseConfig(readIfExists(paths(env).config));
  return Object.assign({
    conv: 'fresh', model: null, customFlags: '',
    startup: cfg.get('ANTIGRAVITY_STARTUP_CMD') ? [cfg.get('ANTIGRAVITY_STARTUP_CMD')] : [],
  }, launch, {
    antigravityFlags: cfg.get('ANTIGRAVITY_FLAGS') || '',
    language: cfg.get('RESPONSE_LANGUAGE') || 'english',
  });
}

// Launchpad's status line is used unless the user's own settings file has one (D13).
function userHasStatusLine(env) {
  try {
    const o = JSON.parse(String(fs.readFileSync(paths(env).userSettings, 'utf8')).replace(/^﻿/, ''));
    // (a UTF-8 byte order mark at the start of the file is stripped above)
    return !!o && typeof o === 'object' && 'statusLine' in o;
  } catch (e) { return false; }
}

// Everything `run` decides, without starting anything: used by `compose` (tests) and by `run`.
function plan(id, env, relaunch) {
  env = env || process.env;
  const p = paths(env);
  const launch = launchFromConfig(readLaunch(id, env), env);
  const c = AH.composeAntigravity(Object.assign({}, launch, { statusLine: !userHasStatusLine(env), relaunch: !!relaunch }));
  const runEnv = Object.assign({}, env, launch.env || {});
  runEnv.KIVUN_ANTIGRAVITY = '1';
  for (const k of Object.keys(runEnv)) if (k.toUpperCase() === 'KIVUN_ANTIGRAVITY_LANGUAGE_LINE') delete runEnv[k];
  const line = AH.antigravityLanguageLine(launch.language);
  if (line) runEnv.KIVUN_ANTIGRAVITY_LANGUAGE_LINE = line;
  // Launchpad's folder first on PATH: the status line command is found by its bare name (A10).
  const pathKey = Object.keys(runEnv).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  runEnv[pathKey] = p.kivun + ';' + (runEnv[pathKey] || '');
  if (!hasVariable(runEnv, 'PSExecutionPolicyPreference') && !scriptPolicyChosen(runEnv)) runEnv.PSExecutionPolicyPreference = POLICY_VALUE;
  return { launch, runEnv, compose: c };
}

function waitForEnter() {
  console.log('  Press Enter to close.');
  try { const b = Buffer.alloc(1); while (fs.readSync(0, b, 0, 1) === 1 && b[0] !== 10) { /* wait for Enter */ } } catch (e) { /* no keyboard */ }
}

function run(id, relaunch, env) {
  env = env || process.env;
  const p = paths(env);
  cleanupLaunches(env);
  if (!CC.ID_RE.test(String(id))) throw new Error('bad launch id');
  const dir = path.join(p.launches, id);
  // The tab's phase-2 cmd.exe owns this folder; agy may exit while the tab lives on.
  fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.ppid }) + '\n');
  const agy = resolveAntigravity(env);
  if (agy.missing) {
    console.log('');
    console.log('  Antigravity was not found, or this copy cannot be used:');
    for (const m of agy.problems.length ? agy.problems : ['Antigravity is not installed.']) console.log('    ' + m);
    console.log('  Run the ClaudeCode Launchpad CLI installer again and choose Antigravity.');
    console.log('');
    return FAIL;
  }
  const pl = plan(id, env, relaunch);
  for (const m of pl.compose.errors.concat(pl.compose.notices)) console.log('  ' + m);
  if (pl.compose.fatal.length) {
    // Starting without the refused option would quietly change what the user asked for.
    console.log('');
    console.log('  Antigravity was not started. Change the Antigravity options in the folder picker, or ANTIGRAVITY_FLAGS');
    console.log('  in config.txt, then launch again.');
    console.log('');
    return 1;
  }
  if (pl.launch.conv === 'pick') console.log('  Type /resume to choose a conversation.');
  // Antigravity matches folders case-sensitively, so it starts in the folder's real spelling (A4).
  let cwd = pl.launch.workdir;
  try { cwd = fs.realpathSync.native(cwd); } catch (e) { /* keep the folder as given */ }
  testPause('run-before-start');
  process.on('SIGINT', () => {});   // Ctrl+C belongs to agy
  process.on('SIGBREAK', () => {});
  const r = cp.spawnSync(agy.exe, pl.compose.args, { cwd, env: pl.runEnv, stdio: 'inherit', shell: false });
  if (r.error) { console.log('  Antigravity could not be started: ' + r.error.message); return 1; }
  return r.status === null ? 1 : r.status;
}

// ---------------------------------------------------------------- installing agy (install.cmd /antigravity)
function download(url, dest, redirects, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('too many redirects'));
        return download(new URL(res.headers.location, url).href, dest, redirects - 1, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timed out')));
  });
}

// Google's install.cmd, from the test's local copy or from Google. Returns the file's path.
async function fetchInstaller(env, p) {
  const file = path.join(p.kivun, 'agy-install.cmd');
  fs.mkdirSync(p.kivun, { recursive: true });
  if (env.KIVUN_TEST_AGY_INSTALLER) fs.copyFileSync(env.KIVUN_TEST_AGY_INSTALLER, file);
  else await download(INSTALLER_URL, file, 3, 60000);
  return file;
}

async function installAntigravity(env) {
  env = env || process.env;
  const p = paths(env);
  const tag = '[Antigravity] ';
  fs.mkdirSync(p.kivun, { recursive: true });
  let c = resolveAntigravity(env, { noCache: true });
  if (!c.missing) {
    // An existing copy: ask it to update. A failed or slow update keeps the copy (D3).
    say(env, tag + 'Antigravity ' + c.version + ' is already installed (' + c.exe + '). Checking for a newer version...');
    const limit = Number(env.KIVUN_TEST_AGY_UPDATE_TIMEOUT) || CC.UPDATE_CHECK_TIMEOUT;
    const r = cp.spawnSync(c.exe, ['update'], { encoding: 'utf8', timeout: limit, windowsHide: true, env });
    const after = resolveAntigravity(env, { noCache: true });
    if (r.error || r.status !== 0) {
      say(env, tag + "Antigravity couldn't check for a newer version, so Launchpad keeps using " + (after.missing ? c.version : after.version) + '.');
    } else if (!after.missing && compareVersions(after.version, c.version) > 0) {
      say(env, tag + 'Antigravity updated from ' + c.version + ' to ' + after.version + '.');
    } else if (!after.missing) {
      say(env, tag + 'Antigravity ' + after.version + ' is up to date.');
    }
    if (after.missing) return failed(env, p, after.problems);
    return 0;
  }
  say(env, tag + 'Downloading Antigravity (about 225 MB). This can take a few minutes - please keep this window open...');
  let file = null;
  try {
    file = await fetchInstaller(env, p);
    // Google's script exits 0 even when its last step fails, so its exit code is ignored (D3).
    cp.spawnSync(env.ComSpec || 'cmd.exe', ['/d', '/c', file], { stdio: 'inherit', env, timeout: 15 * 60 * 1000 });
  } catch (e) {
    CC.log(p, 'install-antigravity: ' + e.message);
    c.problems.push("Google's installer could not be fetched or run: " + e.message);
  }
  if (file) fs.rmSync(file, { force: true });
  c = resolveAntigravity(env, { noCache: true });
  if (c.missing) return failed(env, p, c.problems);
  say(env, tag + 'Antigravity ' + c.version + ' installed.');
  return 0;
}

function failed(env, p, problems) {
  const tag = '[Antigravity] ';
  say(env, tag + 'ERROR: Antigravity could not be installed.');
  for (const m of problems || []) say(env, tag + '  ' + m);
  if (/[&|;<>^]/.test(p.kivun)) say(env, tag + "Google's installer refuses to run when Launchpad's folder path contains any of & | ; < > ^ (" + p.kivun + ').');
  say(env, tag + 'To install it yourself, open Command Prompt (not PowerShell) and run:');
  say(env, tag + '  ' + MANUAL_COMMAND);
  say(env, tag + 'Then run this installer again.');
  CC.log(p, 'install-antigravity: failed: ' + (problems || []).join(' | '));
  return FAIL;
}

// ---------------------------------------------------------------- launch folders and commit
function missingFolder(id) {
  let w = '(unknown)';
  try { w = readLaunch(id).workdir; } catch (e) { /* keep the generic text */ }
  console.log('');
  console.log('  This folder could not be opened:');
  console.log('    ' + w);
  console.log('');
  console.log('  Antigravity was NOT started, so nothing opened in the wrong place.');
  console.log('  If it is on a network drive, connect that drive and launch again.');
  console.log('');
  waitForEnter();
  return 1;
}

function prepare(folder, env) {
  env = env || process.env;
  folder = folder || env.KV_FOLDER;
  if (!folder) throw new Error('prepare needs a folder');
  return createLaunch({ agent: 'antigravity', workdir: workFolder(folder) }, env);
}

function commit(env) {
  env = env || process.env;
  const c = resolveAntigravity(env, { noCache: true });
  if (c.missing) {
    const msg = 'no usable Antigravity: ' + c.problems.join(' | ');
    CC.log(paths(env), 'commit: ' + msg);
    console.log('  ' + (c.problems.length ? c.problems.join('\n  ') : 'Antigravity is not installed.'));
    return false;
  }
  setAgent('antigravity', env);
  CC.log(paths(env), 'commit: Antigravity ' + c.version + ' selected');
  return true;
}

// ---------------------------------------------------------------- command line
function main(argv) {
  const [mode, a1, a2] = argv;
  switch (mode) {
    case 'install': for (const m of install()) console.log(m); return 0;
    case 'uninstall': uninstall(); return 0;
    case 'install-antigravity': return installAntigravity();   // a Promise
    case 'commit': return commit() ? 0 : FAIL;
    case 'prepare': process.stdout.write(prepare(a1) + '\n'); return 0;
    case 'info': {
      if (a2 !== 'workdir') throw new Error('info supports only: workdir');
      process.stdout.write(readLaunch(a1).workdir + '\n'); return 0;
    }
    case 'compose': {
      const pl = plan(a1, process.env, a2 === '--relaunch');
      process.stdout.write(JSON.stringify({ args: pl.compose.args, errors: pl.compose.errors, notices: pl.compose.notices }) + '\n');
      return 0;
    }
    case 'run': return run(a1, a2 === '--relaunch');
    case 'check': { let w; try { w = readLaunch(a1).workdir; } catch (e) { return 1; } try { return fs.statSync(w).isDirectory() ? 0 : 1; } catch (e) { return 1; } }
    case 'missing': return missingFolder(a1);
    default:
      console.log('usage: node configure-antigravity.js install|uninstall|install-antigravity|commit|prepare <folder>|info <id> workdir|check <id>|compose <id>|run <id> [--relaunch]');
      return 2;
  }
}

if (require.main === module) {
  Promise.resolve().then(() => main(process.argv.slice(2)))
    .catch(e => { console.error('configure-antigravity: ' + e.message); return 1; })
    .then(code => { process.exitCode = code; });
}

module.exports = {
  MIN_VERSION, paths, install, uninstall, discover, versionOf, resolveAntigravity, launchFromConfig, plan, run,
  installAntigravity, prepare, commit, main, createLaunch, readLaunch,
};
