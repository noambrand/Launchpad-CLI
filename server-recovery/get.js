// get.js - tiny downloader used by FIX-CLAUDE-ON-THIS-SERVER.cmd
// Old Windows (Server 2012 R2 / 8.1) has no built-in `curl`, but it DOES have
// Node (the installer put it there). So we use Node's https to fetch files,
// following redirects (curl.se's "latest" link and claude.ai both redirect).
// Usage:  node get.js <url> <outputFile>
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');

const url = process.argv[2];
const out = process.argv[3];
if (!url || !out) {
  console.error('usage: node get.js <url> <outputFile>');
  process.exit(2);
}

function download(u, redirectsLeft, cb) {
  if (redirectsLeft < 0) return cb(new Error('too many redirects'));
  const mod = u.startsWith('http://') ? http : https;
  const req = mod.get(u, { headers: { 'User-Agent': 'launchpad-recovery' } }, (res) => {
    // Follow 3xx redirects (curl.se latest.cgi -> versioned zip, etc.)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      const next = new URL(res.headers.location, u).toString();
      return download(next, redirectsLeft - 1, cb);
    }
    if (res.statusCode !== 200) {
      res.resume();
      return cb(new Error('HTTP ' + res.statusCode + ' for ' + u));
    }
    const file = fs.createWriteStream(out);
    res.pipe(file);
    file.on('finish', () => file.close(() => cb(null)));
    file.on('error', cb);
  });
  req.on('error', cb);
  req.setTimeout(120000, () => req.destroy(new Error('timeout')));
}

download(url, 6, (err) => {
  if (err) {
    console.error('download failed: ' + err.message);
    try { fs.unlinkSync(out); } catch (e) {}
    process.exit(1);
  }
  process.exit(0);
});
