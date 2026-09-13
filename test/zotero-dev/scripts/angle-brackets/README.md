# Scripts: 3g. Enclosing brackets (issues #94, #96, #101)

[Case](../../cases/angle-brackets.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

This kit checks that Read Aloud removes enclosing bracket pairs from the
text a voice receives, while word ranges, the cache, prefetch, empty pairs,
native voices and the settings row stay tied to the original text. It holds
two independent sequences, each with its own baseline, fixture import and
cleanup: `pairs-` covers the base behavior and the configurable pair list
with a Fish voice, and `groups-` covers several groups in one sentence with
a Kokoro voice. The files are zotero-dev bridge snippets, sent one at a time
through `zotero_execute_js`, not a Node test runner. Reusing them means
adapting the literals named below and taking a fresh baseline; the PASS
results under Runs are not a fresh pass.

## Before you start

- **Build and bridge.** Read `agents/zotero-tester.md` and the case first.
  Run `zotero_ping`, install the xpi in place, and require
  `diagnostics.startup()` to report every step `ok` and `failed: []`
  before anything is driven. Never run while another agent is driving
  Zotero or while one of the owner's readers is playing.
- **Fixture.** Both sequences use
  `test/fixtures/angle-brackets/angle-brackets.epub` (regenerate it with
  its `build.py`), imported as a disposable standalone attachment by
  `pairs-03` or `groups-02`, which return the new item's ID, key and
  title. Each sequence takes its own fresh import; confirm the title
  before writing its ID into the scripts.
- **Literals to replace.**
  - *Fixture item ID.* `24434` in `pairs-04` to `pairs-07`, `pairs-12` to
    `pairs-16` (twice in `pairs-12`) and `pairs-18` to `pairs-26`. The
    groups sequence carries three historical IDs, all of which become its
    one new import: `25431` in `groups-03` to `groups-05`, `groups-11` and
    `groups-12`; `25444` in `groups-06` to `groups-09`, `groups-13` and
    `groups-14`; `25445` in `groups-15` to `groups-17`.
  - *Fixture path.* `pairs-03` holds a macOS worktree path and `groups-02`
    a Windows one; point both at the EPUB in the current checkout.
  - *Expected segments.* `groups-05` compares the fixture's seven
    paragraphs, positions and EPUB CFIs, which hold while `build.py` is
    unchanged (it last changed with #94).
  - *Restoration values.* `groups-17` restores fixed values taken from the
    1.12.5-beta4 baseline; see Cleanup.
  - *Voices and readers.* No voice ID is hard-coded: the probes use the
    fixture manager's `selectedVoiceID`, the native stubs their own
    `stub-standard` and `stub-premium`. Readers are found by item ID, never
    by index.
- **Shared state.** `pairs-01` stores the baseline in
  `globalThis.__zttsBracketPairsBaseline` and `pairs-26` restores from it,
  so the pairs sequence runs within one Zotero session. The groups
  sequence shares no global: keep `groups-01`'s output privately for its
  cleanup. Settings carry from one script to the next, so run each
  sequence in order: `pairs-13` leaves the setting off for `pairs-14`,
  `pairs-17` leaves the list `【】 ()` for `pairs-18` to `pairs-21`, and
  `groups-10` leaves the setting off until `groups-14` turns it back on.
- **Settings window.** `pairs-08` to `pairs-11` and `pairs-17` work in the
  open settings window: open it with `zotero_open_preferences` before
  `pairs-08`, which navigates to the Zotero-TTS pane. After an in-place
  install, close an already open window and reopen it first.
- **Providers and spend.** In `pairs-` the fixture's remembered voice must
  be a Fish voice, since its captures read the request body's `text`; in
  `groups-` it must be a Kokoro voice, since those captures read `input`,
  which a Fish request leaves `null`. Before any player opens, confirm
  that voice ID contains `::`; otherwise stop, because the player would
  fall back to Zotero's metered Standard voice. Each capture sends one or
  two short requests, and each script that opens or reopens the player
  (`pairs-06`, `pairs-14`, `pairs-15`, `pairs-18`, `pairs-22`, `groups-05`,
  `groups-12`, `groups-14`) synthesizes the opening sentences while muted.
  Standard and Premium are reached only through the restored stubs in
  `pairs-25` and `groups-15`, with no paid synthesis. The groups sequence
  neither reads nor writes `readAloud.bracketPairs`: check that it is
  `<> []` before `groups-06`.
- **The owner's readers.** Only the fixture's reader is opened, played,
  stopped or closed; never start, pause, stop or close the owner's own
  sessions. The native stubs take Zotero's reader prototype from another
  open reader (both runs had one of the owner's, paused and untouched) and
  refuse with `user reader missing` when there is none. Open no other tab
  while a stub runs.
- **Evaluation.** Each file is one `(() => …)()` or `(async () => …)()`
  expression that finishes inside the bridge's ~8 s window. If a multiline
  file comes back as a debugger `SyntaxError`, evaluate it as
  `new Function("return " + script)()`, as the 1.12.5-beta4 run did; the
  body stays as it is.

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
| `pairs-23-mixed-malformed-requests.js` | Captures real requests for `<[Hello]> [<World>]` and `<[Hello>]` | 2, 9 | Sent as `[Hello] <World>` and, unchanged, `<[Hello>]`; `sourceUnchanged: true` for both |
| `pairs-24-empty-pairs.js` | Requests `<> []` | 5, 9 | `calls: []`; a 6444-byte WAV with one whole-segment timestamp [0,5] |
| `pairs-25-native-stub.js` | Closes the fixture, stubs the reader prototype's native interface, reopens the fixture, requests Standard, Premium, the sample and an error, then restores and closes | 6, 9 | `patchRestored: true`, `fixtureClosed: true`, `errors: []`; the stub gets `Hello World` and `“World!”` with `lang`, `paragraphStart` and `sourcePosition`; ranges [1,6], [9,14] and [2,7]; marker `sample-unchanged`; error `native-network` with `noStore: true`; `sourceUnchanged: true` |
| `pairs-26-cleanup-restore.js` | Closes and erases the fixture, restores the prefs and the debug store from the baseline global with memory last, closes the settings window and compares | 7 | `fixtureErased: true`, `fixtureExists: false`, no fixture reader (`readerClosed` is `false` because `pairs-25` already closed it); `readersMatchBaseline: true`; every `finalPrefs` entry `matchesBaseline: true`; position rows, queue and last error as in the baseline |
| `groups-01-baseline.js` | Snapshots the named prefs with user-value flags, readers, settings window, debug store and position store; stores no global | setup | A JSON snapshot, kept privately for `groups-17` |
| `groups-02-mute-sync-off-import.js` | Turns off the sync switches, sets volume 0, enables the setting and imports the fixture | setup | The switches `false`; volume `0`; setting `true`; a new item ID, key and title |
| `groups-03-fixture-open.js` | Opens the fixture's reader | setup | `called: true` |
| `groups-04-fixture-readiness.js` | Polls for the fixture's internal reader and manager | setup | The fixture row with `internal` and `manager` `true` |
| `groups-05-source-positions.js` | Opens and pauses the fixture's player and compares its segments with the fixture's texts, positions and CFIs | 2, 8 | `segments.count: 7`, `unchanged: true`; paused; `textSettings` entries `patched`, `configured` and `effective` `true` |
| `groups-06-provider-requests.js` | Captures real requests for the three-group source and seven edge cases with cache and prefetch off | 2, 8 | Inputs `Log in Register Play as guest`, `“A”, B!`, `<A> B`, `<A> <B>` and, unchanged, `<A> <B`, `<A>> <B>`, `<A> and <B>`, `a < b > c`; slices `Log`, `in`, `Register`, `Play`, `as`, `guest` at [1,4], [5,7], [10,18], [21,25], [26,28], [29,34] |
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

## Cleanup

- **Probes first.** Every capture restores its `fetch` wrapper, planted
  controller fields and cache and prefetch values in `finally`; the native
  stubs restore the reader prototype there and close the fixture. Confirm
  `patchRestored: true` in `pairs-25` and `groups-15` before anything else.
- **Order.** The fixture goes first: close its reader, erase the item and
  check that its position row is gone. The prefs follow in the tester
  workflow's order, as `pairs-26` writes them: volume, the setting, the
  pair list, cache, prefetch and settings sync; then position sync and
  settings upload; then the debug store; `readAloud.memory` last. The
  plugin volume is back before automatic sync and upload are on again,
  and memory is the last pref written.
- **`groups-17` needs editing.** It clears the user values of volume, the
  setting, settings sync, cache and prefetch, sets position sync and
  settings upload to `true` as user values, and turns the debug store on:
  the 1.12.5-beta4 baseline, not yours. Rewrite those lines from
  `groups-01`'s output before running it (its archived README: never
  restore the historical values into another session), in the order above.
- **Outside the groups snapshot.** `groups-01` and `groups-17` leave out
  `readAloud.memory` and `readAloud.bracketPairs`. The sequence writes
  neither, but compare both with a private snapshot at the end and write
  memory back last if it moved.
- **Must end identical.** Every named pref's value and user-value flag;
  `readAloud.memory`, compared by equality and never printed; the owner's
  readers with their item, active and paused state, voice and tier; the
  position store's rows, queue and last error; the debug store; the
  settings window. The fixture item and its reader are gone.
- **Settings window.** `pairs-26` reads `settingsWindowOpen` from the
  baseline global, which `pairs-01` never stores, so it always closes the
  window. If the baseline had it open, reopen it and select the baseline
  pane: in 1.12.4-beta2 `navigateToPane` timed out at the bridge, and
  clicking the pane's list item worked.
- **Failures.** A failed or interrupted run gets the same cleanup from the
  original baseline, never from a snapshot taken after muting. End with
  `zotero_read_errors`: nothing from the run with `[zotero-tts]` or a
  `zotero-tts.js` stack.

## Limits

- **Machine audio.** All three runs found the fixture's AudioContext
  `suspended` at `currentTime` 0, so continuous playback, playback carrying
  on past an empty pair (item 5) and the moving highlight were NOT
  TESTABLE. How the speech sounds and whether the highlight keeps pace
  remain human checks.
- **Direct interface, not segmentation.** The example strings, the
  three-group source included, go straight to the fixture reader's remote
  interface. That proves the request, the returned ranges and the
  untouched segment, not that Zotero splits a document into those
  sentences; the EPUB does not contain the three-group source. Only
  `groups-05` reads the fixture's real segments.
- **Native voices.** Standard and Premium are stubs: the checks prove the
  copied, prepared segment and the mapping back, not synthesis by Zotero's
  service.
- **Locale and settings transfer.** No run switched Zotero's live locale;
  `pairs-08` reads the en-US strings, and the Chinese labels rest on the
  l10n unit tests. Backup, restore and settings sync of both settings are
  covered by unit tests only.
- **Provider timing.** Fish returned a single word timing for the mixed
  sample in `pairs-23` although the prepared text was right; that is the
  provider's limit, not a bracket failure.
- **Item 2's cue and examples.** No script here separates the
  [section 3h](../../cases/fish-language-hints.md) language cue from the
  bracket-prepared text; the
  [1.12.6-beta2 language-hints run](../../runs/2026-09-13-1.12.6-beta2-language-hints/report.md)
  of that case did. The case's example strings `<Hello world>.` and the
  curly-quoted fox sentence were captured only by 1.12.4-beta2's
  [archived request capture](../../runs/2026-09-13-1.12.4-beta2/scripts/08-real-provider-request-capture.js);
  this kit checks the same removal and outside punctuation with
  `<Hello> [World]` and `“<A>”, <B>!`.
- **Dialog text.** `pairs-09` and `pairs-10` return the notice's whole
  `textContent`, which the tester workflow says opens with the dialog's
  own style rule: compare the message after it.
- **Unit-only edges.** Nested pairs (one removal), punctuation before and
  after a pair, fullwidth brackets, UTF-16 position mapping, immutable
  cached timestamps, and concurrent cache and prefetch.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-13-1.12.4-beta2 | 1–7 PASS (#94); continuous playback past the empty pair NOT TESTABLE (AudioContext suspended); live Chinese locale not switched | [report](../../runs/2026-09-13-1.12.4-beta2/report.md) · [scripts](../../runs/2026-09-13-1.12.4-beta2/scripts/) |
| 2026-09-13-1.12.5-beta4 | 8 PASS (#96) through the direct interface; continuous playback and moving highlight NOT TESTABLE (machine audio); live Chinese locale NOT TESTABLE (not switched) | [report](../../runs/2026-09-13-1.12.5-beta4/report.md) · [scripts](../../runs/2026-09-13-1.12.5-beta4/scripts/) |
| 2026-09-13-1.12.6-beta3 | 9 PASS (#101); audio progression NOT TESTABLE (machine audio); listening and highlight motion NOT TESTABLE (human, device); live Chinese locale NOT TESTABLE (not switched) | [report](../../runs/2026-09-13-1.12.6-beta3/report.md) · [scripts](../../runs/2026-09-13-1.12.6-beta3/scripts/) |
| 2026-09-13-1.12.7-beta-manual-follow | 9, the controls only: present, checked, `<> []`, input locked — PASS; its script belongs to the [manual-follow kit](../manual-follow/README.md) | [report](../../runs/2026-09-13-1.12.7-beta-manual-follow/report.md) · [scripts](../../runs/2026-09-13-1.12.7-beta-manual-follow/scripts/) |

## Where each script comes from

| Script | Executed as | Run |
| --- | --- | --- |
| `pairs-01-baseline.js` | [00-baseline-sanitized.js](../../runs/2026-09-13-1.12.6-beta3/scripts/00-baseline-sanitized.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-02-mute-sync-off.js` | [01-setup-mute-sync-off.js](../../runs/2026-09-13-1.12.6-beta3/scripts/01-setup-mute-sync-off.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-03-fixture-import.js` | [02-fixture-import.js](../../runs/2026-09-13-1.12.6-beta3/scripts/02-fixture-import.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-04-fixture-open.js` | [03-fixture-open.js](../../runs/2026-09-13-1.12.6-beta3/scripts/03-fixture-open.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-05-fixture-readiness.js` | [04-fixture-readiness.js](../../runs/2026-09-13-1.12.6-beta3/scripts/04-fixture-readiness.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-06-audio-motion-probe.js` | [05-audio-motion-probe.js](../../runs/2026-09-13-1.12.6-beta3/scripts/05-audio-motion-probe.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-07-audio-clock.js` | [06-audio-clock-two-samples.js](../../runs/2026-09-13-1.12.6-beta3/scripts/06-audio-clock-two-samples.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-08-ui-initial.js` | [07-ui-initial.js](../../runs/2026-09-13-1.12.6-beta3/scripts/07-ui-initial.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-09-ui-validation-dialogs.js` | [08-ui-validation-dialogs.js](../../runs/2026-09-13-1.12.6-beta3/scripts/08-ui-validation-dialogs.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-10-ui-entry-errors.js` | [09-ui-entry-errors.js](../../runs/2026-09-13-1.12.6-beta3/scripts/09-ui-entry-errors.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-11-external-refresh.js` | [10-external-refresh.js](../../runs/2026-09-13-1.12.6-beta3/scripts/10-external-refresh.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-12-text-settings-snapshot.js` | [11-text-settings-session-snapshot.js](../../runs/2026-09-13-1.12.6-beta3/scripts/11-text-settings-session-snapshot.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-13-active-opt-out-request.js` | [12-active-opt-out-request.js](../../runs/2026-09-13-1.12.6-beta3/scripts/12-active-opt-out-request.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-14-stop-reopen-effective.js` | [13-stop-reopen-effective.js](../../runs/2026-09-13-1.12.6-beta3/scripts/13-stop-reopen-effective.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-15-reactivate-defaults.js` | [14-reactivate-defaults.js](../../runs/2026-09-13-1.12.6-beta3/scripts/14-reactivate-defaults.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-16-default-provider-request.js` | [15-default-provider-request.js](../../runs/2026-09-13-1.12.6-beta3/scripts/15-default-provider-request.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-17-ui-set-custom-pairs.js` | [16-ui-set-custom-active.js](../../runs/2026-09-13-1.12.6-beta3/scripts/16-ui-set-custom-active.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-18-reactivate-custom.js` | [17-reactivate-custom.js](../../runs/2026-09-13-1.12.6-beta3/scripts/17-reactivate-custom.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-19-custom-provider-request.js` | [18-custom-provider-request.js](../../runs/2026-09-13-1.12.6-beta3/scripts/18-custom-provider-request.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-20-custom-cache-repeat.js` | [19-custom-cache-repeat.js](../../runs/2026-09-13-1.12.6-beta3/scripts/19-custom-cache-repeat.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-21-custom-prefetch.js` | [20-custom-prefetch.js](../../runs/2026-09-13-1.12.6-beta3/scripts/20-custom-prefetch.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-22-reactivate-defaults-for-mixed.js` | [21-reactivate-default-for-mixed.js](../../runs/2026-09-13-1.12.6-beta3/scripts/21-reactivate-default-for-mixed.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-23-mixed-malformed-requests.js` | [22-mixed-malformed-requests.js](../../runs/2026-09-13-1.12.6-beta3/scripts/22-mixed-malformed-requests.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-24-empty-pairs.js` | [23-empty-default.js](../../runs/2026-09-13-1.12.6-beta3/scripts/23-empty-default.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-25-native-stub.js` | [24-native-standard-premium-stub.js](../../runs/2026-09-13-1.12.6-beta3/scripts/24-native-standard-premium-stub.js) | 2026-09-13-1.12.6-beta3 |
| `pairs-26-cleanup-restore.js` | [25-cleanup-restore.js](../../runs/2026-09-13-1.12.6-beta3/scripts/25-cleanup-restore.js) | 2026-09-13-1.12.6-beta3 |
| `groups-01-baseline.js` | [01-baseline-sanitized.js](../../runs/2026-09-13-1.12.5-beta4/scripts/01-baseline-sanitized.js) | 2026-09-13-1.12.5-beta4 |
| `groups-02-mute-sync-off-import.js` | [02-setup-import.js](../../runs/2026-09-13-1.12.5-beta4/scripts/02-setup-import.js) | 2026-09-13-1.12.5-beta4 |
| `groups-03-fixture-open.js` | [04-fixture-open-and-manager-readiness.js](../../runs/2026-09-13-1.12.4-beta2/scripts/04-fixture-open-and-manager-readiness.js) | 2026-09-13-1.12.4-beta2 |
| `groups-04-fixture-readiness.js` | [05-fixture-open-and-manager-readiness.js](../../runs/2026-09-13-1.12.4-beta2/scripts/05-fixture-open-and-manager-readiness.js) | 2026-09-13-1.12.4-beta2 |
| `groups-05-source-positions.js` | [14-exact-source-position-equality-probe.js](../../runs/2026-09-13-1.12.4-beta2/scripts/14-exact-source-position-equality-probe.js) | 2026-09-13-1.12.4-beta2, run again in 1.12.5-beta4 |
| `groups-06-provider-requests.js` | [06-provider-multiple-capture.js](../../runs/2026-09-13-1.12.5-beta4/scripts/06-provider-multiple-capture.js) | 2026-09-13-1.12.5-beta4 |
| `groups-07-cache-repeat.js` | [07-cache-repeat.js](../../runs/2026-09-13-1.12.5-beta4/scripts/07-cache-repeat.js) | 2026-09-13-1.12.5-beta4 |
| `groups-08-prefetch.js` | [08-prefetch-synthetic.js](../../runs/2026-09-13-1.12.5-beta4/scripts/08-prefetch-synthetic.js) | 2026-09-13-1.12.5-beta4 |
| `groups-09-empty-pair.js` | [09-empty-single.js](../../runs/2026-09-13-1.12.5-beta4/scripts/09-empty-single.js) | 2026-09-13-1.12.5-beta4 |
| `groups-10-opt-out-configured.js` | [10-opt-out-effective.js](../../runs/2026-09-13-1.12.5-beta4/scripts/10-opt-out-effective.js) | 2026-09-13-1.12.5-beta4 |
| `groups-11-stop-player.js` | [11-session-setting-and-cache-probes.js](../../runs/2026-09-13-1.12.4-beta2/scripts/11-session-setting-and-cache-probes.js) | 2026-09-13-1.12.4-beta2 |
| `groups-12-reopen-player.js` | [12-session-setting-and-cache-probes.js](../../runs/2026-09-13-1.12.4-beta2/scripts/12-session-setting-and-cache-probes.js) | 2026-09-13-1.12.4-beta2 |
| `groups-13-opt-out-original-request.js` | [11-opt-out-original.js](../../runs/2026-09-13-1.12.5-beta4/scripts/11-opt-out-original.js) | 2026-09-13-1.12.5-beta4 |
| `groups-14-opt-in-cache.js` | [12-opt-in-cache.js](../../runs/2026-09-13-1.12.5-beta4/scripts/12-opt-in-cache.js) | 2026-09-13-1.12.5-beta4 |
| `groups-15-native-stub.js` | [03-native-multi-group-stub.js](../../runs/2026-09-13-1.12.5-beta4/scripts/03-native-multi-group-stub.js) | 2026-09-13-1.12.5-beta4 |
| `groups-16-empty-groups.js` | [04-empty-multi-group.js](../../runs/2026-09-13-1.12.5-beta4/scripts/04-empty-multi-group.js) | 2026-09-13-1.12.5-beta4 |
| `groups-17-cleanup-restore.js` | [05-cleanup-restore.js](../../runs/2026-09-13-1.12.5-beta4/scripts/05-cleanup-restore.js) | 2026-09-13-1.12.5-beta4 |

The groups sequence follows 1.12.5-beta4, whose first pass (fixture 25444)
ran `groups-06` to `groups-14` and whose second pass (fixture 25445) ran
`groups-01`, `groups-02` and `groups-15` to `groups-17`. The first pass
reused older case 3g probes with its own fixture ID and archived only its
new scripts; its README names `groups-05` as run there and points to the
older setup probes. `groups-03` and `groups-04` (open the fixture) and
`groups-11` and `groups-12` (stop and reopen the player) are those older
probes, placed where that pass opened the fixture and stopped and reopened
the player; the archive does not name the scripts it used for those steps.
