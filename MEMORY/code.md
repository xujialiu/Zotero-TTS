# Code — Zotero-TTS

The source layout, the rules for changing it, and the Zotero behavior that
has already cost a round-trip. Part of the project rule book, whose core is
`MEMORY/MEMORY.md`.

## Layout and rules

```
src/core/           pure logic, no Zotero globals: settings (DEFAULTS ↔ addon/prefs.js,
                    pinned by test/prefs-defaults.test.ts), providers/{openai,azure,cloudflare,speechify,fish,fishspeech,local/kokoro},
                    shortcuts, shortcut-actions, read-aloud-speed, settings-backup,
                    highlight-level + highlight-pin (the Sentence and Word switches;
                    Zotero's own level kept equal to them), webdav, reader-theme, timeout
src/core/engine/    the Engine's pure half (issue #133): session (one tab's reading, Read
                    Aloud's controller line for line), clips, read-ahead, handoff, gap, words
                    (the word off the audio clock), skip; time-stretch, word-onset and
                    speech-chain copied from Zotero 10.0.3 (ADR 0006)
src/read-aloud/engine/ the Engine's Zotero half: index (the four hooks, one session per tab),
                    controller (what the manager holds), audio-output (one AudioContext per
                    session), voice-pick (a pick while reading goes through the handoff)
src/read-aloud/     the Read Aloud integration: index (intercepts Zotero.Reader._readers and
                    overrides _getReadAloudRemoteInterface per reader), remote-interface
                    (composite of Zotero's native interface + our voices), voice-catalog,
                    catalog, read-aloud-memory (+ memory-sync: one voice/speed across documents
                    and open tabs; default-speed / default-voice: what the voice browser sets),
                    highlight-style (Zotero's highlight colors, the sentence under the word
                    by the Sentence switch), system-voices (hide Zotero's own Local voices)
src/ui/             prefs pane (prefs-pane, shortcut-rows, backup-rows, webdav-rows,
                    server-preset-rows, highlight-rows, shortcut-recorder, voice-browser-rows,
                    voice-list-switches: the two unbound checkboxes that edit the player's list,
                    reading-guard: changes affecting current reading are refused, help-tips: the ?
                    icons' tooltips, opened at once), read-aloud-shortcuts, speed-toast,
                    zotero-highlight-menu: Zotero's own Highlight current greyed with a hint
src/index.ts        bootstrap wiring; with core/settings.createZoteroPrefs and ui/prefs-pane the
                    only code that touches Zotero globals (declared in src/globals.d.ts)
addon/              manifest.json, bootstrap.js, prefs.js (defaults), content/preferences.xhtml,
                    content/preferences.css (the ? icons, registered with the pane),
                    locale/<locale>/zotero-tts.ftl (every string the pane and the UI show; en-US is
                    the source, test/l10n.test.ts pins the other locales to it)
test/               mirrors src/; vitest; zotero-dev/ — the live checklist the bridge
                    runs (see Driving Zotero live); fixtures/ — its PDFs and their generator
assets/             README media (the word-highlight GIF, popup and settings screenshots)
```

- TDD: write the failing test first. Zotero-facing code takes its Zotero
  bits as injected deps so the logic is unit-testable (see `memory-sync.ts`,
  `backup-rows.ts`, `read-aloud-shortcuts.ts` for the pattern).
- Every network call goes through `core/timeout.withTimeout`; failures are
  reported as errors, never left hanging (user rule: fail loudly, never hang).
- Never fabricate per-word timestamps; a voice without them falls back to
  sentence highlighting (`remote-interface.wholeSegmentTimestamp`).
- Providers are enabled independently; OpenAI voices/models are never
  hard-coded as the only option (many servers are OpenAI-compatible).
- Preference pane: no `scripts` in the pane registration — Zotero runs them
  before the markup exists. Everything initializes from the root
  `<vbox onload="Zotero.ZoteroTTS.prefsPane.onPaneLoad(document)">`.
  `preference=`-bound inputs redraw themselves on pref change; unbound rows
  (shortcuts) expose a `refresh()`.
- **The pane's text says the effect, never the implementation.** A visible
  line and a `?` tooltip tell the user what the setting gives them, and a
  platform or cost limit if there is one; how it is done — which Zotero
  API it goes through, what it patches, what the player drops behind the
  scenes — stays out. The user can neither act on it nor check it, and it
  is the first thing the next fix rewrites. Background goes to the README,
  the mechanism to `notes/NOTES.md` (issue #18 is the shape: a `?` that
  read like a changelog of the plugin's internals).

## Zotero pitfalls that have already cost a round-trip

- **Sandbox whitelist**: the plugin scope has no `WebSocket`, `AbortController`
  or `caches`; take them from `reader._window`. It does get `Zotero`,
  `Services`, `ChromeUtils`, `IOUtils`, `PathUtils`, `Localization` (the
  Fluent constructor; `core/l10n.ts` formats through a sync instance of it),
  `setTimeout`, `fetch`, `atob`/`btoa`, `TextEncoder`/`TextDecoder`, `URL`,
  `DOMParser`, `crypto`, `XMLHttpRequest` (the list: `wantGlobalProperties`
  and the `Object.assign` after it in `xpcom/plugins.js` `_loadScope`).
- **Compartments**: the reader iframe may not call a bare sandbox function
  (export it with `Components.utils.exportFunction`) nor read a sandbox object
  ("Permission denied to access property …"). Hand reader code primitives
  only; call reader functions with `Reflect.apply`, not `fn.apply`, so the
  argument array stays on our side. Never call `fn.apply` on a reader
  function with sandbox arguments. Inside an exported function, `this` and
  the arguments arrive behind Xray wrappers: a plain object's prototype
  methods are invisible and assignments land on the wrapper — waive them
  (`Components.utils.waiveXrays`) or use references captured on our side;
  objects reached from our side (`reader._internalReader…`) are fine.
  A reader-realm array's `find` / `some` / `filter` given a sandbox
  callback never calls it and answers `undefined` / `false` / `[]`
  without a throw (2026-09-08, issue #75: a guard inert live and green
  in a same-realm unit test), and `map` / `every` answer wrong the same
  way (2026-09-15, issue #110) — walk such arrays by index, and give the
  unit test a list whose `find` / `some` answer nothing.
- **A listed reader can outlive its window** (2026-09-25, issue #143): a
  script's `reader._window.close()` skips Zotero's `reader.close()`, so
  the reader stays in `Zotero.Reader._readers` with its `_internalReader`
  and `_iframeWindow` dead, and every read through them throws. The
  reader object itself is chrome-side and never dead. Walk `_readers`
  through `eachReader` (`src/index.ts`, over `forEachReader` in
  `read-aloud/reader-access.ts`), never a bare loop. One bare walk whose
  attach threw on such a reader failed its whole startup step; in the
  shortcuts step, that cost every reader opened later its Player.
  `test/index.test.ts` starts the whole plugin with one listed.
- **`Zotero.Prefs.set`** writes through the type the pref is declared with in
  `prefs.js`: an int pref goes through `setIntPref`, which cannot hold a
  fraction — a `preference=`-bound number input hands it "1.5" and the pref
  stays 1 (why the old Speed setting never worked; store a string or a
  percentage instead). Only an undeclared pref takes its type from
  `typeof value`, and a fraction then throws. Undeclared prefs read as
  `undefined`.
  `Zotero.Prefs.registerObserver(name, fn)` takes names relative to
  `extensions.zotero.`; observers fire synchronously inside `set`, **in
  registration order** — a reader opened after the plugin started hears a
  write *after* the plugin does, so inside our observer its
  `_state.readAloudVoices` is still the old value (memory-sync refreshes
  it before resyncing a reader). A `set` with an **unchanged value notifies
  nobody**: a popup pick that re-persists what the entry already holds (the
  only voice under a language) is invisible to a pref observer — memory-sync
  hooks the manager's `selectVoice`/`selectTier`/`setLanguage` for those.
- **`FilePicker`** (`chrome://zotero/content/modules/filePicker.mjs`): the
  chosen path is `fp.file` (a string); there is no `fp.path`.
- **Read Aloud**: `reader._internalReader._readAloudManager` — `active` means
  "session open" (paused keeps it true), speaking is `active && !paused`;
  `setSpeed(speed, persist)` — never persist on an idle manager, it starts
  playback; `skipBack/skipAhead('sentence' | 'paragraph', accelerate)` are
  the popup's skip buttons, followed by `_lockPositionToReadAloud()`. Choices persist in `extensions.zotero.reader.readAloudVoices`,
  keyed by the *detected* base language (`mul` for "Multiple languages");
  `_syncPersistedVoicesToManager` restores them. Highlight colors are
  constants in the bundle (`READ_ALOUD_ACTIVE_SEGMENT_COLOR` / `…SENTENCE_COLOR`),
  reached only by shadowing prototype methods per reader (highlight-style.ts);
  each reader tab has its own bundle and classes. Tiers are hard-coded
  standard/premium/local; unknown tiers are dropped. Word mode draws only
  real word timestamps.
- **Kokoro-FastAPI**: `/dev/captioned_speech` needs `stream: false`;
  `/v1/audio/voices` returns `{ voices: [{ id, name }] }`.
- The Zotero 9 internals used by the user's older standalone plugin
  (`view._readAloud.state.controller.speed`) do not exist in Zotero 10.

## Zotero's source and the profile

- Zotero source for verification: unpack the installed `omni.ja` into the
  scratch directory (`unzip -q` or Python `zipfile`) —
  Windows `C:\Program Files\Zotero\app\omni.ja`,
  macOS `/Applications/Zotero.app/Contents/Resources/app/omni.ja`.
  Reader bundle: `resource/reader/reader.js` (~85k lines; grep, then `sed -n`
  ranges); chrome side: `chrome/content/zotero/xpcom/reader.js`; prefs:
  `defaults/preferences/zotero.js`; plugin sandbox: `xpcom/plugins.js`.
- Zotero profile prefs: Windows `%APPDATA%\Zotero\Zotero\Profiles\*\prefs.js`,
  macOS `~/Library/Application Support/Zotero/Profiles/*/prefs.js`.
