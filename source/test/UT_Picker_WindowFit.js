// v3.5.1: the picker window shows everything down to the Launch button, with no scroll bar.
// Two parts, run here in Node with fake windows:
// - webview-shim.js: the host converts the page's CSS pixels with the form's DeviceDpi, which reads 96
//   at 125% or 150% display scaling, so the window came out 1/devicePixelRatio too small. The shim
//   now notices that once and converts itself; a host that converts is left alone.
// - autoSizeToContent() in folder-picker.hta: the collapsed window is tall enough for the Launch
//   button (the profile row and the agent choice push it below the old fixed 690), never past the
//   screen and never below 690.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

const SOURCE = process.env.KIVUN_SOURCE || path.resolve(__dirname, '..');
const SHIM = path.join(SOURCE, 'webview-shim.js');
const SHIM_APP = path.join(SOURCE, '..', 'picker-app', 'webview-shim.js');
const HTA = path.join(SOURCE, 'folder-picker.hta');

// The shim in a fake WebView2 page. hostScale: what the host multiplies by (1 = DeviceDpi reads 96).
function shimPage(opts) {
  const calls = [], timers = [];
  const win = {
    devicePixelRatio: opts.dpr, innerHeight: 0,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    chrome: { webview: { hostObjects: { sync: { host: {
      SizeAndCenter: (w, h) => { calls.push([w, h]); win.innerHeight = opts.laidOut === false ? 0 : Math.round(h * opts.hostScale / opts.dpr); },
    } } } } },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, chrome: win.chrome });
  vm.runInContext(fs.readFileSync(SHIM, 'utf8'), ctx, { filename: 'webview-shim.js' });
  return { win, calls, runTimers: () => { const t = timers.splice(0); t.forEach(fn => fn()); } };
}

test('UT_PickerFit_ShimCopiesIdentical: the shipped shim and the picker-app shim are the same file', () => {
  assert.ok(fs.readFileSync(SHIM).equals(fs.readFileSync(SHIM_APP)), 'source\\webview-shim.js and picker-app\\webview-shim.js differ');
});

test('UT_PickerFit_HostDoesNotScale: at 125% the shim asks again at 1.25x once, then keeps converting', () => {
  const p = shimPage({ dpr: 1.25, hostScale: 1 });
  p.win.resizeTo(1040, 690);
  assert.deepStrictEqual(p.calls, [[1040, 690]]);
  assert.strictEqual(p.win.innerHeight, 552, 'the window came out 1/1.25 too small, as on the real host');
  p.runTimers();
  assert.deepStrictEqual(p.calls[1], [1300, 863], 'asked again in physical pixels');
  p.win.resizeTo(1040, 800);
  assert.deepStrictEqual(p.calls[2], [1300, 1000], 'later sizes are converted too');
  p.runTimers();
  assert.strictEqual(p.calls.length, 3, 'checked only once');
});

test('UT_PickerFit_HostScales: a host that converts gets the full height and is left alone', () => {
  const p = shimPage({ dpr: 1.25, hostScale: 1.25 });
  p.win.resizeTo(1040, 690);
  p.runTimers();
  p.win.resizeTo(1040, 800);
  assert.deepStrictEqual(p.calls, [[1040, 690], [1040, 800]]);
});

test('UT_PickerFit_NoScaling: at 100% nothing changes', () => {
  const p = shimPage({ dpr: 1, hostScale: 1 });
  p.win.resizeTo(1040, 690);
  p.runTimers();
  p.win.resizeTo(1040, 760);
  assert.deepStrictEqual(p.calls, [[1040, 690], [1040, 760]]);
});

test('UT_PickerFit_150Percent: at 150% the shim asks again at 1.5x', () => {
  const p = shimPage({ dpr: 1.5, hostScale: 1 });
  p.win.resizeTo(1040, 690);
  p.runTimers();
  assert.deepStrictEqual(p.calls[1], [1560, 1035]);
});

test('UT_PickerFit_NotLaidOutYet: no height yet means no decision; the next resize checks again', () => {
  const p = shimPage({ dpr: 1.25, hostScale: 1, laidOut: false });
  p.win.resizeTo(1040, 690);
  p.runTimers();
  assert.deepStrictEqual(p.calls, [[1040, 690]], 'nothing decided while the page has no height');
  p.win.innerHeight = 552;
  p.win.resizeTo(1040, 690);
  p.win.innerHeight = 552;
  p.runTimers();
  assert.deepStrictEqual(p.calls[2], [1300, 863]);
});

// autoSizeToContent() from the HTA, alone, with a fake page.
function fitFn() {
  const src = fs.readFileSync(HTA, 'utf8');
  const start = src.indexOf('function autoSizeToContent()');
  assert.ok(start > 0, 'autoSizeToContent not found');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(start, i + 1);
}
function fit(opts) {
  const sizes = [];
  const els = {
    'advanced-body': { className: opts.advancedOpen ? 'open' : '' },
    'agent-note': { offsetHeight: opts.noteHeight || 0 },
  };
  if (opts.launchBottom != null) els['launch-btn'] = opts.measurable === false ? {} : { getBoundingClientRect: () => ({ bottom: opts.launchBottom }) };
  const window = {
    screen: { availWidth: 1536, availHeight: opts.availH || 1000 }, pageYOffset: opts.scrolled || 0,
    resizeTo: (w, h) => sizes.push([w, h]), moveTo: () => {},
  };
  const document = { getElementById: id => els[id] || null, body: { scrollHeight: opts.scrollHeight || 0 }, documentElement: { scrollTop: 0 } };
  const ctx = vm.createContext({ window, document, Math });
  vm.runInContext(fitFn() + '\nautoSizeToContent();', ctx);
  return sizes[0];
}

test('UT_PickerFit_TallEnoughForLaunch: the window fits down to the Launch button plus the page padding', () => {
  assert.deepStrictEqual(fit({ launchBottom: 740 }), [1040, 768]);
});

test('UT_PickerFit_ScrolledPage: the button is measured on the page, whatever is scrolled', () => {
  assert.deepStrictEqual(fit({ launchBottom: 600, scrolled: 140 }), [1040, 768]);
});

test('UT_PickerFit_NeverPastScreen: a short screen caps the height at the screen minus 60', () => {
  assert.deepStrictEqual(fit({ launchBottom: 740, availH: 760 }), [1040, 700]);
});

test('UT_PickerFit_Never690Less: content that fits keeps the old 690, and so does a very short screen', () => {
  assert.deepStrictEqual(fit({ launchBottom: 500 }), [1040, 690]);
  assert.deepStrictEqual(fit({ launchBottom: 740, availH: 600 }), [1040, 690]);
});

test('UT_PickerFit_NoMeasurement: no button, or no way to measure it, keeps the old 690', () => {
  assert.deepStrictEqual(fit({}), [1040, 690]);
  assert.deepStrictEqual(fit({ launchBottom: 740, measurable: false }), [1040, 690]);
});

test('UT_PickerFit_NoteStillCounts: the Antigravity note rule still applies, and the larger height wins', () => {
  assert.deepStrictEqual(fit({ noteHeight: 40 }), [1040, 738]);
  assert.deepStrictEqual(fit({ noteHeight: 40, launchBottom: 790 }), [1040, 818]);
});

test('UT_PickerFit_AdvancedUnchanged: with Advanced options open, the height still follows the page', () => {
  assert.deepStrictEqual(fit({ advancedOpen: true, scrollHeight: 900, launchBottom: 1200 }), [1040, 940]);
});
