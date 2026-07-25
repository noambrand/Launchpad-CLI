# LaunchpadPicker.exe — the signed folder picker (replaces mshta + folder-picker.hta)

## Why this exists (plain English)

Windows Defender kept flagging the old folder picker as malware. The alarm was
**never** about our file or our signature — it fires whenever `mshta.exe` opens
a local `.hta` file, because that combination is a classic malware trick. So it
tripped no matter what, and signing couldn't fix it (the process Windows sees is
Microsoft's own `mshta.exe`, and an `.hta` can't carry a signature).

This project removes `mshta` completely. The picker is now **LaunchpadPicker.exe**,
a small **signed** program that shows the **exact same window** by loading the
old picker's HTML/CSS/JavaScript inside the Microsoft Edge **WebView2** control.
Only the ~10 Windows operations the picker needs (read/write a file, browse for
a folder, run a command, expand `%LOCALAPPDATA%`) are re-routed from the old COM
objects to a tiny C# "bridge." Everything the user sees is unchanged.

## How it works

```
LaunchpadPicker.exe (net48 WinForms, signed)
  └── hosts WebView2, loads  https://appassets.local/folder-picker.html
        └── folder-picker.html  = folder-picker.hta transformed at build time
              └── <script src="webview-shim.js">  loaded FIRST
                    └── polyfills ActiveXObject + window.resizeTo/moveTo
                          └── calls the C# HostBridge (file I/O, browse, run, sizing)
```

- **`Program.cs`** — the WinForms window + WebView2 setup (virtual-host mapping,
  host object, `window.close()` → close form, external links → default browser,
  friendly message if the WebView2 runtime is missing).
- **`HostBridge.cs`** — the signed replacement for the picker's COM calls:
  `ReadFile`/`WriteFile` (UTF-8, no BOM), `FileExists`/`FolderExists`/`CreateFolder`/
  `DeleteFile`, `ExpandEnv`, `Run`, `BrowseForFolder`, `SizeAndCenter`.
- **`webview-shim.js`** — re-implements exactly the 5 COM objects the picker
  created (`WScript.Shell`, `Scripting.FileSystemObject`, `Shell.Application`,
  `ADODB.Stream`, `WinHttp.WinHttpRequest`) on top of the bridge, so the picker's
  ~1,100 lines of logic run byte-for-byte unchanged.
- **`build-picker.js`** — turns the canonical `source/folder-picker.hta` into
  `folder-picker.html` with four tightly-scoped, self-verifying edits (remove the
  `<HTA:APPLICATION>` tag, strip `language="JScript"`, inject the shim, rewrite
  `getInstallDir()`). It ABORTS if the source changed shape, so the two can never
  silently drift. **The `.hta` stays the single source of truth.**

## The single source of truth

Edit the UI **only** in `source/folder-picker.hta`. Never hand-edit
`source/folder-picker.html` — it is regenerated from the `.hta` every build.

## Build + sign (the one manual step)

The picker's signature uses the **Certum "Code Signing in Cloud"** certificate,
whose private key lives in Certum's cloud. That means signing can only happen on
your machine, with **SimplySign Desktop open and logged in** (the 6-digit code
from your phone) — exactly like `sign-and-release.cmd`.

1. Open **SimplySign Desktop** and log in.
2. Double-click **`build-and-sign-picker.cmd`** (in the repo root). It compiles
   the program, regenerates the HTML from the `.hta`, **signs** LaunchpadPicker.exe,
   and stages the signed exe + its WebView2 support DLLs into `source/`.
3. Commit `source/` and publish the installer the way you always do
   (GitHub builds the setup `.exe`, then you run `sign-and-release.cmd` to sign
   and upload the outer installer).

## What ships in the install folder (`%LOCALAPPDATA%\Kivun`)

`LaunchpadPicker.exe` (signed) · `folder-picker.html` · `webview-shim.js` ·
`Microsoft.Web.WebView2.Core.dll` · `Microsoft.Web.WebView2.WinForms.dll` ·
`WebView2Loader.dll` (the three DLLs are Microsoft-signed support files).

## Requirements on the user's PC

- **.NET Framework 4.8** — built into Windows 10 1903+ and Windows 11. Nothing to install.
- **Edge WebView2 Runtime** — ships with Windows 11 and with Microsoft Edge.
  If missing, the picker shows a friendly message linking to the free download.

## Verified so far (2026-07-25)

- ✅ `.NET` build succeeds (net48, 0 warnings) and produces the exe + WebView2 DLLs.
- ✅ Live smoke test: the exe launches, WebView2 initializes, the picker UI renders.
- ✅ End-to-end bridge test: on load the picker read `config.txt` and **wrote a
  valid, correctly-escaped `profiles.json`** via the shim → C# `WriteFile`,
  proving `ActiveXObject` polyfill + `ExpandEnv` + `FileExists`/`FolderExists`
  all work.
- ✅ `build-picker.js` transform verified: all 4 edits land, shim loads before the
  page script, `getInstallDir()` rewritten.
- ✅ Installer builds locally with `makensis` — new files packaged, three
  `mshta` shortcuts repointed to `LaunchpadPicker.exe`, legacy `.hta` dropped and
  removed on upgrade.

## Still to do before release

1. **Sign it** — run `build-and-sign-picker.cmd` with SimplySign logged in
   (see above). Until then `source/` has the HTML + shim but NOT the signed
   exe/DLLs (an unsigned build copy was parked in `trash/unsigned-picker-stage/`).
2. **Real click-through test** on a machine — Browse, pick a folder, tune flags,
   click **Launch**, and confirm Windows Terminal opens the CLI in that folder
   (this exercises `BrowseForFolder`, the file writes, and `Run` of the launcher
   `.bat`). Ideally also test on a **fresh Windows 11** PC to confirm the
   WebView2 runtime is present and Defender stays quiet.
3. **CI note (`.github/workflows/release.yml`)** — the workflow runs `makensis`
   on the committed `source/` files. It does **not** build or sign the picker
   (CI can't reach the Certum cloud cert). So the **signed** `LaunchpadPicker.exe`
   + the three WebView2 DLLs must be committed into `source/` (via step 1) for
   the release build to pack them. This is the intended flow — releasing is
   gated on you having signed the picker first.

## Follow-ups — status

- **`fix-wt-icon.hta`** — ✅ DONE in **v3.0.1**. The Windows Terminal icon fixer
  is now hosted by the same signed `LaunchpadPicker.exe` (page argument
  `fix-wt-icon.html`), launched from a Start-menu shortcut. The product now
  ships **zero HTAs**. See the v3.0.1 CHANGELOG entry.
- **Microsoft WDSI false-positive report** — ✅ SUBMITTED **2026-07-26** (for the
  pre-3.0.0 `folder-picker.hta`, to clear the alarm retroactively for users still
  on old versions). Awaiting Microsoft's determination. See
  `../WDSI_false_positive_report.md`.

## Multi-tool note (v3.0.1+)

`LaunchpadPicker.exe` hosts more than one page. The first CLI argument selects the
page to load (a safe local `.html` filename); no argument = `folder-picker.html`.
Shipping pages: `folder-picker.html` (the folder picker) and `fix-wt-icon.html`
(the Windows Terminal icon fixer). Both are generated from their canonical `.hta`
by `build-picker.js`. Add a new tool by adding its `.hta`, generating the page in
`build-and-sign-picker.cmd`, packaging it in the installer, and pointing a
shortcut at `LaunchpadPicker.exe <page>.html`.
