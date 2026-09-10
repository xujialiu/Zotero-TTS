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
word timestamps) from the user's own TTS services: OpenAI, Azure Speech,
Cloudflare Workers AI, Speechify, and a
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
- **Fluent for plugins** (issue #30, [2026-09-04](NOTES_2026-09-04.md)):
  Zotero registers `[plugin root]/locale/<locale>/*.ftl` itself, before
  `startup`, into one source shared by every plugin — the file name and
  the message ids are global (`zotero-tts.ftl`, `ztts-…`); a locale it
  lacks falls back per file to the closest, then `en*`. A plugin pane
  (parsed as XUL) is translated by Zotero's own `translateFragment` pass
  when its markup carries `<linkset><html:link rel="localization" …/></linkset>`.
  Fluent strips every localizable attribute a message leaves out — a
  `<label value="?">` needs `.value = ?` — and writes custom attributes
  only when `data-l10n-attrs` names them. The sandbox is handed
  `Localization`; a sync instance formats without a window and follows a
  live locale change. Since 1.11.2 the plugin also registers a source of
  its own, `zotero-tts`, holding the same file for every Zotero locale
  (core/l10n-source.ts, issue #64, [2026-09-07](NOTES_2026-09-07.md)):
  a reload's disable tail deletes the shared entry after the successor
  has started, nothing can put it back into Zotero's source, and a
  resource missing from the settings window's one Localization empties
  every pane loaded after the plugin's.

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
   than a `never` check; the Kokoro `call()` helper classifies an abort
   as "local server down" (since issue #55 the catalog aborts a listing
   that ran past its bound, but that rejection is discarded by the
   timeout race and never read).

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
- A release's update.json is cached for five minutes, and the first check after the push can say "no update"

### [2026-09-01](NOTES_2026-09-01.md)

- Positions travel as one shared WebDAV file, merged by recency (issue #40)
- One tab close fires both close hooks, so anything riding a close must dedupe (issue #40)
- Settings sync splits machine by machine, and a multistatus needs no DOM (issue #41)
- Modal dialogs cannot be driven through the bridge
- The bridge's zotero_set_pref cannot write false to a bool pref
- A decode failure is a silent stop: Zotero's error state belongs to the fetch, not the decode (issue #42)

### [2026-09-04](NOTES_2026-09-04.md)

- The pane speaks Zotero's language: Fluent files Zotero registers and translates itself (issue #30)
- The pause between sentences is catalog data, and the gap is one number handed to a timer (issue #44)
- The player's voice list has a second per-voice channel: the option row's DOM id (issue #45)

### [2026-09-05](NOTES_2026-09-05.md)

- A bug hunt over the released 1.10.9, through the bridge on Windows: seven runs, three issues, and what Zotero showed (issues #48, #49, #51)

### [2026-09-06](NOTES_2026-09-06.md)

- Xiaomi MiMo's TTS is a chat completion, and the plugin's OpenAI section learned that route (issue #50)
- The Server dropdown's memory covers the credentials too (issue #52)
- A typo of a hosted server's address is named before the key goes anywhere (issue #54)
- The player's language dropdown resolved against the previous language's entry, so the pick hook now hands it the right one first (issue #49)
- A permanently deleted document's bookmark now leaves the shared file: tombstones stay on the machine, never in the file (issue #51)
- A provider that hangs at the popup's open dropped every provider's voices, so each is bounded on its own now (issue #55)
- Zotero collapses button margins on macOS, and a plugin's pane sheet cannot ask which platform it is on (issue #56)
- The sample player's `<audio>` reports a failure after `play()` has resolved, and the voice browser now says so (issue #48)
- The pane's local-server-down sentence predated the System provider, and Gecko's fetch has one word for every way a server is down (issue #47)
- macOS joined the System provider: a `say` per sentence, an `osascript` per listing, and the sentence highlight (issue #23)
- The two diagnostics say what they read: a view without a state answers null, and `position()` shows the copy Zotero drops (issue #39)
- The `"English"` key is 37 publisher PDFs' `/Lang`, and whether a raw tag stands is a race the plugin then writes into the pref (issue #59)
- The restore Zotero skips after moving off a raw tag now runs from a hook on the manager itself, and no entry is created under such a tag (issue #59)
- The strings TypeScript writes went through t(): a joiner message for the space between sentences, counts as text, constants turned into thunks (issue #43)
- A click on the next sample did not stop the one playing, and the player would have started an abandoned element (issue #61)
- A volume of its own: a gain ahead of Zotero's filter chain, one pref for the keys and the pane (issue #62)
- A full pass over the released 1.11.0, through the bridge on Windows: seven runs, no plugin failure, one issue, and what Zotero showed (issue #64)

### [2026-09-07](NOTES_2026-09-07.md)

- The plugin carries its own copy of its strings in the registry, since Zotero's reload deletes the shared one after the successor has started (issue #64)
- Azure's Dragon Latest voices time only the first ten seconds of a segment, and Zotero's word timers leave the last word lit (issue #69)
- The boost above 100 lands in Zotero's compressor and comes out halved, so the volume stops at 100 (issue #66)
- Cloudflare Workers AI joined as a provider of its own: an account id in the URL, Aura's raw MP3 against MeloTTS's base64 WAV, and no timestamps from either (issue #72)
- Azure's MAI-Voice-2 voices carry no word timing, and the only Ioana in the player is Azure's (issue #73)

### [2026-09-08](NOTES_2026-09-08.md)

- Zotero NFC-normalizes an EPUB's text, and the highlight patch's === check goes dark on a document stored decomposed (issue #74)
- The highlight patch normalizes both sides to NFC before comparing, and the transparent flag clears when Word is left (issue #74)
- The reading guard's dialog closes the players itself: the headphone button's close from the pane, an html:dialog with two buttons, and "open" widened to the popup (issue #71)
- The stop key takes no reader, its toast has two homes, and the recorder's Escape rules out Shift+Esc as a default (issue #71)
- Zotero rebuilds the controller when its voice list lands, even onto the voice already playing, and the plugin's catalog makes that land mid-sentence (issue #75)
- Zotero's two views read the Read Aloud position lock differently, and a re-emitted state can never satisfy the DOM view's gate (issue #76)
- Driving a real Shift+Enter into a reader from the bridge, and why pixels are the wrong measure here (issue #76)
- The return key forgets the DOM view's last state before the re-emit, and Zotero's own first-push path brings the view back (issue #76)
- A write of Zotero's highlight-level pref repaints every open reader inside the write, and a bare h during a session annotates (issue #67)
- The word highlight key writes Zotero's own level, and its toast says when the voice cannot show it (issue #67)

### [2026-09-09](NOTES_2026-09-09.md)

- Speechify joined as a provider of its own: the locale in the voice id, one request at a time, and marks aligned by their text (issue #79)
- Zotero's 25 px cap on a button takes its 6 px out from under the label, and Gecko never re-centers what overflows (issue #80)

### [2026-09-10](NOTES_2026-09-10.md)

- Zotero's PDF follow measures a sentence by its first-page box and only asks whether the box's top is on screen, so a sentence continued on the next page or column is left cut (issue #83)
- The follow's own smooth scroll can drop the position lock: a flat 100 ms timer clears Zotero's "scrolling is mine" flag before the animation's late first frame (issue #85)
- Bridge traps the two runs met, for the next brief
- Settings sync is one shared file merged one setting at a time, and a check's flip stays at the file's stamp (issue #68)
- Live: a paused player anywhere defers provider items for as long as it stays open, the pane's own poke buries the applied line, and a dead URL logs twice (issue #68)
- The pane's WebDAV, Sync and Backup groups are cut by purpose, and the server copy is named a backup (issue #68)
- The follow's call is answered by the plugin: the whole sentence, both pages, against the viewport's edges (issue #83)
- Two lines under the Sync switches, the item-20 fixture that would ping-pong, and beta numbers across worktrees (issue #68)
- The held-provider flip measured, a switch turned back on between passes, and the key an adoption overwrites (issue #68)
- Switching Zotero's locale with the settings window open kills Zotero, and the session restore loses a reader tab
- Kokoro-FastAPI returns the words of a rewritten text, and the aligner's substring search drags the highlight into a later word (issue #86)
- The aligner pairs tokens by longest common subsequence and bridges what the server spelled differently (issue #86)
- Verified live: 37 and 38 spans where there were 6, and a highlight patch that never attaches to a minimized window (issue #86)
