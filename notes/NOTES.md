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

## Zotero's own voices in the voice browser (added 2026-08-26)

README TODO: list Zotero's own Standard and Premium voices in the browser
too, so every voice Read Aloud can offer is in one place, to be sampled and
marked like the plugin's. Verified in the installed 10.0.x `omni.ja` before
writing any code — and the finding that decided the design is that **none of
it needs a reader**:

- `ReaderInstance._getReadAloudRemoteInterface` only ever reaches for
  `Zotero.Sync.Data.Local.getAPIKey()` + `Zotero.Sync.Runner.getAPIClient({
  apiKey })` (`xpcom/reader.js` 1746-1830). The reader supplies the audio
  cache and the target window, nothing else. So the settings pane calls the
  same client directly (`ui/prefs-pane.ts zoteroVoiceService`), with or
  without a document open.
- `client.getReadAloudVoices()` → `GET {api}tts/voices?lang=<appLocale>&
  version=1`, `noAPIKey` when there is no key — signed out still lists.
  Returns `{ voices, standardCreditsRemaining, premiumCreditsRemaining,
  devMode }` or `{ error: 'network' | 'unknown' }`; it **never rejects**, so
  the error field is the only failure signal there is
  (`xpcom/sync/syncAPIClient.js` 620-668).
- `client.getReadAloudAudio('sample', id)` → `GET tts/sample?voice=<id>&
  timestamps=1` with **`noAPIKey: true`** (671-740): a sample costs no
  credits and needs no account. A real segment is `POST tts/speak` with the
  key, which does cost credits — which is why the browser only ever asks for
  `'sample'`, and why a Zotero voice speaks the server's own sentence
  instead of `core/sample-text.ts`'s. The response is either audio bytes or
  `application/json { audioURL, timestamps }` and the client resolves both,
  a second reason to go through it rather than fetching the URL ourselves.
- The voices response is the same format=2 the plugin publishes
  (`read-aloud/voice-catalog.ts`), so `parseZoteroVoices` mirrors the
  reader's `parseVoicesResponse` (bundle 40519) — one entry per voice *and*
  locale — but guards every field: the native one spreads
  `localeConfig.default` unguarded and throws on a response we tolerate.
  That parser is the response's **only** consumer, and it explicitly accepts
  the plain-array locale form, so a rewritten response may emit arrays for
  `{ default, other }`.
- Tier labels are Zotero's own words (`reader.ftl`
  `reader-read-aloud-voice-tier-*`): Standard / Premium / Local, under the
  dropdown labeled "Voice Mode". Standard and Premium only appear in it
  while signed in (`TierSelect`, bundle 38826), so those voices can be
  listed and sampled here without an account, but not used for reading.

The browser is now **three columns — tier, language, voice** (the user's
correction to a first attempt that put the tier in a fourth cell of each
row): the same three steps the popup takes, so what is picked here is found
there. All three tiers are always listed, an empty one reading "(0)" rather
than disappearing and shifting the others under the pointer; the pane opens
on Local (the plugin's own) when it has voices, else on the first tier that
does. The language is **kept across a tier switch** when the new tier has
it, which makes comparing two tiers in one language a single click.

Other consequences in the plugin:

- `read-aloud/zotero-voices.ts` (pure, injected client) parses and bounds
  both calls with `core/timeout`; `ui/prefs-pane.ts` supplies the client and
  copies the audio into a sandbox `Blob` (Zotero builds it in the chrome
  window). The client's results are `Cu.waiveXrays`'d in that glue — plain
  JSON does survive an Xray, but a silently empty list would cost a
  round-trip, and waiving a transparent wrapper costs nothing.
- Either catalog may fail alone — a provider that cannot list must not hide
  Zotero's voices, and Zotero being unreachable must not hide the plugin's —
  so both are awaited with their own catch and what failed is reported
  *beside* what arrived.
- A heart means the same thing in every tier: `favoritesOnly` now also
  filters Zotero's tiers (`filterVoicesResponseToFavorites`), tier by tier.
  A tier without a single favorite is left **untouched**, the same
  never-empty rule the Local tier already had — so marking three Azure
  voices still leaves Standard and Premium whole, exactly as before.
- Zotero's own Local (operating-system) voices are still not listed: they
  never pass through any remote interface (`read-aloud/system-voices.ts`),
  and the TODO was about the cloud tiers.
- Diagnostics: `Zotero.ZoteroTTS.diagnostics.zoteroVoices()` runs the pane's
  path from inside the sandbox and reports the tier counts, the first voice,
  one real sample's byte count, and how the favorites split between the
  plugin's ids and Zotero's.

While reading `xpcom/plugins.js` for the sandbox whitelist: it also grants
`File`, `FileReader`, `URLSearchParams` and `CSS`, which the older note
(and CLAUDE.md) does not mention.

### Follow-up: "only favorites" is strict (2026-08-26, same day)

Shipped first with a per-tier safety valve — a tier none of whose voices was
marked was left whole — reasoning from the rule that keeps the Local tier
from silently emptying. The user's verdict: marking a Standard voice and no
Premium one still offered the whole Premium tier, which is not what the
switch says. The valve is now global instead of per tier
(`remote-interface.getVoices`):

- Both sides are trimmed together — the plugin's catalog
  (`filterCatalogToFavorites`) and Zotero's response
  (`filterVoicesResponseToFavorites`), both now strict — and the result is
  taken only if *something* survives anywhere. Only when not one marked
  voice is listed any more (a provider switched off, a server gone, an
  account signed out) is everything offered again, which is the case the
  valve was for. `ownVoices` therefore became `ownCatalog`: the catalog is
  filtered where Zotero's tiers are in view, and built into a voices
  response afterwards.
- An emptied tier is not hidden: `TierSelect` hard-codes its three entries
  and only sets `disabled: !tiers.has(tier)` (bundle 38826), so Premium
  stays in the Voice Mode dropdown, grayed out.
- Deliberately not done: nudging `_selectedTier` off an emptied tier.
  Zotero's own `_resolveVoice` falls back **to** local and never to a paid
  tier (bundle ~82145), which is the right instinct — silently moving a
  reader onto Standard or Premium spends credits. The cost is one bad
  state: with the OS voices hidden, the popup on Local, and only cloud
  voices marked, the language dropdown comes up empty until another tier is
  picked in Voice Mode (the 1.5.8 blank-dropdown shape, one click to leave).

## Resuming where Read Aloud stopped (added 2026-08-26)

README TODO 1. Zotero already does most of it, verified in the installed
10.0.x bundle before implementing:

- `_onReadAloudEngineStateChanged` (83601–83604) sets
  `_state.readAloudState.savedPosition = activeSegment.sourcePosition` on
  every active-segment change; `onChangeViewState` (84362–84370) hands it out
  as `lastReadAloudPosition`, and `xpcom/reader.js:1037-1042` stores it as a
  per-attachment synced setting (`get/setAttachmentLastReadAloudPosition`,
  `xpcom/data/item.js:3950`). On reopen, 82702 seeds `savedPosition` back
  from it, and `startReadAloudAtPosition()` with no argument (83970) starts
  playback there — which is what Zotero's own `Ctrl/Cmd+Shift+R` (~81690)
  calls. An unscrolled reopen therefore already resumes.
- **What is missing is durability.** 84365: on every debounced view-state
  change, a saved position that is not near the view is persisted as `null`.
  Near is ±5 pages on PDF (76414) and about −3/+4 viewport heights on EPUB
  and snapshot (53736). Pause, scroll away to check something, close — the
  position is gone. `_captureReadAloudStart` (83800) gates restoring the same
  way.
- The plugin therefore keeps its own copy: `read-aloud-position.ts` (a
  bounded LRU of `{lib, key, pos, ts}` in `readAloud.positions`, keyed by
  item **key** so it does not depend on the local itemID) filled by
  `position-sync.ts`. `Shift+B` (`resumeLastPosition`) hands the stored
  position to `startReadAloudAtPosition(position)`, which takes the
  `consumeTargetPosition()` branch (83795) and so never reaches the
  near-view gate.
- **Sampling polls; it does not wrap.** `_state.readAloudState.savedPosition`
  is read from our side every 3 s while a session is active, which needs no
  `exportFunction` and no Xray waiving. Wrapping
  `_onReadAloudEngineStateChanged` would be exact, but it is the same class
  of instance-method patch that has silently broken the Read Aloud button
  before, and a bookmark one sentence stale is not worth that. `setInterval`
  is not in the sandbox whitelist — the tick is a recursive `setTimeout`.
  Writes are throttled to 10 s; `stop()` flushes, and shutdown calls it.
- The key is consumed whenever Read Aloud exists, with or without a stored
  position (a toast says `No saved position`), so it cannot fall through.
  `Shift+R` was the first choice and is wrong: `pdf/web/viewer.mjs:19958`,
  modifier mask `cmd === 4` (Shift only) + keyCode 82, rotates the page −90°.
  `Shift+B` is free — pdf.js has no keyCode 66 binding and the reader
  bundle's only `b` is Ctrl/Cmd+B for bold inside a note editor (32154,
  guarded by `!shift`).
- Deliberately **not** an annotation, and deliberately not a synced setting:
  the position moves every few sentences, and Zotero writing its own copy
  that often is what arms auto-sync every 3 s (see the 2026-08-24 note on the
  sync storm). Our pref is local, and stays out of DEFAULTS so
  settings-backup does not carry it.
- Adding a shortcut action now also fails the build if `preferences.xhtml`
  has no row for it: `test/ui/shortcut-rows.test.ts` walks `SHORTCUT_ACTIONS`
  against the markup. A missing row used to be invisible — the action simply
  did not appear in the pane.

### The stored position was a corpse (fixed 2026-08-26, same day)

First build resumed nothing: `Shift+B` always answered `No saved position`,
and `diagnostics.position()` itself threw `TypeError: can't access dead
object`. The pref on disk was **correct** — it held the right CFI, written
while the tab was still open — so nothing was wrong with recording or with
the attachment key. What was wrong was the copy in memory.

`savedPosition` belongs to the reader's window. The sampler kept the
*reference*, so when the tab closed and that compartment was torn down the
entry became a dead object: `JSON.stringify` over it threw (killing the
diagnostics probe), and on `Shift+B` `Components.utils.cloneInto` threw —
swallowed by the shortcut's try, leaving `resumed = false`, which is exactly
the "nothing stored" toast. A correct value on disk and a corpse in memory
look identical from the outside.

Rule: **safe to read across the compartment is not safe to keep.** Anything
from the reader that outlives the call is copied into our compartment at the
boundary (`plainCopy`, a JSON round-trip — the position has to survive as
data anyway). Three further hardenings came with it: the tick re-arms in a
`finally`, so one unexpected throw can no longer end the heartbeat silently;
a pass that finds a previously-tracked attachment gone flushes at once (the
closest thing to a close event — `Reader.registerEventListener` carries only
render and context-menu hooks, and `ReaderTab.close()` notifies nobody);
and every field of `diagnostics.position()` is read behind its own guard and
copied before it leaves, since a probe that dies on the first dead object is
how this hid in the first place.

Reading the position *at* close, as the obvious design would, cannot work:
that is precisely the moment the compartment goes away. Periodic sampling is
what guarantees a usable value is already in hand — the close event is only
worth acting on to persist it.

### Adaptive tick, so resuming lands on the right sentence (2026-08-26)

With one sample every 3 s, resuming was reliably a sentence early: a
sentence lasts 3–6 s, so what was in hand when the tab closed was often the
previous one. Recording was always sentence-triggered (an entry is touched
only when the sentence changes); what was too slow was *noticing*. The tick
is now 500 ms while a reader is speaking (`active && !paused`) and 3 s
otherwise — half a second is shorter than any sentence, and idle readers
cost a few property reads. The exact alternative, wrapping
`_onReadAloudEngineStateChanged`, buys half a second for an instance-method
patch on the Read Aloud path; not worth it. Each pass now also serializes
the position once and compares the text against the last seen, so an
unchanged sentence costs one stringify and no parse.

What cannot be fixed: Zotero stamps `savedPosition` at the *start* of a
sentence, so resuming replays the sentence that was in progress. There is no
seek-within-segment API, and starting mid-sentence would be worse anyway.

## Shift+Space became the one play key; Shift+B removed (2026-08-26)

The `startFromSelection` action (pref name kept, so custom bindings
survive) now dispatches: session open → `toggleReadAloudPaused()`; idle →
selection > stored position (the old Shift+B, still through positionSync) >
bare `startReadAloudAtPosition()`. `resumeLastPosition` and the
`NO_SAVED_POSITION` toast are gone. Full decision table and accepted costs:
`notes/shift_space_logic.md`. Verified in the 10.0.x bundle while designing:

- `_onReadAloudEngineStateChanged` (~83595): unpausing while the view has a
  non-collapsed selection clears the segments and recomputes — Zotero
  itself restarts from a selection on resume. So "paused + selection →
  play from there" needs only the toggle; never pass the selection.
- `toggleReadAloudPaused` (~83933) locks the view to the spoken position on
  unpause; the popup's play button calls the same pair.
- Zotero's own bare Space (~81798) toggles pause only while
  `readAloudActive`; idle it pages. Shift+Space is now a strict superset,
  and while a session is open the two are synonyms.
- Resume-from-pause offset (`_speakInternal`, ~40188): pause <5 s resumes
  exactly; 5–20 s backs off one word, ≥20 s two words — but only for
  `lang.startsWith('en')`; every other language resumes exactly.
- `Complete` (~39499) resets `_position` to `_backwardStopIndex ?? 0`: a
  finished session replays from where *this session* started, not page 1.
- `isPositionNearView`: PDF ±5 pages (~76414); EPUB/snapshot 3 viewport
  heights above to 4 below, unresolvable positions count as near (~53736).

`diagnostics.smartKey()` reports, per reader, the state the key sees and
which branch it would take.

## Resume landed one sentence early: the close was riding on the tick (2026-08-26)

Reported as "sometimes the sentence at close, sometimes the one before".
position-sync recorded by polling only, so the pref at close held whatever
the last tick saw. The windows: ≤500 ms after a sentence starts (the
speaking tick); ≤3 s while paused (arrow-key skips move `savedPosition`
but the tick had slowed); ≤3 s right after a session starts; and the
inter-sentence gap itself, where Zotero's `savedPosition` legitimately
still names the finished sentence (stamped only when the *next* audio
starts, ~83601 — with our voices `sentenceDelay: 0` + prefetch this is
~0–200 ms and was left as is).

The 2026-08-26 "adaptive tick" entry claimed reading *at* close would be
too late, the compartment already going away. Re-verified and overturned:
on tab close, chrome-side `notify` runs `reader.uninit()` *before*
splicing `_readers`, and `uninit` itself reads reader state
(`_flushState`); the iframe's unload dispatch happens while the
compartment is alive — the shortcuts module has always relied on that same
unload to detach. And closing the *popup* (`deactivate` +
`_resetReadAloudSegmentState`) freezes but does not clear
`savedPosition` — the reset only touches `segmentAnnotations` — so the
value stays readable indefinitely.

Fix (all reads, still no patching): `captureClose(reader)` records the one
closing reader from its iframe unload and flushes past the throttle
(index.ts `hookPositionCapture`, idempotent per iframe, detached on stop);
after deactivate the sampler keeps reading readers that were active this
session (a `wasActive` set — never a fresh document, whose savedPosition
is Zotero's restored copy, not something just listened to); the fast tick
now runs while a session is open (`ACTIVE_TICK_MS`, paused included, for
the skip-while-paused case); `stop()` samples once before its final flush
(quit path). `diagnostics.position()` reports `captureHooks` — one per
open reader iframe.

## The unload hook never fired; capture moved into a reader.uninit wrap (2026-08-26)

Field evidence from the A/B/C procedure (play → close tab → inspect),
courtesy of `diagnostics.position()` run seconds after a tab close:

- `captureHooks` stayed at 3 — the iframe 'unload' hook of the previous
  entry **never fired**. Removing the iframe's node at tab close does not
  dispatch unload (unload is for navigation/window close). This also means
  the shortcuts module's unload-based `unlisten` has never fired for tab
  closes — its listener map holds dead iframes until dispose; harmless,
  but the previous entry's "the shortcuts module has always relied on that
  same unload" was wrong on both counts.
- The closed reader **lingered in `Zotero.Reader._readers`** (`active:
  false`, state readable — the close notification had not finished), and
  Zotero's own `savedPosition` had **regressed one sentence backward**
  during teardown (before close: rects starting x=349.9 on the shared
  line; after: the sentence ending x=346.9 on that same line). The
  `wasActive` continued-read then copied the regressed value over the
  correct one — the fix corrupted the very store it was protecting, which
  is what put "resume" a sentence (or, earlier, several segments) early.

Current design, replacing both mechanisms:

- `captureClose` is called from a per-reader wrap of the chrome-side
  `reader.uninit` (index.ts `hookPositionCapture`): the tab-close
  notification runs uninit synchronously while the state is whole — uninit
  itself reads it for `_flushState`. Capture first, then the original;
  the wrap restores itself on fire and on plugin stop. Same chrome-side
  per-reader patch pattern as read-aloud/index.ts; no compartment ceremony.
- `record(reader, force)`: ticks read open sessions only. The forced read
  (captureClose, stop()) also takes a session deactivated earlier — the
  popup-close value stays frozen in `savedPosition` — but never a document
  that has not played this plugin session.
- `captureClose` then **freezes** the attachment (drops it from
  `wasActive`): whatever the lingering reader's teardown does to
  `savedPosition` afterwards is noise and is not copied. Playing again
  unfreezes.
- `stop()` runs a forced pass over all readers before its final flush.

## Tab close, the real sequence: capture moved to tab.onClose (2026-08-27)

The uninit wrap was never reached either: a second A/B/C run showed
`captureHooks` still at 3 seconds after the close, the reader still in
`_readers` (deactivated, state readable) — `Reader.notify`'s close branch,
which runs `uninit`, lags the actual close by a long stretch. Reading
`Zotero_Tabs.close` (tabs.js ~726) settled the sequence: splice from
`_tabs` → **synchronous `tab.onClose()`** → DOM removal *deferred in a
setTimeout* → `Notifier.trigger('close', 'tab', …)` last. Two traps worth
keeping:

- Patching `Zotero_Tabs.close` misses the × button: the tab bar is wired
  at init with `onTabClose: this.close.bind(this)` (~541), a reference to
  the original taken before any patch.
- Wrapping the tab object's own `onClose` catches every path — close()
  itself invokes it through the property — and is Zotero's own pattern
  (xpcom/reader.js ~1968 wraps it exactly like that).

So: primary capture = per-tab `onClose` wrap (index.ts `hookTabClose`,
found via `reader._window.Zotero_Tabs._tabs` by `reader.tabID`); the
`reader.uninit` wrap stays as backstop (separate reader windows close via
`uninit` directly; the late notify's second capture is a no-op after the
freeze). The same run also confirmed the freeze works: the lingering
reader's entry stayed untouched, `ts` unchanged.

## Hooks that vanish: waive before assigning through reader._window (2026-08-27)

Third A/B/C run, tab.onClose wrap in place — and `tabHooks` still did not
drop on close: the wrap was never entered, though our side could read it
back. Best explanation on record is NOTES' own invisible-Intl incident:
objects reached **through `reader._window`** can present an Xray-flavored
view with an unpinned trigger, and an assignment then lands on the
wrapper — our side reads the expando back happily while chrome keeps
calling the original. (Assignments on objects reached through the
`Zotero.…` chain demonstrably land — installHijack's per-reader
`_getReadAloudRemoteInterface` has always worked — which is why only the
tab hook, reached via `reader._window.Zotero_Tabs._tabs`, went silent.)

Both hook installers now assign through `Components.utils.waiveXrays`
(no-op on a transparent wrapper), verify by reading back through the
waived view, and throw loudly into the error log if the wrap did not
stick — no more silent no-op hooks. `diagnostics.position()` reports
`live: {tabs, uninits}`, the counts chrome can actually see, next to the
map counts; live below map = the Xray trap again.

## Resume passed the right sentence; Zotero started one earlier (2026-08-27)

With the whole capture chain finally firing (the waived hooks work — the
trace shows tab.onClose → capture → uninit on every × close), the last
off-by-one isolated itself: the trace's `resume … pos` line proved the
stored sentence was handed to `startReadAloudAtPosition` verbatim, and
playback still began at its *predecessor* — deterministically, twice in a
row with the same input. So Zotero's PDF rect→segment mapping
(`_findReadAloudStartIndex` → `sourceToSDTPosition`) resolves a
whole-sentence rect position into the boundary's previous segment.

Fix: don't argue with the mapping — feed it the shape it handles every
day. The context menu's "Read Aloud from Here" passes a zero-area point
(`{pageIndex, rects: [[x, y, x, y]]}`, `pointerEventToPosition`, bundle
~79159). `resumeTarget()` (read-aloud-position.ts) converts a stored PDF
position into the center point of its first rect — inside the sentence's
first line, so the mapping cannot land anywhere else. EPUB/snapshot
FragmentSelectors pass through unchanged (no off-by-one observed there).
The close-path trace (`diagnostics.position().trace`) stays — it earned
its keep.

## Speed in the voice browser (added 2026-08-27)

README TODO: a speed in the voice browser, so a sample plays at the speed
it will be read at. Verified in the installed 10.0.x bundle first:

- The popup's slider is `<input type="range" min="0.5" max="3.0"
  step="0.1">` with a `toFixed(1) + '×'` label (bundle ~38808); the
  plugin's `SPEED_MIN/MAX/STEP` already mirror it. The pane's slider is the
  same element, labelled the same way.
- Read Aloud never plays a buffer at a rate: `_playAudioBuffer` (~40010)
  runs `stretchAudioBuffer` (~39746, WSOLA, pitch preserved) and plays the
  result at 1× — "AudioBufferSourceNode.playbackRate shifts pitch like a
  turntable". The sample player therefore sets `preservesPitch = true` and
  `playbackRate = rate` on its `<audio>` element: the same operation
  (Gecko's own stretcher rather than Zotero's WSOLA — the pace and pitch
  match, the artifacts may differ slightly). Synthesis stays at the voice's
  natural pace, so the per-pane sample cache serves every speed and a drag
  of the slider costs no request; `setRate` follows the slider while a
  sample plays.
- The slider starts at the speed Read Aloud will start with
  (`startingSpeed`): the cross-document memory's speed
  (`readAloud.memory`, learned from every slider move and shortcut whether
  or not the "same for every document" switch applies it), else any speed
  Zotero persisted in `reader.readAloudVoices`, else 1. In this build the
  slider drives the samples only; making it the default speed is the next
  TODO. `refresh()` (settings restore) re-reads it.
- `diagnostics.sampleSpeed()` plays a tenth of a second of silence through
  a main-window `<audio>` from inside the sandbox and reports the starting
  speed, the element's `playbackRate`/`preservesPitch` while playing, and
  the rate after `setRate(2)` — proof the element takes the rate from the
  sandbox and that this Gecko has `preservesPitch`.

### Follow-up: the sample played at 1× until the slider moved (2026-08-27, same day)

First live use: the label said 2.0×, the sample played at 1×, and only a
drag of the slider *during* playback sped it up. The player set
`playbackRate` before `src`. Setting `src` runs the media element load
algorithm, whose step 7 is "set the playbackRate attribute to the value
of the defaultPlaybackRate attribute" — the rate set a line earlier was
put back to 1 before the audio had even loaded. `setRate` touches the
element that is already playing, which is why the drag worked. Now the
rate goes on after `src`, and onto `defaultPlaybackRate` as well, so any
later load copies it again; the test's fake `<audio>` resets the rate on
`src` the way the spec does, so the order cannot regress unnoticed. The
`sampleSpeed()` diagnostic would have shown `playbackRate: 1` — the
delivery rule exists for exactly this.

## Default voice and speed: the plan (written 2026-08-27)

README TODO, split into five steps (the README lists them with their
tests). Decided with the user after 1.7.1; what follows is the mechanism
and the internals verified in the installed 10.0.x bundle, so each step
can be picked up cold. Rejected: writing only Zotero's pref and bypassing
the memory — with "same for every document" on, memory-sync would put its
own remembered choice back on the next popup open.

**The memory is the single source of truth; the browser is its UI.**
`readAloud.memory` = `{ speed, voice: { id, lang } }`
(read-aloud/read-aloud-memory.ts), learned from Zotero's pref by
memory-sync's observer and applied — when the switch is on — before
Zotero's own restore. Every step writes *both* the memory and Zotero's
own pref, so it works whether or not the switch is on.

Step 1, speed:

- Write on `change`, not on every `input` tick: the popup persists on
  pointer-up (`handleSpeedPointerUp` → `onPersistSpeed`, bundle ~38800);
  `input` keeps driving the samples live (1.7.1).
- `persistSpeed(prefs, null, speed)` (core/read-aloud-speed.ts) sets every
  language's `speed` — the shortcut does the same when no language is
  known: the user asked for a speed, not a speed in one language. Write
  the memory explicitly as well (`writeMemory`); the observer learns the
  same value, but only fires on a change.
- Open readers: `manager.setSpeed(speed, manager.active &&
  !!manager.selectedVoiceID)` — never persist through an idle manager
  (Speed shortcuts, 2026-08-22: Zotero's persistence path activates it and
  audio starts with the popup closed). The pane reaches readers through
  an injected dep from index.ts (`Zotero.Reader._readers` →
  `_internalReader._readAloudManager`), like read-aloud-shortcuts.ts.
- `diagnostics.readAloudMemory()`: the memory, Zotero's pref per language
  (`speed`, `voice`, `tierVoices`), and per open reader the manager's
  `lang`, `speed`, `selectedVoiceID`, `active`.

Step 2, showing the default:

- Row ↔ memory: a plugin voice's row id is `encodeVoiceId(provider, id)`,
  a Zotero voice's is its own id; `lang` is `mul` for a row under the
  multilingual locale, else the row locale's base language (`zh` for
  zh-CN) — the key Zotero itself persists under (`getBaseLanguage`,
  `_persistCurrentVoice` ~82100). Open the browser on that row's tier and
  locale instead of TIER_PREFERENCE when the memory names a listed voice.

Step 3, picking the default — Zotero's entry, verified:

- xpcom `_setReadAloudVoice({ lang, region, voice, speed, tier })`
  (xpcom/reader.js 1730) writes `{ region, voice, speed, tierVoices }` with
  `delete tierVoices[tier]; tierVoices[tier] = voice` — the tier is pushed
  to the **end**. `_findFallbackVoice` (bundle ~82173) runs with
  `_selectedTier` null (`applyPersistedVoices` ~82077 resets it) and takes
  `Object.keys(persistedTierVoices).pop()` as the target tier, then tries
  `tierVoices[targetTier]`, then `voice`, then a region match. So build the
  object as Zotero does; the existing `planSync` spread
  (`{ ...tierVoices, [PLUGIN_TIER]: id }`) leaves an existing `local` key
  where it was — harmless under `mul`, where only `local` lives, wrong
  under a concrete language once Zotero's tiers are in the same entry.
- `region`: `_persistCurrentVoice` stores `getVoiceRegion(voice)`; store
  the voice's own region subtag (`CN` for zh-CN, none for `mul`) so the
  `regionChanged` guard in `_findFallbackVoice` behaves as after a popup
  pick. Keep the entry's `speed` as it is.
- **Pitfall**: memory-sync's observer reads a pref write that moves both
  `voice` and `speed` of one entry as "the slider persisted a fallback
  voice" and learns only the speed (`noteVoicesChange`). Write the memory
  first, then Zotero's entry with its speed untouched — or the pick is
  forgotten.
- Scope: a `mul` voice is applied to every document by `planSync` (it
  moves the manager to `mul`); a single-language voice only through
  Zotero's entry for its language — `planSync` leaves non-global voices
  alone, the rule from "One voice and speed across documents" (forcing the
  manager's language makes Kokoro G2P English as Chinese). Zotero's
  Standard/Premium voices: same entry with their tier; `_applyVoice`
  (~82232) sets `_selectedTier = voice.tier`; signed out they are not in
  `_allVoices` and Zotero falls back on its own.
- Clearing: memory `voice: null`; Zotero's entry is left alone — the
  memory no longer overrides it, which is "Zotero's own choice".

Step 4, live sync: `Zotero.Prefs.registerObserver('zotero-tts.readAloud.memory',
fn)` — names relative to `extensions.zotero.`, observers fire
synchronously inside `set`, and the pane's own writes come back through
it (guard, as memory-sync's `applying` does). Inject it as a dep; unregister
when the pane unloads.

Step 5, favorites: `favoritesOnly` is a bound checkbox, read on every
render (`loadSettings`); the never-empty guard in remote-interface stays.

Releases: 1.7.2 after step 1, 1.8.0 after step 3, 1.8.1 after step 5 —
each on the feature branch `feat/default-voice`, ff-merged when told.

## The slider writes the default speed (step 1, done 2026-08-27)

`read-aloud/default-speed.ts` `setDefaultSpeed(prefs, speed, managers,
log)`, called from the voice browser's slider on `change` (`input` keeps
driving the samples, as in 1.7.1). Three writes, in this order:

1. The memory: `writeMemory(prefs, { ...readMemory(prefs), speed })`.
   First, so memory-sync's observer — which fires synchronously inside
   every write of Zotero's pref below — finds the speed already there and
   has nothing to write.
2. Every open reader's manager: `setSpeed(speed, active &&
   !!selectedVoiceID)`, the shortcut's rule. A playing reader changes pace
   at once (`setSpeed` writes `_controller.speed`, verified ~82086); an
   idle one gets the value without persisting (the persistence path
   `_setReadAloudVoice` ~83997 re-syncs and `activate()`s a manager that is
   *not* active — and, verified now, does *not* re-sync an active one:
   "don't re-sync (which would nuke and recreate the controller)"). Before
   the pref write, deliberately: a fallback voice persisted here for the
   first time moves together with its speed, which `noteVoicesChange`
   reads as "the slider" and ignores; after the pref write it would move
   alone and be learned as the user's voice choice. Pinned by a test in
   memory-sync.test.ts.
3. `persistSpeed(prefs, null, speed)`: Zotero's entry for every language it
   has seen. With "same for every document" off this is all Zotero gets —
   a language without an entry has nowhere to hold a speed, and only the
   memory (applied while the switch is on) supplies one.

**memory-sync no longer keeps a copy of the memory.** It used to read the
pref once at startup and update its copy only from its observer on
`reader.readAloudVoices`. The pane now writes the memory pref directly,
and on a fresh install Zotero's pref has no entry whose change could
carry the news — the copy would have stayed at `speed: null`, `planSync`
would have written nothing, and the popup would have opened at 1.0× after
a drag to 1.8× (the step's own test, failing exactly on a first install).
`readMemory(prefs)` on every use instead; step 3's row click, which
writes the same pref, is covered by the same change. Cost: one small
JSON.parse per popup open and per pref observation.

Verified in the bundle for this step:

- `_syncPersistedVoicesToManager` (~83883) applies `persisted.speed` on
  its own — no voice needed — so `{ en: { speed: 1.8 } }` written by
  `planSync` for a fresh install is enough for the popup to say 1.8×.
- The popup's slider (~38757): `handleSpeedChange` persists at once when
  not dragging (a key press), `handleSpeedPointerUp` persists after a
  drag; for the local tier it pauses during the drag and applies the
  value on release (`isLocal`). Ours needs neither: one `setSpeed` on
  release, as the shortcut does, and the plugin's voices are time-stretched
  audio like any remote voice.

`diagnostics.readAloudMemory()`: `memory` (the pref), `syncInstalled`,
`sameForAllDocuments`, `startingSpeed` (what the slider opens at),
`zotero.<lang>` = `{ region, voice, speed, tierVoices }`, and per open
reader `manager`, `lang`, `speed`, `selectedVoiceID`, `active`, `paused`.
After a release at 1.8×: `memory.speed` 1.8, every `zotero.<lang>.speed`
1.8, `speed` 1.8 on every reader.

Left to the next steps: the status line and the highlighted default row
(step 2); the slider following the popup and the shortcuts while the pane
is open came the same day (next section).

## Global speed, live (2026-08-27, step 1 follow-up)

Asked after the step-1 build: with two tabs open, the popup's slider (or a
shortcut) in tab 1 should move the settings slider and tab 2 at once.
Verified first that Zotero's own observer on `reader.readAloudVoices`
(xpcom/reader.js 670 → `_handleReadAloudVoicesPrefChange` 1238 → bundle
`setReadAloudVoices` 84045) only replaces `_state.readAloudVoices`; the
manager is re-synced only from `_prepareReadAloud` (popup open), the
language report (84482) and `_setReadAloudVoice` on an inactive manager.
So writing the pref from inside our own observer costs Zotero one state
update per reader and nothing else.

- Readers: memory-sync's observer, on learning a *speed* (a voice learned
  spreads nothing), calls `setDefaultSpeed` for every open reader — the
  pane slider's routine — under `applying` and the `sameForAllDocuments`
  switch. A manager already at the speed is skipped (the originating tab;
  `setDefaultSpeed` skips those now), an active one persists as its own
  slider would, an idle one is never persisted through, and every
  language's entry is written. The snapshot is moved on *before* the
  spread: a reader persisting inside it re-enters the observer, and the
  next real write (a voice picked in the popup) must be diffed against
  the state it started from — a stale snapshot shows a spurious speed
  move and drops the voice as "moved with the speed". Pinned by a test.
- The pane: `Zotero.Prefs.registerObserver('zotero-tts.readAloud.memory')`
  (`READ_ALOUD_MEMORY_OBSERVER`; names are relative to `extensions.zotero.`)
  through the browser's `watchMemory` dep; the slider and a playing
  sample follow; unregistered from the preferences window's `unload`. The
  pane's own write comes back through it and finds the slider there
  already. This is the slider half of README step 4; the highlight half
  waits for step 2.
- The popup's slider persists on pointer-up (and per key press), so tab 2
  follows on release, not during the drag.
- Seen in the user's pref: a key `"English"` holding `{ speed }` only. PDF
  metadata can name the language that way, `getBaseLanguage` (bundle
  38002) only strips a region, and the idle-reader path of the speed
  shortcut writes `{ speed }` under the manager's language — Zotero's own
  entries always carry region/voice/tierVoices. Harmless.

Verification: `diagnostics.readAloudMemory()` after Shift+C in one tab
with another open → `memory.speed`, every `zotero.<lang>.speed` and every
reader's `speed` agree; the settings slider, if open, shows the same.

### The switch (2026-08-27, same day)

Asked next: a switch for the global speed, default on, off = Zotero's own
per-language speeds. Two independent switches now, since the wishes are
independent — per-language voices at one speed everywhere is as
reasonable as one voice at Zotero's per-language speeds:

- `readAloud.sameForAllDocuments` keeps its name and now means the
  *voice* only (label "Use the same voice for every document"); the name
  stays because settings backups carry it.
- `readAloud.globalSpeed` (default true, "Use one speed everywhere"):
  memory-sync applies the memory's speed at sync and spreads a learned
  speed only while it is on; the voice browser's slider sets the default
  only while it is on and drives the samples only otherwise. memory-sync
  takes the two as `sameVoice()` / `globalSpeed()`, read on every sync;
  `apply()` blanks whichever half of the memory is switched off before
  `planSync`. The memory keeps learning both regardless, so a switch
  turned on later starts from the latest choice.
- Existing users who had the old switch off get the global speed on: the
  default the user asked for, and per-language speed is the rarer wish.

## Default voice shown in the browser — step 2 (2026-08-27)

Done in its own worktree (`xujialiu/todo_step2`) beside step 1, both off
`d54ef2d`, then rebased onto 1.7.2. Nothing of step 1's was assumed; the
rebase conflicted only where both appended — the README TODO, the tail of
this file, the browser's doc comment and the test file's new `describe`
blocks — plus a duplicate `readMemory` import in index.ts. Two seams were
then stitched by hand (below): step 1's `onMemoryChange` repaints the
status line too, and the line respects the `globalSpeed` switch. Verified
in the installed 10.0.x bundle first:

- `getBaseLanguage(lang)` is `lang.replace(/-.+$/g, '')` (bundle 38002):
  everything before the first hyphen, no lowercasing, no underscore —
  `zh-CN` → `zh`, `mul` → `mul`. `_persistCurrentVoice` (~82100) writes
  the entry under exactly that, so a memory `{ id, lang }` and a browser
  row meet on `memoryLangForLocale(row.locale)` (read-aloud-memory.ts).
  `core/read-aloud-speed.ts`'s `resolveVoiceLang` splits on `[-_]` and
  lowercases — a looser mirror of the reader's `resolveLanguage`, right
  for finding an entry, not for saying which row a key names.
- The reader has no `'mul'` literal at all: "Multiple languages" is just
  `Intl.DisplayNames` of the `mul` code the catalog publishes under.

The row ↔ memory rule (`defaultVoiceRows`, ui/voice-browser-rows.ts):
the rows with the remembered id under the remembered key — a Zotero voice
listed under several locales is the default only where it was picked; a
voice global by its id (`isMultilingualVoiceId`, the trace of the removed
multilingualEverywhere switch) is applied everywhere by `planSync`, so
any row of it is the default whatever key it sits under; a
single-language voice remembered under another language matches no row
and reads as "not listed now" — nobody's default, which is what
`planSync` makes of it too. The first row is where the browser opens
(tier and locale) on the **first** listing, and when a reload lost the
tier being browsed; a plain reload and `refresh()` (settings restore)
keep the selection — a restore only repaints the highlight and the line.

The status line changed hands: it used to say "N voices. Play a sample;
the heart marks a favorite." and now reads `Default: <label> · <language>
· <speed>` (`defaultVoiceLine`), `Default: <id> (not listed now) · …`
when no listed row is the voice (its provider off, Zotero signed out), and
`Default: Zotero’s own choice · …` when nothing is remembered. Listing
failures are appended with " — " and kept until the next listing; the
nothing-listed messages are unchanged; a sample failure still replaces the
line until the next repaint. The speed in it is the slider's value, which
step 1 made the default speed — it follows a drag at once (`input`), and
the popup's slider and the shortcuts through step 1's memory observer
(`onMemoryChange` now calls `paintStatus` as well). While "Use one speed
everywhere" is off the slider only paces the samples, so the line ends in
`speed per language` instead of a number; the switch is read at every
repaint, not observed — flipping the checkbox shows at the next slider
move or memory change, which is the same lag the slider's own behavior
has. The highlight following a voice picked in the popup while the pane
is open is README step 4, and `onMemoryChange` deliberately leaves the
rows alone. The row itself gets the column entries'
`SelectedItem`/`SelectedItemText` colors and a tooltip on its label.

`diagnostics.defaultVoice()`: the memory, the rows it names in the very
listing the pane gets (the plugin's catalog through `listCatalog`,
Zotero's through `zoteroVoiceService`, each failing on its own), the tier
and locale the browser opens on, and the status line it would paint — so
a wrong highlight can be told from a wrong memory.

## Global voice: the plan (written 2026-08-27, after 1.7.3)

The README TODO was rewritten around the user's next wish, the twin of
the global speed: a voice picked anywhere — the popup of any tab, a row
of the browser — reaches every other open tab and the settings at once.
The remaining steps were reordered for it: 3 the live spread between
tabs, 4 the pane's highlight following, 5 the row click (the earlier
step 3, now reaching the open tabs through step 3's routine), 6
favorites (the earlier step 5). The memory stays the single source of
truth; "Default voice and speed: the plan" above still holds for the
pref shapes and the row ↔ memory rule. Verified in the installed
10.0.1-beta.3 bundle, so each step can be picked up cold:

- `selectVoice(id)` (~82060) is `_voiceID = id`, `_applyVoice()`,
  `_persistCurrentVoice()`. `_applyVoice` (~82220) wants the voice in
  `voicesForLanguage` — the **tier-filtered** pool (`get voices` ~81995
  filters by `_selectedTier`) for the manager's language and region —
  and otherwise sets `_voice = null` and **destroys the controller**
  (playback stops) while `_voiceID` keeps the id and is persisted.
  `_persistCurrentVoice` (~82100) → `onSetVoice` → the internal reader's
  `_setReadAloudVoice` (~83997) → the xpcom pref write, and on an
  **inactive** manager `setLanguage` + `_syncPersistedVoicesToManager` +
  `activate()` — audio with the popup closed, the speed-shortcut incident
  of 2026-08-22. So `selectVoice` is never the tool for another tab: a
  wrong tier or language kills its playback, and an idle one starts.
- Zotero's own idiom for "make the manager reflect the pref" is
  `setLanguage(lang)` then `_syncPersistedVoicesToManager()` (~83883):
  what `_setReadAloudVoice` does for an inactive manager, and what every
  popup open does (`toggleReadAloudPopup` ~83906 → `_prepareReadAloud`
  ~83983, twice — at once and after the SDT language). Inside it,
  `applyPersistedVoices` (~82077) clears `_voiceID` and `_selectedTier`,
  `_resolveVoice` (~82119) takes the target tier from the entry's last
  `tierVoices` key and that tier's voice, `_applyVoice` sets the tier
  and — active, same granularity — `_createController` (~82366), which
  starts from the **current segment** (`backwardStopIndex =
  indexOf(_activeSegment)`) and copies `_speed` and `_paused`: a playing
  tab goes on with the new voice from its sentence, a paused one stays
  paused with it. A granularity change (word ↔ sentence voice) requests
  the segments again instead. No `_pendingSetVoice`, so nothing is
  persisted. Because `_voiceID` is cleared first, a resync **always**
  recreates the controller, onto the same voice too — the sentence
  restarts — so a manager already on the voice is skipped (the
  originating tab). `_region` is cleared by `setLanguage(lang)` without
  a region, as Zotero's own path does; with a region left over from the
  popup's dropdown (zh-TW) the `regionChanged` guard in
  `_findFallbackVoice` (~82173) would skip the entry's voice (zh-CN).
- The spread, then: for every other open reader whose manager is
  `active` (paused counts) and whose `allVoices` lists the voice, run
  the wrapper's own sequence — `apply()`, which writes the mul entry and
  moves the language for a global voice, then the original
  `_syncPersistedVoicesToManager` — as memory-sync's `resync(reader)`.
  An idle reader needs nothing: its next popup open runs the same. A
  reader that does not list the voice (`_allVoices` is loaded per popup
  open, and Zotero's own voices are in it only while signed in) is
  skipped and logged — a resync there would resolve a fallback and move
  the tab to some other voice.
- **Stranded on mul.** `deactivate()` (~82441) resets everything but
  `_lang`, and the manager lives as long as the reader (~82635). So a
  manager memory-sync moved to `mul` stays on `mul` across popup opens
  for the tab's lifetime: a Chinese PDF that read with Ava keeps `mul`
  and Zotero's `mul` entry after the user picks Xiaoxiao, and only a
  newly opened tab gets Xiaoxiao. Found while planning; fixed by step 3.
  `apply()` records the language it moves a manager *from* (a WeakMap
  per internal reader, overwritten on every move, deleted when the
  manager is seen off `mul`), and when the memory's voice is not global
  — a single-language voice, or cleared — moves a manager it stranded
  back to that language before Zotero's restore, so the tab gets the
  entry a fresh tab would. A manager the user put on "Multiple
  languages" by hand has no record and is left there. `planSync` takes
  that document language in place of the manager's; the switch is still
  diffed against the manager's actual language.
- Scope of the live spread: a global voice (mul, or multilingual by id)
  reaches every active reader; a single-language voice the active
  readers whose document language is its `lang` (stranded ones moved
  back first); the others are left playing and go back to Zotero's
  choice at their next popup open — changing an English tab's voice
  mid-sentence because a Chinese voice was picked elsewhere would be
  jarring. Cost: two controller recreations (a fallback, then the voice)
  where the language, region or tier changes — the same two Zotero's own
  popup makes for a language switch followed by a pick — one otherwise;
  the fallback recreation may cost one segment's synthesis.
- Learning: `noteVoicesChange` already reads a moved `voice` with an
  unmoved `speed` as a pick. Zotero persists one on `selectVoice`, on
  `selectTier` (~82066, `_pendingSetVoice`) and on the popup's language
  switch (`handleLangChange` ~38590, `persist: true`) — each is spread,
  as Zotero itself treats each as a choice. The observer fires
  synchronously inside tab 1's `_persistCurrentVoice`; the spread's
  resyncs re-enter it under `applying`, with the snapshot moved on
  first, exactly as the speed spread does. Gated by `sameVoice()`, whose
  checkbox is relabeled "Use one voice everywhere — every document and
  every open tab (off: Zotero keeps one per language)"; the pref keeps
  its name for the backups.
- Step 4 (pane): `onMemoryChange` re-reads the memory's voice; when the
  default rows change, the columns open on the first row as the first
  listing does and the voices repaint; the pane's own write (step 5)
  comes back with the same rows and is a no-op, like the slider's.
- Step 5 (row click): the memory first, then Zotero's entry for the
  voice's language as `_setReadAloudVoice` builds it (region, voice,
  speed kept, tier pushed last) — under `mul` for a multilingual row,
  else under `memoryLangForLocale(locale)` — then step 3's spread. A
  second click clears the memory only. The pitfall from the earlier plan
  stands: the entry's speed untouched, or the observer reads the write
  as the slider.
- Diagnostics: `readAloudMemory()` gains per reader the recorded
  document language and whether `allVoices` lists the memory's voice;
  the spread logs which readers it resynced and which it skipped, and
  why.

Releases: 1.7.4 after steps 3 and 4, 1.8.0 after step 5, 1.8.1 after
step 6.

## Global voice, live — step 3 (2026-08-27)

memory-sync's observer now spreads a learned voice the way it spreads a
learned speed: `spreadVoice(choice)` runs Zotero's own restore again on
every other reader that is reading, as planned above ("Global voice: the
plan"). What the build settled:

- `resync(internal)` is the wrapper's own sequence run from our side —
  `apply()`, then the original `_syncPersistedVoicesToManager` through
  `Reflect.apply` — so the mul entry is written and the language moved by
  the same code every popup open runs. Skipped: idle managers (their next
  popup open runs the wrapper), a manager already on the voice (the
  originating tab — `applyPersistedVoices` clears `_voiceID` first, so a
  resync always recreates the controller and would restart the sentence),
  a reader whose document is in another language for a single-language
  voice, and one whose `allVoices` lacks the id (walked by index; the
  array lives in the reader's compartment). Every skip is in the debug
  line: `spread read-aloud voice …: en: another language; mul: resynced`.
- `applying` became a save/restore (`whileApplying`): a resync's `apply()`
  nests inside the spread's own guard, and the old `finally { applying =
  false }` would have dropped the outer guard before the next reader.
- Document language: `movedFrom`, a WeakMap per internal reader, records
  the language `apply()` moves a manager to `mul` from; overwritten on
  every move, dropped once the manager is seen on any other language (the
  popup's dropdown), never written for a manager the user put on `mul`.
  `planSync(docLang, …)` takes the document language — the record while
  the manager is on `mul`, else the manager's — and `switching` is still
  diffed against the manager's actual language, so a non-global voice (or
  none, or the voice switch off while the speed switch is on) sends a
  stranded manager back with `setLanguage(docLang)` before Zotero's
  restore, which then finds the entry a fresh tab would. A plugin reload
  loses the records: a tab stranded by 1.7.3 stays on `mul` until it is
  reopened.
- Region: for a single-language voice on its own language, a manager
  region that differs from the entry's — `_findFallbackVoice`'s
  `regionChanged` would skip the entry's voice — is cleared with
  `setLanguage(lang)`, Zotero's own inactive-manager idiom, which passes
  no region. Applies at popup open too: the tab's earlier "Chinese
  (Taiwan)" pick yields to the voice picked elsewhere.
- The checkbox reads "Use one voice everywhere — every document and every
  open tab (off: Zotero keeps one per language)"; the pref keeps its name
  for the backups.
- `diagnostics.readAloudMemory()` per reader: `docLang` (the sync's
  record), `region`, and `listsDefault` (whether the manager's voice list
  has the memory's voice).

Verification: two tabs reading with Ava Multilingual; in tab 1 pick Ada
Multilingual → tab 2 goes on with Ada from its current sentence, and
`readAloudMemory()` shows `memory.voice` Ada and `selectedVoiceID` Ada on
both readers. Two Chinese PDFs → pick Xiaoxiao in one → the other
follows (`lang` zh on both); an English PDF beside them keeps its voice
and shows `docLang` en.

## The settings follow a pick in the popup — step 4 (2026-08-27)

The voice half of the pane's memory observer (step 1's `onMemoryChange`,
which so far moved only the slider): `followChoice` re-reads the memory's
voice, and when it changed, recomputes the default rows, opens the columns
on the first one — the first listing's rule, since the pane is the
memory's view and the user just made a choice elsewhere — and repaints;
with no listed row (cleared, or not listed now) the highlight goes and
the columns stay where the user browsed to. A memory change that moved
only the speed leaves the columns alone. A memory that changed before the
listing arrived is taken into account by `load()`, which reads the same
`choice`. A playing sample survives the re-render: the glyph is painted
from `playing` on every render. The pane's own write (step 5's row click)
comes back through the same observer with the same rows and is a no-op.
Verification is by eye: with the pane open, pick another voice in a
tab's popup → the highlight and the columns move to it and the status
line names it; `diagnostics.defaultVoice()` shows the same rows.

## A row click makes the default — step 5 (2026-08-27)

`read-aloud/default-voice.ts` `setDefaultVoice(prefs, pick | null)`, the
twin of default-speed.ts, called from the browser's row label — now a
button styled like the column entries (`ROW_LABEL_STYLE`), with the title
saying what a click does. Two writes in this order: the memory (so
memory-sync's observer, firing inside the next write, finds the voice
there and learns nothing), then Zotero's entry for `pick.lang` exactly as
`_setReadAloudVoice` builds it — `{ region, voice, speed, tierVoices }`
with the tier deleted and re-added so it is the last key, which is where
`_findFallbackVoice` takes its target tier from. The entry's speed is
kept; an entry Zotero has not written takes the memory's speed, or none:
a voice moving together with a speed reads as the slider persisting a
fallback (noteVoicesChange) and the pick would be dropped. `region` is
`regionOfLocale(locale)`, everything after the first hyphen, as Zotero's
`getVoiceRegion` reads it; `lang` is `memoryLangForLocale(locale)` (`mul`
for a multilingual row); `tier` the row's. Then the pane calls the
`spreadVoice` dep — memory-sync's routine from step 3, handed to the pane
by index.ts through `onPaneLoad(doc, { spreadVoice })`, since the pane's
module has no reach to the running sync — and every tab that is reading
switches. A second click on the default clears the memory only and
spreads nothing (Zotero's entry stays; the memory no longer overrides it).
`followChoice` prefers a default row in view, so the columns stay on the
row just clicked (a Zotero voice under two locales has two default rows).

Verification: `diagnostics.readAloudMemory()` after clicking Xiaoxiao's
row → `memory.voice` `{ id: "azure::zh-CN-XiaoxiaoNeural", lang: "zh" }`,
`zotero.zh` `{ region: "CN", voice: …Xiaoxiao…, tierVoices: { …, local:
…Xiaoxiao… } }` with `local` the last key, and `selectedVoiceID` Xiaoxiao
on every reader that was reading a Chinese document; after clicking it
again, `memory.voice` null and `zotero.zh` unchanged.

## Only a favorite can be the default — step 6 (2026-08-27)

While `readAloud.favoritesOnly` is on the popup offers only the marked
voices (remote-interface), so a default that is not one would never be
offered and Zotero would fall back silently. The browser keeps the two
consistent now:

- A row that is neither a favorite nor the default gets a grayed label
  (`ROW_LABEL_BLOCKED_STYLE`) and the tooltip "Only a favorite can be the
  default while “Offer only favorite voices” is on"; its click does
  nothing (`onPick` checks again). The default can always be cleared.
- Unmarking the default's heart while the switch is on clears the default
  (`setDefault(null)` — memory only, nothing spread) and the status line
  reads "Default cleared: <label> is no longer a favorite, and only
  favorites are offered" until the next repaint; any other heart toggle
  repaints the rows (which of them can be picked changed) and the line.
- The switch is observed (`FAVORITES_ONLY_OBSERVER`,
  `zotero-tts.readAloud.favoritesOnly`, a pref observer like the memory's,
  unregistered from the pane's unload): flipping it repaints the rows and
  the line. The line gains " — not a favorite, while only favorites are
  offered: Read Aloud cannot start with it" whenever the remembered voice
  is not marked, at every repaint, so marking it ends the warning at
  once. `favoritesOnly` is read through the dep on every render, never
  cached.

Verification is by eye: switch on with a non-favorite default → the line
warns and the other rows gray out; unmark the default's ♥ → the line
reports it cleared, and `diagnostics.readAloudMemory().memory.voice` is
null.

The README TODO is empty now and the section is gone; steps 3 to 6 are
four commits on `feat/global-voice`.

### Incident: the settings followed a pick, the other tab did not (2026-08-27)

First live run of step 3 with two tabs: picking a voice in tab 1 moved
the pane's highlight (the memory was learned) but tab 2 kept reading
with its voice. Verified in `xpcom/prefs.js`: `Zotero.Prefs` keeps a
single nsIPrefBranch observer and its own `_observers[name]` array,
called **in registration order**; a ReaderInstance registers its
`_handleReadAloudVoicesPrefChange` when the tab opens (xpcom/reader.js
670), i.e. after the plugin's startup registration, and that handler is
what copies the pref into the reader's `_state.readAloudVoices`
(`setReadAloudVoices` → `_updateState`, synchronous), which
`_syncPersistedVoicesToManager` restores from. So inside tab 1's
`Zotero.Prefs.set`, memory-sync's observer ran first, the resync ran
Zotero's restore on tab 2 against the *old* entry, and nothing changed.
It only worked by accident where `apply()` had a nested write to make
(a multilingual voice picked under a concrete language), which refreshed
every reader's copy on the way. The pane path (a row click) was fine:
its write completes, every observer included, before `spreadVoice` is
called.

Fix: memory-sync's `resync` first calls the new `refreshVoices(reader)`
dep — index.ts runs the reader's own `_handleReadAloudVoicesPrefChange`,
else does what it does (`setReadAloudVoices(cloneInto(pref,
_iframeWindow))`) — then `apply()`, then the restore. The fake reader in
memory-sync.test.ts now keeps its own copy of the pref, refreshed by an
observer registered after the sync's, exactly as Zotero's; the bug
reproduced in the existing spread tests before the fix, and one test
pins that the copy is refreshed first (and what happens without it).

## Adding a voice while a tab is reading: refused (2026-08-27)

Asked after the global voice: a tab whose popup is open does not see a
voice added in the settings (a favorite marked while only favorites are
offered, a provider switched on) — could every tab's list follow the
browser live? Researched in the 10.0.1-beta.3 bundle:

- The list is `manager._allVoices`, rebuilt only by
  `ReadAloudManager.loadVoices(loggedIn)` (~82023), which Zotero calls
  from `_prepareReadAloud` (every popup open, ~83984) and from nowhere
  else. Zotero's own "Manage voices" pushes `setReadAloudEnabledVoices`
  to open readers from the chrome side (xpcom/reader.js 1247), but this
  bundle has no such method at all — Zotero itself never refreshes an
  open popup's list.
- `loadVoices` would do it: it re-runs our composite `getVoices` (the
  favorites and hide filters included), `_resolveVoice` keeps the current
  voice if still listed, `_stateChanged` repaints the dropdowns. Two
  costs decided against it: `_resolveVoice` → `_applyVoice` recreates the
  controller on an active manager unconditionally, even onto the same
  voice, so every refresh restarts the sentence being read; and a listing
  that fails mid-playback (`RemoteReadAloudProvider.getVoices` throws,
  `handleError` yields `[]`) leaves only the OS voices, so Zotero's
  fallback moves the tab to one of them (or, with them hidden, nothing
  resolves and the session stalls). Plus one full catalog request per
  reader per change, and the address/key fields writing the pref on every
  keystroke, which would make a half-typed key empty the list.

The user's decision: refuse instead. `ui/reading-guard.ts`:
`readingTabsMessage(titles)` names the tabs (the attachment's parent item
title through `Zotero.Items.get(itemID).parentItem`, else the item's) and
says to close them or stop Read Aloud there, then add the voice again;
`refuseWhileReading` shows it through `Services.prompt.alert` and returns
true. Guarded: marking a ♥ while `favoritesOnly` is on (unmarking never;
with the switch off the popup offers everything anyway), and the three
"Enable … voices" checkboxes (`guardProviderSwitches`: on `command`, when
the box just went on and a tab is reading, both the checkbox and the pref
are put back to off — Zotero's binding writes the pref on `command` as
well and its order against ours is not relied on; switching off is never
refused). Not guarded: Reload voices (it re-lists the pane, adds nothing
to a popup by itself) and editing an address or key. "A tab is reading"
is `_readAloudManager.active`, paused included. Verification is by eye:
with a popup open in some tab, click a ♥ (favorites-only on) or an Enable
checkbox → the dialog names the tab and nothing changes; close the popup
→ the same click goes through.

### The white ring around the dialog (2026-08-27, same day)

First live look at the guard: `Services.prompt.alert` on Windows in dark
mode draws its dark body inside a white ring — toolkit's commonDialog
window keeps a light background around the dialog box in this Zotero
(10.0.1-beta.3), and a plugin cannot restyle another window's document.
The message is now an `html:dialog` of the pane's own document
(`showPaneNotice`): appended to the pane's body, shown with
`showModal()` (centered, backdrop, Escape closes), painted with explicit
light or dark colors chosen by the pane window's
`prefers-color-scheme` — the same test `currentReaderTheme` uses — plus
`color-scheme` on the element so the OK button renders for the theme;
removed on close. Where `showModal` is missing or throws, the OS prompt
is the fallback. `Services.prompt.confirm` in the Restore flow still
uses the OS prompt — a question with two answers, left alone for now.

The first in-pane version was a bare box ("ugly, and not like an alert
popup"): it is drawn like an alert window now — a title strip reading
"Zotero TTS", the warning sign (the emoji presentation, U+26A0 U+FE0F, the
OS alert's yellow triangle) beside the text with its first line in bold,
OK bottom right, Windows 11's dialog colors (`#202020` dark, `#f3f3f3`
light), a dimmed backdrop through a `<style>` inside the dialog
(`::backdrop` cannot be set inline; the element goes away with the
dialog). If this is still not enough of a window, the next step is a real
one: `aomStartup.registerChrome` for a `chrome://zotero-tts/` path and
`openDialog` on an XHTML of our own — a title bar from the OS and a
document whose background we control, so no ring.

The message lost its explanation on request ("the user does not need the
implementation detail"): it names the tabs and says "Close those tabs,
then try again." — the why stays in the README, in parentheses.

### Incident: one voice under Multiple languages, and nothing followed (2026-08-27)

Step-by-step verification of the branch, round 1: with "Offer only
favorite voices" on and Ada the only favorite under Multiple languages,
switching tab 1's language dropdown to "Multiple languages" left the
memory where it was and tab 2 on its old voice; with two multilingual
favorites everything followed. The user isolated the rule; the cause is
in Zotero's pref layer: the dropdown switch runs `setLanguage('mul',
{ persist: true })`, `_resolveVoice` finds the one voice, and
`_persistCurrentVoice` writes the `mul` entry — which already held Ada
from an earlier session, so `Zotero.Prefs.set` sees an unchanged value
and **notifies no observer at all** (our debug log had not one line for
the whole gesture). Picking Ada in the voice dropdown afterwards is the
same write again. The pref observer, the only learner until now, is
blind to a pick that changes nothing in the pref; it also explains the
earlier round's stray Steffan — the memory stayed on the last pick that
had changed the pref.

Fix (memory-sync `attachPicks`, from `attach`): the popup's three picks
are shadowed on the manager's prototype the way system-voices.ts shadows
`_resolveVoice` (`ownerOf` is exported from there now; one prototype per
reader tab bundle; `exportFunction`, `Reflect.apply`, `this` and the
options object waived) — `selectVoice`, `selectTier`, and `setLanguage`
only with `persist` (Zotero's own calls and this sync's `apply()` pass
none). After the original ran, `notePick` reads the manager's
`selectedVoiceID` and `lang` and, when the memory does not hold that
choice, writes it and spreads — the debug line reads `read-aloud memory
(a pick the pref did not show): …`. Whenever the pick did change the
pref, the observer learned it inside the persist and the hook finds the
memory there already: one spread, never two. Under `applying` nothing is
a pick (our resyncs move managers through `setLanguage` without persist
anyway). Disposed with the rest. The test fake's manager now carries its
methods on a prototype, models Zotero's resolve + persist for the three
picks, and its `zoteroWrites` skips an unchanged value like Gecko does —
so the incident reproduces in a test.

## One voice everywhere means every language (2026-08-27)

Round 2 of the live verification opened a Chinese PDF beside two English
ones reading with Blue (en-US): its popup came up on Premium / Chinese /
Zotero's own choice, by the rule from 2026-08-22 that a single-language
voice applies only to documents in its language. The user's verdict:
wrong — with "Use one voice everywhere" on, the voice goes to every
document, English voice on a Chinese PDF and Chinese voice on an English
one alike, "for one uniform and simple rule". Costs, stated and accepted:
Zotero offers a voice only under its own language, so the manager is
moved there (the popup of a Chinese PDF shows English, and sentencex
splits its sentences by English rules); an English-only engine's voice
(Kokoro) reads Chinese text as noise, Azure's English voices read it
badly but read it.

What changed:

- `planSync(docLang, voices, memory, tier)`: the lane is the voice's —
  `mul` for a multilingual voice (`isGlobalVoice`, where the catalog
  publishes it), else the language it was picked under — for every
  document; with no voice remembered, `docLang`. The lane's entry is
  made to name the voice with its tier pushed to the **end** of
  `tierVoices` (where `_findFallbackVoice` takes its target tier from —
  the earlier plan's note about the spread leaving an existing key in
  place is settled this way). The tier of a Zotero voice is not in its id:
  `apply()` reads it off the manager's `allVoices` (`tierOf`); while the
  list is still loading at a popup's first sync the entry's `voice` alone
  is set, and Zotero's own persist from the user's pick has the tier
  right anyway.
- memory-sync's record became `moved: { from, to }` per internal reader:
  `from` is the document's language (kept across moves), `to` the lane
  the manager was moved to; `documentLanguage` is `from` while the
  manager is on `to`, else the manager's language, and the record is
  dropped once the manager is seen elsewhere (the user's dropdown) or
  moved back. A manager the user put on "Multiple languages" by hand is
  moved to the voice's language like any other and back to `mul` when the
  voice is cleared.
- `spreadVoice` reaches every active reader; the "another language" skip
  is gone. The region clearing applies to any voice on its own language.

Verification: two English tabs on Blue and a Chinese tab, all reading —
the Chinese tab's popup shows English (United States) / Azure-Blue and
`readAloudMemory()` lists it with `lang: "en"`, `docLang: "zh"`; picking
Xiaoxiao in the Chinese tab moves the English tabs to `lang: "zh"` with
`docLang: "en"`.

## The voice browser's language column is the popup's dropdown (2026-08-27)

Reported on the 1.8.0-beta build: the voice browser said "American
English" where the player's dropdown says "English (United States)".
Three rules of Zotero's the column had not followed, verified in the
bundle:

- LanguageRegionSelect (reader.js ~38105) names a language through
  `Intl.DisplayNames` with `languageDisplay: 'standard'` — "English
  (United States)", "英语（美国）" — where the default `'dialect'`, which
  the column used, gives "American English" / "美国英语".
- An entry carries its region only where the list holds the base language
  in more than one region (`baseCounts`), "English" alone otherwise. The
  list is the selected tier's: `manager.languages` is
  `getSupportedLanguages(this.voices)`, and `voices` filters `_allVoices`
  by `_selectedTier` — so one language reads "English" in Zotero's tiers
  and "English (United States)" in Local once a provider speaks it in
  several regions.
- A voice files under Zotero's *normalized* language (`normalizeLanguage`,
  ~38005, applied by `getSupportedLanguages`): `cmn` → `zh`, the regions
  CN/HK/TW dropped (REGION_EQUIVALENTS — Zotero's own tiers do not name
  them), ar-XA/ar-SA → `ar-001`. So the dropdown has one "Chinese", and it
  offers every Chinese voice — `isLanguageSupported` accepts any variant
  when no region is asked for. The column had one entry per locale,
  "Chinese (China)" beside "Chinese (Taiwan)".

Built as read-aloud/language-dropdown.ts (`dropdownLanguage`,
`dropdownLabels`, `languageDisplayName`), used by `groupVoicesByTier`:
the column groups a tier's voices by dropdown language and names the
entries per tier, and the status line names the default's entry the same
way (`languageNameOf`). The selection state is a dropdown language, not a
locale; a row keeps its own locale, so a pick still remembers its region
(zh-TW → `region: 'TW'`) and a sample speaks its own script. The pane and
the `defaultVoice` diagnostic render the names in `Zotero.locale`, as
before. Diagnostic: `Zotero.ZoteroTTS.diagnostics.languageColumn()` lists
the column per tier beside every open reader's `manager.languages` for
the tier it is on, with `same` per reader.

Costs: none to the memory or Zotero's entries. With "Offer only favorite
voices" on, the popup's list is the favorites' languages, so its region
rule runs over fewer entries than the column's — the column, which lists
every voice by design, may say "English (United States)" where the
trimmed popup says "English"; `same` is false then, as the diagnostic's
`favoritesOnly` explains.

## Enable is a commit point: the provider switches (2026-08-28)

The voice browser's Reload voices button was the only way to list again
after a provider change in the same pane session (the pane listed once,
on load; a settings restore only re-read the memory), and did nothing new
the rest of the time. Rather than watch the twelve provider prefs with a
debounce, the user chose to make Enable a commit point:

- The "Enable … voices" checkboxes became one button per section,
  `Enable` / `Disable` (ui/provider-rows.ts; bottom row, beside Test
  connection, since both write to the line there). Enable runs the
  provider's connection check — `checkProvider` in prefs-pane.ts, the
  same Test connection runs: testConnection with the spend probe for
  Azure/OpenAI, the timestamp probe for Kokoro, the Model suggestions as a
  side effect — and writes the pref only when it passes; a failed check
  leaves the provider off, with the message where Test connection writes
  its own. While the check runs the button reads `Checking…` and both
  buttons are held; a click meanwhile does nothing. Disable clears the
  line — the last "Connected…" beside an Enable button read as if it
  still held (seen live, 2026-08-28).
- While a provider is on, the section's fields (`input, menulist` under
  the groupbox `ztts-provider-<id>`) are disabled; Disable unlocks them
  and hands the OpenAI section back to server-preset-rows (`onUnlocked` →
  `presetRows.refresh()`), which grays out the fields the chosen server
  ignores — a plain unlock would un-gray them. Init order matters the
  same way: the preset rows render before the provider rows lock, and
  onRestored calls `presetRows.refresh()` before `providerRows.refresh()`.
- The voice browser lists again on: Enable passing, Disable, Test
  connection passing on a provider that is on (the server came back), and
  a settings restore (`load()` after `refresh()`). Two triggers in a row:
  `load()` during a listing notes it and runs once more when done (the
  `again` flag), so the last change is what the columns show. The Reload
  button is gone; "No voices" just says to enable a provider.
- The reading guard moved with the switch: enabling is refused while a
  tab is reading (`refuseWhileReading`, before any check); disabling
  never is, as before. `guardProviderSwitches` and its checkbox-vs-binding
  order dance are gone with the checkboxes.
- Test connection stays: off, it probes without committing and fills the
  Model suggestions — which has to happen while the fields are editable;
  on, it is the retry after a server came back.

Lost: a server whose voice list changed while the pane is open needs the
settings reopened, or Test connection pressed. The local section's
heading is now the engine's name (`ztts-local-heading`, from the
registry), since the button no longer carries it.

Verified live through the zotero-dev MCP bridge (1.8.0-beta4, Zotero
10.0.2-beta.1): Enable on Kokoro → `Checking…` with both buttons held
(~200 ms), `Connected. 68 voices available. Word timestamps available.`,
pref on, fields locked, Local 707 → 775; Disable → off at once, fields
open, line cleared, Local 775 → 707; a wrong address → `Local TTS server
is not running at that address.` with the provider left off; Test
connection on the enabled OpenAI section → `Testing…` (buttons held 1.3
s), `Connected. 28 voices available. Synthesis works.`, the browser
listed again; Enable with Read Aloud open in two tabs → the pane dialog
naming both, no check run. Driving notes: the pane is
`Services.wm.getMostRecentWindow('zotero:pref').document`, and
`button.click()` fires its `command`. To close Read Aloud in a tab from
chrome use `reader._internalReader.toggleReadAloudPopup(false)` — a bare
`manager.deactivate()` with the popup still open is undone at once by the
popup's state sync, which re-activates the manager and, in one tab,
started playback.

## Voice browser: the status line by column, and Zotero's 28px buttons (2026-08-28)

Two pane fixes on `xujialiu/minor`, shipped as 1.8.0-beta5.

**The status line** now reads in the order the columns stand — `Default
voice: Local | English (United States) | Kokoro-am_puck | 1.7×`
(`defaultVoiceLine`; `Zotero’s own choice per language` with nothing
remembered, `<id> (not listed now)` with no listed row) — and each half
answers to its switch in the Reading group: "Use one voice everywhere"
off → `Default speed: 1.7×`; "Use one speed everywhere" off → the voice
alone, no speed; both off → `No default voice or speed: Zotero keeps both
per language`. Listing failures and the not-a-favorite warning are still
appended (the warning only while the line names a voice). Both switches
are now *observed* (`watchSwitches`: `SAME_VOICE_OBSERVER` in
default-voice.ts, `GLOBAL_SPEED_OBSERVER` in default-speed.ts), so a
checkbox flipped repaints the line inside `Zotero.Prefs.set` — verified:
the line read back immediately after each `set` already held the new
text, the same as 200 ms later, and the `preference=`-bound checkboxes
had followed. `diagnostics.defaultVoice()` reports `sameVoice` beside
`globalSpeed`, and its `status` equaled the pane's line exactly.

**The third column's rows** stood further apart than the tier and language
entries again — the 48ca0b3 rhythm, broken when c49d912 turned the voice
label from a `<span>` into a `<button>` for the row click. Measured live
before the fix (beta4, Windows, pane font 13px): tier and language entries
28px tall and 28px apart, `line-height` 19.5px; a voice row 34px apart, its
label button computing `height: 28px`; the glyph buttons 19.5px (their
inline `height: 1.5em`). The cause is Zotero's own sheet, verified in the
installed omni.ja: `chrome/content/zotero-platform/win/preferences.css`
holds `:is(button:where(:not(.btn,[type=checkbox],[type=radio])),
input:where([type=button],[type=submit])){height:28px;appearance:none;
padding:0;border:1px solid transparent;…}` — a type selector with no
`@namespace` in the sheet, so it matches our `html:button`s like Zotero's
XUL ones; the pane's stylesheets are `global.css`, `zotero-platform/
content/preferences.css`, `zotero/skin/preferences.css`, `zotero.css`. The
column entries had been 28px all along (their `line-height: 1.5` never
decided their height; the two columns agreed on the sheet's number, so
nothing showed), and the label became 28px the moment it was a button:
row = 28 + 3 + 3 = 34. The skin's `button{max-height:25px;margin:0 -2px
-1px}` was *not* in effect on them (computed `max-height: none` before the
fix; a parent scope the minified sheet's grep flattened, presumably).

Fix (`BUTTON_RESET`, ui/voice-browser-rows.ts): every button of the
browser states its whole box inline — `height`, `min-height: 0`,
`max-height: none`, `box-sizing: border-box`, `margin: 0` — and so does
the row; inline beats the sheets. After (beta5, same measurement): every
entry and every row 25.5px (= 1.5 × 13 + 6), pitch 25.5 in all three
columns, label and glyph buttons 19.5px, label `height` 19.5px. Side
effect: the tier and language columns tightened from 28 to 25.5px a line.
Rule: **an `html:button` in the pane is sized like a XUL button by
Zotero's sheets; never leave one of its dimensions to the line box.** The
measurement is the check for any future change to these styles: the three
columns' `pitch` equal, the label's computed `height` = 1.5 × font-size.

Seen alongside, not caused by the build: 19 `can't access dead object`
errors at the second of the in-place upgrade (`zotero_plugin_install`
beta4 → beta5) with a Read Aloud session active (paused) in one tab, from
the *old* bundle (`zotero-tts.js:0:NNNN` offsets, which locate nothing —
the installed bundle is unminified). Not reproduced by flipping the prefs
or closing the pane afterwards, and the earlier close of the beta4 pane
had logged nothing. Consistent with the old sandbox's callbacks (the
position sampler's tick, the manager hooks) running once more after their
compartment was nuked — the same class as the position sampler's dead
entry above. Not investigated; noted so the next in-place upgrade with a
session open is read for it, not for the change under test.
