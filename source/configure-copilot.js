// configure-copilot.js
// Everything Launchpad does for GitHub Copilot CLI, in one place, as configure-codex.js does for
// Codex, and reusing its helpers rather than copying them. Node built-ins only.
//
// Modes (node configure-copilot.js <mode> ...):
//   install-copilot    install Copilot itself for install.cmd /copilot: use a compatible copy, update an
//                      older npm copy with notice, never touch another copy, else npm install
//   install            add Launchpad's one hook file to Copilot's settings folder
//   uninstall          delete that file
//   commit             verify the installed Copilot, cache its path, then set AGENT to copilot
//   prepare [folder]   create a launch folder for a right-click / shortcut launch, print its id
//                      (the launcher passes the folder in KV_FOLDER, not as an argument)
//   info <id> workdir  print a launch's work folder (the batch file needs it for the tab)
//   check <id>         exit 0 when the launch's work folder is reachable, 1 when not
//   missing <id>       print the 'folder could not be opened' message and wait for Enter
//   compose <id>       print the exact argument array `run` would start Copilot with (JSON)
//   run <id> [--relaunch]   start Copilot for a launch: argument array, no shell
//
// As for Codex, the batch launcher never handles user text: cmd re-reads quotes, %, ! and ^.
// What this relies on was tested against the real Copilot: Copilot_Step0_Results.md.

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const CC = require('./configure-codex');
const AH = require('./agent-helpers');
const { atomicWrite, compareVersions, parseConfig, createLaunch, readLaunch, cleanupLaunches, setAgent, workFolder, readIfExists, fileStamp, testPause, say, npm, npmCommand } = CC;

// The first version that passed Step 0. Reopening a conversation failed on 1.0.65 (S9).
const MIN_VERSION = '1.0.105';
const MIN_NODE = '22.0.0';    // Copilot's documented minimum
const HOOKS_NAME = 'launchpad-sounds.json';
const POLICY_VALUE = 'RemoteSigned';

// ---------------------------------------------------------------- paths
function paths(env) {
  env = env || process.env;
  const base = CC.paths(env);
  const copilotHome = env.COPILOT_HOME || path.join(base.home, '.copilot');
  return Object.assign({}, base, {
    copilotHome,
    hooksFile: path.join(copilotHome, 'hooks', HOOKS_NAME),
    sessions: path.join(copilotHome, 'session-state'),
    pathCache: path.join(base.kivun, 'kivun-copilot-path.txt'),
    log: path.join(base.kivun, 'copilot-setup.log'),
    languages: path.join(base.kivun, 'copilot-language'),
    soundScript: path.join(base.kivun, 'copilot-sound.js').replace(/\\/g, '/'),
  });
}

// ---------------------------------------------------------------- settings: one file of Launchpad's own
function hooksText(p) {
  const hook = sound => ({ type: 'command', exec: 'node', args: [p.soundScript, sound], timeoutSec: 10 });
  return JSON.stringify({ version: 1, hooks: { agentStop: [hook('done')], notification: [hook('permission')] } }, null, 2) + '\n';
}

function install(env) {
  const p = paths(env);
  const text = hooksText(p);
  if (readIfExists(p.hooksFile) === text) return ['sound hooks already present'];
  fs.mkdirSync(path.dirname(p.hooksFile), { recursive: true });
  atomicWrite(p.hooksFile, text);
  CC.log(p, 'install: sound hooks written');
  return ['sound hooks added'];
}

function uninstall(env) {
  const p = paths(env);
  fs.rmSync(p.hooksFile, { force: true });
  CC.log(p, 'uninstall: done');
}

// ---------------------------------------------------------------- finding a conversation
// Noam decided Launchpad keeps no record of its own, so this reads Copilot's own session folders, and
// changes nothing there. Those are Copilot's internal files: if their format changes this finds nothing
// and the launch starts a new conversation, which is safe. Plain --continue is not safe: with no
// conversation in this folder it opens another folder's (Step 0, S4).
function yamlValue(line) {
  const v = line.trim();
  if (v.length > 1 && v[0] === "'" && v[v.length - 1] === "'") return v.slice(1, -1).replace(/''/g, "'");
  if (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') { try { return JSON.parse(v); } catch (e) { return v; } }
  return v;
}
function sameFolder(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

// The id of the newest conversation of exactly this folder, or null. A session opened and left with no
// message has no events.jsonl, and Copilot can't reopen it.
function findConversation(folder, env) {
  const p = paths(env);
  let names = [];
  try { names = fs.readdirSync(p.sessions); } catch (e) { return null; }
  let best = null;
  for (const id of names) {
    try {
      const dir = path.join(p.sessions, id);
      if (!fs.existsSync(path.join(dir, 'events.jsonl'))) continue;
      const text = fs.readFileSync(path.join(dir, 'workspace.yaml'), 'utf8');
      const cwd = (text.match(/^cwd:(.*)$/m) || [])[1];
      const updated = (text.match(/^updated_at:(.*)$/m) || [])[1];
      if (!cwd || !sameFolder(yamlValue(cwd), folder)) continue;
      const at = updated ? yamlValue(updated) : '';
      if (!best || at > best.at) best = { id, at };
    } catch (e) { /* not a session folder, or not one we can read */ }
  }
  return best ? best.id : null;
}

// ---------------------------------------------------------------- the language line
// Copilot has no language option. COPILOT_CUSTOM_INSTRUCTIONS_DIRS points at a folder Launchpad owns,
// and only a .github/instructions file with applyTo applies at startup; AGENTS.md there does not (S6).
// It adds to the user's own instructions, which still apply.
function languageFolder(p, code, line) {
  const dir = path.join(p.languages, String(code).toLowerCase());
  const file = path.join(dir, '.github', 'instructions', 'language.instructions.md');
  const text = '---\napplyTo: "**"\n---\n' + line + '\n';
  if (readIfExists(file) !== text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    atomicWrite(file, text);
  }
  return dir;
}

// ---------------------------------------------------------------- PowerShell's script policy
// Copilot's shell tool runs on Windows PowerShell when PowerShell 7 isn't installed, and Windows blocks
// scripts there by default, so npm (npm.ps1) fails inside Copilot (S2). For this session only, Launchpad
// lets local scripts run; unsigned scripts from the internet stay blocked, nothing is saved, and Copilot's
// own prompts don't change. Noam chose this over installing PowerShell 7 (2026-11-06). A policy someone
// chose is left alone, because this variable would override it. Group Policy always wins anyway.
function scriptPolicyChosen(env) {
  if (env.KIVUN_TEST_SCRIPT_POLICY) return env.KIVUN_TEST_SCRIPT_POLICY === 'chosen';
  const keys = ['HKCU\\Software\\Microsoft\\PowerShell\\1\\ShellIds\\Microsoft.PowerShell', 'HKLM\\Software\\Microsoft\\PowerShell\\1\\ShellIds\\Microsoft.PowerShell',
    'HKCU\\Software\\Policies\\Microsoft\\Windows\\PowerShell', 'HKLM\\Software\\Policies\\Microsoft\\Windows\\PowerShell'];
  return keys.some(k => {
    const r = cp.spawnSync('reg.exe', ['query', k, '/v', 'ExecutionPolicy'], { encoding: 'utf8', windowsHide: true, timeout: 5000, env });
    if (r.error) return true;   // couldn't ask: nothing is loosened on a guess
    return r.status === 0 && /ExecutionPolicy\s+REG_/.test(r.stdout || '');
  });
}
function hasVariable(env, name) { return Object.keys(env).some(k => k.toUpperCase() === name.toUpperCase()); }

// ---------------------------------------------------------------- finding and checking Copilot
function nodeTooOld(version) { return compareVersions(String(version).replace(/^v/, ''), MIN_NODE) < 0; }
// The Node that would run Copilot. Tests name one, because the runner's own Node would decide otherwise.
function nodeVersion(env) { return env.KIVUN_TEST_NODE_VERSION || process.version; }
// npm's copy runs on this Node. A stand-alone copilot.exe doesn't use Node at all.
function needsNewerNode(c, env) { return c.kind === 'npm' && nodeTooOld(nodeVersion(env)); }

function npmCandidate(prefix) {
  const loader = path.join(prefix, 'node_modules', '@github', 'copilot', 'npm-loader.js');
  return fs.existsSync(loader) ? { kind: 'npm', loader, prefix } : null;
}

function versionOf(c, env) {
  const file = c.kind === 'npm' ? process.execPath : c.exe;
  const args = c.kind === 'npm' ? [c.loader, '--version'] : ['--version'];
  // Its first run unpacks about 200 MB, so this can take a while.
  const r = cp.spawnSync(file, args, { encoding: 'utf8', timeout: 180000, windowsHide: true, env });
  const m = String(r.stdout || '').match(/Copilot CLI\s+(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function discover(env) {
  const found = [];
  const w = cp.spawnSync('where.exe', ['copilot'], { encoding: 'utf8', windowsHide: true, env });
  for (const line of String(w.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/\.cmd$/i.test(line)) { const c = npmCandidate(path.dirname(line)); if (c) found.push(c); }
    else if (/\.exe$/i.test(line)) found.push({ kind: 'exe', exe: line });
  }
  if (!found.length) {
    // npm by its full path: on a fresh PC the installer's own PATH predates Node.
    const npmCmd = npmCommand(env);
    const r = npmCmd ? npm(env, npmCmd, ['prefix', '-g'], null, 30000) : {};
    const prefix = String(r.stdout || '').trim().split(/\r?\n/).pop();
    if (prefix) { const c = npmCandidate(prefix); if (c) found.push(c); }
  }
  const seen = new Set();
  return found.filter(c => { const k = (c.loader || c.exe).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function keyFile(c) { return c.kind === 'npm' ? c.loader : c.exe; }

// The path cache is never authority: trusted only while the file still has the same size and time.
function resolveCopilot(env, opts) {
  env = env || process.env;
  opts = opts || {};
  const p = paths(env);
  if (!opts.noCache) {
    try {
      const c = JSON.parse(fs.readFileSync(p.pathCache, 'utf8'));
      const now = fileStamp(keyFile(c));
      if (now && c.stamp && now.size === c.stamp.size && now.mtime === c.stamp.mtime && !needsNewerNode(c, env)) return c;
    } catch (e) { /* no usable cache */ }
  }
  const problems = [];
  for (const c of discover(env)) {
    if (needsNewerNode(c, env)) { problems.push('Copilot at ' + keyFile(c) + ' needs Node.js 22 or newer; this PC has ' + nodeVersion(env) + '.'); continue; }
    const v = versionOf(c, env);
    if (!v) { problems.push('Copilot at ' + keyFile(c) + ' did not start.'); continue; }
    if (compareVersions(v, MIN_VERSION) < 0) { problems.push('Copilot ' + v + ' at ' + keyFile(c) + ' is older than ' + MIN_VERSION + '.'); continue; }
    const out = Object.assign({}, c, { version: v, stamp: fileStamp(keyFile(c)) });
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
    startup: cfg.get('COPILOT_STARTUP_CMD') ? [cfg.get('COPILOT_STARTUP_CMD')] : [],
  }, launch, {
    copilotFlags: cfg.get('COPILOT_FLAGS') || '',
    language: cfg.get('RESPONSE_LANGUAGE') || 'english',
  });
}

// Everything `run` decides, without starting anything: used by `compose` (tests) and by `run`.
function plan(id, env, relaunch) {
  env = env || process.env;
  const p = paths(env);
  const launch = launchFromConfig(readLaunch(id, env), env);
  const runEnv = Object.assign({}, env, launch.env || {});
  const sessionId = launch.conv === 'last' ? findConversation(launch.workdir, runEnv) : null;
  const c = AH.composeCopilot(Object.assign({}, launch, { sessionId, relaunch: !!relaunch }));
  if (launch.conv === 'last' && !sessionId && !relaunch) c.notices.push('No earlier Copilot conversation in this folder, so this starts a new one.');
  const line = AH.copilotLanguageLine(launch.language);
  if (line) {
    if (p.languages.includes(',')) {
      // Copilot splits this variable on commas, so such a path would name two wrong folders.
      c.notices.push('Your user folder name has a comma in it, so Launchpad can\'t add the response language for Copilot.');
    } else {
      const dir = languageFolder(p, launch.language, line);
      const existing = runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
      runEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = existing ? existing + ',' + dir : dir;
    }
  }
  if (!hasVariable(runEnv, 'PSExecutionPolicyPreference') && !scriptPolicyChosen(runEnv)) runEnv.PSExecutionPolicyPreference = POLICY_VALUE;
  return { launch, runEnv, compose: c };
}

function run(id, relaunch, env) {
  env = env || process.env;
  const p = paths(env);
  cleanupLaunches(env);
  if (!CC.ID_RE.test(String(id))) throw new Error('bad launch id');
  const dir = path.join(p.launches, id);
  // The tab's phase-2 cmd.exe owns this folder; Copilot may exit while the tab lives on.
  fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.ppid }) + '\n');
  const copilot = resolveCopilot(env);
  if (copilot.missing) {
    console.log('');
    console.log('  Copilot was not found, or this copy cannot be used:');
    for (const m of copilot.problems.length ? copilot.problems : ['Copilot is not installed.']) console.log('    ' + m);
    console.log('  Run the ClaudeCode Launchpad CLI installer again and choose GitHub Copilot.');
    console.log('');
    return 1;
  }
  const pl = plan(id, env, relaunch);
  for (const m of pl.compose.errors.concat(pl.compose.notices)) console.log('  ' + m);
  if (pl.compose.fatal.length) {
    // Starting without the refused option would quietly change what the user asked for.
    console.log('');
    console.log('  Copilot was not started. Change the Copilot options in the folder picker, or COPILOT_FLAGS');
    console.log('  in config.txt, then launch again.');
    console.log('');
    return 1;
  }
  testPause('run-before-start');
  const binDir = copilot.kind === 'npm' ? copilot.prefix : path.dirname(copilot.exe);
  const runEnv = Object.assign({}, pl.runEnv, { PATH: binDir + ';' + (pl.runEnv.PATH || pl.runEnv.Path || '') });
  const file = copilot.kind === 'npm' ? process.execPath : copilot.exe;
  const args = (copilot.kind === 'npm' ? [copilot.loader] : []).concat(pl.compose.args);
  process.on('SIGINT', () => {});   // Ctrl+C belongs to Copilot
  process.on('SIGBREAK', () => {});
  const r = cp.spawnSync(file, args, { cwd: pl.launch.workdir, env: runEnv, stdio: 'inherit', shell: false });
  if (r.error) { console.log('  Copilot could not be started: ' + r.error.message); return 1; }
  return r.status === null ? 1 : r.status;
}

// ---------------------------------------------------------------- installing Copilot (install.cmd /copilot)
function installCopilot(env) {
  env = env || process.env;
  const p = paths(env);
  fs.mkdirSync(p.kivun, { recursive: true });
  const logFile = env.KIVUN_LOG || path.join(p.kivun, 'install-log.txt');
  // An existing copy: use it if new enough; update it only if npm installed it.
  const found = discover(env).filter(c => !needsNewerNode(c, env)).map(c => Object.assign(c, { version: versionOf(c, env) })).filter(c => c.version);
  const good = found.find(c => compareVersions(c.version, MIN_VERSION) >= 0);
  if (good) { say(env, '[Copilot] GitHub Copilot ' + good.version + ' is already installed (' + keyFile(good) + ') - using it.'); return 0; }
  const oldExe = found.find(c => c.kind === 'exe');
  const oldNpm = found.find(c => c.kind === 'npm');
  if (oldExe && !oldNpm) {
    say(env, '[Copilot] GitHub Copilot ' + oldExe.version + ' at ' + oldExe.exe + ' is older than ' + MIN_VERSION + ' and was not installed with npm.');
    say(env, '[Copilot] Launchpad does not change it. Update it the way you installed it, then run this installer again.');
    return 6;
  }
  if (nodeTooOld(nodeVersion(env))) {
    say(env, '[Copilot] ERROR: Node.js ' + nodeVersion(env) + ' is too old for GitHub Copilot (it needs 22 or newer). Update Node.js, then run this installer again.');
    return 6;
  }
  if (oldNpm) say(env, '[Copilot] GitHub Copilot ' + oldNpm.version + ' is older than ' + MIN_VERSION + '. Launchpad will update it now.');
  const npmCmd = npmCommand(env);
  if (!npmCmd) { say(env, '[Copilot] ERROR: npm was not found next to Node.js. Reinstall Node.js, then run this installer again.'); return 6; }
  const prefixArgs = oldNpm ? ['--prefix', oldNpm.prefix] : [];
  say(env, '[Copilot] Downloading GitHub Copilot (about 170 MB). This can take a few minutes - please keep this window open...');
  npm(env, npmCmd, ['install', '-g'].concat(prefixArgs, ['@github/copilot@latest', '--no-fund', '--no-audit']), logFile);
  const c = resolveCopilot(env, { noCache: true });
  if (c.missing) {
    say(env, "[Copilot] ERROR: GitHub Copilot could not be installed. Check the internet connection, then run this installer again. Details: " + logFile);
    for (const m of c.problems) say(env, '[Copilot]   ' + m);
    return 6;
  }
  say(env, '[Copilot] GitHub Copilot ' + c.version + ' installed.');
  return 0;
}

function missingFolder(id) {
  let w = '(unknown)';
  try { w = readLaunch(id).workdir; } catch (e) { /* keep the generic text */ }
  console.log('');
  console.log('  This folder could not be opened:');
  console.log('    ' + w);
  console.log('');
  console.log('  Copilot was NOT started, so nothing opened in the wrong place.');
  console.log('  If it is on a network drive, connect that drive and launch again.');
  console.log('');
  console.log('  Press Enter to close.');
  try { const b = Buffer.alloc(1); while (fs.readSync(0, b, 0, 1) === 1 && b[0] !== 10) { /* wait for Enter */ } } catch (e) { /* no keyboard */ }
  return 1;
}

function prepare(folder, env) {
  env = env || process.env;
  folder = folder || env.KV_FOLDER;
  if (!folder) throw new Error('prepare needs a folder');
  return createLaunch({ agent: 'copilot', workdir: workFolder(folder) }, env);
}

function commit(env) {
  env = env || process.env;
  const c = resolveCopilot(env, { noCache: true });
  if (c.missing) { CC.log(paths(env), 'commit: no usable Copilot: ' + c.problems.join(' | ')); return false; }
  setAgent('copilot', env);
  CC.log(paths(env), 'commit: Copilot ' + c.version + ' selected');
  return true;
}

// ---------------------------------------------------------------- command line
function main(argv) {
  const [mode, a1, a2] = argv;
  switch (mode) {
    case 'install': for (const m of install()) console.log(m); return 0;
    case 'install-copilot': return installCopilot();
    case 'uninstall': uninstall(); return 0;
    case 'commit': return commit() ? 0 : 6;
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
      console.log('usage: node configure-copilot.js install|uninstall|install-copilot|commit|prepare <folder>|info <id> workdir|check <id>|compose <id>|run <id> [--relaunch]');
      return 2;
  }
}

if (require.main === module) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error('configure-copilot: ' + e.message); code = 1; }
  process.exitCode = code;
}

module.exports = {
  MIN_VERSION, MIN_NODE, paths, install, uninstall, findConversation, languageFolder, scriptPolicyChosen,
  npmCandidate, discover, resolveCopilot, launchFromConfig, plan, run, nodeTooOld, installCopilot, prepare, commit, main,
  createLaunch, readLaunch,
};
