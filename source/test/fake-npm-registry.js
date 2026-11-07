// A tiny npm registry for tests, on a local port. Real npm talks to it, so the install code runs for real
// and nothing is downloaded from the internet. It runs as its own process because the tests block on
// spawnSync while npm runs.
//
//   node fake-npm-registry.js <spec.json> <port file> <request log>
//
// The spec is read again on every request, so a test can change the registry by rewriting the file:
//   { "packages": { "<name>": { "latest": "1.0.0", "versions": { "1.0.0": {
//       "files": { "<path in the package>": "<text>" }, "bin": {...}, "optionalDependencies": {...}, "broken": true } } } } }
// "broken" makes the version's download answer 500, while the registry still lists it.
'use strict';
const fs = require('fs'), http = require('http'), zlib = require('zlib'), crypto = require('crypto');
const [specFile, portFile, requestLog] = process.argv.slice(2);

function tarball(name, version, v) {
  const manifest = { name, version };
  if (v.bin) manifest.bin = v.bin;
  if (v.optionalDependencies) manifest.optionalDependencies = v.optionalDependencies;
  const files = Object.assign({ 'package.json': JSON.stringify(manifest) }, v.files || {});
  const blocks = [];
  for (const [file, body] of Object.entries(files)) {
    const data = Buffer.from(body);
    const h = Buffer.alloc(512);
    h.write('package/' + file, 0, 100);
    h.write('0000755\0', 100);
    h.write('0000000\0', 108);
    h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write('00000000000\0', 136);
    h.write('        ', 148);
    h.write('0', 156);
    h.write('ustar\0' + '00', 257);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

const server = http.createServer((req, res) => {
  fs.appendFileSync(requestLog, req.url + '\n');
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  if (spec.hang) return;   // a blocked network: the request is accepted and never answered
  const send = (status, type, body) => { res.writeHead(status, { 'content-type': type }); res.end(body); };
  const tgz = req.url.match(/^\/tarball\/([^/]+)\/([^/]+)\.tgz$/);
  if (tgz) {
    const name = decodeURIComponent(tgz[1]), version = decodeURIComponent(tgz[2]);
    const v = spec.packages[name] && spec.packages[name].versions[version];
    if (!v || v.broken) return send(500, 'text/plain', 'broken');
    return send(200, 'application/octet-stream', tarball(name, version, v));
  }
  const name = decodeURIComponent(req.url.slice(1).split('?')[0]);
  const pkg = spec.packages[name];
  if (!pkg) return send(404, 'application/json', JSON.stringify({ error: 'not found' }));
  const versions = {};
  for (const [version, v] of Object.entries(pkg.versions)) {
    const entry = { name, version, dist: {
      tarball: 'http://' + req.headers.host + '/tarball/' + encodeURIComponent(name) + '/' + encodeURIComponent(version) + '.tgz',
      shasum: crypto.createHash('sha1').update(tarball(name, version, v)).digest('hex'),
    } };
    if (v.bin) entry.bin = v.bin;
    if (v.optionalDependencies) entry.optionalDependencies = v.optionalDependencies;
    versions[version] = entry;
  }
  send(200, 'application/json', JSON.stringify({ name, 'dist-tags': { latest: pkg.latest }, versions }));
});

server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(portFile, String(server.address().port));
});
setTimeout(() => process.exit(0), 15 * 60 * 1000).unref();   // never outlives a test run that crashed
