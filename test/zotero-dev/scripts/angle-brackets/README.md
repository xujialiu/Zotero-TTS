# Scripts: 3g. Enclosing brackets (issues #94, #96, #101, #127)

[Case](../../cases/angle-brackets.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Bridge snippets (`zotero_execute_js`, one at a time, or through the
[shared runner](../_shared/README.md)), not a Node test runner. Three
independent sequences, each with its own baseline, fixture import and
cleanup: `pairs-` (base behavior + configurable list, Fish voice),
`groups-` (several groups in one sentence, Kokoro voice), `sentence-`
(a bracket pair inside a sentence, #127, Fish voice, the runner's
`params`/`state` — no hard-coded item id). Reusing `pairs-`/`groups-`
means adapting the literals below and taking a fresh baseline; PASS
results under Runs are not a fresh pass.

## Before you start

- **Build and bridge.** Read `.agents/zotero-tester.md` and the case first;
  `zotero_ping`, install in place, require `diagnostics.startup()` `ok`,
  `failed: []`. Never run while another agent drives Zotero, or an
  owner's reader plays.
- **Fixture.** All three sequences use
  `test/fixtures/angle-brackets/angle-brackets.epub` (`build.py`; #127
  appended 4 paragraphs after the original 7, unchanged — confirmed by
  `sentence-04`). Each sequence takes its own fresh standalone import and
  confirms the title. No voice id is hard-coded (the fixture manager's
  `selectedVoiceID`; native stubs use `stub-standard`/`stub-premium`);
  readers are found by item id, never index.
- **`pairs-`/`groups-` hard-code an old fixture item id** — open the
  script named below to find and replace it; `groups-17` rewrites its
  restoration values from `groups-01`'s own output, never the archived
  1.12.5-beta4 numbers. `pairs-01`/`-26` share a baseline global
  (`globalThis.__zttsBracketPairsBaseline`); `groups-01`'s output stays
  private, for `groups-17` alone. Settings window: `pairs-08`–`11` and
  `pairs-17` need it open on the Zotero-TTS pane
  (`zotero_open_preferences` before `pairs-08`); reopen after an
  in-place install. Settings carry between scripts within a sequence
  (`pairs-13`→`14`, `pairs-17`→`18`–`21`, `groups-10`→`14`).
- **`sentence-` reads the runner's state** (`Zotero.ZoteroTTSRun.state`:
  `baseline`, `fixtureItemID`, `voiceID`, `segments`,
  `segmentShapesBefore`, `segmentsOff`; `params.fixturesDir`) — nothing
  to edit, run its scripts in order through the [runner](../_shared/README.md).
- **Providers and spend.** `pairs-`/`sentence-` need a remembered Fish
  voice (captures read the request body's `text`); `groups-` needs Kokoro
  (`input`; Fish leaves it `null`). Confirm the voice id contains `::`
  before any player opens, or stop. Opening/reopening the player also
  synthesizes the segment it lands on, muted; Standard/Premium only
  through the restored stubs (`pairs-25`, `groups-15`), no paid
  synthesis. `groups-` never touches `readAloud.bracketPairs` (confirm
  `<> []` before `groups-06`). **Force `cacheAudio` off before a probe
  that must prove request text**: `sentence-11`/`-12` found that text
  unchanged by stripping (`ifx`), or already cached this session
  (`fireball` reactivated), is served with no fetch otherwise — a silent
  false negative.
- **The owner's readers.** Only the fixture's reader opens, plays, stops
  or closes. Native stubs borrow Zotero's reader prototype from another
  already-open reader (paused, untouched), refusing with `user reader
  missing` when there is none; open no other tab while a stub runs.
- **Evaluation.** One `(() => …)()`/`(async () => …)()` expression per
  file; a multiline one returned as a debugger `SyntaxError` instead
  runs as `new Function("return " + script)()` (moot under the runner).

## Run order

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `pairs-01-baseline.js` | Snapshots the named prefs with user-value flags (memory as kind and flag only), readers, settings window, debug store and position store, and keeps them in the baseline global | setup | A JSON snapshot with no memory value or secret; the owner's readers as found |
| `pairs-02-mute-sync-off.js` | Turns off position sync, settings sync and settings upload, sets volume 0, enables the setting with `<> []` and turns the debug store on | setup | The three switches `false`; volume `0` with a user value; setting `true`; list `<> []`; `debugStoring: true` |
| `pairs-03-fixture-import.js` | Imports the fixture EPUB | setup | A new item ID and key, the given title, `attachmentEPUB` |
| `pairs-04-fixture-open.js` | Opens the fixture's reader | setup | `called: true` |
| `pairs-05-fixture-readiness.js` | Polls for the fixture's internal reader, manager and remote interface | setup | The fixture row with `internal`, `manager` and `remoteInterface` all `true` |
| `pairs-06-audio-motion-probe.js` | Opens the fixture's player, traces its state and audio clock, pauses it | setup | Active on the intended plugin voice, then paused; `audioState`, `audioTime` and `position` recorded |
| `pairs-07-audio-clock.js` | Reads the audio clock twice 500 ms apart, then pauses | setup | `clockMoved: true` lets playback checks run; `suspended` at `0` in both samples makes playback progression NOT TESTABLE; `stopped: true` |
| `pairs-08-ui-initial.js` | Opens the Zotero-TTS pane and reads the checkbox, the pair input and the help | 1, 9 | Checkbox `ztts-strip-angle-brackets` checked with `preference: null`; input `ztts-bracket-pairs` holding `<> []`, disabled; label `Remove enclosing brackets when reading`; help naming outside punctuation, the space-separated list, and stopping and reopening Read Aloud |
| `pairs-09-ui-validation-dialogs.js` | Unchecks the setting, then tries to enable an empty list, `aa` and `<> <>` answering Cancel, and `<> <>` answering Use defaults | 9 | Unchecked leaves the input enabled; each try opens the notice with `Use defaults` and `Cancel` and its own message (empty list, invalid pair, duplicate pair); Cancel keeps the draft and the switch off; Use defaults writes `<> []`, checks and locks |
| `pairs-10-ui-entry-errors.js` | Tries `<` and `**` answering Cancel, then enables `<> []` | 9 | Both show the invalid-pair message; Cancel keeps the draft and the switch off; `restored` checked, `<> []`, locked |
| `pairs-11-external-refresh.js` | Writes the list and the setting from outside the pane | 9 | Every write updates both controls: `() 【】` while locked, off and unlocked, `<> []`, on and locked |
| `pairs-12-text-settings-snapshot.js` | Reads `diagnostics.textSettings()` for every reader and the fixture | 4, 9 | Every entry `patched`, `configured` and `effective` `true`, `configuredPairs` and `effectivePairs` `<> []`; the fixture active and paused |
| `pairs-13-active-opt-out-request.js` | Turns the setting off during the paused session and captures a real request for `<Hello> [World]` | 2, 4 | `configured: false` with `effective: true`; one request with text `Hello World`; `Hello` [1,6], `World` [9,14]; the setting stays off |
| `pairs-14-stop-reopen-effective.js` | Stops and reopens the fixture's player, then pauses | 4 | Inactive after the stop, active after the reopen, then paused; fixture `configured: false`, `effective: false` |
| `pairs-15-reactivate-defaults.js` | Turns the setting on, stops and reopens the player | 4 | `configured: true`; fixture `effective: true` with `effectivePairs` `<> []`; active and paused |
| `pairs-16-default-provider-request.js` | Captures a real request for a frozen `<Hello> [World]` segment with cache and prefetch off | 2, 3, 9 | One request `Hello World`; real ranges `Hello` [1,6], `World` [9,14]; `sourceUnchanged: true` |
| `pairs-17-ui-set-custom-pairs.js` | Unchecks, types `【】 ()` and re-enables in the pane while the session is paused | 9 | Draft off with the input enabled; enabled checked and locked; `configuredPairs` `【】 ()`, `effectivePairs` still `<> []` |
| `pairs-18-reactivate-custom.js` | Stops and reopens the player | 9 | `effectivePairs` `【】 ()`; active and paused |
| `pairs-19-custom-provider-request.js` | Captures a real request for a frozen `【Hello】 (World)` segment | 3, 9 | One request `Hello World`; `Hello` [1,6], `World` [9,14]; `sourceUnchanged: true` |
| `pairs-20-custom-cache-repeat.js` | Requests `【Hello】 (World)` twice with the cache on and prefetch off | 3, 9 | `callCount: 1`; equal audio sizes; `sameTimestamps: true` |
| `pairs-21-custom-prefetch.js` | Plants a two-segment list, requests the anchor with prefetch on, then the next segment, and restores the controller | 3, 9 | Requests `Prefetch anchor with two groups` and `Prefetch next sentence.`; `callCountBeforeSecond` equal to the final call count; `nextPrefetched: true` |
| `pairs-22-reactivate-defaults-for-mixed.js` | Writes `<> []` and the setting on, stops and reopens the player | 9 | `effective: true` with `effectivePairs` `<> []`; active and paused |
| `pairs-23-mixed-malformed-requests.js` | Captures real requests for `<[Hello]> [<World>]` and `<[Hello>]` | 2, 9 | Sent as `[Hello] <World>` and, unchanged, `<[Hello>]`; `sourceUnchanged: true` for both. **Superseded by #127**: current code sends these as `Hello World` and `Hello` (`sentence-07`, 2026-09-22) — rerun before reusing this script's own PASS |
| `pairs-24-empty-pairs.js` | Requests `<> []` | 5, 9 | `calls: []`; a 6444-byte WAV with one whole-segment timestamp [0,5] |
| `pairs-25-native-stub.js` | Closes the fixture, stubs the reader prototype's native interface, reopens the fixture, requests Standard, Premium, the sample and an error, then restores and closes | 6, 9 | `patchRestored: true`, `fixtureClosed: true`, `errors: []`; the stub gets `Hello World` and `“World!”` with `lang`, `paragraphStart` and `sourcePosition`; ranges [1,6], [9,14] and [2,7]; marker `sample-unchanged`; error `native-network` with `noStore: true`; `sourceUnchanged: true` |
| `pairs-26-cleanup-restore.js` | Closes and erases the fixture, restores the prefs and the debug store from the baseline global with memory last, closes the settings window and compares | 7 | `fixtureErased: true`, `fixtureExists: false`, no fixture reader; `readersMatchBaseline: true`; every `finalPrefs` entry `matchesBaseline: true`; position rows, queue and last error as in the baseline |
| `groups-01-baseline.js` | Snapshots the named prefs with user-value flags, readers, settings window, debug store and position store; stores no global | setup | A JSON snapshot, kept privately for `groups-17` |
| `groups-02-mute-sync-off-import.js` | Turns off the sync switches, sets volume 0, enables the setting and imports the fixture | setup | The switches `false`; volume `0`; setting `true`; a new item ID, key and title |
| `groups-03-fixture-open.js` | Opens the fixture's reader | setup | `called: true` |
| `groups-04-fixture-readiness.js` | Polls for the fixture's internal reader and manager | setup | The fixture row with `internal` and `manager` `true` |
| `groups-05-source-positions.js` | Opens and pauses the fixture's player and compares its segments with the fixture's texts, positions and CFIs | 2, 8 | `segments.count: 7`, `unchanged: true`; paused; `textSettings` entries `patched`, `configured` and `effective` `true` |
| `groups-06-provider-requests.js` | Captures real requests for the three-group source and seven edge cases with cache and prefetch off | 2, 8 | Inputs `Log in Register Play as guest`, `“A”, B!`, `<A> B`, `<A> <B>` and, unchanged, `<A> <B`, `<A>> <B>`, `<A> and <B>`, `a < b > c`; slices `Log`, `in`, `Register`, `Play`, `as`, `guest` at [1,4], [5,7], [10,18], [21,25], [26,28], [29,34]. **Superseded by #127**: `sentence-07` (2026-09-22) reconfirms `<A> <B`→`A <B`, `<A>> <B>`→`A> B`, `<A> and <B>`→`A and B` directly; rerun this script before reusing its own PASS |
| `groups-07-cache-repeat.js` | Requests the three-group source twice with the cache on | 3, 8 | No fetch for the second request; equal audio sizes; `sameTimestamps: true` |
| `groups-08-prefetch.js` | Plants a two-segment list, requests the anchor with prefetch on, then the next segment | 3, 8 | Inputs `Prefetch anchor with two groups` and `Prefetch next sentence.`; no fetch for the next segment's own request; `restoredSegments` and `restoredPosition` `true` |
| `groups-09-empty-pair.js` | Requests `<>` with prefetch off | 5 | A 6444-byte WAV; `calls: []` |
| `groups-10-opt-out-configured.js` | Turns the setting off and reads `textSettings()` | 4, 8 | `configured: false`, `effective: true`, `active: true`; the setting stays off |
| `groups-11-stop-player.js` | Stops the fixture's player | 4 | `error: null`, `active: false` |
| `groups-12-reopen-player.js` | Reopens and pauses the fixture's player and reads `textSettings()` | 4, 8 | Active, then paused; the fixture's entry `configured: false`, `effective: false` |
| `groups-13-opt-out-original-request.js` | Captures a real request for the three-group source in that session | 4, 8 | `configured: false`; one input equal to `<Log in> <Register> <Play as guest>` |
| `groups-14-opt-in-cache.js` | Stops, turns the setting on, reopens and pauses, then requests the source again | 4, 8 | The fixture's `effective: true`; the six slices and ranges of `groups-06` |
| `groups-15-native-stub.js` | Closes the fixture, stubs the reader prototype's native interface, reopens the fixture, requests the three-group source on Standard, then restores and closes | 6, 8 | `patchRestored: true`, `fixtureClosed: true`, `errors: []`; the stub gets `Log in Register Play as guest` with `lang`, `paragraphStart`, `position` and `sourcePosition`; the six ranges of `groups-06`; `sourceTextAfter` the original source |
| `groups-16-empty-groups.js` | Reopens the fixture's reader if needed and requests `<> <   >` with prefetch off | 5, 8 | A 6444-byte WAV with one timestamp [0,8]; `calls: []`; prefetch restored. It waits only 500 ms after opening: an interface error means rerun it once the reader is ready |
| `groups-17-cleanup-restore.js` | Closes and erases the fixture, then writes fixed restoration values (see Cleanup) | 7 | `fixtureErased: true`, `fixtureExists: false`; `remaining` holds only the baseline readers; `finalPrefs`, debug store and position store equal to `groups-01` |
| `sentence-01-baseline.js` | Snapshots the named prefs (incl. `fish.enabled`/`fish.freeOnly`), readers (title via `item.parentItem`, not a second `Items.get`), settings window, debug store and position, into `state.baseline` | setup | A JSON snapshot; no memory value or secret |
| `sentence-02-setup-import.js` | Mutes, turns sync off, sets the default list, `prefetchEnabled` off, debug store on, imports the fixture | setup | Switches as set; a new item id/key/title; `state.fixtureItemID` |
| `sentence-03-open-ready.js` | Opens the fixture reader and polls for internal/manager/remote interface | setup | `ready: true` |
| `sentence-04-activate-segments.js` | Opens the popup (fetch-wrapped), pauses once 11 segments exist, reads all of `manager.segments` by index (never `.map()` — reader-realm array) | 2, 10 | `first7Unchanged: true` against the pre-#127 array; `last4Match: true` (the fixture's own segmentation is exactly the 4 target sentences, no fallback needed); the natural first request `[Speak in American English] Hello world.` (short-text cue, §3h) |
| `sentence-05-item2-fox-request.js` | Direct `getAudio` on the real fox-sentence segment, cache/prefetch off | 2 | Request `“The quick brown fox jumps over the lazy dog!”`; `sourceUnchanged: true` |
| `sentence-06-item5-empty-pair.js` | Direct `getAudio` on the real `<>` segment | 5 | `calls: []`; 6444-byte WAV, timestamp [0,2]; `sourceUnchanged: true` |
| `sentence-06b-comparison-and-unmatched.js` | Blocked-fetch direct calls on the real "comparison" and "unmatched-bracket" segments | 2 | Both requested unchanged |
| `sentence-07-item3-nine-strings.js` | Blocked-fetch direct calls for 9 synthetic strings (issue #127's changed item 8/9 examples) | 8, 9 | All 9 match: `A B`, `A <B`, `A> B`, `A and B`, unchanged `a < b > c`, `Hello World`, `Hello`, unchanged `x <= 5 and y >= 3`, `Warning: HP < 10%` |
| `sentence-08-fireball-and-levelup.js` | Real requests for the Fireball and Level-Up segments, cache on (first-ever text) and prefetch off, with a debug-store before/after diff | 10 | Texts match; ranges slice `Fireball` [9,17], `Level` [1,6], `Up` [7,9]; debug lines "removed 2 … from 31/30 chars" |
| `sentence-09-fireball-cache-repeat.js` | Repeats the Fireball segment with cache on | 10 | `noSecondRequest: true`; `Fireball` slice unchanged at [9,17] |
| `sentence-10-gained-and-ifx.js` | Real requests for the Gained and Ifx segments, cache on | 10 | Gained: `You gained  100 exp today.` (two spaces) with a debug line; Ifx: sent as written, no debug line |
| `sentence-11-setting-off-reopen.js` | Sets the setting off, stops/reopens the session, then blocked-fetch calls (cache forced off) on all four target segments | 10 | `effective: false`; all four unchanged (with brackets) |
| `sentence-12-setting-on-reopen.js` | Sets the setting on, stops/reopens, blocked-fetch call (cache forced off) on Fireball | 10 | `effective: true`; `He cast Fireball at the wolf.` |
| `sentence-13-cleanup-restore.js` | Closes/erases the fixture, restores prefs (incl. the two fish prefs) from `state.baseline`, memory last | 7 | Every `finalPrefs` entry `matchesBaseline: true`; readers, position and settings window match the baseline |

## Cleanup

- **Probes first.** Every capture restores its `fetch` wrapper and any
  planted cache/prefetch/controller values in `finally`; native stubs
  restore the reader prototype and close the fixture there. Confirm
  `patchRestored: true` (`pairs-25`, `groups-15`) before anything else.
- **Order.** Fixture first: close, erase, confirm its position row is
  gone. Then prefs in the tester workflow's order — volume, the setting,
  the pair list, cache, prefetch, settings sync, position sync, settings
  upload, debug store, `readAloud.memory` last (`pairs-26`, `sentence-13`).
  `groups-17` instead rewrites fixed values from `groups-01`'s own output
  (never the archived 1.12.5-beta4 numbers) and turns position
  sync/settings upload/debug store back **on** — confirm against its own
  baseline run first. `groups-01`/`-17` never touch `readAloud.memory` or
  `.bracketPairs`; compare both privately, restore memory last if moved.
- **Must end identical**, checked against the *original* baseline even
  after a failure, never a post-mute snapshot: every named pref's value
  and user-value flag; `readAloud.memory` (equality only, never printed);
  the owner's readers (item, active, paused, voice, tier); the position
  store; the debug store; the settings window as the baseline had it
  (`pairs-26` always closes it, since `pairs-01` never stores that flag;
  reopen and reselect the pane — click its list item if `navigateToPane`
  times out); fixture item and reader gone. End with `zotero_read_errors`:
  nothing unexplained carrying `[zotero-tts]`/`zotero-tts.js` (a probe's
  own deliberate, self-labelled `SynthesisError('network', …)` is expected).

## Limits

- **Machine audio.** AudioContext stayed `suspended` at `currentTime` 0
  in every run: continuous playback, carrying on past an empty pair, and
  the moving highlight are NOT TESTABLE; sound and highlight pace are
  human checks.
- **Direct interface, not segmentation.** Most example strings (the
  three-group source, `sentence-07`'s nine) go straight to the remote
  interface: proof of the request/ranges/untouched segment, not that
  Zotero's segmenter produces that sentence. `groups-05` and `sentence-04`
  read real segments instead (the first 7, and all 11 as of #127).
- **Native voices** (`pairs-25`, `groups-15`) are stubs: proof of the
  copied/prepared segment and mapping back, not Zotero's synthesis. No
  run switched Zotero's live locale; Chinese labels and backup/restore/
  sync rest on unit tests only.
- **Provider timing.** Fish gave one word timing for `pairs-23`'s mixed
  sample despite correct prepared text, and merged "the wolf" into one
  range for `sentence-09` — its own alignment granularity, not a bug.
- **Item 2's language cue.** No script here isolates the
  [§3h](../../cases/fish-language-hints.md) cue from the prepared text
  (that case's own 1.12.6-beta2 run did); `sentence-04`'s natural first
  request shows it applied to `<Hello world>.` (`[Speak in American
  English] Hello world.`); `sentence-05` covers the fox sentence.
- **Dialog text.** `pairs-09`/`-10` return the notice's whole
  `textContent` (its own style rule opens it): compare the message after.
- **Unit-only edges.** Nested/punctuation-adjacent pairs, fullwidth
  brackets, UTF-16 mapping, immutable cached timestamps, concurrent
  cache/prefetch, and, since #127, deeper nesting/crossing and math-sign
  edges beyond `sentence-07`'s nine.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-13-1.12.4-beta2 | 1–7 PASS (#94); continuous playback NOT TESTABLE (machine audio); live Chinese locale not switched | issue comment (2026-09-13, 1.12.4-beta2) |
| 2026-09-13-1.12.5-beta4 | 8 PASS (#96) through the direct interface; playback/highlight NOT TESTABLE (machine audio) | issue comment (2026-09-13, 1.12.5-beta4) |
| 2026-09-13-1.12.6-beta3 | 9 PASS (#101); audio progression NOT TESTABLE (machine audio); listening/highlight NOT TESTABLE (human, device) | issue comment (2026-09-13, 1.12.6-beta3) |
| 2026-09-13-1.12.7-beta-manual-follow | 9 controls only (present, checked, `<> []`, locked) — PASS; script in the [manual-follow kit](../manual-follow/README.md) | issue comment (2026-09-13, 1.12.7-beta manual-follow) |
| 2026-09-22-1.13.2-beta7 | 2, 3, 5, 10 PASS via `sentence-`; item 8/9's nine changed strings PASS via `sentence-07`; machine audio still NOT TESTABLE; listening (Fireball/Level Up spoken) and highlight pace remain human checks | issue #127 closing comment |
