// Runs the folder picker's real script (folder-picker.hta) in Node, invisibly, against a sealed
// folder: fake Windows objects (FileSystemObject, WScript.Shell, ADODB.Stream, Shell.Application)
// backed by real files, and a small fake page built from the HTA's own HTML. Records every
// program the picker starts instead of starting it.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

function attr(tag, name) { const m = tag.match(new RegExp('\\b' + name + '="([^"]*)"')); return m ? m[1] : null; }
function decode(s) { return String(s).replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

function makeElement(tag, attrs) {
  const el = {
    tagName: tag, id: attrs.id || null, name: attrs.name || null, type: attrs.type || null,
    value: attrs.value != null ? decode(attrs.value) : '', checked: attrs.checked || false,
    placeholder: attrs.placeholder != null ? decode(attrs.placeholder) : '', className: attrs.class || '',
    style: { display: /display\s*:\s*none/.test(attrs.style || '') ? 'none' : '' },
    innerText: '', _html: '', onclick: null, focus() {}, select() {},
    getElementsByTagName() { return [{ innerHTML: '' }]; },
  };
  return el;
}

function radiosIn(html) {
  const out = [];
  const re = /<input\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = m[0];
    if (attr(t, 'type') !== 'radio') continue;
    out.push(makeElement('input', { type: 'radio', name: attr(t, 'name'), value: attr(t, 'value') != null ? attr(t, 'value') : '', checked: /\schecked\b/.test(t), id: attr(t, 'id') }));
  }
  return out;
}

function buildPage(html) {
  const body = html.slice(html.indexOf('<body'));
  const byId = {}, staticRadios = [], dynamic = {};
  const tagRe = /<(\w+)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(body))) {
    const [whole, tag, rest] = m;
    const id = attr(whole, 'id');
    const a = { id, name: attr(whole, 'name'), type: attr(whole, 'type'), value: attr(whole, 'value'), placeholder: attr(whole, 'placeholder'),
      class: attr(whole, 'class'), style: attr(whole, 'style'), checked: /\schecked\b/.test(rest) };
    if (tag.toLowerCase() === 'input' && a.type === 'radio') { const r = makeElement('input', a); staticRadios.push(r); if (id) byId[id] = r; continue; }
    if (!id) continue;
    const el = makeElement(tag.toLowerCase(), a);
    const close = body.indexOf('</' + tag, m.index + whole.length);
    const inner = close > 0 ? body.slice(m.index + whole.length, close) : '';
    if (!/</.test(inner)) { el.innerText = decode(inner); if (tag.toLowerCase() === 'textarea') el.value = decode(inner); }
    byId[id] = el;
  }
  // A radio group, as in a real page: checking one radio unchecks the others of the same name.
  const allRadios = () => staticRadios.concat(...Object.values(dynamic));
  function exclusive(r) {
    let on = !!r.checked;
    Object.defineProperty(r, 'checked', {
      get() { return on; },
      set(v) { on = !!v; if (on) for (const o of allRadios()) if (o !== r && o.name === r.name) o.checked = false; },
    });
  }
  staticRadios.forEach(exclusive);
  for (const id of Object.keys(byId)) {
    const el = byId[id];
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html; },
      set(v) { el._html = String(v); dynamic[id] = radiosIn(el._html); dynamic[id].forEach(exclusive); },
    });
  }
  const document = {
    getElementById: id => byId[id] || null,
    getElementsByName: name => staticRadios.concat(...Object.values(dynamic)).filter(r => r.name === name),
    body: { scrollHeight: 800 },
  };
  return { document, byId };
}

// A sealed run. opts: { hta, helpers, kivunDir, env } ; env holds USERPROFILE, LOCALAPPDATA, PATH.
function openPicker(opts) {
  const htaText = fs.readFileSync(opts.hta, 'utf8');
  const script = htaText.slice(htaText.indexOf('<script language="JScript">') + '<script language="JScript">'.length, htaText.lastIndexOf('</script>'));
  const page = buildPage(htaText);
  const runs = [], state = { closed: false, browse: null, prompt: null };
  const env = opts.env;
  const expand = s => String(s).replace(/%([^%]+)%/g, (all, k) => (env[k] != null ? env[k] : all));

  function FileSystemObject() {}
  FileSystemObject.prototype = {
    FileExists: p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } },
    FolderExists: p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } },
    CreateFolder: p => { fs.mkdirSync(p); },
    DeleteFile: p => { fs.unlinkSync(p); },
    GetParentFolderName: p => path.win32.dirname(p),
  };
  function Stream() { this.Type = 2; this.Charset = 'utf-8'; this._text = ''; this._bytes = null; this._pos = 0; }
  Stream.prototype = {
    Open() {}, Close() {},
    WriteText(t) { this._text += t; },
    set Position(v) { if (this.Type === 1 && this._bytes === null) this._bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(this._text, 'utf8')]); this._pos = v; },
    get Position() { return this._pos; },
    CopyTo(other) { const b = this._bytes || Buffer.from(this._text, 'utf8'); other._bytes = (other._bytes || Buffer.alloc(0)); other._bytes = Buffer.concat([other._bytes, b.slice(this._pos)]); },
    SaveToFile(p) { fs.writeFileSync(p, this._bytes || Buffer.from(this._text, 'utf8')); },
    LoadFromFile(p) { this._text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); },
    ReadText() { return this._text; },
  };
  function ActiveXObject(name) {
    if (name === 'Scripting.FileSystemObject') return new FileSystemObject();
    if (name === 'ADODB.Stream') return new Stream();
    if (name === 'WScript.Shell') return { ExpandEnvironmentStrings: expand, Run: (cmd, style, wait) => { runs.push({ cmd, style, wait }); return 0; } };
    if (name === 'Shell.Application') return { BrowseForFolder: () => (state.browse ? { Self: { Path: state.browse } } : null) };
    if (name === 'WinHttp.WinHttpRequest.5.1') return { Open() {}, Send() { throw new Error('offline in tests'); }, SetTimeouts() {} };
    throw new Error('unexpected ActiveXObject ' + name);
  }
  const window = {
    screen: { availWidth: 1920, availHeight: 1080 }, resizeTo() {}, moveTo() {},
    close: () => { state.closed = true; }, prompt: () => state.prompt, confirm: () => true,
    setTimeout: () => 0, onerror: null,
  };
  const ctx = {
    ActiveXObject, window, document: page.document, location: { pathname: '/' + opts.kivunDir.replace(/\\/g, '/') + '/folder-picker.hta' },
    setTimeout: () => 0, decodeURIComponent, JSON, Math, RegExp, Date, String, Array, Object, Error,
    AgentHelpers: opts.helpers ? require(opts.helpers) : undefined,
  };
  ctx.window.document = page.document;
  vm.createContext(ctx);
  vm.runInContext(script, ctx, { filename: path.basename(opts.hta) });
  return {
    ctx, runs, state, el: id => page.byId[id],
    radios: name => page.document.getElementsByName(name),
    setRadio: (name, value) => { for (const r of page.document.getElementsByName(name)) r.checked = (r.value === value); },
    error: () => (page.byId.err ? page.byId.err.innerText : ''),
  };
}

module.exports = { openPicker };
