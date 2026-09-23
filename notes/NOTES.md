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

Decisions and their reasons: [docs/design/](../docs/design/) for the owner,
[docs/adr/](../docs/adr/) for engineers and agents.

## What the plugin is

A Zotero 10 plugin that adds voices to Zotero's built-in Read Aloud, from the
user's own TTS services: OpenAI, Azure Speech, Cloudflare Workers AI,
Speechify, Fish Audio (its cloud, and a Fish Speech server of the user's own),
and a local Kokoro-FastAPI server. Since issue #133 every voice of the Player,
Zotero's Standard and Premium included, plays on the plugin's own engine
(`src/core/engine/`, `src/read-aloud/engine/`), behind Read Aloud's manager;
sentence segmentation, the word/sentence highlight, the follow and the
position are still Zotero's, driven from that manager.

Mechanism: intercept `Zotero.Reader._readers.push`, and on each new reader
replace the instance method `_getReadAloudRemoteInterface` with ours. Zotero
calls that method later, inside async `_open()`, and gets back the same
four-method object its own cloud backend would return.

A standalone-player mode was designed and half-planned as a fallback in case
the hijack did not work. The hijack worked; the standalone mode was deleted
before it was ever built.

Since 2026-09-15 the direction is to move off Read Aloud step by step while
Zotero keeps the document analysis ([docs/PHILOSOPHY.md](../docs/PHILOSOPHY.md),
issue #109). What can be separated, and at what cost, is in
[NOTES_2026-09-15.md](NOTES_2026-09-15.md).

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
  General → Read Aloud → "Highlight current"). Since 1.12.11 (issue #114)
  the plugin pins that pref to its own two switches,
  `zotero-tts.highlight.sentence` / `.word` (`word` while Word is on, else
  `sentence`, never `paragraph`; core/highlight-pin.ts writes it back inside
  its own observer), and greys Zotero's menulist (ui/zotero-highlight-menu.ts).
  In `word` mode the reader
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
- **The Engine's hooks** (issue #133, verified against 10.0.3,
  [2026-09-23](NOTES_2026-09-23.md)), each per tab:
  `RemoteReadAloudVoice.prototype.getController` (reader.js 40476), which
  `_createController` asks (82664); the manager's `activeTimestamp` getter
  (82229-82235), whose `instanceof RemoteReadAloudController` test would
  hide the word; `setSegments` (82543), the one public call before every
  first controller, where the voice prototype is patched in time; and
  `repositionTo` (82621), which marks a jump. Samples
  (`getSampleController`, 40479) are not hooked. The copied code — the WSOLA
  stretch (39747-39820), the word onset (39821-39894) and the filter chain of
  `_initAudioContext` (39942-39963) — is 10.0.3's, pinned by the fixtures in
  `test/fixtures/engine/`; a later Zotero reaches it only when it is copied
  again on purpose (ADR 0006).
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
Entries up to 2026-09-13 cite run directories under `test/zotero-dev/runs/`;
that archive was deleted on 2026-09-14 (a run's table is on its issue since
then) and is in the git history before that day.

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
- Zotero's block classifier throws a page's first line out of the reading order, and the plugin relinks the chain before the sentences are cut (issue #87)
- A PDF view has no pages before its first render, none while hidden, and the highlight patch now lands with the first page instead of giving up (issue #88)
- Verified live: the page half lands within 125 ms of the pages' return, every tab attaches at its open now, and a trusted key resumes a chrome-started player on macOS (issue #88)
- Fish Audio joined as two providers in one section: the timestamp stream merged per chunk, the library's 1,000-entry window, and a Fish Speech server that answers MessagePack unless asked for JSON (issue #89)
- The owner's Fish Speech server, measured: an empty references folder is "0 voices", a Kokoro recording makes a reference, and 4 tokens a second without compile (issue #89)
- Verified live: the server block on the H200, and what a one-at-a-time server does to the read-ahead, the voice list and the sample button (issue #89)

### [2026-09-11](NOTES_2026-09-11.md)

- The Fish Audio section's server block is headed Local, and the player's prefixes are Fish-cloud and Fish-local (issue #89)
- The PDF can move before its scroll event arrives, so instant scrolling still drops the follow lock (issue #85)
- The plugin owns PDF follow intent while Zotero keeps the state and highlight work (issue #90)
- An active PDF can be renderable while the host chrome document still reports hidden (issue #90)
- Beta3 keeps follow intent through late native events and yields to trusted manual navigation (issue #90)
- The owner completed the reported PDF from the beginning without another follow failure (issue #90)
- Fish Audio discovery is a query window, and a usable list can still be incomplete (issue #91)

### [2026-09-12](NOTES_2026-09-12.md)

- A caller timeout does not expire shared voice discovery (issue #91)
- The public discovery window does not fit eleven seconds when fetched sequentially (issue #91)
- Three independent Fish sources replace automatic community discovery (issue #91)
- Verified in Zotero: all eight source combinations and the restored user state (issue #91)
- The Cloud actions move last and English voices gain regional groups (issue #91)
- The source choices lock with Fish and fit one row (issue #91)
- One field-label column aligns the Fish inputs with the other providers (issue #91)
- Explicit regional picks must not reuse a generic remembered voice (issue #91)
- Verified: regional menus remain selected in PDF and EPUB (issue #91)
- Expanded player opening needs an early visibility gate (issue #81; live verification pending)
- Expanded player verified live; preserve the original transport snapshot during cleanup (issue #81)

- Auto-scroll separates sentence entry from actual clipping (issue #93)

- A shortcut switches the shared auto-scroll mode (issue #93)

- Playback resume is not an explicit request to follow (issue #93)

- Beta3 verifies the mode shortcut and PDF/EPUB manual intent (issue #93)

- The owner accepts auto-scroll and each option gets its own help (issue #93)

- The two auto-scroll help icons pass the focused UI check (issue #93)

- Center each sentence becomes the default (issue #93)

- Speech preparation keeps document coordinates and a session snapshot (issue #94)

### [2026-09-13](NOTES_2026-09-13.md)

- Bracket preparation verified through Fish and a native transport stub (issue #94)

- Previous and next voice keys can follow the player's filtered list (issue #95)

- The requested voice handoff is at a word boundary after preparation (issue #95)

- A prepared native controller carries the new voice to a safe boundary (issue #95)

- Multiple bracketed phrases cross the single-pair boundary (issue #96)

- Sibling wrappers retain ordered source offsets (issue #96)

- The beta3 native handoff passed its first live pass (issue #95)

- Follow-up separates native single-player policy from blocked audio contexts (issue #95)

- Sentence-wide validation hid usable Kokoro word boundaries (issue #95)

- Multiple-group requests verified in the live reader (issue #96)

- Real Kokoro timings begin before sample zero (issue #95)

- Beta6 hands real Kokoro audio over within the sentence (issue #95)

- Native regional pools include voices that change the displayed group (issue #97)

- Regional shortcuts verified against a native compatible pool (issue #97)

- Fish receives isolated stat text without an English language constraint

- An English text cue yields comparable Fish samples for short stats

- The owner confirms both English-cued stat samples read correctly (issue #98)

- The configured Fish Speech server returns local stat comparison samples (issue #98)

- Fish cloud cues stay out of document coordinates and follow the requested voice (issue #98)

- Fish cloud hint mechanics pass live; a malformed test stream caused the visible error (issue #98)

- Configured providers and official tiers hand over at supported boundaries (issue #95)

- Manual navigation waits for sentence disappearance (issue #100)

- The fixture-close check reaches dead nested reader dependencies (issue #100)

- Beta3 retains following through partial visibility and closes cleanly (issue #100)

- A visibility pause resumes when the current sentence returns (issue #100)

- Bracket lists share one scan and one activation snapshot (issue #101)

- Configurable bracket pairs passed the live request and settings checks (issue #101)

- Reentry passes on beta4 while the next release baseline is merged (issue #100)

- The merged 1.12.7-beta installation passes the final reentry check (issue #100)

### [2026-09-14](NOTES_2026-09-14.md)

- Zotero's block model cuts a paragraph mid-page, and its part-linking rule cannot rejoin a short last line (issue #104)
- No run archive, a kit runner inside Zotero, and a tester that reads only its workflow
- The cut paragraph joined back before the sentences are cut, and the runner's first kit (issue #104)
- A selected sentence's first character belongs to the previous segment at lookup (issue #105)
- Boundary correction preserves native selection handling on unpause (issue #105)
- The second sentence proves the boundary fix through the key (issue #105)
- Regional shortcut filtering does not constrain the manual voice menu (issue #106)
- The current US pool contains 44 generic English voices (issue #106)
- One list passes in both reader formats and the real Fish catalog (issue #106)

- Manual sentence placement is separate from playback resume (issue #107)

- Interior resume targets verify centering, not just return (issue #107)

### [2026-09-15](NOTES_2026-09-15.md)

- Player voice changes share preparation and paused resume (issue #108)
- Native resume and notification cleanup pass in beta2 (issue #108)
- The tester independently completes beta2 verification (issue #108)
- What can be separated from Read Aloud (issue #109)
- Provider entries in the player's first dropdown: three hard-coded places and the way past each (issue #110)
- Provider entries built: a second shadow on _resolveVoice, a createElement wrapper, and the keys the memory follows (issue #110)
- Zotero refreshes a tier's remembered voice only at a popup open, and a paused pick previewed by #108 never reached the lists (issue #110)
- Zotero's Standard and Premium behind switches: one dropped key hides a tier everywhere, and the dropdown follows (issue #111)
- Verified live, issue #111: the browser's safety net re-added a hidden tier, `languages` is the selected tier's, and a fresh open never strands (issue #111)

### [2026-09-16](NOTES_2026-09-16.md)

- The plugin player takes over the controls: layouts, shared real controls, manual following and the reader boundary

- The highlight levels are the plugin's own two switches: Zotero's pref pinned to them through its own observers, and its settings menulist greyed (issue #114)
- The OpenAI section split into three, and the old keys read once (issue #113)
- Verified live, issue #114: the pin snaps inside the write, an in-place reinstall keeps the previous prefs.js default, and a bare W on the library pane is Zotero's (issue #114)
- The split ran twice: Gecko keeps a gone prefs.js's defaults, and the recovery (issue #113)
- The re-run passes, and three things seen on the way (issue #113)
- A result that lands after its reader window is gone: the four dead-object lines, and Zotero.logError's column (issue #116)
- Verified live, issue #116: silent drops on both close paths, the chain stops, and Kokoro is too fast to catch a late result (issue #116)

- Player label and combo corrections: native labels, light-dismiss-safe toggle, aligned controls

- Real player verified, compact menus prepared: trusted voice handoff and exact preference restoration

- Cached child styles clipped the compact floating panel: per-instance resource URLs

- A detached document still has a live wrapper: null-window guards and independent cleanup

- Player verification closed: real controls and handoff, compact UI, fresh resources, clean teardown

- Player A/M reflects effective following (issue #117)

### [2026-09-17](NOTES_2026-09-17.md)

- Player following passed after waiting for the selected iframe (issue #117)

- Floating menus use the host viewport and keep the player stationary (issue #118)

- A saved layout equal to the retained default is not a user value (issue #118)

- Floating controls verified with frame and scroll evidence (issue #118)

- Voice notices follow paused readiness and native source start (issue #119)

- Voice notice source timing verified in both formats (issue #119)
- Testing defaults to a taskbar-minimized window

- Playback preparation ends at source start, not buffering completion (issue #120)
- Playback notice timing verified with running and suspended output (issue #120)

- Settings changes protect the affected reading sessions (issue #121)

- Selective reading protection verified in Zotero (issue #121)

- Player position and held speed keys share existing settings (issue #122)

- Position and held speed shortcuts verified live (issue #122)

### [2026-09-18](NOTES_2026-09-18.md)

- An expanded layout transition reports the old bar height (issue #124)
- Layout rendering reports its completed dimensions (issue #124)
- Floating transitions pass with real frame geometry (issue #124)
- A/M sits between speed and volume (issue #124)
- EPUB resize deliberately blurs the reading view (issue #124)
- Centered mode and resize masking verified (issue #124)
- Anything on the player's render path runs at frame rate (issue #125)

### [2026-09-20](NOTES_2026-09-20.md)

- Gecko allows no copy out of a password field, revealed or not (issue #19)
- The screenshot bridge reaches the main window only

### [2026-09-21](NOTES_2026-09-21.md)

- The pane's blank check kept its own list of attributes (issue #103)
- Zotero's settings window keeps a radio's end margin on Linux only (issue #102)
- How Zotero 10 resolves and generates an EPUB Read Aloud position: the SDT pack, not the DOM (issue #126)
- An element CFI from upstream epub.js names the same block in the SDT mapper, measured on four books (issue #126)
- The hooks the Positions File rides on, and what is read where (issue #126)
- The player's play resumes through toggleReadAloudPaused, and a jump un-pauses by itself (issue #126)
- `_sdt.mapper` is an Xray wrapper in the sandbox; `_internalReader` and `_readAloudManager` are not (issue #126)

### [2026-09-22](NOTES_2026-09-22.md)

- Brackets go wherever they enclose text; a `<…>` pair of two math signs stays (issue #127)
- Adoption needed a named document, and naming needed a native position (issue #129)
- Zotero asks for its voice list only signed in, and every plugin voice rode that request (issue #130)
- Verified live, issue #130: the tab's own flag proves the skip, and a tab open across a reinstall keeps the previous instance's `loadVoices` hook (issue #130)
- The 03:30 entry had the order wrong: every clean shutdown carries a leftover `loadVoices` hook forward, and none makes one (issue #131)
- Empty plugin preferences enable OpenAI, and native voice memory repopulates the cleared branch (issue #132)
- OpenAI now requires an enable choice on a fresh installation (issue #132)

### [2026-09-23](NOTES_2026-09-23.md)

- The Engine behind Read Aloud's manager: four hooks, and what the manager does around them (issue #133)
- Verified live: the Engine plays in Zotero, and a cached answer that would not decode defeated Retry (issue #133)

### [2026-09-24](NOTES_2026-09-24.md)

- The docked bars lie over the document: the reader has two layers, and the player moved one (issues #135, #137)
