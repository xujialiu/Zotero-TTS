# Scripts: 3h. Fish cloud short-text language hints (issue #98)

[Case](../../cases/fish-language-hints.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

This kit checks that a short Fish cloud request gains its voice's language
cue and that nothing else does: the real outgoing request and its word
ranges, the fewer-than-four-word threshold, cache and in-flight identity
per locale, prefetch, the excluded locales and providers, and the state
left behind. The files are zotero-dev bridge snippets, each sent on its own
through `zotero_execute_js`; they are not a Node test runner. Reusing them
means adapting the literals named below and taking a fresh baseline, and an
old run's PASS results are not a fresh pass.

## Before you start

- **Build and bridge.** Follow `agents/zotero-tester.md` (How to drive,
  Rules) and the [baseline](../../baseline.md): bridge ping, the build
  installed, `diagnostics.startup()` with every step `ok`, the error ring's
  contents read. Each file is one self-invoking function that returns JSON.
  05 and 06 poll for up to 7 s inside the call, 08 and 09 longer (import,
  open, close); a bare `undefined` is the bridge's timeout, not a result,
  so check the fixture and the hooks before retrying.
- **Fixture.** `test/fixtures/angle-brackets/angle-brackets.epub`, rebuilt
  by its `build.py`. No kit script imports the copy that 03–07 and 10
  share: after 02, import it as a standalone attachment and open it by hand
  (`Zotero.Attachments.importFromFile({ file, libraryID, title })` with
  `Zotero.Libraries.userLibraryID`, then `Zotero.Reader.open(id)`, then
  poll until `_internalReader._readAloudManager._options.remoteInterface`
  exists; 08 and 09 take the same steps for copies of their own, which
  they erase). The run imported three copies in turn, 24424 for 03, 24425
  for 04 and 24426 for 05–07 and 10, and erased the first two in steps it
  did not retain, the first after failed stub attempts left its player in
  error. One copy should serve all of them: 03, 04 and 07 call the remote
  interface directly and never open the player, 05 needs that player idle,
  and 06 needs the controller 05 creates. A copy whose player ends in an
  error is erased with 10 and replaced.
- **Literals to replace.**
  - *Fixture item IDs:* `24424` in 03, `24425` in 04, `24426` in 05, 06,
    07 and 10. The list `[24424,24425,24426,24427,24428]` in 11 takes
    every copy of this run: the shared one, 08's `import.itemID`, and
    09's, which 09 does not return (find it by its title).
  - *Voice:* `fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da`, the run's free
    Dax voice, in 03, 04, 06 and 09. Use a Fish cloud voice this profile
    lists; 03 sends its reference to Fish. Those scripts pass their
    locales themselves, while 05 takes the remembered voice and its locale,
    so its American cue needs an en-US voice there. 07 uses
    `local::af_bella`, 08 a stub id.
  - *MP3:* `/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/baseline-100-exp.mp3`
    in 04–09, the audio every stub answers with: any short valid MP3. The
    run's was an uncued Fish sample from the pronunciation research.
  - *EPUB:* `/Users/xujialiu/Works/Zotero-TTS/test/fixtures/angle-brackets/angle-brackets.epub`
    in 08 and 09: this checkout's copy. Their fixture titles carry the
    run's date.
  - *Reading memory:* `baselineMemory` in 08 is the run's
    `readAloud.memory`, written back in `finally` whenever the pref
    differs. Replace it with this run's value from 01, or 08 overwrites
    the user's memory with the old one.
  - *Manager path:* line 6 of 04 and 07 reads `reader._readAloudManager`,
    which neither Zotero's reader tab (`xpcom/reader.js`) nor the plugin
    defines. As archived, both return `fixture remote interface missing`,
    although the run's outputs show that the copies it ran reached the
    manager. Read it as `reader._internalReader._readAloudManager`, like
    the other scripts.
- **State between scripts.** No script leaves a global behind: each keeps
  the sandbox `fetch`, the prototype method, the controller fields and
  `cacheAudio`/`prefetchEnabled` in locals and restores them in its own
  `finally`. What carries over is Zotero's state: 02's prefs, the shared
  fixture reader, the player 05 leaves paused (06 needs its controller)
  and the plugin's in-memory audio cache (see Cleanup).
- **Debug store.** The archived 02 neither turns it on nor returns the
  before values that the run's `outputs/02-mute-and-sync-off.json` holds,
  so turn the store on by hand as the baseline says and keep 01 for the
  before values. After 03, read the marker
  `fish: language hint [Speak in American English] for short speech`
  from it (`zotero_read_logs` or `await Zotero.Debug.get()`); no kit
  script does.
- **Spend.** Only 03 reaches a provider: three real Fish cloud requests
  (`100 exp`, `2/50 HP`, the four words) and none for `<>`, on the model
  `fish.freeOnly` selects: `s2.1-pro-free` in the run, the paid model when
  it is off. Fish must be enabled with its key set. Configured providers
  are authorized for testing (tester Rules). 04–07 and 09 answer the
  plugin sandbox's `fetch` with a stub (05, 06 and 09 let requests without
  a string body through), and 08 stubs Zotero's native interface, so they
  spend nothing, provided 05 opens the player on the Fish voice: it plays
  the remembered voice, so point `readAloud.memory` at the Fish voice
  first if it names another (a Zotero voice would be real, metered
  synthesis) and restore the memory last.
- **Stream stubs.** Keep the `String.fromCharCode(10, 10)` event
  terminators. The run's first stub attempts sent a literal backslash-n;
  Fish parsed no event and the player reported "the stream carried no
  audio", a harness fault, not a product one.
- **Never drive the owner's readers.** Every script finds its reader by
  the fixture's item ID; 01 and 11 only read the others. While 08 runs,
  the reader-tab prototype's `_getReadAloudRemoteInterface` is stubbed and
  every reader's Zotero voices go through it, so no reader may be playing.
  The pronunciation research scripts stay archived: they read
  `Zotero.Reader._readers[0]`, the owner's book, at fixed segment indices.

## Run order

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| 01-baseline-snapshot.js | Reads every reader's session state, 16 plugin prefs with user flags, the debug store, the settings window and the position store | setup | Recorded, not asserted: the user's readers as found, each pref's value and user flag, `debugStoring`, `settingsWindowOpen`, `position.database.rows` with `queued` 0; redact `readAloud.memory` and `fish.voices` in saved evidence |
| 02-mute-and-sync-off.js | Sets the plugin volume to 0, the three WebDAV switches off and bracket stripping on | setup | `syncPositions`, `syncSettings`, `autoUploadSettings` false; `volume` 0; `stripAngleBrackets` true |
| 03-real-fish-request-capture.js | Real Fish requests for `< 100 exp>`, `< 2/50 HP >`, `<One two three four>` and `<>` with cache and prefetch off, recording each request body and word range | 1, 2, 3 | Three POSTs to `/v1/tts/stream/with-timestamp`: `[Speak in American English] 100 exp`, `[Speak in American English] 2/50 HP ` (trailing space), uncued `One two three four`; none for `<>` (a 6444-byte pause); ranges `100` 2..5, `exp` 6..9, `2` 2..3, `50` 4..6, `HP` 7..9, each `sourceSlice` the original word; every `error` null; `prefsRestored` true |
| 04-cache-locale-stub.js | Stubbed transport: a cache repeat, en-US against en-GB, four words, sample and `<>`, seven excluded locales, three concurrent callers | 2, 3, 4, 5 | `callsAfterEnUSRepeat` 1, `callsAfterEnGB` 2, `repeatSameTimestamps` true, ranges `100` 1..4 and `exp` 5..8; exclusions add two uncued calls (`One two three four`, the sample sentence), `<>` gives 6444 bytes; the locales add 7 calls, all `100 exp`, `unchanged` true, no error; `concurrent.calls` 2, American and British `100 exp concurrent`; `prefsRestored` true |
| 05-popup-sse-stub.js | Opens the fixture's player on the remembered voice with prefetch off and a stubbed stream, and pauses once it plays | 1 | `error` null; one call, `[Speak in American English] Hello world.`; the trace ends `active` on the Fish voice with 7 segments; `after.paused` true, `after.error` null |
| 06-prefetch-locale-stub.js | Swaps in three controller segments, requests the first as en-US, flips the voice object to en-GB, waits for prefetch, replays, then asks in British | 4 | `prefetch.calls` equals `expected`: `[Speak in American English] 102 exp`, `[Speak in American English] 4/70 HP `; `reuse.fetchesAdded` 0; `british.fetchesAdded` 2, both British; `controllerRestored` and `prefsRestored` true; `after.paused` true, `after.error` null |
| 07-local-stub-no-cue.js | Kokoro requests for `<100 exp>` and a sample, answered by a `/dev/captioned_speech` stub | 3, 5 | Two requests, `input` `100 exp` and the sample sentence; `noCue` true; ranges `100` 1..4 and `exp` 5..8 over the original text; both `error` null; `prefsRestored` true |
| 08-native-stub-no-cue.js | Imports its own copy, stubs Zotero's native interface on the reader prototype, requests `<100 exp>` and a sample, restores, closes and erases, and writes `baselineMemory` back | 3, 5 | `nativeCalls` `100 exp` and `sample`, both en-US, no cue; one range `100` 1..4; `patchRestored`, `closed`, `erased` true; `remainingFixtureReaders` 0; `errors` empty; user readers unchanged |
| 09-unspaced-language-stub.js | Imports its own copy; stubbed requests for `<One>` in en-US and `<你好世界>`, `<你好世界今天快乐>` in zh-CN; closes and erases | 2 | Calls `[Speak in American English] One`, `[Speak in Chinese (China)] 你好世界`, uncued `你好世界今天快乐`; every `error` null; `closed`, `erased`, `prefsRestored` true; `remainingFixtureReaders` 0; user readers unchanged |
| 10-fixture-cleanup.js | Closes the shared copy's player and tab, then erases the item | cleanup | `found`, `closed`, `erased` true; `errors` empty |
| 11-final-state-audit.js | Reads the eight prefs the kit writes, every reader with its player state, the listed fixture items, the selected tab and the position store | 7 | Each pref's value and user flag as in 01 (`readAloud.memory` by length); `debugStoring` and `settingsWindow` as in 01; every listed fixture `false`; the user's readers as in 01; position rows back to 01's count, `queued` 0 |

## Cleanup

- **Order.** 08 and 09 erase their own copies in `finally`; after 09, 10
  erases the shared one. Then compare `readAloud.memory` with 01: a
  fixture's player can move it (the run checked it after erasing a copy,
  `outputs/09-retry-fixture-cleanup-and-memory-restore.json`), and 08
  writes its literal back.
- **Preferences, rebuilt from this run's 01.** The run's restore survives
  only as a redacted transcript,
  `13-final-preference-restore.redacted.js.txt`,
  holding that run's values and a placeholder memory; it is not a script
  and is not in this kit. Restore from 01's output instead: `cacheAudio`,
  `prefetchEnabled` and `readAloud.stripAngleBrackets` first, then
  `readAloud.volume`, then `webdav.syncPositions`, `webdav.syncSettings`
  and `webdav.autoUploadSettings`, with `readAloud.memory` from the raw 01
  value as the very last write. A pref 01 saw with a user value is set to
  that value; one without is cleared with `Services.prefs.clearUserPref`,
  as the stubs' `finally` blocks do. Then return the debug store to 01's
  `debugStoring` and run 11.
- **Byte-identical at the end.** Every pref 01 read, value and user flag
  (11 covers the eight the kit writes, the memory by length only; compare
  its value privately and rerun 01 for the rest); the debug store and the
  settings window; the user's readers' `active`, `paused`, voice and
  `position`; no fixture item; position rows at 01's count with `queued`
  0; no new plugin error in the error ring (the run's 18 came from its
  failed stub attempts).
- **Hooks.** Every stub puts the sandbox `fetch` back in `finally`, and 06
  restores the controller's `_segments`, `_position` and `_currentIndex`
  (`controllerRestored`). 08 restores the prototype method by assignment,
  and `patchRestored` compares identity only: Zotero defines the method on
  `ReaderInstance` (`chrome/content/zotero/xpcom/reader.js`:1748) and a
  tab is a `ReaderTab` (:1950), so the tab prototype keeps an own property
  holding the original until Zotero restarts. It behaves the same.
- **Audio cache.** 04, 05 and 06 run with the plugin's in-memory cache on,
  so the stub MP3 stays cached under the Fish voice for their texts
  (`100 exp`, `One two three four`, `Hello world.`,
  `This sentence has five words.`, `102 exp`, `4/70 HP `) until Zotero
  restarts or another build is installed: the key holds the plugin
  version, provider, voice, text and cue (`cacheVersion` in
  `src/index.ts`, `cacheKeyFor` in `src/read-aloud/remote-interface.ts`).
  A second pass in the same session counts fewer fetches, and reading one
  of those texts with that voice would play the stub. Report it.

## Limits

- **Listening (item 6).** Whether the cue is spoken, the words change or
  the pronunciation is right, and whether the highlight keeps pace, are
  human checks; the run recorded NOT TESTABLE (human). The owner's
  confirmation covers only the research samples (pronunciation report).
- **Stubs are not Fish.** 04–09 answer with one fixed MP3 and made-up
  word timings, so their ranges prove the plugin's mapping, not real
  alignment. Real ranges come only from 03, which runs with the cache off
  and replays nothing.
- **Who supplies the locale.** 03, 04, 06, 07, 08 and 09 hand the locale
  to the remote interface themselves; only 05 shows the reader passing
  it, for the fixture's first segment. No script switches voices in the
  player, so the prepared voice switch of item 1 was not observed live;
  06 only changes its voice object after the first request.
- **Fish Speech Local.** No script covers its exclusion (item 5); the run
  marked it NOT RUN and left it to issue #99. 07's Local stub is Kokoro.
- **Popup visibility and tab.** 01 records neither the user's player
  visibility nor the selected tab, so neither restoration can be proven;
  the run reported the user's popup visibility as not captured.
- **Zotero sync.** Zotero's own sync uploaded the fixtures' metadata while
  they existed; the plugin's WebDAV switches in 02 do not stop it.

## Runs

The run archive that held each run's report and scripts was removed on
2026-09-14 (a run's table is on its issue since then); the last column names
what it held, and the git history before that day still has the files.

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-13-1.12.5-pronunciation | Research only, before #98 was opened, on the owner's own book; no case item | report (2026-09-13, 1.12.5 pronunciation) · scripts (2026-09-13, 1.12.5 pronunciation) |
| 2026-09-13-1.12.6-beta2-language-hints | 1–5 and 7 PASS (7 without the user's popup visibility, which was not captured); 6 NOT TESTABLE (human); the Fish Speech Local exclusion NOT RUN (#99) | report (2026-09-13, 1.12.6-beta2 language-hints) · scripts (2026-09-13, 1.12.6-beta2 language-hints) |

## Where each script comes from

The middle column is the file's name in that run's archive, removed on
2026-09-14 and kept in the git history before that day.

| Script | Executed as | Run |
| --- | --- | --- |
| 01-baseline-snapshot.js | `01-baseline-snapshot.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 02-mute-and-sync-off.js | `02-temporary-mute-and-sync-off.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 03-real-fish-request-capture.js | `03-real-fish-request-capture.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 04-cache-locale-stub.js | `07-cache-locale-good-stub.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 05-popup-sse-stub.js | `08-popup-good-sse-stub.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 06-prefetch-locale-stub.js | `09-prefetch-good-stub.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 07-local-stub-no-cue.js | `10-local-stub-no-cue.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 08-native-stub-no-cue.js | `11-native-stub-no-cue.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 09-unspaced-language-stub.js | `12-unspaced-language-stub.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 10-fixture-cleanup.js | `15-fixture-24426-cleanup.js` | 2026-09-13-1.12.6-beta2-language-hints |
| 11-final-state-audit.js | `14-final-state-audit.js` | 2026-09-13-1.12.6-beta2-language-hints |
