// configure-codex.js
// Everything Launchpad does for OpenAI's Codex, in one place (handout D11). Node built-ins only.
//
// Modes (node configure-codex.js <mode> ...):
//   install-codex           install Codex itself for install.cmd /codex: use a compatible copy, update an
//                           older npm copy with notice, never touch another copy, else a pinned npm install
//   install                 add Launchpad's status line and sound hooks to the user's Codex settings,
//                           recording exactly what was added (kivun-codex-changes.json)
//   uninstall               remove only those recorded additions that are still exactly present
//   models [--bundled]      refresh the model list cache (kivun-codex-models.json)
//   set-agent <claude|codex>  the ONLY writer of AGENT in config.txt (D13), one atomic replace (D18)
//   commit                  verify the installed Codex, cache its path, then set-agent codex
//   prepare <folder>        create a launch folder for a right-click / shortcut launch, print its id
//   info <id> workdir       print a launch's work folder (the batch file needs it for the tab)
//   check <id>              exit 0 when the launch's work folder is reachable, 1 when not
//   missing <id>            print the 'folder could not be opened' message and wait for Enter
//   compose <id>            print the exact argument array `run` would start Codex with (JSON)
//   run <id> [--relaunch]   start Codex for a launch: argument array, no shell (D15)
//
// Why one file: the batch launcher must never handle user text for Codex (cmd re-reads quotes, %,
// ! and ^), so composition, validation and starting all happen here, in one tested place.
// Gate 0 facts this relies on are in the handout, section 5.

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const MIN_VERSION = '0.166.0';
const ID_RE = /^[0-9a-f]{32}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOCKET_LIMIT = 108;     // Codex's background-server connection file must be shorter (Gate 0)
const MAX_PATH = 260;         // Node can't start an exe whose full path is longer (Gate 0)
const STATUS_LINE = 'status_line = ["model-with-reasoning","context-used","used-tokens","five-hour-limit","weekly-limit","current-dir"]';
// Codex silently ignores unknown event names, so every name we write is checked against this list.
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PreCompact',
  'PostCompact', 'SubagentStart', 'SubagentStop', 'Stop', 'Interrupt', 'PreModelRequest', 'PostModelRequest', 'SessionEnd'];
// Our two hooks. Q4 was verified at Gate 0 (S8): Stop fires once per completed turn, never on
// interrupt or refusal, so the done hook is installed.
const OUR_HOOKS = [['PermissionRequest', 'permission'], ['Stop', 'done']];
// Same wording as the Claude path (claudecode-launchpad.bat, LANG_PROMPT).
const LANGUAGES = {
  hebrew: 'Hebrew', arabic: 'Arabic', persian: 'Persian (Farsi)', urdu: 'Urdu', kurdish: 'Kurdish', pashto: 'Pashto',
  sindhi: 'Sindhi', yiddish: 'Yiddish', syriac: 'Syriac', dhivehi: 'Dhivehi', nko: "N'Ko", adlam: 'Fulani (Adlam script)',
  mandaic: 'Mandaic', samaritan: 'Samaritan', dari: 'Dari (Afghan Persian)', uyghur: 'Uyghur', balochi: 'Balochi',
  kashmiri: 'Kashmiri', shahmukhi: 'Punjabi (Shahmukhi)', azeri_south: 'South Azerbaijani', jawi: 'Malay (Jawi script)',
  hausa_ajami: 'Hausa (Ajami script)', rohingya: 'Rohingya', turoyo: 'Turoyo (Neo-Aramaic)',
};

// ---------------------------------------------------------------- paths
function paths(env) {
  env = env || process.env;
  const home = env.HOME || env.USERPROFILE;
  const kivun = env.KIVUN_DIR || path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Kivun');
  return {
    home,
    kivun,
    config: path.join(kivun, 'config.txt'),
    changes: path.join(kivun, 'kivun-codex-changes.json'),
    models: path.join(kivun, 'kivun-codex-models.json'),
    pathCache: path.join(kivun, 'kivun-codex-path.txt'),
    langCache: path.join(kivun, 'kivun-codex-langcheck.json'),
    launches: path.join(kivun, 'launch'),
    log: path.join(kivun, 'codex-setup.log'),
    codexHome: env.CODEX_HOME || path.join(home, '.codex'),
    // Forward slashes, like the Claude hooks configure-sound-hooks.js writes.
    play: path.join(home, '.claude', 'sounds', 'play.js').replace(/\\/g, '/'),
  };
}

// ---------------------------------------------------------------- small utilities
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Test-only pause (handout 9.1): when KIVUN_TEST_PAUSE names this step, write <step>.reached and
// wait for <step>.release in KIVUN_TEST_PAUSE_DIR. Ignored when the variable is not set.
function testPause(step) {
  if (process.env.KIVUN_TEST_PAUSE !== step || !process.env.KIVUN_TEST_PAUSE_DIR) return;
  const dir = process.env.KIVUN_TEST_PAUSE_DIR;
  fs.writeFileSync(path.join(dir, step + '.reached'), String(process.pid));
  const until = Date.now() + 60000;
  while (!fs.existsSync(path.join(dir, step + '.release')) && Date.now() < until) sleepSync(50);
}

// Write a temp file beside the target, then rename over it: readers see the old file or the new
// one, never half of either. A busy file (another program has it open) is retried, then left whole.
function atomicWrite(file, data, pauseStep) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  if (pauseStep) testPause(pauseStep);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (i < 5 && /^(EBUSY|EPERM|EACCES)$/.test(e.code)) { sleepSync(200); continue; }
      try { fs.unlinkSync(tmp); } catch (e2) { /* nothing left to clean */ }
      throw e;
    }
  }
}

function readIfExists(file) { try { return fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }

function log(p, line) {
  try { fs.mkdirSync(p.kivun, { recursive: true }); fs.appendFileSync(p.log, new Date().toISOString() + ' ' + line + '\r\n'); } catch (e) { /* logging never blocks */ }
}

function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); }
  return 0;
}

// ---------------------------------------------------------------- config.txt
// Same reading as the batch file: lines starting with # are comments, KEY=value, value may hold "=".
function parseConfig(text) {
  const map = new Map();
  for (const raw of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!raw || raw[0] === '#') continue;
    const i = raw.indexOf('=');
    if (i > 0) map.set(raw.slice(0, i), raw.slice(i + 1));
  }
  return map;
}

// Change one key's value, or append it. Every other byte (BOM, comments, order, line ends) stays.
function setConfigValue(text, key, value) {
  text = text || '';
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = text.slice(bom.length);
  const nl = body.includes('\r\n') ? '\r\n' : (body.includes('\n') ? '\n' : '\r\n');
  const lines = body.split(/(?<=\n)/);
  let done = false;
  const out = lines.map(l => {
    if (done || l[0] === '#') return l;
    const end = (l.match(/\r?\n$/) || [''])[0];
    const content = l.slice(0, l.length - end.length);
    if (content.slice(0, content.indexOf('=')) === key && content.indexOf('=') > 0) { done = true; return key + '=' + value + end; }
    return l;
  });
  let result = out.join('');
  if (!done) {
    if (result && !result.endsWith('\n')) result += nl;
    result += key + '=' + value + nl;
  }
  return bom + result;
}

function effectiveAgent(text) {
  return parseConfig(text).get('AGENT') === 'codex' ? 'codex' : 'claude';
}

// The only writer of AGENT (D13). Writes nothing when the effective agent is already right, so a
// Claude upgrade without an AGENT key leaves config.txt byte-identical (requirement A2).
function setAgent(agent, env) {
  if (agent !== 'claude' && agent !== 'codex') throw new Error('agent must be claude or codex');
  const p = paths(env);
  const text = readIfExists(p.config);
  if (effectiveAgent(text) === agent) return false;
  atomicWrite(p.config, setConfigValue(text, 'AGENT', agent), 'set-agent-before-rename');
  return true;
}

// ---------------------------------------------------------------- flags and startup text
// One tokenizer, used everywhere (handout 7.5): whitespace separates, "..." keeps text together
// and the quotes are removed, nothing else is special.
function tokenize(s) {
  const out = [];
  let cur = '', inQ = false, had = false;
  for (const ch of String(s || '')) {
    if (ch === '"') { inQ = !inQ; had = true; continue; }
    if (!inQ && /\s/.test(ch)) { if (had || cur) out.push(cur); cur = ''; had = false; continue; }
    cur += ch;
  }
  if (inQ) { const e = new Error('A quote mark in the custom options is not closed.'); e.code = 'UNCLOSED_QUOTE'; throw e; }
  if (had || cur) out.push(cur);
  return out;
}

// Codex takes one first message. Entries are joined with a space; a line break or other control
// character, or an entry starting with "/" (a slash command, Q2), is refused.
function startupText(entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).map(e => String(e == null ? '' : e)).map(e => e.trim()).filter(Boolean);
  for (const e of list) {
    if (/[\u0000-\u001f\u007f]/.test(e)) return { text: null, error: 'CONTROL', message: 'The startup message can only be one line.' };
    if (e[0] === '/') return { text: null, error: 'SLASH', message: "Codex can't run commands at startup. Type it yourself once Codex opens." };
  }
  return { text: list.length ? list.join(' ') : null };
}

function languageLine(code) {
  const name = LANGUAGES[String(code || '').toLowerCase()];
  return name ? 'Always respond in ' + name + '.' : null;
}
// A TOML literal string: handles the N'Ko apostrophe and is never parsed as another type.
function languageArg(line) { return "developer_instructions='''" + line + "'''"; }

const isModelFlag = t => t === '-m' || t === '--model' || t.startsWith('--model=');

// Build the exact argument array (D11, D15). Returns { args, errors, notices }.
//   launch: { conv: fresh|last|pick, model, customFlags, codexFlags, startup, language,
//             skipLanguage, noDaemon, relaunch }
function compose(launch) {
  const errors = [], notices = [];
  let user = [];
  try { user = tokenize(launch.codexFlags).concat(tokenize(launch.customFlags)); } catch (e) { errors.push(e.message); user = []; }
  if (user.length && /^(resume|fork)$/i.test(user[0])) {
    errors.push('Choose "continue last" or "pick from history" in the picker instead of typing ' + user[0] + '.');
    user = [];
  }
  const bad = user.filter(t => /^--dangerously-/.test(t) || t === '--yolo');
  if (bad.length) { errors.push('Launchpad does not start Codex with ' + bad.join(' ') + '.'); user = user.filter(t => !bad.includes(t)); }
  for (let i = 0; i < user.length; i++) {
    const t = user[i];
    const v = t === '-a' || t === '--ask-for-approval' ? user[i + 1] : (t.startsWith('--ask-for-approval=') ? t.split('=')[1] : undefined);
    if ((t === '-a' || t === '--ask-for-approval' || t.startsWith('--ask-for-approval=')) && v !== 'on-request' && v !== 'never') {
      errors.push('The approval option (-a) can only be on-request or never.');
    }
  }
  if (user.filter(isModelFlag).length > 1) errors.push('The custom options name a model more than once. Codex will not start with two models.');
  const userModel = user.some(isModelFlag);
  const userInstructions = user.some(t => /developer_instructions\s*=/.test(t));

  const args = [];
  if (launch.noDaemon) args.push('--no-daemon');
  if (launch.conv === 'last') args.push('resume', '--last');
  else if (launch.conv === 'pick') args.push('resume');
  if (launch.model && !userModel) args.push('-m', launch.model);
  const lang = !launch.skipLanguage && !userInstructions ? languageLine(launch.language) : null;
  if (lang) args.push('-c', languageArg(lang));
  args.push(...user);
  if (!launch.relaunch) {
    const st = startupText(launch.startup);
    if (st.error) { errors.push(st.message); notices.push('startup message not sent'); }
    else if (st.text && launch.conv === 'pick') {
      // `codex resume <text>` would read the text as a conversation name.
      notices.push('The startup message is not sent when you pick a conversation from the list.');
    } else if (st.text) {
      if (st.text[0] === '-') args.push('--'); // otherwise Codex reads it as an option (Gate 0: "-h..." shows help)
      args.push(st.text);
    }
  }
  return { args, errors, notices };
}

// ---------------------------------------------------------------- hooks.json
function hookCommand(p, sound) { return 'node "' + p.play + '" ' + sound; }
// The frozen entry (handout section 5): no commandWindows, no matcher, no statusMessage.
function hookGroup(p, sound) { return { hooks: [{ type: 'command', command: hookCommand(p, sound), timeout: 10, async: true }] }; }
function groupHasCommand(g, cmd) { return !!(g && Array.isArray(g.hooks) && g.hooks.some(h => h && h.command === cmd)); }

// Add our missing entries at the end of each event's list (stable positions keep approval).
// Returns { text, added } or { error } for a file that is not a JSON object we can extend.
function ensureHooks(text, p) {
  let obj;
  if (text == null || !text.trim()) obj = { hooks: {} };
  else {
    try { obj = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { return { error: 'hooks.json is not valid JSON; left untouched' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { error: 'hooks.json is not a JSON object; left untouched' };
  }
  if (obj.hooks == null) obj.hooks = {};
  if (typeof obj.hooks !== 'object' || Array.isArray(obj.hooks)) return { error: 'hooks.json "hooks" is not an object; left untouched' };
  const added = [];
  for (const [event, sound] of OUR_HOOKS) {
    if (!HOOK_EVENTS.includes(event)) throw new Error('unknown Codex hook event: ' + event);
    const cmd = hookCommand(p, sound);
    if (obj.hooks[event] != null && !Array.isArray(obj.hooks[event])) return { error: 'hooks.json "' + event + '" is not a list; left untouched' };
    const list = obj.hooks[event] || [];
    if (!list.some(g => groupHasCommand(g, cmd))) { list.push(hookGroup(p, sound)); added.push({ kind: 'hook', event, command: cmd }); }
    obj.hooks[event] = list;
  }
  return { text: added.length ? JSON.stringify(obj, null, 2) + '\n' : text, added };
}

function hookPresent(text, entry) {
  try { const o = JSON.parse(String(text).replace(/^\uFEFF/, '')); return !!(o && o.hooks && Array.isArray(o.hooks[entry.event]) && o.hooks[entry.event].some(g => groupHasCommand(g, entry.command))); } catch (e) { return false; }
}

// Remove our group for one recorded entry, only if it is still exactly our frozen group.
function removeHook(text, entry) {
  const o = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  const list = o.hooks && o.hooks[entry.event];
  if (!Array.isArray(list)) return text;
  const keep = list.filter(g => !(g && Array.isArray(g.hooks) && g.hooks.length === 1 && g.hooks[0].command === entry.command && Object.keys(g).length === 1));
  if (keep.length === list.length) return text;
  if (keep.length) o.hooks[entry.event] = keep; else delete o.hooks[entry.event];
  return JSON.stringify(o, null, 2) + '\n';
}

// ---------------------------------------------------------------- config.toml status line
function tomlTable(line) {
  const m = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
  return m ? m[1].replace(/["']/g, '') : null;
}
function hasStatusLine(text) {
  let table = '';
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = tomlTable(line);
    if (t !== null) { table = t; continue; }
    if (table === 'tui' && /^\s*status_line\s*=/.test(line)) return true;
    if (table === '' && /^\s*["']?tui["']?\s*\.\s*status_line\s*=/.test(line)) return true;
    if (table === '' && /^\s*tui\s*=\s*\{.*status_line/.test(line)) return true;
  }
  return false;
}

// Add the default status line only when the user has none (handout 7.5).
function ensureStatusLine(text) {
  if (hasStatusLine(text)) return { text, added: null };
  text = text || '';
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = text.slice(bom.length);
  const nl = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/(?<=\n)/);
  const i = lines.findIndex(l => tomlTable(l.replace(/\r?\n$/, '')) === 'tui');
  if (i >= 0) {
    if (!/\n$/.test(lines[i])) lines[i] += nl;
    lines.splice(i + 1, 0, STATUS_LINE + nl);
    return { text: bom + lines.join(''), added: { kind: 'status_line', line: STATUS_LINE, table: false } };
  }
  let out = body;
  if (out && !out.endsWith('\n')) out += nl;
  if (out) out += nl;
  out += '[tui]' + nl + STATUS_LINE + nl;
  return { text: bom + out, added: { kind: 'status_line', line: STATUS_LINE, table: true } };
}

function statusLinePresent(text, entry) { return String(text || '').split(/\r?\n/).some(l => l === entry.line); }

function removeStatusLine(text, entry) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const i = lines.indexOf(entry.line);
  if (i < 0) return text;
  lines.splice(i, 1);
  if (entry.table && i > 0 && tomlTable(lines[i - 1]) === 'tui') {
    const next = lines.slice(i).find(l => l.trim() !== '');
    if (next === undefined || tomlTable(next) !== null) {
      lines.splice(i - 1, 1);
      if (i - 2 >= 0 && lines[i - 2] === '') lines.splice(i - 2, 1);
    }
  }
  return lines.join(nl);
}

// ---------------------------------------------------------------- change record
function loadRecord(p) {
  const t = readIfExists(p.changes);
  if (!t) return { version: 1, entries: [] };
  try { const r = JSON.parse(t); if (r && Array.isArray(r.entries)) return r; } catch (e) { /* fall through */ }
  throw new Error('kivun-codex-changes.json is unreadable; nothing changed');
}
function saveRecord(p, r) { fs.mkdirSync(p.kivun, { recursive: true }); atomicWrite(p.changes, JSON.stringify(r, null, 2) + '\n'); }
function targetFile(p, entry) { return path.join(p.codexHome, entry.kind === 'hook' ? 'hooks.json' : 'config.toml'); }
function entryPresent(p, entry) {
  const t = readIfExists(targetFile(p, entry));
  if (t == null) return false;
  return entry.kind === 'hook' ? hookPresent(t, entry) : statusLinePresent(t, entry);
}

// After an interrupted install or uninstall: an intended entry whose text is there counts as
// applied, one whose text is missing is dropped, and an applied entry the user removed is dropped.
function reconcile(p, r) {
  r.entries = r.entries.filter(e => entryPresent(p, e)).map(e => Object.assign(e, { state: 'applied' }));
  return r;
}

// Apply one file's additions in the recorded order: intent, edit, applied (handout 7.5).
function applyWithRecord(p, r, file, newText, added) {
  if (!added.length) return;
  for (const a of added) r.entries.push(Object.assign({ file: path.basename(file) }, a, { state: 'intended' }));
  saveRecord(p, r);
  testPause('install-after-intent');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWrite(file, newText);
  testPause('install-after-edit');
  for (const e of r.entries) if (e.state === 'intended') e.state = 'applied';
  saveRecord(p, r);
}

function install(env) {
  const p = paths(env);
  const r = reconcile(p, loadRecord(p));
  saveRecord(p, r);
  const results = [];
  const cfgFile = path.join(p.codexHome, 'config.toml');
  const st = ensureStatusLine(readIfExists(cfgFile));
  applyWithRecord(p, r, cfgFile, st.text, st.added ? [st.added] : []);
  results.push(st.added ? 'status line added' : 'status line already set by the user; left as is');
  const hooksFile = path.join(p.codexHome, 'hooks.json');
  const hk = ensureHooks(readIfExists(hooksFile), p);
  if (hk.error) { results.push(hk.error); log(p, 'install: ' + hk.error); }
  else { applyWithRecord(p, r, hooksFile, hk.text, hk.added); results.push(hk.added.length ? hk.added.length + ' sound hook(s) added' : 'sound hooks already present'); }
  log(p, 'install: ' + results.join('; '));
  return results;
}

function uninstall(env) {
  const p = paths(env);
  const r = reconcile(p, loadRecord(p));
  saveRecord(p, r);
  for (const e of r.entries.slice()) {
    const file = targetFile(p, e);
    const t = readIfExists(file);
    if (t != null) atomicWrite(file, e.kind === 'hook' ? removeHook(t, e) : removeStatusLine(t, e));
    testPause('uninstall-between');
    r.entries = r.entries.filter(x => x !== e);
    saveRecord(p, r);
  }
  log(p, 'uninstall: done');
}

// ---------------------------------------------------------------- finding and checking Codex
function triple(arch) { return arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'; }
function hostArch(env) { return /arm64/i.test(env.PROCESSOR_ARCHITEW6432 || env.PROCESSOR_ARCHITECTURE || '') ? 'arm64' : 'x64'; }

// npm prefix folder -> the codex.js entry point and the native exe npm put beside it.
function npmCandidate(prefix, env) {
  const codexJs = path.join(prefix, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (!fs.existsSync(codexJs)) return null;
  const arch = hostArch(env);
  const nativeExe = path.join(prefix, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-' + arch, 'vendor', triple(arch), 'bin', 'codex.exe');
  return { kind: 'npm', codexJs, nativeExe, prefix };
}

function versionOf(c, env) {
  const file = c.kind === 'npm' ? process.execPath : c.exe;
  const args = c.kind === 'npm' ? [c.codexJs, '--version'] : ['--version'];
  const r = cp.spawnSync(file, args, { encoding: 'utf8', timeout: 30000, windowsHide: true, env });
  const m = String(r.stdout || '').match(/codex-cli\s+(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function discover(env) {
  const found = [];
  const w = cp.spawnSync('where.exe', ['codex'], { encoding: 'utf8', windowsHide: true, env });
  for (const line of String(w.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (/\.cmd$/i.test(line)) { const c = npmCandidate(path.dirname(line), env); if (c) found.push(c); }
    else if (/\.exe$/i.test(line)) found.push({ kind: 'exe', exe: line });
  }
  const standalone = path.join(env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  if (env.LOCALAPPDATA && fs.existsSync(standalone)) found.push({ kind: 'exe', exe: standalone });
  if (!found.length) {
    const r = cp.spawnSync(env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm prefix -g'], { encoding: 'utf8', windowsHide: true, timeout: 30000, env });
    const prefix = String(r.stdout || '').trim().split(/\r?\n/).pop();
    if (prefix) { const c = npmCandidate(prefix, env); if (c) found.push(c); }
  }
  const seen = new Set();
  return found.filter(c => { const k = (c.codexJs || c.exe).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function fileStamp(f) { try { const s = fs.statSync(f); return { size: s.size, mtime: s.mtimeMs }; } catch (e) { return null; } }
function cacheKeyFile(c) { return c.kind === 'npm' ? c.nativeExe : c.exe; }

// The path cache is never authority (D18): trusted only while the file still has the same size
// and time; otherwise Codex is found again and checked with --version.
function resolveCodex(env, opts) {
  env = env || process.env;
  opts = opts || {};
  const p = paths(env);
  if (!opts.noCache) {
    try {
      const c = JSON.parse(fs.readFileSync(p.pathCache, 'utf8'));
      const now = fileStamp(cacheKeyFile(c));
      if (now && c.stamp && now.size === c.stamp.size && now.mtime === c.stamp.mtime) return c;
    } catch (e) { /* no usable cache */ }
  }
  const problems = [];
  for (const c of discover(env)) {
    const exe = cacheKeyFile(c);
    if (exe && exe.length >= MAX_PATH) { problems.push('The Codex folder path is too long for Windows (' + exe.length + ' characters): ' + exe); continue; }
    const v = versionOf(c, env);
    if (!v) { problems.push('Codex at ' + (c.codexJs || c.exe) + ' did not start.'); continue; }
    if (compareVersions(v, MIN_VERSION) < 0) { problems.push('Codex ' + v + ' at ' + (c.codexJs || c.exe) + ' is older than ' + MIN_VERSION + '.'); continue; }
    const out = Object.assign({}, c, { version: v, stamp: fileStamp(exe) });
    try { fs.mkdirSync(p.kivun, { recursive: true }); atomicWrite(p.pathCache, JSON.stringify(out, null, 2) + '\n'); } catch (e) { /* cache is optional */ }
    return out;
  }
  return { missing: true, problems };
}

// ---------------------------------------------------------------- models
function parseModels(text) {
  const j = JSON.parse(text);
  const list = Array.isArray(j) ? j : (j.models || j.data || []);
  if (!Array.isArray(list)) throw new Error('unexpected model list');
  return list.filter(m => m && m.visibility === 'list' && m.slug).map(m => ({ slug: m.slug, name: m.display_name || m.slug }));
}

function refreshModels(env, bundled) {
  env = env || process.env;
  const p = paths(env);
  const c = resolveCodex(env);
  if (c.missing) return false;
  const file = c.kind === 'npm' ? process.execPath : c.exe;
  const args = (c.kind === 'npm' ? [c.codexJs] : []).concat(['debug', 'models'], bundled ? ['--bundled'] : []);
  const r = cp.spawnSync(file, args, { encoding: 'utf8', timeout: 30000, windowsHide: true, env });
  let models;
  try { models = parseModels(r.stdout); } catch (e) { log(p, 'models: refresh failed, previous list kept'); return false; }
  if (!models.length) { log(p, 'models: empty list, previous list kept'); return false; }
  atomicWrite(p.models, JSON.stringify({ source: bundled ? 'bundled' : 'online', at: new Date().toISOString(), models }, null, 2) + '\n');
  return true;
}

// ---------------------------------------------------------------- existing developer instructions
// User instructions = a text item, in the developer message that carries Codex's tagged blocks,
// that is not itself a tagged block (Gate 0, S16).
function promptInputHasUserInstructions(json) {
  const arr = Array.isArray(json) ? json : (json.input || json.items || []);
  for (const m of arr) {
    if (!m || m.role !== 'developer') continue;
    const texts = (m.content || []).map(c => (c && c.text) || '');
    if (!texts.some(t => t.trim().startsWith('<'))) continue;
    if (texts.some(t => t.trim() && !t.trim().startsWith('<'))) return true;
  }
  return false;
}
function tomlHasInstructions(text) { return /^\s*developer_instructions\s*=/m.test(String(text || '')); }
function gitRoot(dir) {
  let d = path.resolve(dir);
  for (;;) { if (fs.existsSync(path.join(d, '.git'))) return d; const up = path.dirname(d); if (up === d) return null; d = up; }
}

// true when Launchpad must NOT add its language line. Any doubt counts as true (Q1).
function hasExistingInstructions(launch, env, codex, userTokens) {
  const p = paths(env);
  const files = [path.join(p.codexHome, 'config.toml'), path.join(launch.workdir, '.codex', 'config.toml')];
  const root = gitRoot(launch.workdir);
  if (root) files.push(path.join(root, '.codex', 'config.toml'));
  userTokens.forEach((t, i) => { if ((t === '-p' || t === '--profile') && userTokens[i + 1]) files.push(path.join(p.codexHome, userTokens[i + 1] + '.config.toml')); });
  const key = crypto.createHash('sha256').update(JSON.stringify({ w: launch.workdir, h: p.codexHome, t: userTokens, f: files.map(f => [f, fileStamp(f)]) })).digest('hex');
  try { const c = JSON.parse(fs.readFileSync(p.langCache, 'utf8')); if (c.key === key) return c.skip; } catch (e) { /* recompute */ }
  let skip = files.some(f => tomlHasInstructions(readIfExists(f)));
  if (!skip && codex && !codex.missing) {
    const passthrough = [];
    userTokens.forEach((t, i) => { if (t === '-c' || t === '--enable' || t === '--disable') passthrough.push(t, userTokens[i + 1]); });
    const file = codex.kind === 'npm' ? process.execPath : codex.exe;
    const args = (codex.kind === 'npm' ? [codex.codexJs] : []).concat(['--no-daemon', 'debug', 'prompt-input'], passthrough, ['hi']);
    const r = cp.spawnSync(file, args, { cwd: launch.workdir, encoding: 'utf8', timeout: 5000, windowsHide: true, env });
    try { skip = promptInputHasUserInstructions(JSON.parse(r.stdout)); } catch (e) { skip = true; }
  }
  try { atomicWrite(p.langCache, JSON.stringify({ key, skip }) + '\n'); } catch (e) { /* cache is optional */ }
  return skip;
}

// ---------------------------------------------------------------- launch folders
function launchDir(p, id) {
  if (!ID_RE.test(String(id))) throw new Error('bad launch id');
  return path.join(p.launches, id);
}
function createLaunch(data, env) {
  const p = paths(env);
  fs.mkdirSync(p.launches, { recursive: true });
  for (;;) {
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(p.launches, id);
    try { fs.mkdirSync(dir); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    atomicWrite(path.join(dir, 'launch.json'), JSON.stringify(data, null, 2) + '\n');
    return id;
  }
}
function readLaunch(id, env) { return JSON.parse(fs.readFileSync(path.join(launchDir(paths(env), id), 'launch.json'), 'utf8')); }
function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// Delete a launch folder only when it is over 24 hours old AND its owning tab (the phase-2
// cmd.exe recorded in owner.json) is gone. A tab open for days is never touched.
function cleanupLaunches(env, now) {
  const p = paths(env);
  now = now || Date.now();
  let names = [];
  try { names = fs.readdirSync(p.launches); } catch (e) { return 0; }
  let removed = 0;
  for (const n of names) {
    if (!ID_RE.test(n)) continue;
    const dir = path.join(p.launches, n);
    let st; try { st = fs.statSync(dir); } catch (e) { continue; }
    if (now - st.mtimeMs < DAY_MS) continue;
    let pid = 0;
    try { pid = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')).pid; } catch (e) { pid = 0; }
    if (pid && isAlive(pid)) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); removed++; } catch (e) { /* retried next launch */ }
  }
  return removed;
}

function launchFromConfig(launch, env) {
  const cfg = parseConfig(readIfExists(paths(env).config));
  return Object.assign({
    conv: 'fresh', model: null, customFlags: '',
    startup: cfg.get('CODEX_STARTUP_CMD') ? [cfg.get('CODEX_STARTUP_CMD')] : [],
  }, launch, {
    codexFlags: cfg.get('CODEX_FLAGS') || '',
    language: cfg.get('RESPONSE_LANGUAGE') || 'english',
  });
}

function socketPath(env) { return path.join(paths(env).codexHome, 'app-server-control', 'app-server-control.sock'); }

// Everything `run` decides, without starting anything: used by `compose` (picker preview, tests)
// and by `run`, so the preview always matches what starts.
function plan(id, env, relaunch, codex) {
  const launch = launchFromConfig(readLaunch(id, env), env);
  const runEnv = Object.assign({}, env, launch.env || {});
  let userTokens = [];
  try { userTokens = tokenize(launch.codexFlags).concat(tokenize(launch.customFlags)); } catch (e) { userTokens = []; }
  const wantsLanguage = !!languageLine(launch.language);
  const skipLanguage = wantsLanguage ? hasExistingInstructions(launch, runEnv, codex, userTokens) : false;
  const noDaemon = socketPath(runEnv).length >= SOCKET_LIMIT;
  const c = compose(Object.assign({}, launch, { skipLanguage, noDaemon, relaunch: !!relaunch }));
  if (skipLanguage) c.notices.push('Your Codex settings already contain your own instructions, so Launchpad didn\'t add the language line. Codex follows your instructions.');
  if (noDaemon) c.notices.push('Codex runs without its background server: its settings folder path is too long for it.');
  return { launch, runEnv, compose: c };
}

function run(id, relaunch, env) {
  env = env || process.env;
  const p = paths(env);
  cleanupLaunches(env);
  const dir = launchDir(p, id);
  // The tab's phase-2 cmd.exe owns this folder; Codex may exit while the tab lives on.
  fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.ppid }) + '\n');
  const codex = resolveCodex(env);
  if (codex.missing) {
    console.log('');
    console.log('  Codex was not found, or this copy cannot be used:');
    for (const m of codex.problems.length ? codex.problems : ['Codex is not installed.']) console.log('    ' + m);
    console.log('  Run the ClaudeCode Launchpad CLI installer again and choose Codex.');
    console.log('');
    return 1;
  }
  const pl = plan(id, env, relaunch, codex);
  for (const m of pl.compose.errors.concat(pl.compose.notices)) console.log('  ' + m);
  testPause('run-before-start');
  // Refresh the model list in the background; never delays the start.
  try { cp.spawn(process.execPath, [__filename, 'models'], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref(); } catch (e) { /* optional */ }
  const binDir = codex.kind === 'npm' ? codex.prefix : path.dirname(codex.exe);
  const runEnv = Object.assign({}, pl.runEnv, { PATH: binDir + ';' + (pl.runEnv.PATH || pl.runEnv.Path || '') });
  const file = codex.kind === 'npm' ? process.execPath : codex.exe;
  const args = (codex.kind === 'npm' ? [codex.codexJs] : []).concat(pl.compose.args);
  process.on('SIGINT', () => {});   // Ctrl+C belongs to Codex
  process.on('SIGBREAK', () => {});
  const r = cp.spawnSync(file, args, { cwd: pl.launch.workdir, env: runEnv, stdio: 'inherit', shell: false });
  if (r.error) { console.log('  Codex could not be started: ' + r.error.message); return 1; }
  return r.status === null ? 1 : r.status;
}

// ---------------------------------------------------------------- installing Codex (install.cmd /codex)
// Plain-language progress goes to the screen and to install-log.txt; npm's own noise to the log only.
function say(env, line) {
  console.log(line);
  try { fs.appendFileSync(env.KIVUN_LOG || path.join(paths(env).kivun, 'install-log.txt'), line + '\r\n'); } catch (e) { /* screen still has it */ }
}

function nodeTooOld(version) { return compareVersions(String(version).replace(/^v/, ''), '16.0.0') < 0; }

function npmCommand(env) {
  const beside = path.join(path.dirname(process.execPath), 'npm.cmd');
  if (fs.existsSync(beside)) return beside;
  const w = cp.spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8', windowsHide: true, env });
  return String(w.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null;
}

// npm.cmd needs cmd to run. Every argument here is ours (package names, versions, a folder), never user text.
function npm(env, npmCmd, args, logFile) {
  const q = s => '"' + s + '"';
  const line = '/d /s /c "' + [q(npmCmd)].concat(args.map(q)).join(' ') + (logFile ? ' >>' + q(logFile) + ' 2>&1' : '') + '"';
  return cp.spawnSync(env.ComSpec || 'cmd.exe', [line], { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, env, timeout: 30 * 60 * 1000 });
}

// The newest stable version >= MIN_VERSION whose Windows package for this PC is published (D14).
// `exists(version)` answers whether @openai/codex@<version>-win32-<arch> is on the registry.
function chooseVersion(versions, exists) {
  const stable = versions.filter(v => /^\d+\.\d+\.\d+$/.test(v) && compareVersions(v, MIN_VERSION) >= 0)
    .sort((a, b) => compareVersions(b, a)).slice(0, 8);
  for (const v of stable) if (exists(v)) return v;
  return null;
}

function installCodex(env) {
  env = env || process.env;
  const p = paths(env);
  fs.mkdirSync(p.kivun, { recursive: true });
  const logFile = env.KIVUN_LOG || path.join(p.kivun, 'install-log.txt');
  if (nodeTooOld(process.version)) {
    say(env, '[Codex] ERROR: Node.js ' + process.version + ' is too old for Codex (it needs 16 or newer). Update Node.js, then run this installer again.');
    return 5;
  }
  const arch = hostArch(env);
  // An existing copy: use it if new enough; update it only if npm installed it (Q5).
  const found = discover(env).map(c => Object.assign(c, { version: versionOf(c, env) })).filter(c => c.version);
  const good = found.find(c => compareVersions(c.version, MIN_VERSION) >= 0 && (cacheKeyFile(c) || '').length < MAX_PATH);
  if (good) { say(env, '[Codex] Codex ' + good.version + ' is already installed (' + (good.codexJs || good.exe) + ') - using it.'); return 0; }
  const oldExe = found.find(c => c.kind === 'exe');
  const oldNpm = found.find(c => c.kind === 'npm');
  if (oldExe && !oldNpm) {
    say(env, '[Codex] Codex ' + oldExe.version + ' at ' + oldExe.exe + ' is older than ' + MIN_VERSION + ' and was not installed with npm.');
    say(env, '[Codex] Launchpad does not change it. Update it the way you installed it, then run this installer again.');
    return 5;
  }
  if (oldNpm) say(env, '[Codex] Codex ' + oldNpm.version + ' is older than ' + MIN_VERSION + '. Launchpad will update it now.');
  const npmCmd = npmCommand(env);
  if (!npmCmd) { say(env, '[Codex] ERROR: npm was not found next to Node.js. Reinstall Node.js, then run this installer again.'); return 5; }
  // Pick the version: the newest one whose Windows package exists (npm can publish "latest" first).
  const view = args => { const r = npm(env, npmCmd, ['view'].concat(args, ['--json'])); try { return JSON.parse(r.stdout); } catch (e) { return undefined; } };
  const versions = view(['@openai/codex', 'versions']);
  if (!Array.isArray(versions)) {
    say(env, "[Codex] ERROR: couldn't reach the npm registry to download Codex. Check the internet connection, then run this installer again.");
    return 5;
  }
  const version = chooseVersion(versions, v => typeof view(['@openai/codex@' + v + '-win32-' + arch, 'version']) === 'string');
  if (!version) { say(env, '[Codex] ERROR: no Codex version ' + MIN_VERSION + ' or newer has a Windows package yet. Try again later.'); return 5; }
  const prefixArgs = oldNpm ? ['--prefix', oldNpm.prefix] : [];
  say(env, '[Codex] Downloading Codex ' + version + ' (about 500 MB). This can take several minutes - please keep this window open...');
  let r = npm(env, npmCmd, ['install', '-g'].concat(prefixArgs, ['@openai/codex@' + version, '--no-fund', '--no-audit']), logFile);
  let c = resolveCodex(env, { noCache: true });
  if (c.missing || compareVersions(c.version, version) < 0) {
    // Known Windows npm failure: the optional Windows package is skipped. Install the pinned pair explicitly.
    say(env, '[Codex] The Windows part of Codex was not installed. Retrying with it named explicitly...');
    r = npm(env, npmCmd, ['install', '-g'].concat(prefixArgs, ['@openai/codex@' + version,
      '@openai/codex-win32-' + arch + '@npm:@openai/codex@' + version + '-win32-' + arch, '--no-fund', '--no-audit']), logFile);
    c = resolveCodex(env, { noCache: true });
  }
  if (c.missing) {
    say(env, '[Codex] ERROR: Codex could not be installed. Details: ' + logFile);
    for (const m of c.problems) say(env, '[Codex]   ' + m);
    return 5;
  }
  say(env, '[Codex] Codex ' + c.version + ' installed.');
  return 0;
}

// The launcher's message when the chosen folder can't be reached (it names the folder, so Node
// prints it rather than cmd). Never opens Codex somewhere the user didn't choose.
function missingFolder(id) {
  let w = '(unknown)';
  try { w = readLaunch(id).workdir; } catch (e) { /* keep the generic text */ }
  console.log('');
  console.log('  This folder could not be opened:');
  console.log('    ' + w);
  console.log('');
  console.log('  Codex was NOT started, so nothing opened in the wrong place.');
  console.log('  If it is on a network drive, connect that drive and launch again.');
  console.log('');
  console.log('  Press Enter to close.');
  try { const b = Buffer.alloc(1); while (fs.readSync(0, b, 0, 1) === 1 && b[0] !== 10) { /* wait for Enter */ } } catch (e) { /* no keyboard */ }
  return 1;
}

function prepare(folder, env) {
  if (!folder) throw new Error('prepare needs a folder');
  return createLaunch({ agent: 'codex', workdir: folder }, env);
}

function commit(env) {
  env = env || process.env;
  testPause('commit-before-cache');
  const c = resolveCodex(env, { noCache: true });
  if (c.missing) { log(paths(env), 'commit: no usable Codex: ' + c.problems.join(' | ')); return false; }
  testPause('commit-before-agent');
  setAgent('codex', env);
  log(paths(env), 'commit: Codex ' + c.version + ' selected');
  return true;
}

// ---------------------------------------------------------------- command line
function main(argv) {
  const [mode, a1, a2] = argv;
  switch (mode) {
    case 'install': for (const m of install()) console.log(m); return 0;
    case 'install-codex': return installCodex();
    case 'uninstall': uninstall(); return 0;
    case 'models': return refreshModels(process.env, a1 === '--bundled') ? 0 : 1;
    case 'set-agent': setAgent(a1); return 0;
    case 'commit': return commit() ? 0 : 5;
    case 'prepare': process.stdout.write(prepare(a1) + '\n'); return 0;
    case 'info': {
      if (a2 !== 'workdir') throw new Error('info supports only: workdir');
      process.stdout.write(readLaunch(a1).workdir + '\n'); return 0;
    }
    case 'compose': {
      const pl = plan(a1, process.env, a2 === '--relaunch', resolveCodex(process.env));
      process.stdout.write(JSON.stringify({ args: pl.compose.args, errors: pl.compose.errors, notices: pl.compose.notices }) + '\n');
      return 0;
    }
    case 'run': return run(a1, a2 === '--relaunch');
    case 'check': { let w; try { w = readLaunch(a1).workdir; } catch (e) { return 1; } try { return fs.statSync(w).isDirectory() ? 0 : 1; } catch (e) { return 1; } }
    case 'missing': return missingFolder(a1);
    default:
      console.log('usage: node configure-codex.js install|uninstall|models [--bundled]|set-agent <claude|codex>|commit|prepare <folder>|info <id> workdir|compose <id>|run <id> [--relaunch]');
      return 2;
  }
}

if (require.main === module) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error('configure-codex: ' + e.message); code = 1; }
  process.exitCode = code;
}

module.exports = {
  MIN_VERSION, STATUS_LINE, HOOK_EVENTS, LANGUAGES, ID_RE,
  paths, atomicWrite, compareVersions, parseConfig, setConfigValue, effectiveAgent, setAgent,
  tokenize, startupText, languageLine, languageArg, compose,
  hookCommand, hookGroup, ensureHooks, hookPresent, removeHook,
  hasStatusLine, ensureStatusLine, statusLinePresent, removeStatusLine,
  loadRecord, reconcile, install, uninstall,
  npmCandidate, discover, resolveCodex, parseModels, refreshModels,
  promptInputHasUserInstructions, tomlHasInstructions, gitRoot, hasExistingInstructions,
  createLaunch, readLaunch, cleanupLaunches, launchFromConfig, socketPath, plan, run, prepare, commit, main,
  nodeTooOld, chooseVersion, installCodex,
};
