// The 12 Claude setups of the golden comparison (handout 9.2), plus the cmd fallback.
// Each case writes what the installer or the picker would have written, then names the
// launcher's arguments. Hand-off files are UTF-8 without BOM, as folder-picker.hta writes them.
'use strict';
const fs = require('fs'), path = require('path');
const { SOURCE } = require('./harness');

const TEMPLATE = fs.readFileSync(path.join(SOURCE, 'config.txt'), 'utf8');
function config(d, values) {
  let t = TEMPLATE;
  for (const [k, v] of Object.entries(values || {})) {
    const re = new RegExp('^' + k + '=.*$', 'm');
    if (!re.test(t)) throw new Error('config key not in template: ' + k);
    t = t.replace(re, k + '=' + v);
  }
  fs.writeFileSync(path.join(d.kivun, 'config.txt'), t);
}
const write = (d, name, text) => fs.writeFileSync(path.join(d.kivun, name), text, 'utf8');
function folder(d, name) { const p = path.join(d.work, name); fs.mkdirSync(p, { recursive: true }); return p; }
const PROJECT = 'my-project';
const HEBREW = 'פרויקט בעברית'; // "Hebrew project"

module.exports = [
  { id: 'G01-right-click', setup: d => config(d), args: d => [folder(d, PROJECT)] },
  { id: 'G02-picker', setup: d => { config(d); write(d, 'kivun-workdir.txt', folder(d, PROJECT)); }, args: () => ['READFILE'] },
  { id: 'G03-hebrew-language', setup: d => config(d, { RESPONSE_LANGUAGE: 'hebrew' }), args: d => [folder(d, PROJECT)] },
  { id: 'G04-claude-flags', setup: d => config(d, { CLAUDE_FLAGS: '--model opus --verbose' }), args: d => [folder(d, PROJECT)] },
  { id: 'G05-continue-no-history', env: { STANDIN_FAIL_ON: '--continue' },
    setup: d => { config(d); write(d, 'kivun-workdir.txt', folder(d, PROJECT)); write(d, 'kivun-claude-flags.txt', '--continue'); }, args: () => ['READFILE'] },
  { id: 'G06-resume-picker', setup: d => { config(d); write(d, 'kivun-workdir.txt', folder(d, PROJECT)); write(d, 'kivun-claude-flags.txt', '--resume'); }, args: () => ['READFILE'] },
  { id: 'G07-profile-env', setup: d => { config(d); write(d, 'kivun-workdir.txt', folder(d, PROJECT)); write(d, 'kivun-env.txt', 'MY_VAR=hello world\r\nSECOND=2\r\n'); }, args: () => ['READFILE'] },
  { id: 'G08-picker-startup', setup: d => { config(d); write(d, 'kivun-workdir.txt', folder(d, PROJECT)); write(d, 'kivun-claude-startcmd.txt', '/status'); }, args: () => ['READFILE'] },
  { id: 'G09-config-startup', setup: d => config(d, { STARTUP_CMD: '/help' }), args: d => [folder(d, PROJECT)] },
  { id: 'G10-auto-continue', setup: d => config(d, { AUTO_CONTINUE: 'true' }), args: d => [folder(d, PROJECT)] },
  { id: 'G11-drive-root', setup: d => config(d), args: d => [(process.env.SystemDrive || 'C:') + '\\'] },
  { id: 'G12-hebrew-folder', setup: d => config(d, { RESPONSE_LANGUAGE: 'hebrew' }), args: d => [folder(d, HEBREW)] },
  { id: 'G13-cmd-fallback', mode: 'fallback', setup: d => config(d), args: d => [folder(d, PROJECT)] },
];
