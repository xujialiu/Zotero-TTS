# zotero-tts — engineering notes

Working notes: incidents, what was verified in Zotero's source, and why things
are the way they are. Kept private until 2026-08-23, tracked in git since.
Written from 2026-08-21, after the plugin first played audio end to end in
Zotero 10.0.1-beta.1. One-time setup logs and overtaken lists live in
NOTES_SUPPLEMENTARY.md; nothing there is needed before touching the code.

## What the plugin is

A Zotero 10 plugin that replaces the audio backend of Zotero's built-in Read
Aloud. The native player, sentence segmentation, prefetching, and word/sentence
highlighting are all Zotero's; the plugin only supplies voices and audio (plus
word timestamps) from the user's own TTS services: OpenAI, Azure Speech, and a
local Kokoro-FastAPI server.

Mechanism: intercept `Zotero.Reader._readers.push`, and on each new reader
replace the instance method `_getReadAloudRemoteInterface` with ours. Zotero
calls that method later, inside async `_open()`, and gets back the same
four-method object its own cloud backend would return.

A standalone-player mode was designed and half-planned as a fallback in case
the hijack did not work. The hijack worked; the standalone mode was deleted
before it was ever built.

---

## Production incidents, in order

All of these happened on the first day the plugin was installed into a real
Zotero. Every one of them was invisible to the 130+ unit tests, because every
one of them lives at the boundary between the plugin and Zotero's runtime.

### 1. The xpi would not install

**Symptom.** Install dialog: "could not be installed. It may be incompatible
with this version of Zotero." Same message on every retry.

**Wrong turns.** (a) Suspected the `strict_min_version` comparison — ruled out
from `XPIDatabase.sys.mjs`: on a `-beta` build, `maxVersion` is not even
consulted. (b) Suspected `applications` vs `browser_specific_settings` — ruled
out from the manifest JSON schema, which allows additional properties, so the
`zotero` key is not stripped. I added `browser_specific_settings` anyway during
diagnosis; it was dead code and was later removed.

**Cause.** Zotero's own patch in `Extension.sys.mjs` (`parseManifest`) hard-
rejects any extension whose `applications.zotero` lacks `id`, `update_url`, or
`strict_max_version`. We shipped without `update_url`. The rejection happens
during manifest parsing, before Zotero learns the add-on's name — which is why
the dialog showed the file path instead of "Zotero TTS". That detail was the
clue I missed for two rounds.

**Fix.** Add both fields. A build test now asserts all three are present and
well-formed, so dropping one fails `npm test` instead of failing silently in a
dialog with no information.

**Lesson.** The install dialog is lossy. The error console (Help → Debug
Output Logging) had the exact message the whole time:
`Reading manifest: applications.zotero.update_url not provided`.

### 2. Voices listed, synthesis failed with "An unknown error occurred"

**Symptom.** After install, the native voice picker showed our Azure voices
(proving the hook, the catalog, HTTPS, the API key, and the region were all
correct), but pressing play failed with Zotero's generic error.

**Diagnostic blind spot found first.** `getAudio` caught every failure and
returned only one of the three strings Zotero's UI understands. The real error
was never logged anywhere. Added a `log` dependency so the raw error reaches
`Zotero.logError` before it is collapsed.

**Cause.** `AbortController is not defined`. The plugin bootstrap runs in a
`Cu.Sandbox` whose globals are an explicit whitelist (`plugins.js:136-183`):

    atob btoa Blob crypto CSS ChromeUtils DOMParser fetch File FileReader
    TextDecoder TextEncoder URL URLSearchParams XMLHttpRequest
    + Zotero ChromeWorker IOUtils Localization PathUtils Services Worker
      XMLSerializer setTimeout/clearTimeout setInterval/clearInterval
      requestIdleCallback/cancelIdleCallback

`AbortController`, `WebSocket`, `AudioContext`, and `caches` are all absent.
`getAudio` constructed an `AbortController` bare; `getVoices` never needed one,
which is why the list populated and playback did not.

**A trap inside the diagnosis.** A "replay the whole Azure handshake" probe run
from Tools → Developer → Run JavaScript passed all four steps. That window runs
in chrome scope, which *has* `AbortController`. It cannot stand in for the
sandbox. It did, however, prove the hand-written Azure WebSocket protocol and
the sandbox→reader `Cu.cloneInto` of a Blob both work — neither had been tested
against a real server before.

**Fix.** Obtain the constructor from the reader's chrome window and inject it,
exactly as `WebSocket` already was. Regression test deletes the global and
asserts `getAudio` still succeeds.

**Lesson.** Before using any DOM/Web API global in plugin code, check the
whitelist. If it is not there, take it from a chrome window and inject it.

### 3. Pressing play crashed the whole Zotero process

**Symptom.** Hard crash, no JS error, reproducible on every play after a clean
reinstall. Windows Error Reporting: `zotero.exe` / `xul.dll 140.14.0.2270` /
exception `0x80000003` (`EXCEPTION_BREAKPOINT` — a Gecko `MOZ_RELEASE_ASSERT`,
not a memory fault). Six minidumps, all at fault offset `0x2404103`.

**What the dumps gave and did not give.** Zotero ships a custom-built Gecko;
its `xul.dll` has no PDB on symbols.mozilla.org, so `cdb` could not name a
single frame. But `~<n>` on the faulting thread named the thread:
**`DOMCacheThread`** — the Cache API's own worker — in the newest dump and in
the very first one.

**Wrong turn.** Before reading the thread name I hypothesised the cause was a
sandbox-owned `Blob` being handed to the chrome window's `Response` +
`caches.put`, and fixed that by re-creating the Blob in the chrome window. The
crash was unchanged. I also presented a "disable caching" checkbox as an A/B
experiment without confirming the user had actually flipped it — they had not,
so I had no A/B data and reasoned on as if I did. Both were avoidable.

**Cause, to the extent it can be known.** Driving the Cache API (`win.caches`)
from the plugin sandbox across a compartment boundary triggers a release
assert on `DOMCacheThread`. Native Read Aloud uses the same Cache API from
chrome-window JS without incident. The specific assert cannot be named without
symbols, and a disk cache of the user's own TTS output is not worth chasing it.

**Fix.** Remove the Cache API entirely. Audio is cached in a process-wide,
byte-bounded in-memory LRU (`core/memory-cache.ts`, 64 MiB): pure JS, no
compartment crossing, no DOM thread, seven unit tests. The bundle is scanned
clean of `caches`/`Response`.

**Lesson.** When a crash reproduces and the stack is unreadable, the *thread
name* is still recoverable from the minidump and is often enough to identify
the subsystem. Get that before forming a hypothesis, not after.

### 4. (Minor) Preference pane did not render after an in-place upgrade

Seen once, unreproduced; moved to NOTES_SUPPLEMENTARY.md.

### 5. Pane initialization ran before the pane existed (2026-08-22)

**Symptom:** the new shortcut buttons rendered blank and did nothing. The
engine dropdown, capability line and Test-connection button had been dead
for the same reason all along — every lookup was null-guarded, so nothing
ever complained.

**Cause:** `Zotero.PreferencePanes.register({ scripts })` loads the scripts
into a sandbox *before* parsing and inserting the pane markup
(`preferences.js` `_loadPane`: `loadSubScript` at ~320, `parseXULToFragment`
and `container.append` at ~337–347). `preferences-shim.js` therefore called
`onPaneLoad(document)` into an empty pane. Only afterwards does Zotero
dispatch a `load` event to each top-level child of the fragment
(`_initImportedNodesPostInsert`, ~621), which is the hook Zotero's own panes
use: `<vbox onload="...">`.

**Fix:** `onload="Zotero.ZoteroTTS.prefsPane.onPaneLoad(document)"` on the
root `<vbox>`; the shim and the `scripts` option are gone. `build.test.ts`
pins this.

**Lesson:** a null-guarded DOM lookup that "can't fail" should log when it
does; the guards hid a total failure for weeks. And `scripts` is for
defining functions the markup can call, not for touching the markup.

---

## Facts about Zotero 10 worth keeping

Verified by reading the unpacked `omni.ja` of both `10.0-beta.26` and
`10.0.1-beta.1`; `xpcom/reader.js` was byte-identical between them.

- `ReaderInstance.prototype._getReadAloudRemoteInterface(targetWindow)` returns
  `{ getVoices, getAudio, getCreditsRemaining, resetCredits }`. Called at
  `reader.js:267` inside async `_open()`, after an `await`.
- `Reader.open()` pushes onto `_readers` synchronously right after `new
  ReaderTab(...)` (`reader.js:2961`, `2991`), so a `push` interceptor runs
  before the method is read. `ReaderInstance` returns a Proxy whose `set` trap
  only diverts to `_internalReader` once that exists — it does not at push time
  — so an instance-property override lands where `_open()` reads it, and
  `delete` works because there is no `deleteProperty` trap.
- `getAudio` must return `{ audio: Blob, timestamps? }`. `timestamps` items are
  `{ start, end, charStart, charEnd }` (seconds; char offsets into the
  *normalized* segment text, `charEnd` exclusive — reader
  `normalizedOffsetsToRawOffsets`). Never estimate per-word timings.
- **Word mode has no fallback of its own.** The highlight level is Zotero's
  pref `reader.readAloud.highlightGranularity` (default `sentence`; Settings →
  General → Read Aloud → "Highlight current"). In `word` mode the reader
  draws only `activeWordSourcePosition` (`_resolvePrimarySelector`, bundle
  ~53313/76406), which is null without timestamps — so a segment without
  them shows **no highlight at all**. Since 2026-08-22 the plugin returns one
  timestamp spanning the whole segment (`wholeSegmentTimestamp`, end = one
  day so a resume never drops it) when the provider supplies none; word mode
  then shows the sentence. The cache keeps the provider's real output.
  `[zotero-tts] <provider>: N word timestamps for M chars` in the debug output
  tells what reached Zotero per segment.
- Voice catalog is `parseVoicesResponse` format=2: `{ [tier]: [{ voices,
  locales, segmentGranularity, sentenceDelay, cacheVersion }] }`. `tier` ∈
  `standard | premium | local`. `segmentGranularity` must be `'sentence'` or
  word highlighting is silently disabled. **Never include `creditsPerMinute`**
  — its presence makes Zotero show credit balances and a purchase prompt.
- Error strings Zotero's Read Aloud UI understands: `'network'`,
  `'quota-exceeded'`, `'unknown'`. Note `'quota-exceeded'` renders *no*
  message (Zotero expects its credits UI to explain it, which we suppress), so
  mapping rate limits there makes them silent. Still open, see below.
- Return values must be built as `new targetWindow.Promise(...)` and the
  results `Cu.cloneInto`'d into the reader iframe, or cross-compartment access
  throws. Native does exactly this (`reader.js:1744-1826`).
- The plugin sandbox whitelist is above. Run JavaScript runs in chrome scope
  and proves nothing about the sandbox.
- `manifest.json` → `applications.zotero` needs `id`, `update_url`,
  `strict_max_version`, or Zotero refuses the install with a generic message.

---

## Coexisting with Zotero's own voices (added 2026-08-22)

The first hijack *replaced* `_getReadAloudRemoteInterface`, so Zotero's
Standard/Premium cloud voices vanished and ours appeared under "Standard".
Now the override builds a **composite**: it calls the prototype's original
method (`Object.getPrototypeOf(reader)._getReadAloudRemoteInterface.call(
reader, targetWindow)`, lazily, once) and

- `getVoices`: runs both sides concurrently; keeps Zotero's tiers, credits
  and `devMode`; appends ours under `local`. Either side may fail alone;
  an error is reported only when both do. Zotero's side is guarded by a
  20 s timeout because its promises never reject (an exception inside the
  executor leaves them pending — reader.js xpcom 1749-1760).
- `getAudio`: ids that don't decode as `provider::voice` go to Zotero.
- credits calls pass through.

**A tier of the plugin's own is impossible.** `TierSelect`
(reader bundle 38826-38853) hard-codes standard / premium (logged in only)
/ local, and `parseVoicesResponse` (40522) drops any other key. So plugin
voices live in **Local**, beside the OS voices, labelled
`TTS-<Provider>-<voice>` (`TTS-Azure-Ava Multilingual`).

Voice list order and languages (2026-08-22): Zotero shows voices in the
order given (`buildVoiceOptions` sorts only by `creditsPerMinute`, which we
never set) and flattens configs in order, locale by locale — so the catalog
is emitted as **one config per voice, sorted by label** with a
`zh`-collated comparator (Latin alphabetical, Han by pinyin). Multilingual
voices — all OpenAI(-compatible) voices, and Azure voices whose ShortName/
DisplayName/LocalName contains "Multilingual"/"多语言" — use locale **`mul`**
(BCP-47 "multiple languages"): Zotero labels languages with
`Intl.DisplayNames`, which renders `mul` as "Multiple languages" / "多语种",
so they get their own entry in the language dropdown instead of being
repeated under every language (the user rejected the earlier `'*'` wildcard,
which did exactly that). `'*'` remains Zotero's wildcard if ever wanted:
`isLanguageSupported` matches it to every language and
`getSupportedLanguages` hides it from the dropdown. Consequence of `mul`:
Zotero picks the document's language on open, so a multilingual voice has to
be chosen by switching the dropdown to "Multiple languages".

OpenAI provider = any OpenAI-compatible server (2026-08-22, after the user
rejected hard-coding the 11 OpenAI voice names): voices come, in order of
trust, from the
`openai.voices` pref the user typed (comma-separated), else from
`GET /v1/audio/voices` (a de-facto extension; OpenAI itself answers 404;
shapes `{voices:[{id,name}]}`, `{voices:[..]}`, `{data:[..]}`, bare array are
all read), else OpenAI's documented list (`OPENAI_DEFAULT_VOICES`). All get
the `'*'` locale. The model is free text (`html:input` + `html:datalist`);
Test connection uses `listModels()` (`/v1/models`) as the probe, fills the
datalist with the server's models (speech-related first), and says whether
the typed model is listed. Word highlighting via OpenAI-compatible servers
is not possible: the speech API carries no timings (Zotero's own Read Aloud
gets them from Zotero's server, `api.zotero.org/tts/speak` with
`timestamps: 1`). A transcription-based (whisper word timestamps) option was
described to the user and not requested.

Nothing may hang (2026-08-22, user rule: fail loudly, never hang): every
request is bounded by `core/timeout.ts` — synthesis 60 s (aborts the
injected controller), plugin voice catalog 30 s, Zotero's own voices 20 s,
Test connection 15 s — and a timeout surfaces as `'network'`, which Zotero
renders with a Retry. OpenAI's Test connection used to be fake (its voice
list is static), so any URL and key "connected"; it now probes
`GET {base}/v1/models` with the key (`TTSProvider.checkConnection`), and
401/403 map to the new `auth` kind. Base URLs are normalized
(`providers/base-url.ts`): trailing slashes and the SDK-style `/v1` suffix
are dropped, for OpenAI and Kokoro alike.

Providers are independent switches since 2026-08-22 (`openai.enabled`,
`azure.enabled`, `local.enabled`; the old single `provider` pref is migrated
once at startup by `migrateLegacyProviderPref`). Every enabled provider's
voices are listed together (`collectCatalog`: one failing to list is logged
and skipped, never fatal). `createProvider(id, settings, deps)` builds any
provider regardless of its flag, because Zotero may still ask for a voice
of a provider switched off since. The pane has a Test-connection button per
provider. The Local section is one block per engine — "Enable
Kokoro-FastAPI" + Address — with no engine dropdown while Kokoro is the
only engine (`local.engine` pref kept for a future second block). If a
dynamically filled `menulist` ever returns: its value must be re-applied
after the items are added — Zotero syncs the pref into it before `onload`.
Which controller handles a voice is decided by the voice object
(`RemoteReadAloudVoice.getController`), not by its tier, so remote voices
under `local` still route to our `getAudio`. Side effect: the popup's
speed slider treats the local tier as "pause while dragging"
(`isLocal`), harmless for us.

Zotero's `_getReadAloudRemoteInterface` opens `this._window.caches` — the
Cache API whose use *from the sandbox* crashed Zotero (incident 3). Here it
runs inside Zotero's own function/compartment, as it does natively. Verified
live by the user on 2026-08-22: Standard/Premium play, Local shows the
plugin voices, no crash.

---

## Kokoro-FastAPI server quirks (2026-08-22)

- **`/dev/captioned_speech` streams NDJSON by default** (`stream: true` in
  `CaptionedSpeechRequest`); the adapter sends `stream: false` and gets
  one `{ audio, audio_format, timestamps }`. Before that fix every Kokoro
  synthesis failed with `decode-failed`.
- **`/v1/audio/voices` returns `{ voices: [{ id, name }] }`**, not a list of
  ids as the adapter (and its tests) assumed; the string-only filter yielded
  zero voices, so no local-engine entry ever reached Zotero. The adapter
  accepts both shapes.

The machine setup behind these findings (Docker on the Windows box, an
abandoned native uv install and its Windows-CUDA pitfalls) is in
NOTES_SUPPLEMENTARY.md; the user-facing setup is
`tutorials/kokoro-fastapi.md`.

---

## Speed shortcuts (added 2026-08-22)

Shift+Z / Shift+X / Shift+C (reset / −0.1 / +0.1, customisable in the pane)
drive **Zotero's own** Read Aloud speed — the popup slider — not the
synthesis speed in our settings. Zotero time-stretches audio it already has,
so the change is immediate and cached audio stays valid.

- Zotero 10 API: `reader._internalReader._readAloudManager` is a
  `ReadAloudManager` (bundle ~81879) with getters `active`, `speed`, `lang`,
  `selectedVoiceID` and `setSpeed(speed, persist = false)` (~82086).
  `persist = true` re-speaks and calls `_persistCurrentVoice()` →
  `onSetVoice` → xpcom `_setReadAloudVoice()` → pref
  `reader.readAloudVoices` (`{[lang]: {region, voice, speed, tierVoices}}`).
  `_persistCurrentVoice` returns early with no `_voiceID`, so the plugin
  patches the pref's `speed` field itself in that case (read-aloud-speed.ts).
  Zotero 9 had a different shape (`view._readAloud.state.controller.speed`);
  the author's earlier standalone plugin targets that.
- Hooks: `Zotero.Reader.registerEventListener('renderToolbar', fn, pluginID)`
  fires via the reader's `CustomSections` (type "Toolbar" → `renderToolbar`)
  with `event.reader` set by xpcom `_customEventHandler`; the iframe exists by
  then. It re-fires on toolbar re-renders, so the hook must be idempotent.
  `onMainWindowLoad({ window })` in bootstrap.js covers windows opened later;
  `Zotero.getMainWindows()` covers ones already open.
- Key capture: a capturing `keydown` listener on each chrome window, plus one
  on each `reader._iframeWindow` as a fallback; `defaultPrevented` guards
  against double handling. Matching uses `KeyboardEvent.code` (layout
  independent). The reader binds no Shift+letter combinations (its Shift
  combos are Shift+Arrow / Shift+Tab / Shift+Enter only).
- In the main window the keys act only when the selected tab is a reader or
  some reader is playing; editable targets (inputs, textareas,
  contenteditable, `editable-text`) are never hijacked.
- **Never call `setSpeed(speed, true)` on an idle manager.** Zotero's
  persistence path (reader `_setReadAloudVoice`, bundle ~84036) re-syncs and
  `activate()`s a manager that is not active but still holds a voice —
  `deactivate()` keeps `_voiceID` — so audio would start with the popup
  closed, and the hijack would fire synthesis requests. The plugin persists
  through Zotero only while `manager.active`; otherwise it writes the pref
  itself (found in review, 2026-08-22).
- `manager.speed` is the constructor default (1) until the manager knows its
  language and `_syncPersistedVoicesToManager` has run (popup opened). Until
  then the baseline comes from the pref, and with no language known the
  pref's `speed` is updated for every language.
- Known trade-offs: the recorder does not reject Zotero's own combos
  (Ctrl+W, Ctrl+Tab, ...); while some reader is playing, the library tab's
  type-to-find swallows nothing but the three bound keys.

---

## Still open (from the 2026-08-22 whole-branch review)

The resolved items and the one-time security note moved to
NOTES_SUPPLEMENTARY.md; these remain:

1. **Rate limit is silent.** A 429 from any provider maps to
   `'quota-exceeded'`, which Zotero renders with no message and no Retry.
   Remap to `'network'` or `'unknown'` so the user gets feedback. (The
   Test-connection synthesis probe covers visibility at test time only.)
2. **A throw inside the interface factory kills the reader tab**, not just
   Read Aloud — `_open()` has no `.catch`. Native returns `null` on failure
   and the consumer handles null; ours should too.
3. Minor: `patched` reader list in the hijack never shrinks during a
   session; `toZoteroError` reaches exhaustiveness via `default` rather
   than a `never` check; the Kokoro `call()` helper classifies a user abort
   as "local server down" (unreachable today — nothing aborts through this
   interface).

## One voice and speed across documents (added 2026-08-22)

Report: the voice and speed change every time a document is opened.
Verified in the 10.0.1-beta.1 bundle:

- `reader.readAloudVoices` is keyed by the *detected* base language
  (`sdt_segments_getSDTLang`, ~71241: PDF `Language` metadata, else ELD
  detection on ~2500 characters from the middle of the text, else `en`),
  entries `{ region, voice, speed, tierVoices }`.
- `_syncPersistedVoicesToManager` (~83883) restores only that key's entry.
  No entry → `_findFallbackVoice` (tier voice → last voice → region match →
  first) and the speed stays the constructor default 1. Fallbacks are never
  persisted, so the same document keeps re-resolving on every open.
- A voice chosen under "Multiple languages" sits under the key `mul`, which
  detection never produces. The user's pref had `mul` → a Kokoro voice via
  OpenAI, `zh` → an Azure Multilingual voice that is no longer in the zh pool
  since the `mul` change, and `et`/`fi`/`fr` entries — misdetected documents,
  most likely written by the speed shortcut: `setSpeed(x, true)` persists the
  active fallback voice along with the speed, exactly as Zotero's slider does.
- Why only a multilingual voice can be global: `getVoicesForLanguage` and
  `_applyVoice` drop any voice whose `language` does not match the manager's
  language, and forcing the manager's language would make, say, Kokoro G2P
  Chinese text as English. Azure's single-language voices are no better.

Mechanism (`modes/hijack/read-aloud-memory.ts` + `memory-sync.ts`):

- Plugin pref `zotero-tts.readAloud.memory` = `{ speed, voice: { id, lang } }`,
  learned from `Zotero.Prefs.registerObserver('reader.readAloudVoices')`:
  the speed from any entry whose speed moved; the voice from an entry whose
  voice moved *without* its speed moving (both at once = the slider persisting
  a fallback voice). Pref observers do not fire for an unchanged value, so a
  language switch that re-persists the same voice is invisible — deliberate.
  Initial guess when nothing is remembered: any entry's speed + the `mul`
  entry's voice.
- Per reader, `_internalReader._syncPersistedVoicesToManager` is shadowed on
  the instance, attached from `renderToolbar` and from our `getVoices` (which
  Zotero calls synchronously inside `loadVoices()` right before the sync).
  The wrapper writes the entry Zotero is about to read (speed; for `mul` also
  the voice) — pref observers are synchronous, so Zotero's own
  `_handleReadAloudVoicesPrefChange` has updated `_state.readAloudVoices`
  before `set` returns — and calls `manager.setLanguage('mul')` when the
  remembered voice is multilingual. Then the original runs and Zotero's own
  resolution picks the voice and speed. Nothing else of Zotero's is touched.
- `readAloud.sameForAllDocuments` (default on) is read on every sync, so the
  pane checkbox applies at once; off = Zotero's per-language behavior.
- Costs: on `mul`, sentence splitting uses sentencex's English rules (`K()`
  falls back to `en` for unknown codes) — the same as when the user picks
  "Multiple languages" by hand; the popup's language dropdown then shows
  "Multiple languages" rather than the document's language.

### Incident: Read Aloud button dead after the first build (2026-08-22)

Clicking the toolbar button did nothing. The wrapper was assigned to the
reader's internal object as a bare sandbox function; the reader's compartment
cannot call such a function (opaque wrapper — the call throws), so
`_prepareReadAloud` died right after `loadVoices()`, leaving the button
pressed and no popup. Chrome → content calls (our `manager.setSpeed`) are
fine; content → chrome needs `Components.utils.exportFunction`, which is what
Zotero does with its remote interface (`cloneInto(..., { cloneFunctions:
true })`, xpcom reader.js:234). Now exported via the `exportFunction` dep.

Second attempt, same symptom, debug output: `Error: Permission denied to
access property "length"` from reader.js. `original.apply(internal, args)`
resolves `apply` on the reader's function, i.e. the reader compartment's
`Function.prototype.apply`, which then reads `args.length` — an array from
the plugin sandbox, which that compartment may not touch. `Reflect.apply`
from our side reads the array here and passes the values individually.
Rule of thumb for the whole plugin: nothing allocated in the sandbox may be
handed to reader code as an object — primitives, or `cloneInto`, or export.

## Settings backup (added 2026-08-23)

`core/settings-backup.ts` + `ui/backup-rows.ts`. File: `{ format:
"zotero-tts-settings", version, pluginVersion, exportedAt, settings: { flat
pref names → values } }`, built from `loadSettings()` so it is always
validated. Keys included: everything in DEFAULTS, API keys too; the memory
pref (`readAloud.memory`) is state, not a setting, and is left out. Restore
coerces each value to the kind DEFAULTS declares and skips the rest — Zotero's
pref branch throws on a type mismatch with the declared default — and keeps
whatever the file does not mention. Files via Zotero's `FilePicker`
(`chrome://zotero/content/modules/filePicker.mjs`, `init(win, title, mode)`,
`returnOK`/`returnReplace`; the chosen path is `.file`, a string — there is
no `.path`, reading it gives undefined, which the first build took for a
cancel and wrote nothing) and `IOUtils.writeUTF8/readUTF8`, which
the plugin loader puts in the sandbox (xpcom/plugins.js ~168, with
`PathUtils`, `ChromeUtils`, `Services`; `OS.File` survives only as Zotero's
own shim, `chrome/content/zotero/osfile.mjs`).
Bound `preference=` inputs redraw on their own after a restore
(preferences.js registers an observer per bound element); the shortcut rows
are redrawn through the `refresh` that `initShortcutRows` now returns.

## Incident: speed shortcuts routed to a hidden tab (2026-08-23)

Report: the speed shortcuts work on Windows but do nothing on macOS — with
a telltale screenshot: the plugin's toast climbing to 1.5× while the
visible popup's slider sat at 1.2×.

**Cause — not macOS.** `pickReader` treated `manager.active` as "playing".
In Zotero (verified in the 10.0.1-beta.2 bundle), `active` means *the Read
Aloud session is open*: `activate()` sets `_active = true, _paused = false`
(~82263), `pause()` sets only `_paused = true` (~82283), and only
`deactivate()` (~82441) — called when the popup is closed (~83922) — clears
`_active`. A background tab whose popup was left open paused therefore
stays `active` indefinitely, and `find(isActive)` routed every speed key to
it: its speed climbed (the toast), the visible reader never moved (the
slider). Windows "worked" only because that session had a single reader
tab. Confirmed live via Run JavaScript: three readers; `_readers[0]`
(hidden tab) `active: true, paused: true, speed: 1.5`; the selected tab's
manager untouched at 1.2.

**Fix.** "Playing" is `active && !paused` (`isSpeaking`,
ui/speed-shortcuts.ts); a manager without a `paused` field counts as
speaking while active. With nothing speaking, the keys fall through to the
selected tab's reader as designed.

**Diagnostic notes.** `setSpeed()` always ends in `_stateChanged()`, so a
popup slider that does not move proves the manager being driven is not the
visible one — that single observation localized the bug. And "works on
platform A, dead on platform B" was a coincidence of session state (how
many reader tabs were open); the platform framing pointed at the keyboard
layer, which the on-screen toast had already exonerated.

## Local voices named after their engine (2026-08-23)

`TTS-Local-af_bella` → `TTS-Kokoro-af_bella`: `LocalEngineAdapter` gains
`voiceName` ("Kokoro"; a future Piper adapter brings `TTS-Piper-…` for
free), catalog entries carry an optional display `name` which
`pluginVoiceLabel` prefers, and "Local" remains the fallback when the
engine id is unknown. Voice *ids* (`local::af_bella`) are unchanged, so
persisted choices and cached audio survive the rename.

## Test connection proves the account can spend (2026-08-23)

Trigger: the user asked whether their Azure free quota was used up —
nothing in the plugin could answer that. checkConnection/listVoices
cannot: a key lists voices fine long after its quota ran out.

`TTSProvider.checkSynthesis(voice)` — a two-character synthesis ("Hi"),
result discarded — now runs inside `testConnection` after the voice list,
for Azure and OpenAI only (local engines have no quota; pass
`synthesisVoice` to enable). Failures render as `Connected, but synthesis
failed: …`, deliberately distinct from connection errors.

- **Azure is probed over REST** (`POST /cognitiveservices/v1`), *not* the
  WebSocket the plugin plays through: a refused WS upgrade surfaces only as
  `onerror`, so quota-out, bad key and network failure are
  indistinguishable there. REST answers 403 when the F0 monthly characters
  are gone (also for a key without synthesis permission), 401 for a bad
  key, 429 for rate limiting. Verified live against the user's eastasia
  key (token + 2-char synthesis both 200 — the quota was not, in fact,
  used up). Exact remaining characters are not queryable with the speech
  key at all; that needs the Azure portal's metrics.
- **OpenAI reports an exhausted balance as 429 `insufficient_quota`** —
  the same status as rate limiting; only the response body tells them
  apart. `checkSynthesis` reads the body on 429 and maps quota to the
  `quota` kind; everything else goes through `statusError` as before.
- Open item 1 (a playback-time 429 maps to `'quota-exceeded'`, which
  Zotero renders silently) is still open; the probe only fixes visibility
  at test time.

## Multilingual voices under every language (2026-08-23)

`readAloud.multilingualEverywhere` (default off): the catalog publishes
multilingual voices under Zotero's `*` wildcard instead of `mul`. Facts
verified in the 10.0.1 bundle that shaped the design:

- The language dropdown is **sorted by display label, hard-coded**
  (`result.sort((a, b) => a.label.localeCompare(b.label))`, ~38148). The
  catalog controls which languages exist, never their order — "put
  Multiple languages first" is impossible from the plugin, which is what
  triggered this feature instead.
- `isLanguageSupported('*', lang)` is unconditionally true — including
  `lang === 'mul'`. So `*` voices appear under every language **and**
  under a "Multiple languages" entry if one exists; publishing a voice
  under both `*` and `mul` shows it twice there, because
  `buildVoiceOptions` does not deduplicate (~38447). Hence the switch is
  either/or: on = `*` only (entry disappears), off = `mul` only.
- `getSupportedLanguages` skips `*` (~39271): wildcard voices never create
  a language entry of their own.

Voice memory had to follow: with the `mul` lane gone, a global voice is
recognized by its **id** (`isMultilingualVoiceId`: every OpenAI-compatible
voice; Azure ones whose id says Multilingual) rather than by the language
it was chosen under, and `planSync` writes it into the detected language's
entry — a `*` voice is valid there, so `setLanguage('mul')` is not needed
(and with the switch off, the old mul-lane behavior is unchanged).

## `src/modes/hijack/` → `src/read-aloud/` (2026-08-23)

The `modes/` layer existed for a standalone-player mode that was deleted
before it was ever built (see "What the plugin is"); with hijack the only
mode there will ever be, the directory is now named for what it integrates
(Zotero's Read Aloud), not how. `installHijack` keeps its name — the
mechanism did not change. Paths in older entries above are left as
written; they are history.

## Chatterbox-TTS-Server and tiny segments (added 2026-08-23)

Chatterbox-TTS-Server (devnen) runs in Docker on the Windows machine
(`~/Works/Chatterbox-TTS-Server`, CUDA 12.1 compose, port 8004; the upstream
compose ships a placeholder `HF_TOKEN`, blanked in a local
`docker-compose.override.yml` or Hugging Face refuses the download). The
plugin reaches it through the OpenAI provider: `/v1/audio/voices` →
`{ voices: ["Abigail.wav", …] }`, `voice` is the file name, `model` ignored,
`/v1/models` is 404 (handled since af79d6a), no word timestamps. Its API-key
field must be non-empty because the provider throws `no-key` on an empty key.

Incident: playback stopped with "An unknown error occurred" after a few
sentences. Server log: `OpenAI speech: processing 1 chunk(s) for input of
2 chars` → `IndexError: max(): Expected reduction dim 1 to have non-zero
size` in `chatterbox/models/t3/inference/alignment_stream_analyzer.py`
(`A[self.completed_at:, :-5].max(dim=1)` on an empty slice) → HTTP 500.
Probed: "1.", "I.", "A", "Ok", "No" fail; "2)", "Hi.", "3.1", "Yes." pass —
it is the token count, not the character count. Zotero segments section
numbers into their own sentences, so every numbered heading killed playback.
Fix (`remote-interface.ts`): a failing segment of ≤ 8 characters whose error
is the server's own (`unknown`/`decode-failed`, never key/network/quota)
becomes a 400 ms WAV of silence (`core/silence.ts`), with the whole-segment
timestamp, logged via debug, not cached. Longer failures still surface.

## Extra headers, keyless servers (added 2026-08-23)

For Chatterbox behind a Cloudflare Tunnel + Access service token the plugin
must send `CF-Access-Client-Id` / `CF-Access-Client-Secret`; `openai.headers`
(`Name: value; ...`, parsed by `core/headers.ts`) goes out with every OpenAI
provider request before Authorization. At the same time the `no-key` guard
now applies only when the base URL's host is api.openai.com: compatible
servers (Kokoro-FastAPI, Chatterbox) have no key, and a placeholder key was
the only way to use them before. A server that does want a key answers 401,
which the pane already reports as a rejected key.

## Server presets in the OpenAI section (added 2026-08-23)

The user first proposed an "official / compatible" switch that disables key,
model and voices for compatible servers. Rejected: hosted compatible services
(Groq, SiliconFlow, LiteLLM, DeepInfra) need key and model, Speaches needs
model, servers without a voice list need voices. Built instead
(`core/server-presets.ts`, `ui/server-preset-rows.ts`): a Server dropdown
with OpenAI / Chatterbox-TTS-Server / Other. A preset fills its defaults once
on switch (never on load), grays out only the fields the server provably
ignores, and `applyPreset` blanks those fields in the factory so leftovers
from another server are not sent. `other` disables nothing. The stored pref
`openai.server` is empty for settings saved before the preset existed; then
the preset is guessed from the address (api.openai.com -> openai, else
other). The menulist is not bound with `preference=` because switching has
side effects that must not run on load.

## Extra headers for the Local engine (added 2026-08-23)

Same field as the OpenAI section's, so Kokoro behind a Cloudflare Access
service token keeps its word timestamps (`/dev/captioned_speech` through the
Local provider) instead of being routed through the OpenAI section. The
Kokoro adapter merges `deps.headers` under the request's own headers, and a
401/403 is now `auth` rather than `unknown`; a 401/403 on
`/dev/captioned_speech` also skips the fallback to `/v1/audio/speech`, which
sits behind the same gateway.

## Synthesis speed setting removed (2026-08-23)

Report: "the Speed field in the settings seems to do nothing." It did
nothing, for two stacked reasons, both verified in Zotero's source.

- The pref was declared as an integer (`prefs.js`: `speed`, 1). The pane's
  `preference=` binding writes `elem.value` — a string — through
  `Zotero.Prefs.set`, which dispatches on the pref's *existing* type
  (`xpcom/prefs.js` `set()`: `getPrefType` → `setIntPref`), and an int pref
  cannot hold a fraction. So 1.2–1.9 left the pref at 1 (the default:
  nothing changed), anything below 1 became 0 and was clamped to 0.5 by
  `loadSettings`; only 2 and 3 survived. The profile checked never held a
  user value for it.
- Even a stored value was a second speed multiplying Zotero's own. The
  reader time-stretches the decoded buffer for the popup slider
  (`_playAudioBuffer` → `stretchAudioBuffer`, pitch preserved) — the speed
  the shortcuts, the toast and the cross-document memory drive. Ours was
  applied at synthesis time, so changing it meant re-synthesizing (the cache
  key carried it) while prefetched segments kept the old pace; and the
  providers were uneven: OpenAI's `gpt-4o-mini-tts` (the preset's default
  model) ignores `speed`, Chatterbox post-stretches exactly as Zotero does,
  only Kokoro and Azure change pace natively.

Decision (the user's, option A): drop the control. `Settings.speed`, the
pref, the pane row and `SynthesisOptions.speed` are gone; every provider
synthesizes at the voice's natural pace (OpenAI and Kokoro send no `speed`,
Azure's SSML has no `<prosody rate>`), and the cache key is
`[version, provider, voice, text]`. A leftover `zotero-tts.speed` user value
is harmless: undeclared now, it reads as `undefined` and nothing asks for
it. Backups from older versions list `speed` under "ignored". Rejected
alternative: feeding Zotero's slider value to the provider — every slider
move would re-synthesize and drop the prefetch, and Zotero's
re-speak-on-speed-change assumes stretching.

Pitfall to keep: a `preference=`-bound `<html:input type="number">` cannot
hold a fraction on an int pref. Declare such a pref as a string and parse
it, or store an integer (a percentage).

## WebDAV backup (added 2026-08-23)

README TODO: the settings backup should travel between machines without
carrying the JSON file by hand. Built as three bound fields in the Backup
group (URL, username, password — the password is a plain pref, like the
API keys) and three buttons: Upload, Download, Test. It is the same file
the Backup/Restore buttons write and read (`zotero-tts-settings.json` in
the folder), with the same validation and confirmation on the way back in
(`parseBackup` / `applyBackup`).

- `core/webdav.ts`: fetch with Basic auth. PROPFIND `Depth: 0` on the
  folder for Test; PUT for Upload, and when the server answers 404/409
  (missing parent — RFC 4918 says 409, some servers 404) MKCOL the folder
  and PUT again, a 405 from MKCOL meaning the folder exists after all; GET
  for Download. 401/403 → `auth`, 404 → `not-found`, any other status →
  `http` with the code; a throwing fetch or the 15 s timeout → `network`.
  `cache: 'no-store'` on every request so a download never comes from the
  HTTP cache.
- Sandbox: `btoa`, `atob`, `TextEncoder`, `TextDecoder`, `URL`,
  `DOMParser`, `crypto` and `XMLHttpRequest` are in the plugin sandbox's
  `wantGlobalProperties` (xpcom/plugins.js), so Basic auth needs nothing
  from a window. Still no AbortController: a stalled request is reported
  after the timeout, not cancelled.
- Manual, not sync — backup semantics, like the file buttons. Possible
  follow-ups: an "upload after every change" checkbox; reusing Zotero's own
  WebDAV account (its password sits in the login manager, not in a pref).
- The uploaded file contains the WebDAV password itself, since every
  setting is in the backup. Harmless: whoever can read the folder holds
  the credentials already, and restoring writes the same values back.
- Digest-only servers are not supported (fetch does not negotiate Digest
  and the plugin sends Basic up front); every common host takes Basic over
  HTTPS. (The wsgidav verification log is in NOTES_SUPPLEMENTARY.md.)

## Sentence and paragraph shortcuts (added 2026-08-23)

README TODO 2. Defaults: ArrowLeft / ArrowRight = previous / next sentence,
Shift+ArrowLeft / Shift+ArrowRight = previous / next paragraph.

- Zotero 10 API (bundle ~82296): `manager.skipBack(granularity, accelerate)`
  and `skipAhead(...)`, granularity `'sentence' | 'paragraph'`, `accelerate`
  = five units (the popup's buttons pass `event.shiftKey`). A paragraph is
  the run of segments from one `anchor === 'paragraphStart'` to the next;
  mid-paragraph, back goes to the *previous* paragraph, not to the start of
  the current one (the controller bumps delta, ~39426). Skipping while
  paused moves the highlight without playing. The popup calls
  `onLockPosition` after every skip → reader `_lockPositionToReadAloud()`
  → view `setPositionLocked(true)`, so the view follows the spoken position
  again after the user scrolled away; the plugin does the same
  (`deps.lockPosition` in ui/read-aloud-shortcuts.ts).
- The arrows are the reader's own paging keys, so a navigation binding is
  taken only while a session is open (`manager.active`, playing or paused)
  on a manager that has the skip methods; otherwise the key falls through
  untouched, before preventDefault. Speed keys keep acting on an idle
  reader (they write the pref). The recorder allows bare arrow keys for the
  navigation actions only (`shortcutProblem(s, { allowBareArrows })`);
  everything else still needs a modifier or an F-key.
- `ui/speed-shortcuts.ts` is now `ui/read-aloud-shortcuts.ts`
  (`createReadAloudShortcuts`); `core/shortcut-actions.ts` holds the action
  lists and the skip table. Older sections above use the old name.
- Not exposed: `accelerate` (×5). No toast for a skip — the moving
  highlight is the feedback. Holding a key does not repeat the skip.

## Highlight colors and the sentence under the word (added 2026-08-23)

README TODO: change the color of the Read Aloud highlight; and, in word
mode, keep the sentence highlighted as well. Research first, in the 10.0.1
bundle:

- Colors are constants: `READ_ALOUD_BASE_COLOR = '#4072e5'`,
  `READ_ALOUD_ACTIVE_SEGMENT_COLOR = base + '73'` (45%) for the unit at the
  chosen granularity, `READ_ALOUD_ACTIVE_SENTENCE_COLOR = base + '4d'` (30%)
  for the secondary slot. No pref, no CSS variable. PDF pages draw them as
  `<div class="overlayRect">` with the color in the inline style (plus
  opacity .4/.3 and `mix-blend-mode` multiply / plus-lighter by theme);
  EPUB and snapshot views draw SVG paths through a "spotlight" map keyed
  `ReadAloudActiveSegment` / `ReadAloudActiveSentence`.
- The secondary slot is, in Zotero, only a two-second flash of the unit a
  skip moved by when it differs from the primary (`lastSkipGranularity`,
  reset when playback moves on by itself). In word mode the sentence is
  never shown persistently — but the slot exists in both view kinds.
- Granularity: the `reader.readAloud.highlightGranularity` pref
  (word/sentence/paragraph) and the effective one
  (`_effective…Granularity`: word only when the segments are sentences).

Built (read-aloud/highlight-style.ts), per reader, on prototypes reached
from the views (`_internalReader._primaryView/_secondaryView/_primarySDTView/
_secondarySDTView`), exported with `Components.utils.exportFunction` and
calling the originals through `Reflect.apply`:

- PDF: `Page.prototype._pushHighlightedPosition(items, position, color)` —
  the position's identity against the view's `_readAloudHighlightedPosition`
  / `_readAloudSentenceHighlightedPosition` says which highlight it is, so
  the constants are never matched; the primary gets the word color when
  the effective granularity is word, the sentence color otherwise. The
  Page prototype is reached through `view._pages[0]`, so attaching waits
  for a rendered page (retried from renderToolbar and getVoices).
  `PDFView.prototype.setReadAloudState` keeps the sentence in the secondary
  slot in word mode: after the original, set the slot to
  `activeSegment.sourcePosition` and `_render()`; a flash of the same
  sentence is kept by cancelling its timer (through
  `reader._iframeWindow.clearTimeout` — the timer is the reader iframe's,
  not the sandbox's); a paragraph flash is left to expire.
- EPUB / snapshot: `DOMView.prototype._getSpotlightColor(key)` for the
  colors; `ReadAloud.prototype.setState` (the helper at `view._readAloud`)
  for the sentence: `view.setSpotlight('ReadAloudActiveSentence', selector,
  null)` with the selector resolved once per segment
  (`helper._resolveSegmentSelector`). Zotero's flash timer removes only
  the selector it set, so replacing it is safe.
- `this` arrives in the exported wrappers (the reader calls them as
  methods); the patch lands on the prototype that owns the method, found
  by walking the chain, so a subclass (SDT views) is covered too.
- Assignments through the cross-compartment wrapper reach the reader's
  objects (the sandbox and the reader share the system principal — no
  Xray expandos), as `_syncPersistedVoicesToManager` already relied on.

Pane: `<html:input type="color">` bound with `preference=` to a string
pref works like any other bound input (value `#rrggbb`); the opacities are
integer percent prefs, because an int pref cannot hold a fraction
(see "Synthesis speed setting removed").

### Incident: the word kept the sentence color (2026-08-23)

First build in Zotero: word mode painted the word in the *sentence* color
and never kept the sentence. `Zotero.ZoteroTTS.diagnostics.highlight()` (the
sandbox reaching out to `_internalReader._primaryView`) reported the
effective granularity `word` and the method present; the rendered rects
(`.overlayRect` in the PDF viewer document, read from Tools → Developer →
Run JavaScript) were the sentence color at 0.4 multiply. So the same
call failed only *inside* the exported wrappers. Cause: what the reader
passes into an exported function — `this` and the arguments — arrives
behind Xray wrappers. A JS Xray shows a plain object's own properties
(`_layer`, `_readAloudState`, the highlight slots) but not its prototype's
methods (`_effectiveReadAloudPrimaryGranularity` reads as undefined), and
an assignment through it lands on the wrapper, not the object — so the
granularity fell back to null (sentence color) and the sentence slot was
never really set. Objects reached from the sandbox side (`Zotero.Reader
._readers[i]._internalReader…`) are plain cross-compartment wrappers with
full semantics, which is why memory-sync.ts, which uses its captured
`internal` rather than `this`, never met this. Fix: `deps.waiveXrays`
(Components.utils.waiveXrays) on `this` and the arguments before use; the
original is still called with what arrived. The test file models an Xray
with a proxy that exposes own properties only.

### Preview and Restore in the Highlight group (2026-08-23)

The explanatory paragraph was replaced by a sample page (ui/highlight-rows.ts):
two lines of serif text on white, one with the sentence highlighted, one
with the word highlighted inside the sentence (the sentence only while the
switch is on). Each highlight is an inline span whose background is the
color at its opacity with the reader's rectangle opacity (0.4, light
theme) folded in, under `mix-blend-mode: multiply` — the same compositing
as the PDF view's `.overlayRect`, and black text stays black under it. The
bound inputs write the prefs first (Zotero's listeners were attached when
the pane was built), so the rows just listen for `input`/`change`/`command`
and repaint from the prefs; "Restore default colors" writes
DEFAULTS.highlight and repaints. The dark-theme reader (opacity 0.3,
`plus-lighter`) is not previewed.

The preview follows the reader's theme (core/reader-theme.ts, wired in
prefs-pane.ts): Zotero resolves the theme in the reader bundle's
`_updateColorScheme` — the app's `prefers-color-scheme` picks the
`reader.lightTheme` or `reader.darkTheme` pref, a theme id among
`DEFAULT_THEMES` (dark #2E3440/#D8DEE9, black, snow, sepia; copied into
reader-theme.ts) and the synced setting `readerCustomThemes`; an empty or
unknown id is the default light theme (#ffffff/#121212), and
`getModeBasedOnColors` decides light or dark by relative luminance of the
two colors. The PDF view then draws highlight rectangles at opacity 0.4
with `multiply` (light) or 0.3 with `plus-lighter` (dark); the preview
folds those into the span's rgba and blend mode. The prefs pane reads the
app scheme from its own window's `matchMedia`, the same query the reader
iframe uses. The EPUB overlay draws the same colors as SVG paths at 50%
opacity; the preview shows the PDF rendering.

### Defaults: a green word on a yellow sentence (2026-08-23, 1.4.2)

The defaults moved from Zotero's colors (#4072e5 at 45%/30%, switch off)
to a green word (#00ff00, 100%) on a yellow sentence (#ffff00, 100%) with
the sentence kept under the word. Full opacity still reaches the page at
the reader's own 0.4 (light) / 0.3 (dark). Default prefs are not stored,
so an installed copy that never touched the Highlight group picks the new
defaults up on update, while one that pressed "Restore default colors"
under 1.4.0/1.4.1 keeps Zotero's blue: the button wrote those as user
values. `DEFAULTS.highlight` is still what the button restores.

## Zotero's own prefetch, and the Prefetch setting (researched 2026-08-23)

The *Prefetch (sentences)* setting (`prefetch`, 1-10, default 3) is read
and written by settings.ts and used nowhere else: the remote interface
synthesizes the one segment Zotero asks for. It stays as a README TODO for
now. What Zotero does on its own, from reader.js (10.0.1-beta.2):

- `RemoteReadAloudController` serves every voice that comes through a
  remote interface (ours included). After a segment starts playing it calls
  `_prefetchFrom(index + 1)`: a window of `MAX_WINDOW = 3` segments, at most
  `MAX_CONCURRENT_FETCHES = 2` in flight, bounded by `_forwardStopIndex`.
  Each candidate is scored `risk - 50 * distance`, where risk = estimated
  fetch time (an exponential moving average of ms per character, initial
  1.5 ms/char, plus 250 ms) minus the time until the segment would start
  (16 characters per second, divided by the speed); the next segment gets
  +10 000 so it always goes first. Decoded buffers live in an LRU of 32
  (`AUDIO_BUFFER_CACHE_CAPACITY`), timestamps beside them; `_getAudioData`
  dedupes in-flight fetches. Both limits are `const` locals of the method,
  so nothing outside can tune them.
- Making the setting real means either shadowing
  `RemoteReadAloudController.prototype._prefetchFrom` per reader with a copy
  of that scheduler (the class is reachable from `manager._controller` once
  a session exists; ~60 lines to keep in step with Zotero), or warming our
  audio cache from `getAudio`: find the segment in
  `reader._internalReader._readAloudManager._segments` (the array
  `_createController` hands the controller) and synthesize the next N into
  the cache, one at a time, so Zotero's later fetches hit it. The second
  needs an in-memory store when `cacheAudio` is off, must yield to Zotero's
  two fetches on a GPU server (`_controller._fetching.size`), and costs
  money on paid providers for text that is never reached.
- Worth it only for servers slower than real time on average bursts: Azure
  and GPU Kokoro are far faster than playback, so Zotero's window of three
  already hides the latency.

## Prefetch made real (2026-08-23, feat/prefetch)

The Prefetch setting now works: warming from `getAudio`, the second option
above, plus a `prefetchEnabled` switch (default on; the warmer also needs
`cacheAudio` on, since the cache is where warmed audio lives). Verified
live over three rounds of debug-output traces; two traps, both invisible
to unit tests:

- **`manager.segments` is not what the player speaks.** Warming that list
  synthesized paragraph-sized texts (327, 240 chars) the controller never
  requested — money spent, zero cache hits. The speaking order is the
  *controller's* `_segments` (`manager._controller._segments`), anchored at
  `_currentIndex ?? _position` — the same expression `_prefetchFrom` uses.
- **Skip in-flight segments, never join them.** Zotero's own window slides
  three segments ahead in parallel; a serial chain that awaited segments
  Zotero was already fetching trailed it forever and never reached segment
  N+4 — the entire value of a count above three. The chain now skips keys
  that are pending or cached and synthesizes only what nobody else is on.
- With both fixed, the steady state in the trace is exactly right: every
  segment after the first plays `(cached)`, and each played segment tops
  the window up by one.

Beside the warmer, `getAudio` now dedupes in-flight synthesis per cache
key (registered synchronously, so interleaved awaits cannot double-bill):
Zotero fetches up to two segments concurrently and the warmer runs beside
them, and before this the same sentence could be synthesized twice.

## The green sentence in word mode (researched 2026-08-24)

Report: on Zotero 10.0 stable, word mode with *keep the sentence*, an
OpenAI voice (and, on that machine, Kokoro) paints the whole sentence in
the WORD color (green) while reading; skips flash yellow. Premium,
Standard and the system Local voices look right. The beta machine looked
fine, so it read as a stable-vs-beta difference. It is not:

- `resource/reader/reader.js` is byte-identical between 10.0 stable and
  10.0.1-beta.2 (md5 94c37771ed676a8277bbe1aba555592f, both 5,043,893
  bytes; stable taken from the official Linux tarball, beta from this
  machine's omni.ja). The chrome side differs only in setAnnotations /
  unsetAnnotations awaiting `_initPromise`. No Read Aloud difference at
  all between the two versions.
- The real chain: for a voice without word timestamps the plugin returns
  one timestamp spanning the whole segment (remote-interface
  `wholeSegmentTimestamp`, by design — word mode never falls back to the
  sentence on its own, it draws nothing). Zotero schedules that timestamp
  as a word event, so `activeWordSourcePosition` covers the whole
  sentence and the primary highlight IS the sentence, while
  `_effectivePrimaryGranularity` still says `word` (it checks only the
  prefs/segment granularity, reader.js 53347/76405). highlight-style
  colors the primary by that granularity, so the whole sentence gets the
  word color.
- Invisible until 1.4.2: word and sentence defaults were both #4072e5
  (45 % / 30 %), so the mispainted sentence looked like sentence mode.
  1.4.2 split the defaults (green word / yellow sentence) and exposed it.
  Any voice that yields no word timestamps shows it — OpenAI always;
  Kokoro when its server does not answer `/dev/captioned_speech` (the
  debug line says `no word timestamps for N chars`). Zotero and plugin
  versions are irrelevant; the beta machine reproduces it with an OpenAI
  voice too.
- Fixed the same day (highlight-style.ts): when the effective granularity
  is `word` but `reader._internalReader._readAloudManager.activeTimestamp`
  is the stand-in (start 0, end WHOLE_SEGMENT_END_SECONDS — a sentinel no
  real timestamp carries), the primary is demoted to `sentence`: sentence
  color, and the kept-sentence slot stays empty (the primary already is
  the sentence). The manager's `activeTimestamp` getter returns null for
  non-remote controllers, so system voices never demote. Diagnostics:
  `inspect()` now reports `wholeSegmentWord`.

### Follow-up: the word-color flash while buffering (issue #2, 2026-08-24)

The 1.5.1 demotion recognized only the stand-in timestamp — and between
segments there is none at all: on every natural advance `_handleSegmentEnd`
dispatches `ActiveSegmentChanging(null)` + `ActiveSegmentChange(null)`, the
manager nulls `_activeSegment` / `_activeTimestampIndex`, and the PDF view's
`setReadAloudState` skips the highlight update without an active position —
so the previous primary (the whole old sentence, for a wordless voice) stays
drawn through the gap while `manager.activeTimestamp` is null. The color
callback evaluates live at render time, so the demotion switched off and the
stale sentence flashed the word color; invisible with a fast server, seconds
long behind the buffering spinner. (Manual skips differ: `_skipTo` dispatches
with the new segment. A rarer path to the same state: `_segmentTimestamps`
is an LRU of 32, evictable for a still-active segment.)

Fixed by inverting the condition (highlight-style.ts): the word color only
while a *real* word timestamp is active; stand-in or none demote to the
sentence color. In the gap a real-word voice's stale last word now shows the
sentence color — neutral. System voices have no `activeTimestamp` (non-remote
controller) and no word positions, unaffected. Diagnostics: `inspect()`
reports `activeWordTimestamp: real | stand-in | none`.

## Read from selection and go to reading position (added 2026-08-24)

README TODO 3 (Shift+Space reads from the selection) plus a new Shift+Enter
that brings the view back to the spoken position. Both verified in the
installed 10.0.x bundle (the same one as the skip research, skipBack at
~82296) before implementing.

- `reader.startReadAloudAtPosition(position = null)` (bundle ~83952) is the
  whole feature: the context menu's *Read Aloud from Here* passes the click
  position, and with no argument it falls back to `getSelectionPosition()`.
  Active with segments → `_lockPositionToReadAloud()` + `jumpTo(position)`
  (no selection: `play()`). Idle → `setTargetPosition(...)`, popup opens,
  and once a voice resolves the reader auto-activates (~83587,
  `_onReadAloudEngineStateChanged`: popup open, not first-run, voice
  selected, not active) — reading starts by itself; only the first-run
  popup (no tier ever chosen) waits for the user. Start priority inside
  `_captureReadAloudStart` (~83788): view selection (consumed via
  `clearSelection`) > target > savedPosition if near the view > first
  visible segment.
- Zotero already binds this: `Ctrl/Cmd+Shift+R` and `Ctrl/Cmd+Shift+L`
  (~81690) call `startReadAloudAtPosition()`; active with no selection they
  close the popup instead. Worth knowing before wiring a duplicate.
- The plugin takes Shift+Space only when
  `internalReader.getSelectionPosition()` is truthy (the selection-popup
  state — the same guard Zotero's own key uses) and the method exists;
  otherwise the key falls through (pdf.js pages up on Shift+Space). Whether
  a session is open does not matter: idle is the point.
- "View back to the spoken position" is two steps because the lock is only
  a flag: `_lockPositionToReadAloud()` → view `lockPositionToReadAloud()`
  sets it, nothing scrolls. The scroll happens in the views' state push:
  the PDF view navigates (`ifNeeded`, centered) on *any*
  `setReadAloudState` while locked (~76333) — paused included; EPUB and
  snapshot views only when `state.activeSegment` changed identity (~53239),
  so they return at the next sentence, and while paused only after resume.
  `manager._stateChanged()` (~82454) is just a queued
  `options.onStateChange` — re-emitting state costs nothing and never
  touches audio — so Shift+Enter = lock + `_stateChanged()`.
- Rejected for Shift+Enter: `play()` — while playing the controller's
  `paused` setter re-runs `_speak()` (~40153), which re-fetches and
  restarts the current segment (offset only survives when `_indexAtPause`
  happens to match), and while paused it resumes; `jumpTo(current)` —
  `repositionTo` sets `_paused = false` (~82330), so a paused session
  starts playing, and the segment restarts. If the EPUB "next sentence"
  delay ever grates, `jumpTo` is the escalation: immediate on every view
  type, at the price of those side effects.
- Both keys live in the existing pipeline: `PositionAction` in
  core/shortcut-actions.ts, guards in ui/read-aloud-shortcuts.ts
  (`canStartFromSelection` / `canReturnToSpoken` decide *before*
  preventDefault, so an unusable key falls through untouched), wiring in
  index.ts (`startReadAloudAtPosition` feature-detected for older Zotero).
  Defaults Shift+Space / Shift+Enter; both rebindable, neither allows bare
  arrows.

## Kokoro-FastAPI: no word timestamps for Chinese voices (verified 2026-08-24)

`/dev/captioned_speech` returns `timestamps: []` for zh voices (zf_/zm_),
on both the local Docker image and a fresh remote deployment — an upstream
limitation of its zh pipeline, not a plugin or deployment issue. Chinese
text with an English voice (af_bella) yields a few clause-sized entries
(half a sentence per "word"), of which the plugin's alignment keeps ~2.
English is unaffected (spoken forms like "three" for "3" are dropped by
alignment; the rest of the sentence still highlights; first-word
start_time can be slightly negative — harmless). So Chinese word-level
highlighting needs Azure (zh-CN voices report word boundaries); Kokoro
falls back to sentence highlighting on Chinese by design. The 1.5.2 debug
note ('the captioned reply came without word timestamps') covers both an
empty reply and alignment yielding nothing.

## Read Aloud arms auto-sync every few sentences (observed 2026-08-24)

Zotero saves the reading position as a *synced setting*
(`lastReadAloudPosition_u_…`) as playback advances. Every write arms the
3 s auto-sync timer, so continuous listening runs a full data sync round
about every 11 s: one 20-minute Read Aloud stretch showed 107 rounds of
`Starting data sync for My Library` (with keys/current + groups requests
each), 125 syncedSettings UPDATEs, 586 `Beginning DB transaction` lines.
The intermittent 1-2 s whole-app freezes reported during listening most
plausibly come from these sync rounds (DB churn), not from the plugin —
the plugin never touches lastReadAloudPosition. Verify by unchecking
Settings → Sync → 'Sync automatically' during listening. Separate note:
a malformed EPUB produced 715 pairs of 'No startContainer found for
epubcfi' / 'Unable to get range for CFI' in the same 20 minutes —
Zotero-side, cheap individually, but worth ruling out with a clean file.

### Follow-up: the sentence going dark on EPUBs (issue #3, 2026-08-24)

The #2 demotion removed the kept-sentence slot whenever the primary IS the
sentence — but on EPUBs the whole-segment word position often maps to a CFI
the view cannot resolve (the reader floods `No startContainer found for
epubcfi` / `Unable to get range for CFI`, tens per second; a sentence
spanning multiple DOM nodes is enough), the primary is then not drawn at
all, and with the slot removed nothing was highlighted. Until 1.5.2 the
kept slot (the segment's own selector, computed at segmentation time —
robust) masked this. First fix attempt — fill the slot only when the
primary was not drawn — failed on EPUBs: the DOM spotlight map holds a
*selector* that fails only at render time (`toDisplayedRange`), so
"drawn" cannot be detected from the slot. Fixed by keeping the slot in
word mode unconditionally (the pre-1.5.3 condition, on the raw, undemoted
granularity); when the primary does draw, the doubled same-color tint
over the sentence is what every version before 1.5.3 always showed.
Diagnostics: `inspect()` reports `primaryShown` (slot occupancy, not
render success).

### Root cause found live (issue #3, 2026-08-24, evening)

Even the unconditional keep did not help: probing the running reader
showed the *segment* selector itself failing `toDisplayedRange`
(`epubcfi(/6/16!/4/4/12/3,:32,:168)` on El Akkad c001), while the
displayed DOM was correct (`<p>` = [empty pagebreak span, text]). The
resolver embedded in the reader (epub.js EpubCFI, reader.js ~46840)
resolves a text step /n as `textNodes(parent)[(n-1)/2]` — valid only when
text and elements alternate starting with text — while the generator
numbers positions among all children per the CFI spec, so a paragraph
starting with an element (every printed-page anchor) yields /3 for its
only text node and resolution finds nothing. Zotero's own primary
highlight (all voices, all modes) goes dark on those paragraphs; worth
reporting upstream. Verified live: rewriting /3 -> /1 resolves to exactly
the sentence. Plugin workaround (highlight-style resolvableSelector):
when the sentence selector does not resolve, rewrite the final text step
(1,3,5,7,9), accept only a rewrite whose displayed text equals the
segment text, clone it into the reader compartment
(deps.cloneIntoReader — a sandbox-built object is unreadable there), and
cache per segment. Probing lesson: Run JavaScript objects live in the
chrome compartment — hand-built selectors read as empty inside the
reader; clone with Components.utils.cloneInto(obj, view._iframeWindow)
or every probe returns false (two rounds of garbage data until a
known-good positive control exposed it).

### Follow-up: silent misresolution (issue #4, 2026-08-25)

The numbering mismatch also resolves WRONG without failing: a paragraph
with an inline element mid-text (El Akkad p. 10: pagebreak span, textA,
a <span> around the letter ع, textB) has two text nodes, and the
resolver reads the spec's /3 (textA) as text-node-list entry [1] (textB)
— the first sentence's offsets highlighted three lines below the spoken
text, no console error. The 1.5.5 repair only engaged on resolution
failure. Fixed: the sentence selector's displayed text is verified
against the segment text unconditionally (mismatch runs the same rewrite
search); and the demoted stand-in primary is painted transparent
(#00000000) when its own displayed text is not the sentence, since the
plugin cannot reposition Zotero's primary. Upstream note added to
zotero/reader#244: a resolution-side fallback cannot cover this case —
with two text nodes both numberings resolve, to different nodes; the
generator and resolver must agree on one convention.

### Follow-up: real words too (issue #4, 2026-08-25)

With a word-timestamp voice the *word* primary is misresolved the same
way (green word landing on "syrup" while sentence 1 is read). Final
design — repair BEFORE Zotero draws: the setState wrapper runs
repairWordPosition ahead of the original and verifies
state.activeWordSourcePosition against the text it should show (the
active timestamp's charStart..charEnd slice of segment.text for a real
word, the whole sentence for the stand-in); on mismatch it swaps in a
rewrite verified by displayed text (same machinery as the sentence,
cloned into the reader compartment) — assignment through the waived
state reaches the reader's object, so Zotero itself draws the primary
at the right place. Only when no rewrite shows the expected text does
the fallback remain: hiddenPrimary (own WeakMap, re-evaluated per push,
kept through the gap, reset on popup close) paints the primary
transparent via _getSpotlightColor. So misresolving paragraphs get a
correct green word again; only unrepairable shapes lose the word
highlight.

### Follow-up: sentences spanning two text nodes (issue #4, 2026-08-25)

Sentence 2 of the El Akkad paragraph crosses the inline element (textA +
span(ع) + textB), so its selector is a cross-node range
(`(P,/3:64,/5:130)`) — the single-step rewrite shape did not match and
the sentence slot stayed empty (word highlight fine, sentence gone).
Fixed with an exact mapping instead of guessing: a one-character probe
(`(P/c,:0,:1)`, c = 1,3,5,7,9, cloned) resolves once, its
range.startContainer.parentNode gives the real child list, and
textStepMap computes spec (2*elementsBefore+1) -> legacy (2*textIndex+1)
per text node; both range endpoints are rewritten through the map and
the result must still display exactly the segment text. Deeper range
parts (`,/2/3:0`) stay out of scope. DOM nodes reached through the CCW
(childNodes/nodeType/parentNode) read fine from the sandbox.

## Hiding Zotero's own Local voices (added 2026-08-26)

README TODO: a switch (`readAloud.hideZoteroLocalVoices`, default off) so
the Local tier offers only the plugin's entries, which then drop their
`TTS-` prefix. Verified in the installed 10.0.x bundle before implementing:

- The OS voices never pass through the remote interface.
  BrowserReadAloudProvider lists them straight from the reader iframe's
  `window.speechSynthesis` (~39696), and ReadAloudManager.loadVoices
  concatenates `_allVoices = [...remoteVoices, ...browserVoices]` (~82023)
  from provider instances it creates locally — so the composite getVoices
  cannot filter them, and there is no eagerly-reachable provider instance
  to patch either.
- The main popup renders from the manager's state. `useVoiceData` (~40556),
  which lists voices through provider instances of its own, feeds only the
  one-time first-run promo popup — the single surface the switch does not
  cover (`read-aloud-voices.js` / `read-aloud-first-run.js` are separate
  bundles).
- Every path that (re)builds or re-reads the list calls `_resolveVoice`
  synchronously right after: loadVoices (every popup open —
  `_prepareReadAloud`, ~83984), setLanguage, selectTier,
  applyPersistedVoices. So read-aloud/system-voices.ts shadows
  `_resolveVoice` per reader (the highlight-style pattern: exportFunction,
  waive `this`, Reflect.apply the original) and splices the system voices
  out of `_allVoices` in place first, with the array's own splice and
  primitive arguments.
- Telling the voices apart is exact: BrowserReadAloudVoice ids read
  `local-<voiceURI>` (~39626) while RemoteReadAloudVoice returns the
  published `impl.id` verbatim (~40436) — so "system" = tier `local` and
  the id does not decode with decodeVoiceId. Zotero's cloud voices sit in
  standard/premium and are untouched.
- loadVoices rebuilds `_allVoices` from scratch on each popup open, so the
  switch applies, in both directions, the next time the popup opens. A
  persisted OS-voice choice simply falls through Zotero's own
  `_findFallbackVoice`. With no enabled provider the Local tier disappears
  from the tier row (the `tiers` getter reads the filtered list).
- The label prefix rides the same switch into buildVoicesResponse as
  `plainLabels` ("Azure-Ava" instead of "TTS-Azure-Ava"); voice ids never
  change, so persisted choices and the audio cache survive.
- Attach point: `onVoicesRequested` fires synchronously at the start of the
  composite getVoices — i.e. while loadVoices awaits its Promise.all and
  before this very listing's `_resolveVoice` — so the first popup open is
  already filtered. renderToolbar (watchReader) attaches too but may run
  before the manager exists; attach() returning false there is fine, the
  next voices request retries. Diagnostics:
  `Zotero.ZoteroTTS.diagnostics.systemVoices()` reports enabled/patched and
  per-tier voice counts per reader.

## Voice browser and favorites (added 2026-08-26)

README TODO: a voice browser in the settings — locales on the left, that
locale's voices on the right, a play button per voice, a heart, and an
"offer only favorites" switch. Entirely plugin-side; nothing of Zotero's
Read Aloud is touched, so no bundle research was needed for once.

- Both the browser and the remote interface list through
  `listNamedCatalog` (read-aloud/catalog.ts; the engine-name mapping moved
  out of index.ts), so the pane and the popup agree on voices and names.
  The browser drops the TTS- prefix — everything in it is the plugin's.
  The pane auto-loads the catalog on open: the same one request per
  enabled provider the popup makes on every open, so no new cost class.
- Samples: `sampleTextForLocale` (core/sample-text.ts), one short sentence
  per language keyed by the BCP-47 base tag (zh-TW/HK/MO get traditional
  script, yue its own), `mul`/`*` get English plus Chinese in one sample —
  switching mid-sample is what a multilingual voice is for — and unknown
  languages fall back to English. Synthesis is the provider's normal
  `synthesize` bounded by the Test-connection timeout, with the
  AbortController taken from the pane's chrome window (the sandbox has
  none); results are cached in a Map for the pane's lifetime, so replays
  are free. Sample failures land in the status line, never a dialog.
- Playback: a detached `<audio>` element created in the pane document,
  fed a data: URL (`blobToDataURL`) — `URL.createObjectURL` from the
  sandbox is untested ground and a sample is small enough to inline.
  Closing the pane window tears the element down and stops playback.
- Favorites: pref `readAloud.favoriteVoices`, a JSON array of encoded ids
  (`azure::…`) — voice ids may contain any character, which rules out a
  comma-separated pref. The `favoritesOnly` switch filters in
  remote-interface (`getFavoriteVoices` → `filterCatalogToFavorites`);
  with nothing marked, or when no favorite matches anything listed (its
  provider switched off, its server gone), the full catalog is offered —
  a filter that silently emptied the Local tier would read as "the plugin
  broke". Both prefs are settings, so they ride the backup; hearts are
  repainted through the pane's onRestored like the other unbound rows.

### Follow-up: blank language dropdown (reported 2026-08-26, same day)

First live use of favorites: with the favorites reduced to multilingual
voices only, multilingualEverywhere on and the OS voices hidden, the
popup's language dropdown went blank. Verified in the installed 10.0.x
bundle before fixing:

- The dropdown's entries are `manager.languages` =
  `getSupportedLanguages(this.voices)` — **tier-filtered** (81997), and
  `getSupportedLanguages` **skips `*`** (39275, "wildcard voices … shouldn't
  appear as a selectable language option"). A Local tier holding nothing
  but wildcard voices therefore has zero language entries: the popup's
  LanguageRegionSelect renders an empty option list and the collapsed
  value shows nothing.
- Zotero's own recovery cannot run: `_resolveVoice` resets a language
  that is no longer offered (~82135) but the reset is guarded by
  `languages.length` — with an empty list even the stale `_lang` stays.
  Playback itself still works (`isLanguageSupported('*', anything)` is
  true), which is why only the dropdown looked broken.
- The tier only degenerates to wildcard-only when the OS voices are
  hidden AND every offered voice is multilingual — which the favorites
  filter can now produce at runtime from a mixed catalog.

Fix (remote-interface.ts ownVoices): in exactly that combination the
multilingualEverywhere transform is skipped for the favorites-filtered
catalog, so the voices go back under `mul` and its "Multiple languages"
entry becomes the tier's one language. With no concrete language on
offer there is nothing for the wildcard to spread the voices under, so
the switch loses nothing; any concrete-language voice beside them (or
unhiding the OS voices) restores the wildcard, and a manager stranded on
another language recovers through Zotero's own reset once the language
list is non-empty again.

## multilingualEverywhere removed; "Multiple languages" pinned first (2026-08-26)

The user's verdict after the blank-dropdown episode: the wildcard switch
now showed the very entry it promises to remove (the 1.5.8 degenerate-case
fallback), so drop the feature and instead put "Multiple languages" at the
top of the popup's language dropdown, the rest alphabetical. The 2026-08-23
research had called that ordering impossible — the dropdown is sorted by
display label, hard-coded (`result.sort((a, b) =>
a.label.localeCompare(b.label))`, LanguageRegionSelect ~38149) and the
catalog controls only which languages exist. That verdict missed one step:
the sort key is the LABEL, and the label is produced by
`Intl.DisplayNames.prototype.of` — a prototype method of the reader
iframe's compartment, patchable per reader exactly like Zotero's own
prototypes. Overturned; built as read-aloud/multilingual-first.ts.

- The shadow returns the `mul` label with one leading U+0020. Two runtime
  facts carry it, both verified:
  - ICU collates the space before every letter and Han character — checked
    for en/zh/ja/de/fr/es via node (same ICU family as Gecko), including
    Han-vs-space under zh collation, and pinned in the module's test. The
    component's comparator runs with no explicit locale, i.e. the app's.
  - HTML white-space collapsing removes a leading space when rendering:
    the option rows and the closed trigger are `white-space: nowrap`
    (reader.css `.custom-select…`), so the entry sorts first and displays
    unchanged. Mid-sentence (the "no {tier} voices for {language}" status,
    reader.js ~40818, the only other DisplayNames.of caller in reader.js)
    the doubled space collapses to one.
- Component internals that make the patch land: LanguageRegionSelect
  creates its DisplayNames instances inside the component (~38114) and
  calls `.of()` per render — method lookup is dynamic, so a patch attached
  before the next state sync applies; `manager.languages` returns a fresh
  array per read, so the options useMemo recomputes on every state change.
- Costs, accepted: the dropdown's type-ahead compares
  `label.toLowerCase().startsWith(...)`, so typing "m"/"d" no longer jumps
  to the entry (it is already first); the first-run promo popups
  (read-aloud-voices.js / read-aloud-first-run.js) are separate windows
  and keep the plain label and alphabetical position. If a Zotero update
  changes the sort or the rendering, the entry falls back to sorting
  alphabetically — nothing breaks.
- The removal itself: pref, pane checkbox, `VoicesResponseOptions.
  multilingualEverywhere` (`*` publishing), the remote-interface dep, the
  1.5.8 degenerate-case fallback, and planSync's fourth parameter are all
  gone — multilingual voices always publish under `mul` and memory-sync
  always restores through the mul lane. `isMultilingualVoiceId` stays:
  pref entries written while the switch was on hold multilingual voices
  under concrete languages, and it is what still recognizes those. A
  leftover `readAloud.multilingualEverywhere` user value is undeclared
  now and reads as undefined (the `speed` precedent); backups from
  switch-era versions list it under "ignored".
- Diagnostics: `Zotero.ZoteroTTS.diagnostics.multilingualFirst()` reports
  per reader whether the prototype is patched and what the live mul label
  reads (leading space = working).

### Incident: patched: false everywhere, then a diagnostics crash (2026-08-26)

First install of multilingual-first: no reader patched, the dropdown
unchanged, and `diagnostics.multilingualFirst()` printed bare
`{patched: false}` per reader — no mulLabel field, meaning the sandbox
read `reader._iframeWindow.Intl` as undefined (a visible Intl would have
produced either the label or an error entry). WebIDL members of the same
window read fine (highlight-style's clearTimeout always worked); only
the JS engine globals were missing — an Xray-flavored view. Fixed by
waiving the window before reaching Intl
(`waiveXrays(reader._iframeWindow).Intl…`), which the user verified
live: "Multiple languages" pinned first.

Unresolved wrinkle, recorded deliberately: a probe sandbox built like the
plugin's (`new Cu.Sandbox(systemPrincipal, {sandboxName})`, run from Run
JavaScript with the window injected from chrome) saw `typeof win.Intl`
=== 'object' *directly* — contradicting the Xray reading, though it ran
in a different session (after a restart) and with the window handed in
from chrome rather than read off the reader proxy in-sandbox. So the
exact trigger for the invisible-Intl state is not pinned down; the waiver
is kept unconditionally, since waiving an already-transparent wrapper
returns the same object and costs nothing. inspect() now reports
`intl: {direct, waived}` from the real plugin sandbox, so the next
occurrence answers the question by itself.

The user's first diagnostics run after the fix crashed with
`TypeError: missing "type" option in DisplayNames()` — a second, separate
compartment bug: inspect handed `new win.Intl.DisplayNames(undefined,
{type: 'language'})` an options object **allocated in the sandbox**, and
the reader-compartment native cannot read a sandbox object's properties.
Note the failure shape: not "Permission denied" but the native seeing
*no* `type` at all — a native reading a foreign object degrades to
"option missing", which is quieter and easier to misread than the script
case. The rule from the Read Aloud button incident therefore extends to
natives: anything object-shaped handed to reader-compartment code —
script or built-in constructor — must be cloned over first
(deps.cloneInto). And the crash swallowed the whole report including the
intl views (the very data needed above): inspect probes are now guarded
per field, so one failing probe costs its own field, never the report.

Resolution data (same day, second run, from the real plugin sandbox):
`intl: {direct: "object", waived: "object"}` and mulLabel carried the
prefix — the invisible-Intl state was observed once and has not
reproduced; the waiver stays regardless. The same run exposed one more
membrane fact: the report's `stillPatched` identity check read false
while the patch demonstrably worked, because `proto.of` read back
through the waived window is a *different wrapper object* than the
reference exportFunction returned at install time — identity comparisons
across membranes are meaningless. The field is gone; the prefixed
mulLabel, produced through the real prototype, is the proof that
matters.

## The sentence leaves the word alone (added 2026-08-26)

README TODO: in word mode the word was not the color that was picked,
because the kept sentence and the word tinted the same pixels. Verified
against the installed bundle (`resource/reader/reader.js`, sha1
c29b36de..., byte-identical to the unpacked copy) and the matching
zotero-reader sources.

How Zotero draws the two highlights, and why an overlap is neither color:

- PDF (`Page._buildDisplayList`): the primary is pushed first, the
  secondary second, and each rectangle becomes a
  `div.overlayRect` with `background-color: <color+alpha>; opacity: 0.4;
  mix-blend-mode: multiply` (0.3 / `plus-lighter` in a dark theme).
  Multiply is commutative, so paint order does not matter: the overlap is
  the *product* of the two tints. With the defaults (green `#00ff00` and
  yellow `#ffff00`, both 100%) the word renders `#99FF99` alone but
  `#99FF5C` over the sentence.
- EPUB / snapshot: both are `<path opacity="50%">` with the color as
  `fill`, inside one `<svg class="annotation-container blended">` that
  multiplies (dark: `screen`). Inside the SVG it is plain source-over, so
  order *does* matter — and it flips: `setSpotlight(key, null)` deletes,
  so whenever the primary selector is momentarily null its key is
  re-inserted at the end of the map. The same defaults render `#80FF80`
  alone, `#BFFF40` with the sentence on top, `#80FF40` with the word on
  top. Two different wrong colors, alternating.
- Alpha 100% does not help: Zotero's own 0.4 / 0.5 opacity is applied on
  top of the color's alpha, so both highlights are always translucent.

Solving for a replacement color (draw the word in whatever composites to
the picked color over the sentence) was rejected: multiply can only
darken and `plus-lighter` only lighten, so per channel it is often
unsolvable (a yellow word on a green sentence needs the red channel
*brighter*), and it would depend on 0.4/0.5, the blend mode and the
theme — the most likely things to change upstream.

What was built instead is geometric, and stated as one rule: **the
secondary highlight is drawn only where the primary is not.** Besides the
word, that also removes two older doubled tints: the stand-in word
position of a wordless voice (the primary covers the whole sentence, so
the kept sentence now subtracts to nothing) and a sentence-granularity
flash landing on the sentence already shown.

- PDF: in the shadowed `_pushHighlightedPosition`, when the secondary is
  the one being drawn, `subtractRects` cuts the primary's rectangles for
  this page out of it and the pieces are pushed instead (cloned into the
  reader first — reader code cannot read a sandbox object). Both position
  rectangle sets are line boxes from the same mapper
  (`pdf-position-mapper.textNodeSpansToSourcePosition` -> `mergeLineRects`,
  `sameLine` = 60% vertical overlap), so they line up. A true rectangle
  difference, not a full-height cut: the word box is usually shorter than
  its line box, and the strips above and below it stay sentence-colored
  rather than becoming a hole in the band. Doing it at paint time keeps
  the slot holding the real sentence position (all the identity
  bookkeeping is untouched) and costs no extra render — Zotero rebuilds
  the display list on every word and diffs it by `JSON.stringify`
  signature.
- EPUB / snapshot: two slots of our own, `ZoteroTTSSentenceHead` /
  `ZoteroTTSSentenceTail`. `_renderAnnotations` iterates the whole
  `_spotlights` map and asks `_getSpotlightColor(key)` per entry, which is
  already shadowed, so any key draws. What the slots hold is not a
  selector but a piece of one (`{ztts, sentence, word}`), turned into a
  range by a third shadow, `toDisplayedRange`: both selectors are resolved
  through Zotero's own resolver *at render time* and the sentence range is
  cut at the word's boundary points. Nothing of ours is ever a generated
  CFI — `toSelector` is the generator whose text-step convention the
  resolver disagrees with (issues #3/#4), so a CFI we built would be wrong
  exactly where those are. It also means no staleness: the pieces are cut
  from the very ranges Zotero is drawing.

Details worth keeping:

- The pieces are prepared *before* the original `setState`, so Zotero's
  own render of the moved word draws them. A word update only rewrites
  what the two slots hold, never the map, so the render count is
  unchanged; one render is added when the pieces appear and one when they
  go.
- Anything that leaves the word unusable falls back to the whole sentence
  in the head slot and nothing in the tail — the word position resolving
  to nothing, or resolving *outside* the sentence (the right text in the
  wrong place, issue #4). When it cannot even be verified, `hiddenPrimary`
  is already set and the pieces are not used at all: the sentence goes
  back into Zotero's own slot in one piece.
- `dispose()` must take our two keys out of every DOM view *before* the
  prototypes are restored: Zotero's own `_getSpotlightColor` throws
  `Unknown highlight key` on anything but its three, which would break the
  whole annotation render. The views are held as `WeakRef`s for that.
- Whether a view's `toDisplayedRange` was patched is marked with a property
  on the view (`_zoteroTTSSentencePieces`), not a WeakSet, and "are the
  pieces out?" is read from the spotlight map by key. The view is reached
  one way when attaching (from `_internalReader`) and another way while
  drawing (off the waived Xray `this` of `setState`), and those are
  different wrapper objects for the same reader object — the membrane
  identity trap the `stillPatched` field fell into. A boolean and a string
  key read the same through either wrapper.
- Cosmetic, accepted: `annotation-overlay.tsx` expands a spotlight
  rectangle by 2px inline and to the full line height, and only for
  Zotero's own two keys (`isSpotlight`). The pieces are therefore
  glyph-height, like an ordinary highlight annotation, while the word keeps
  its taller box and stands a little proud of them — closer to how the PDF
  view already looks, since its rectangles are glyph-height too. The word's
  2px inline expansion also overlaps each piece by 2px; invisible in
  practice.
- Left alone: a *paragraph* flash after a paragraph skip still covers the
  word for its two seconds, as before.
- The pane preview (ui/highlight-rows.ts, the `-word-before` / `-word`
  / `-word-after` spans) shows the new rendering: three siblings, the
  sentence color never behind the word.
- `diagnostics.highlight()` proves the mechanism rather than the look:
  `secondaryTrim` (PDF) counts the sentence's rectangles, the primary's,
  and the pieces left of them, and `sentencePieces` (EPUB / snapshot) is
  the text each of our two slots actually draws — resolved through the
  patched `toDisplayedRange`, so it is the same path the renderer takes.

### Two things the first build got wrong, found in use (2026-08-26)

**The whole line flickered as the word moved.** The first cut was a true
rectangle difference, which leaves a strip above and below the word running
the full width of the line whenever the word's box is shorter than its
line's — and that thickness changes with every word (ascenders, descenders,
a taller character somewhere on the line, or just a hundredth of a point of
disagreement between the two positions). The cut now runs the **full height
of the line rectangle**, gated by Zotero's own `sameLine` test (60% of the
shorter height), so the highlight's outline never changes; only the slot
moves. To keep that slot from showing bare page around a shorter word, the
primary's rectangles are grown to the height of the sentence line each sits
on (`fittedPrimaryPDF`) — which is also what the EPUB view already does to
a spotlight of its own (`expandRect` to the line height).

**A patch of sentence color was left where the last word had been.** Between
segments the manager fires `ActiveSegmentChange(null)`, which nulls both the
active segment and the timestamp (manager.ts), and `setReadAloudState` then
skips its whole update — `if (activePosition?.pageIndex !== undefined)` —
so the previous word's primary stays on the page. With no timestamp it is
demoted to the sentence color (issue #2), and our own code, seeing no active
segment, took the sentence away from around it: one word-sized patch of
sentence color, alone on the page. Both view kinds now leave what is drawn
alone while the popup is open in word mode with no active segment, so the
gap shows the whole sentence in the sentence color, which is what issue #2
wanted in the first place. For the same reason a state push with no *word*
(the first push of each segment does that too) no longer swaps the pieces
out for Zotero's own sentence slot: the pieces stay and the head simply
draws the whole sentence, since the two slots are drawn at different heights
and swapping them made the band jump once per sentence.
