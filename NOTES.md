# zotero-tts — engineering notes

Working notes: incidents, what was verified in Zotero's source, and why things
are the way they are. Kept private until 2026-08-23, tracked in git since.
Written from 2026-08-21, after the plugin first played audio end to end in
Zotero 10.0.1-beta.1.

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

Seen once, on an `ADDON_UPGRADE` install with the preferences window open. A
full Zotero restart cleared it. Not reproduced, not fixed, recorded only.

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

## Kokoro-FastAPI on this machine (set up 2026-08-22)

Runs in **Docker Desktop** (WSL 2 backend, `nvidia` runtime available):
container `kokoro`, image `ghcr.io/remsky/kokoro-fastapi-gpu:latest` (cu126,
right for the RTX 3080 Ti), `--restart unless-stopped --gpus all -p
8880:8880`. The image bundles the model, CUDA torch and espeak-ng. README.md
in the repo documents the Docker install for users.

A native `uv` install was tried first the same day (Docker was not on PATH
until a reboot) and then removed completely — clone, venv, model, the torch
wheel cache and the winget espeak-ng. Two lessons from it, in case native is
ever tried again:

- **The `gpu` extra does not give Windows a CUDA torch.** Its pin is
  `torch==2.8.0+cu126 ; platform_machine == 'x86_64'`, and on Windows
  `platform_machine` is `AMD64`, so `uv sync` installs `2.8.0+cpu`. Fix was
  `uv pip install --python .venv torch==2.8.0+cu126 --index-url
  https://download.pytorch.org/whl/cu126`, and then every `uv run` had to be
  `--no-sync`, or the lock put the CPU build back.
- **`/dev/captioned_speech` streams NDJSON by default** (`stream: true` in
  `CaptionedSpeechRequest`); the adapter now sends `stream: false` and gets
  one `{ audio, audio_format, timestamps }`. Before that fix every Kokoro
  synthesis failed with `decode-failed`.
- **`/v1/audio/voices` returns `{ voices: [{ id, name }] }`**, not a list of
  ids as the adapter (and its tests) assumed; the string-only filter yielded
  zero voices, so no `TTS-Local-*` entry ever reached Zotero. The adapter
  accepts both shapes now.
- espeak-ng (the phonemizer fallback upstream recommends) was installed via
  winget for the native run and uninstalled with it; the Docker image has
  its own.
- Verified in Docker (2026-08-22): image 12.7 GB, server up 15 s after
  `docker run`, 68 voices, two sentences synthesized in 0.18 s with 10 word
  timestamps, log says "Loading Kokoro model on cuda", `nvidia-smi -L` inside
  the container lists the RTX 3080 Ti.

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

## Open items from the final whole-branch review

Not fixed as of this note. Ordered by user impact.

1. **Rate limit is silent.** A 429 from any provider maps to
   `'quota-exceeded'`, which Zotero renders with no message and no Retry.
   Remap to `'network'` or `'unknown'` so the user gets feedback.
2. **Speed setting is wrong in two ways.** Fixed 2026-08-23: the control is
   gone, see "Synthesis speed setting removed" below.
3. **A throw inside the interface factory kills the reader tab**, not just
   Read Aloud — `_open()` has no `.catch`. Native returns `null` on failure and
   the consumer handles null; ours should too.
4. **Only the selected provider's voices are published**, while the spec said
   to merge all three. Product decision: is mixing (e.g. Kokoro for English,
   Azure for Chinese) wanted?
5. Minor: `patched` reader list in the hijack never shrinks during a session;
   `toZoteroError` reaches exhaustiveness via `default` rather than a `never`
   check; the Kokoro `call()` helper classifies a user abort as
   "local server down" (unreachable today — nothing aborts through this
   interface).

## Security note

The Azure API key is stored in plaintext in `prefs.js` (Zotero prefs are
plaintext; the pane should say so). During diagnosis I grepped the whole prefs
file and the key appeared in tool output. It should be rotated.

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
  pane checkbox applies at once; off = Zotero's per-language behaviour.
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

Tooling note: the Bash tool's heredoc transport has now mangled two scripts
(one with `\\.` regex escapes, one with ellipsis characters); scripts with
either go through the Write tool and `python file.py`.

## Server presets in the OpenAI section (added 2026-08-23)

The user first proposed an "official / compatible" switch that disables key,
model and voices for compatible servers. Rejected: hosted compatible services
(Groq, SiliconFlow, LiteLLM, DeepInfra) need key and model, Speaches needs
model, servers without a voice list need voices. Built instead
(`core/server-presets.ts`, `ui/server-preset-rows.ts`): a Server dropdown
with OpenAI / Chatterbox-TTS-Server / Other. A preset fills its defaults once
on switch (never on load), greys out only the fields the server provably
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
