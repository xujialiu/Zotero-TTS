# Zotero-TTS — engineering notes

Working notes: incidents, what was verified in Zotero's source, and why things
are the way they are. Kept private until 2026-08-23, tracked in git since.
Written from 2026-08-21, after the plugin first played audio end to end in
Zotero 10.0.1-beta.1.

This file is the standing reference — what the plugin is, the Zotero 10 facts
that outlive any single day, and what is still open. The work itself is a log,
one file per day: `NOTES_<date>.md`, indexed at the bottom. A new entry goes at
the end of today's file, its heading stamped with the date and the time
(`2026-08-30 14:32`); what is already written there is not rewritten.

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

## Still open (from the 2026-08-22 whole-branch review)

The items resolved since have their own entries in the log; the one-time
security note is in [NOTES_2026-08-22.md](NOTES_2026-08-22.md). These remain:

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

---

## The log, by date

One file per day, entries in the order they were written. Source comments that
cite `notes/NOTES.md` with a date or a section title resolve through this index.

### [2026-08-21](NOTES_2026-08-21.md)

- Production incidents, in order
  - 1\. The xpi would not install
  - 2\. Voices listed, synthesis failed with "An unknown error occurred"
  - 3\. Pressing play crashed the whole Zotero process
  - 4\. (Minor) Preference pane did not render after an in-place upgrade

### [2026-08-22](NOTES_2026-08-22.md)

- 5\. Pane initialization ran before the pane existed
- Coexisting with Zotero's own voices
- Kokoro-FastAPI server quirks
- Kokoro-FastAPI on the Windows machine
- Speed shortcuts
- One voice and speed across documents
  - Incident: Read Aloud button dead after the first build
- Security note (one-time)

### [2026-08-23](NOTES_2026-08-23.md)

- Settings backup
- Incident: speed shortcuts routed to a hidden tab
- Local voices named after their engine
- Test connection proves the account can spend
- Multilingual voices under every language
- `src/modes/hijack/` → `src/read-aloud/`
- Chatterbox-TTS-Server and tiny segments
- Extra headers, keyless servers
- Server presets in the OpenAI section
- Extra headers for the Local engine
- Synthesis speed setting removed
- WebDAV backup
- WebDAV client verification log
- Sentence and paragraph shortcuts
- Highlight colors and the sentence under the word
  - Incident: the word kept the sentence color
  - Preview and Restore in the Highlight group
  - Defaults: a green word on a yellow sentence (1.4.2)
- Zotero's own prefetch, and the Prefetch setting
- Prefetch made real (feat/prefetch)
- Tooling note: heredoc transport

### [2026-08-24](NOTES_2026-08-24.md)

- The green sentence in word mode
  - Follow-up: the word-color flash while buffering (issue #2)
- Read from selection and go to reading position
- Kokoro-FastAPI: no word timestamps for Chinese voices
- Read Aloud arms auto-sync every few sentences
  - Follow-up: the sentence going dark on EPUBs (issue #3)
  - Root cause found live (issue #3, evening)

### [2026-08-25](NOTES_2026-08-25.md)

- Follow-up: silent misresolution (issue #4)
- Follow-up: real words too (issue #4)
- Follow-up: sentences spanning two text nodes (issue #4)

### [2026-08-26](NOTES_2026-08-26.md)

- Hiding Zotero's own Local voices
- Voice browser and favorites
  - Follow-up: blank language dropdown
- multilingualEverywhere removed; "Multiple languages" pinned first
  - Incident: patched: false everywhere, then a diagnostics crash
- The sentence leaves the word alone
  - Two things the first build got wrong, found in use
- Zotero's own voices in the voice browser
  - Follow-up: "only favorites" is strict
- Resuming where Read Aloud stopped
  - The stored position was a corpse
  - Adaptive tick, so resuming lands on the right sentence
- Shift+Space became the one play key; Shift+B removed
- Resume landed one sentence early: the close was riding on the tick
- The unload hook never fired; capture moved into a reader.uninit wrap

### [2026-08-27](NOTES_2026-08-27.md)

- Tab close, the real sequence: capture moved to tab.onClose
- Hooks that vanish: waive before assigning through reader._window
- Resume passed the right sentence; Zotero started one earlier
- Speed in the voice browser
  - Follow-up: the sample played at 1× until the slider moved
- Default voice and speed: the plan
- The slider writes the default speed (step 1)
- Global speed, live (step 1 follow-up)
  - The switch
- Default voice shown in the browser — step 2
- Global voice: the plan (after 1.7.3)
- Global voice, live — step 3
- The settings follow a pick in the popup — step 4
- A row click makes the default — step 5
- Only a favorite can be the default — step 6
  - Incident: the settings followed a pick, the other tab did not
- Adding a voice while a tab is reading: refused
  - The white ring around the dialog
  - Incident: one voice under Multiple languages, and nothing followed
- One voice everywhere means every language
- The voice browser's language column is the popup's dropdown

### [2026-08-28](NOTES_2026-08-28.md)

- Enable is a commit point: the provider switches
- Voice browser: the status line by column, and Zotero's 28px buttons
- The ? beside a setting: tooltips, a pane stylesheet, Zotero's label margins
  - The ? tooltips open at once, Extra headers get one, the field column lines up
- README media straight out of the running Zotero

### [2026-08-29](NOTES_2026-08-29.md)

- Prefetch, measured live: the reach is the setting plus Zotero's three
- Prefetch locks the cache on, and the cache became a per-call dep
- A dead prototype is not restorable: the teardown noise, and what held the tabs (issue #5)
- The player's Options key: a DOM click, because there is no method (issue #7)
- A word of a checkbox's label in bold
- A source build sorts below its own version (issue #8)
- The marker moved to Zotero's own voices, and the first accessor patch (issue #9)
- The operating system becomes a provider (issue #12)
- Text that is in the PDF but not on the page (issue #15)

### [2026-08-30](NOTES_2026-08-30.md)

- The voice list is a per-tab snapshot, so nothing may edit it while a tab reads (issue #11)
- Hiding Zotero's own Local voices became unconditional (issue #17)
- The ? sat on the note because a XUL `value` never wraps (issue #18)
- Gecko's password reveal button is on in Zotero, and the pref does not say so (issue #19)
- A restored backup turned providers on without checking them (issue #21)

### [2026-08-31](NOTES_2026-08-31.md)

- The store keeps the resume point, and a center is noisier than its rect (issue #14)
- The positions moved into zotero-tts.sqlite, and the pass ran against a zombie (issue #16)
- Clean session: the zombie owned the patches, and imported hit 0 (issue #16)
- The speed resolver was a looser mirror than Zotero's, and a fresh tab restores from the raw tag once (issue #26)
- A startup step fails on its own now, and a diagnostic says which (issue #25)
- A reload ran two instances at once, and the old one took the new one's global (issue #28)
- A release is checked from chrome scope, and the gear menu installs rather than offers
- A bug hunt over the released 1.10.1, through the bridge: five runs, nine issues, and what Zotero showed
- Every pick of the Server dropdown was a first pick, so each server now keeps its own address (issue #34)
- A remembered voice the list does not offer starts a substitute, staged before the list lands (issues #35, #36, #37)
- An open tab's interface can be re-delivered — but only through Zotero's own clone (issue #38)
