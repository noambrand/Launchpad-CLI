/*
  webview-shim.js  -  COM compatibility layer for the Launchpad folder picker.

  The picker UI was written for an HTA (mshta.exe) and talks to Windows through
  five COM objects created with `new ActiveXObject(...)`. This host is a signed
  WebView2 app instead, which has no ActiveX. This shim re-implements exactly the
  COM surface the picker uses, backed by the C# HostBridge exposed as
  window.chrome.webview.hostObjects.sync.host. It is injected into <head> BEFORE
  the picker's own <script>, so `new ActiveXObject(...)`, window.resizeTo and
  window.moveTo are all defined before the page uses them, and the picker's
  ~1100 lines of logic run byte-for-byte unchanged.

  Only these five ProgIDs are ever created by the picker (verified against the
  source): WScript.Shell, Scripting.FileSystemObject, Shell.Application,
  ADODB.Stream, WinHttp.WinHttpRequest.5.1.
*/
(function () {
  "use strict";

  function host() {
    if (window.chrome && chrome.webview && chrome.webview.hostObjects &&
        chrome.webview.hostObjects.sync) {
      return chrome.webview.hostObjects.sync.host;
    }
    throw new Error("WebView2 host bridge unavailable");
  }

  // --- WScript.Shell -------------------------------------------------------
  function makeWshShell() {
    return {
      Run: function (cmd, windowStyle, waitOnReturn) {
        return host().Run(String(cmd), windowStyle | 0, !!waitOnReturn);
      },
      ExpandEnvironmentStrings: function (s) {
        return host().ExpandEnv(String(s == null ? "" : s));
      }
    };
  }

  // --- Scripting.FileSystemObject -----------------------------------------
  function makeFso() {
    return {
      FileExists: function (p) { return !!host().FileExists(String(p)); },
      FolderExists: function (p) { return !!host().FolderExists(String(p)); },
      CreateFolder: function (p) { return host().CreateFolder(String(p)); },
      DeleteFile: function (p) { return host().DeleteFile(String(p)); },
      // VBScript's CopyFile overwrites by default when the flag is omitted.
      CopyFile: function (src, dst, overwrite) {
        return host().CopyFile(String(src), String(dst), overwrite === undefined ? true : !!overwrite);
      },
      // Pure string helper - no OS call needed. Matches VBScript semantics:
      // strips a trailing separator, then returns everything before the last one.
      GetParentFolderName: function (p) {
        p = String(p == null ? "" : p).replace(/[\\\/]+$/, "");
        var i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
        return i < 0 ? "" : p.substring(0, i);
      }
    };
  }

  // --- Shell.Application (BrowseForFolder) ---------------------------------
  function makeShellApp() {
    return {
      // Signature used by the picker: BrowseForFolder(0, title, 0x50, startPath).
      // Returns a Folder whose .Self.Path is the chosen directory, or null on
      // cancel - mirroring the COM object the picker expects.
      BrowseForFolder: function (hwnd, title, options, rootOrStart) {
        var start = (typeof rootOrStart === "string") ? rootOrStart : "";
        var picked = host().BrowseForFolder(start, String(title == null ? "" : title));
        if (!picked) return null;
        return { Self: { Path: picked } };
      }
    };
  }

  // --- ADODB.Stream (utf-8 text read/write) --------------------------------
  // The picker only uses ADODB.Stream through two helpers, writeUtf8NoBom() and
  // readUtf8(). We emulate just enough of the object to make those helpers
  // produce identical results: a UTF-8, NO-BOM file on write, and the file's
  // text on read. The byte-level Type/Position/CopyTo dance the helpers perform
  // to strip a BOM is preserved as no-ops because HostBridge.WriteFile never
  // emits a BOM in the first place.
  function makeAdodbStream() {
    return {
      Type: 2,
      Charset: "utf-8",
      Position: 0,
      LineSeparator: -1,
      _text: "",
      Open: function () {},
      WriteText: function (t) { this._text += (t == null ? "" : String(t)); },
      ReadText: function () { return this._text; },
      LoadFromFile: function (path) {
        this._text = host().ReadFile(String(path));
        this.Position = 0;
      },
      SaveToFile: function (path /*, saveOptions */) {
        host().WriteFile(String(path), this._text);
      },
      CopyTo: function (dest /*, numChars */) {
        if (dest) dest._text = this._text;
      },
      Close: function () {}
    };
  }

  // --- WinHttp.WinHttpRequest.5.1 (update check) ---------------------------
  // The picker does a synchronous GET to the GitHub releases API and reads
  // .Status / .ResponseText. We back it with a synchronous XMLHttpRequest,
  // which preserves the exact (blocking) semantics the picker was written for.
  // Served from the https://appassets.local origin, the cross-origin request to
  // api.github.com succeeds via GitHub's `Access-Control-Allow-Origin: *`.
  function makeWinHttp() {
    var xhr = new XMLHttpRequest();
    var obj = {
      Open: function (method, url /*, async */) {
        xhr.open(String(method), String(url), false); // always synchronous
      },
      SetRequestHeader: function (k, v) {
        // Some headers (e.g. User-Agent) are forbidden in the browser and throw;
        // the update check is best-effort, so swallow those quietly.
        try { xhr.setRequestHeader(String(k), String(v)); } catch (e) {}
      },
      SetTimeouts: function () {},
      Send: function (body) { xhr.send(body == null ? null : body); }
    };
    Object.defineProperty(obj, "Status", { get: function () { return xhr.status; } });
    Object.defineProperty(obj, "ResponseText", { get: function () { return xhr.responseText; } });
    return obj;
  }

  // --- ActiveXObject dispatcher -------------------------------------------
  window.ActiveXObject = function (progId) {
    progId = String(progId == null ? "" : progId);
    if (/^WScript\.Shell/i.test(progId)) return makeWshShell();
    if (/^Scripting\.FileSystemObject/i.test(progId)) return makeFso();
    if (/^Shell\.Application/i.test(progId)) return makeShellApp();
    if (/^ADODB\.Stream/i.test(progId)) return makeAdodbStream();
    if (/^WinHttp\.WinHttpRequest/i.test(progId)) return makeWinHttp();
    throw new Error("ActiveXObject not supported in WebView2 host: " + progId);
  };

  // --- Window sizing -------------------------------------------------------
  // HTAs can resize/move their own OS window; a WebView2 page cannot. Route the
  // picker's window.resizeTo(w,h) to the host, which sizes the form's client
  // area (converting CSS px -> physical px) and centers it. window.moveTo then
  // becomes a no-op because the host already centered the window.
  window.resizeTo = function (w, h) {
    try { host().SizeAndCenter(w | 0, h | 0); } catch (e) {}
  };
  window.moveTo = function (/* x, y */) { /* host centers in resizeTo */ };
})();
