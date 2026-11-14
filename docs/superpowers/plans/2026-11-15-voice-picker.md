# Voice Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 10 new ElevenLabs voices for the voice alerts, with Adam as the default and a Male / Female + voice-chip row in the picker.

**Architecture:** Clips live in `source/sounds/voices/<id>/{regular,funny}/`, listed by `source/sounds/voices/voices.json`. `play.js` picks the clip from `config.json` `voice` (default from the index, Adam), falling back to today's clips (id `original`). `voice.js` and the picker read and write the same `config.json` key.

**Tech Stack:** Node (play.js, voice.js, node:test), JScript in `folder-picker.hta` (ES3, HTA/WebView2), NSIS and Mac pkg unchanged.

**Spec:** `docs/superpowers/specs/2026-11-15-voice-picker-design.md`

## Global Constraints

- Clip format: mono, 16-bit, 44.1 kHz WAV (already produced in `test-tools\voice-set\`).
- Voice ids and order: `adam, will, eric, chris, jon, vincent, hale, original, bella, laura, jessica`. `"default": "adam"`, `"default_female": "bella"`.
- No `voice` key in the shipped `source/sounds/config.json`. "No pick" = default = Adam.
- Today's clips stay in `source/sounds/regular/` and `funny/` (id `original`).
- Picker: edit only `source/folder-picker.hta`, then regenerate `source/folder-picker.html` with `node picker-app\build-picker.js source\folder-picker.hta source\folder-picker.html`. Use only bridge calls the picker already has (`ReadFile`, `FileExists`, `Run`). ES3 only (no `let`, arrow functions, `forEach` on arrays is fine only if already used; prefer `for`).
- Picker lists are chip buttons built as one `innerHTML` string with `onclick="fn(<index>)"`, never `<select>` (HTA `onchange` is unreliable; project rule at `folder-picker.hta:1279`).
- Hooks, alert text and `configure-sound-hooks.js` do not change. `play.js` must never throw or print.
- No commits until Noam says so (his rule). Each task ends with tests green, not a commit.

## Review Focus

1. `config.json` names a voice that no longer ships, or a typo: Adam plays, and the picker shows Adam selected. (Task 2, Task 4 tests)
2. `voices.json` missing or broken (a partial copy): alerts still play (Adam folder if present, else Original); the picker shows only Original. (Task 2, Task 4)
3. A voice id like `../../x` in `config.json`: never leaves the sounds folder. (Task 2)
4. An upgrading user: their `config.json` has no `voice`; toggling Sounds On/Off or the pack in the picker must not write `voice`, so they stay on "no pick". (Task 4)
5. A voice missing one clip: that alert plays the Original clip, never silence. (Task 2)

---

### Task 1: Clips and voices.json in the bundle

**Files:**
- Create: `source/sounds/voices/<id>/regular/{done,error,permission,waiting,save}.wav` and `.../funny/...` for the 10 new ids (copy from `C:\Users\noamb\Downloads\launchpad_After_crash\test-tools\voice-set\<id>\`)
- Create: `source/sounds/voices/voices.json`
- Test: `source/test/UT_Voices.js` (new)
- Modify: `.github/workflows/build-and-test-mac.yml` (path filter + run `UT_Voices.js` next to `UT_Sounds.js`)

**Interfaces:**
- Produces: `voices.json` = `{ "default": "adam", "default_female": "bella", "elevenlabs": { "model": "eleven_multilingual_v2", "takes": { "A": {...}, "B": {...} } }, "voices": [ { "id", "label", "gender": "male"|"female", "description", "elevenlabs_voice_id"?, "take"? } ] }` in the Global Constraints order. `original`: label "Original", gender male, description "the first Launchpad voice", no ElevenLabs fields. Labels, descriptions, ElevenLabs ids and takes: the spec's table (descriptions from `test-tools\voice-set\<id>\voice.json`).

- [ ] **Step 1: Write the failing tests** in `UT_Voices.js`:
  - `UT_Voices_IndexShape`: ids in exact order above; `default === 'adam'`, `default_female === 'bella'`; genders: bella, laura, jessica female, rest male.
  - `UT_Voices_EveryClipPresent`: for each id except `original`, all 10 files exist; parse each WAV header (`fmt ` chunk): channels 1, bits 16, rate 44100.
  - `UT_Voices_ShippedConfigHasNoVoice`: `JSON.parse(source/sounds/config.json)` has no `voice` key.
- [ ] **Step 2: Run** `node --test source/test/UT_Voices.js`. Expected: FAIL (no voices folder).
- [ ] **Step 3: Copy the 100 clips and write `voices.json`.** Copy only `regular/` and `funny/` (not the per-voice `voice.json`).
- [ ] **Step 4: Run** the same command. Expected: PASS. Also `node --test source/test/UT_Sounds.js` still PASS (deploy compares baseline vs new on the same bundle).

### Task 2: play.js plays the chosen voice

**Files:**
- Modify: `source/sounds/play.js` (`resolve`, new helpers, exports, header comment)
- Test: `source/test/UT_Voices.js`

**Interfaces:**
- Consumes: Task 1's `voices.json` shape.
- Produces (exported from `play.js`): `loadIndex() -> object|null` (parsed `voices/voices.json`, null on any error); `defaultVoice() -> string` (`index.default` if its folder exists, else `'adam'` if `voices/adam` exists, else `'original'`); `voice() -> string` (sanitized `cfg().voice` to `[a-z0-9_-]`; `'original'` kept; any other id used only if `voices/<id>` is a folder; otherwise `defaultVoice()`); `resolve(name)` candidates in order: `voices/<voice>/<mode>/<name>` (skipped for `original`), `<mode>/<name>`, `regular/<name>`, `<name>`.

- [ ] **Step 1: Write the failing tests.** Helper `bundle(files, config, index)` makes a temp dir with copies of `play.js`, `voice.js`, `reminder.js`, writes `config.json`, optional `voices/voices.json`, and 4-byte stand-in `.wav` files at the given relative paths; tests `require()` that copy's `play.js` and compare `resolve()` to `path.join(dir, ...)`:
  - `UT_Voices_DefaultIsAdam`: config `{}`; files `voices/adam/regular/done.wav`, `regular/done.wav` → `voices/adam/regular/done.wav`.
  - `UT_Voices_ChosenVoiceAndPack`: `{voice:'bella', mode:'funny'}` → `voices/bella/funny/permission.wav`.
  - `UT_Voices_MissingClipFallsBackToOriginal`: bella has no `funny/save.wav` → `funny/save.wav`.
  - `UT_Voices_UnknownVoiceUsesDefault`: `{voice:'zed'}` → adam's clip.
  - `UT_Voices_BadIdStaysInside`: `{voice:'../../x'}` → adam's clip, and the result starts with `dir`.
  - `UT_Voices_OriginalUsesTopFolders`: `{voice:'original'}` with adam present → `regular/done.wav`.
  - `UT_Voices_NoIndexStillPlays`: no `voices.json`: with `voices/adam/` → adam; without → `regular/done.wav`.
  - `UT_Voices_BrokenIndex`: `voices.json` = `{oops` → same as no index, no throw.
- [ ] **Step 2: Run** `node --test source/test/UT_Voices.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the Interfaces above in `play.js`. Keep `module.exports` keys `play, resolve, clip, mode, enabled` and add `voice, defaultVoice, loadIndex`. Log line in `logEvent` unchanged (the `wav=` path already shows the voice folder).
- [ ] **Step 4: Run** `node --test source/test/UT_Voices.js source/test/UT_Sounds.js`. Expected: PASS (incl. `UT_PlayJs_CodexInputSilent`).

### Task 3: voice.js commands and the Choose Voice launcher

**Files:**
- Modify: `source/sounds/voice.js` (usage comment, `status`, new `voice`, `voices`, `choose`)
- Create: `source/sounds/Choose Voice.cmd` (CRLF), `source/sounds/Choose Voice.command` (LF, git mode 100755 via `git update-index --chmod=+x` after `git add`; the existing `.command` files are 100644, keep theirs as is)
- Modify: `source/sounds/Test Sounds.cmd` and `Test Sounds.command` first line: "...in the current voice and pack..."
- Test: `source/test/UT_Voices.js`

**Interfaces:**
- Consumes: `play.js` `loadIndex()`, `voice()`, `defaultVoice()`.
- Produces: `node voice.js voice <id>` (accepts ids in the index, case-insensitive; prints `Voice set to <Label>.`; unknown → prints `Usage: node voice.js voice <name>` plus the list, config untouched); `node voice.js voices` (one line per voice: `<n>. <Label> (<gender>[, default])` with ` <- current` on the effective voice); `node voice.js choose` (prints the same list, reads one line with `readline`; a valid number or id sets the voice; empty or invalid → `No change.`); `status` gains `Voice:           <Label>` plus ` (default)` when config has no `voice`.

- [ ] **Step 1: Write the failing tests** (spawn `node voice.js ...` in a `bundle()` dir with the real `voices.json`):
  - `UT_VoiceJs_SetsVoice`: `voice bella` → config `voice === 'bella'`, other keys (`mode`, `x`) kept, stdout contains `Bella`.
  - `UT_VoiceJs_RejectsUnknown`: `voice zed` → config bytes unchanged, stdout contains `Usage`.
  - `UT_VoiceJs_StatusDefault`: config without voice → stdout matches `/Voice:\s+Adam \(default\)/`.
  - `UT_VoiceJs_ChooseByNumber`: `choose` with input `9\n` → `voice === 'bella'`.
  - `UT_VoiceJs_ChooseEmptyKeeps`: input `\n` → config unchanged, stdout contains `No change.`
- [ ] **Step 2: Run** `node --test source/test/UT_Voices.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the commands and the two launchers (same shape as `Funny Sounds ON.cmd/.command`, running `node voice.js choose`).
- [ ] **Step 4: Run** `node --test source/test/UT_Voices.js`. Expected: PASS.

### Task 4: Picker Voice row

**Files:**
- Modify: `source/folder-picker.hta` (CSS `.voice-chip-row` / `button.voice-chip` / `.active`, styled like `.profile-chip`; markup row after "Voice pack"; script next to the other sound handlers ~line 1449-1543)
- Regenerate: `source/folder-picker.html`
- Modify if needed: `source/test/picker-sim.js` (only if a needed DOM feature is missing; keep existing behavior)
- Test: `source/test/UT_Picker_Voice.js` (new)

**Interfaces:**
- Consumes: `voices.json` shape (Task 1), the same resolve order as `play.js` (Task 2) for Preview.
- Produces (page globals, called by tests): `loadVoiceIndex()` (reads `soundsDir + "\\voices\\voices.json"` into `voiceIndex`, null on error); `currentVoiceId() -> string` (config `voice` if `original` or in the index, else index default, else `"original"`); `renderVoiceRow()` (sets radio `snd-gender` from the current voice's gender; fills `#snd-voice-chips` with one `<button type="button" class="voice-chip[ active]" title="<description>" onclick="onSoundVoiceChip(<i>)">Label</button>` per voice of that gender, index order); `onSoundGenderChange()` (sets `soundCfg.voice` to `default` or `default_female`, saves, re-renders, flashes); `onSoundVoiceChip(i)` (sets `soundCfg.voice` to the i-th voice of the shown gender, saves, re-renders, flashes); `previewVoice()` (`wshShell.Run('wscript.exe //nologo "' + soundsDir + '\\play.vbs" "' + wav + '"', 0, false)` with `wav` = first existing of `voices\<v>\<mode>\permission.wav`, `<mode>\permission.wav`, `regular\permission.wav`). Markup: radios `name="snd-gender"` values `male`/`female` with `onclick="onSoundGenderChange()"`, `<div class="voice-chip-row" id="snd-voice-chips"></div>`, `<button type="button" onclick="previewVoice()">▶ Preview</button>`. `loadSoundConfig()` must not add `voice`; only the two voice handlers write it.

- [ ] **Step 1: Write the failing tests** in `UT_Picker_Voice.js`, using `UT_Picker.js`'s `sandbox()`/`open()` pattern plus `User\.claude\sounds\config.json`, the real `voices\voices.json`, and stand-in wavs for adam/bella permission clips:
  - `UT_PickerVoice_DefaultIsAdam`: config `{enabled:true, mode:'regular'}` → radio `male` checked; `#snd-voice-chips` innerHTML has 8 `voice-chip` buttons, `class="voice-chip active"` on Adam, an `Original` chip; config.json bytes unchanged after `init()`.
  - `UT_PickerVoice_FemaleSelectsBella`: `setRadio('snd-gender','female')`, `ctx.onSoundGenderChange()` → config `voice === 'bella'`; chips Bella, Laura, Jessica; Bella active.
  - `UT_PickerVoice_ChipSaves`: male list, `ctx.onSoundVoiceChip(2)` → `voice === 'eric'`; config key `x: 1` kept.
  - `UT_PickerVoice_OtherSwitchesDontPin`: `setRadio('snd-enabled','off')`, `ctx.onSoundEnabledChange()`, then mode change → config has no `voice`.
  - `UT_PickerVoice_UnknownShowsDefault`: config `voice:'zed'` → Adam active.
  - `UT_PickerVoice_NoIndex`: no `voices.json` → exactly one chip, `Original`, active.
  - `UT_PickerVoice_PreviewPlaysSelected`: `voice:'bella', mode:'funny'` with `voices\bella\funny\permission.wav` present → last `runs` entry has `style 0`, contains `play.vbs` and `voices\bella\funny\permission.wav`.
- [ ] **Step 2: Run** `node --test source/test/UT_Picker_Voice.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the markup, CSS and functions; call `loadVoiceIndex()` and `renderVoiceRow()` from the existing `loadSoundConfig(); applySoundConfigToUI();` start-up path (`folder-picker.hta:~1968`). Update the Test Sounds button title to "...in the selected voice and pack".
- [ ] **Step 4: Regenerate** `node picker-app\build-picker.js source\folder-picker.hta source\folder-picker.html`. Expected: exit 0 (it aborts if the source changed shape).
- [ ] **Step 5: Run** `node source\test\run-node-tests.js`. Expected: all PASS, including `UT_Picker*.js` (the v3.2.2 baseline comparison must still match: the voice row writes nothing on launch).

### Task 5: Docs

**Files:**
- Modify: `source/sounds/README.md` (new "Voices" section: the 11 voices, default Adam / Bella, `voice.js voice|voices|choose`, Choose Voice launcher, fallback order; Files table gets `voices/`), `README.md` (voice alerts section: one paragraph + the picker row), `docs/CHANGELOG.md` `[Unreleased]` "Added — 10 new voices and a voice picker" (Adam is now the default for everyone without a pick; Original still selectable; installer size ~1.7 → ~11 MB), the spec's Design "Picker" paragraph (chips instead of a dropdown, with the reason).
- Modify: `C:\Users\noamb\Downloads\launchpad_After_crash\HANDOFF.md` new "Now" section (state of the branch, where the clips and generator came from, the key file, what's left).

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Check** every command named in the docs runs: `node source/sounds/voice.js voices` in a temp copy prints 11 lines.

### Task 6: Whole-branch verification and hand-over

- [ ] **Step 1: Run** `node source\test\run-node-tests.js`. Expected: all PASS (report any pre-existing failures separately, with output).
- [ ] **Step 2: CI check for the picker HTML:** rebuild to `%TEMP%` and compare with `source/folder-picker.html` (the `validate-codex-option.yml` step). Expected: identical.
- [ ] **Step 3: Look at the real picker** in a sandbox: run `mshta.exe source\folder-picker.hta` with `USERPROFILE` and `LOCALAPPDATA` pointed at a temp folder holding a deployed copy of `source/sounds` (via `configure-sound-hooks.js --deploy-only` with that `USERPROFILE`) and a stand-in Kivun folder; open Advanced options; screenshot the Sound alerts section with agent-desktop; check the row fits and wraps cleanly; close without launching.
- [ ] **Step 4: Fresh review** of the whole branch diff by a reviewer subagent; fix what it confirms.
- [ ] **Step 5: Show Noam** the result (screenshot, test counts, `git status`), and commit, push and open a PR only on his word.
