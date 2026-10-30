// Runs every source/test/UT_*.js file with Node's built-in test runner (node:test) and exits
// nonzero if any test fails. Called by RunUT.cmd. Lists the files itself, because `node --test`
// only expands wildcards from Node 21 on and the suite must run on Node 18 too.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const files = fs.readdirSync(__dirname).filter(n => /^UT_.*\.js$/.test(n)).sort().map(n => path.join(__dirname, n));
if (files.length === 0) { console.error('No UT_*.js files in ' + __dirname); process.exit(1); }
const r = cp.spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', windowsHide: true });
process.exit(r.status === null ? 1 : r.status);
