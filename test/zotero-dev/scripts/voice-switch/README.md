# Scripts: 4a. Previous and next voice (issue #95)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

These scripts check case 4a, the previous and next voice shortcuts of
issue #95 and the regional pools of #97. They form seven independent
groups; each comes from one run and brings its own setup and cleanup.
They are zotero-dev bridge snippets, sent one at a time through
`zotero_execute_js` in chrome scope, not a Node test runner. Reusing them
means adapting the literals named below and taking a fresh baseline; the
PASS results under Runs are evidence of those runs, not a fresh pass.

## Before you start

- **Build and bridge.** Start with `zotero_ping` and `zotero_plugin_list`.
  A verification run installs the XPI with `zotero_plugin_install` and
  runs `native-00-startup-diagnostic.js` before anything else. Record the
  XPI and bundle SHA-256: a version string is not a build identity. Every
  script returns a JSON string, so a bare `undefined` means the eval timed
  out (about 8 s).
- **Fixtures.** Every group imports its own standalone copy of
  `test/fixtures/fixture-a.pdf` (the cancel group also `fixture-b.pdf`)
  with `Zotero.Attachments.importFromFile`, keeps the new item ID in its
  global and erases only that item in its cleanup. No script hard-codes a
  fixture item ID.
- **Fixture paths.** The absolute file paths point into Orca worktrees
  that no longer exist (`shortcut_swtich_voice`, `bug` and `bug_-95_2`
  under `C:\Users\xujia\orca\workspaces\zotero_plugin_tts\`). Replace them
  with this checkout's `test\fixtures\` in `native-03`, `cancel-01`,
  `cancel-02`, `kokoro-02`, `alignment-02`, `regional-02`, `providers-05`
  and `official-03`.
- **Reader indices.** Readers are found by item ID at run time.
  `native-05` and `regional-04` patch the prototype of the first
  non-fixture reader, and `official-00` and `official-02` inspect
  `Zotero.Reader._readers[0]`: one of the owner's reader tabs must be open,
  and it is never driven.
- **Voice IDs.** The controlled transports define their own (`native95-a`
  to `-d`, `followup95-a` to `-d`, `regional97-*`). `alignment-03` names
  `local::af_bella` and `local::af_jadzia`. `kokoro-02` and `alignment-02`
  open the player on the remembered voice, and `kokoro-03`/`kokoro-04`
  switch to its menu neighbors, so `readAloud.memory` must name a listed
  Kokoro voice with Kokoro neighbors. Otherwise the player opens on another
  voice, possibly a metered one, and `kokoro-03` stops with
  `fixture manager or two filtered local voices are missing`.
  `official-04` takes the first two voices of each tier's pool.
- **Provider pairs.** Each `providers-08-spec-*` names two provider
  prefixes and a direction; adapt the set to the providers configured
  now. `openai::` means MiMo in the all-configured mode and Chatterbox in
  the chatterbox-fish mode, which needs a saved Chatterbox preset.
- **Artifact paths.** `providers-13` and `official-13` write under
  `C:\Users\xujia\orca\scratch\zotero-tts-voice-handoff-2026-09-13\`,
  which still holds the 2026-09-13 artifacts: point `root` at the new
  run's directory first, or they overwrite them. `official-13` also
  writes build `1.12.6-beta` and its XPI hash into its evidence.
- **Privileged globals.** native: `Zotero.__ztts95Baseline`,
  `__ztts95Fixture`, `__ztts95NativeState`; cancel: `__ztts95Followup`;
  kokoro and alignment: the same `__ztts95Kokoro`; regional:
  `__ztts97Baseline`, `__ztts97Fixture`, `__ztts97NativeState`; providers:
  `__zttsAllHandoff`; official: `__zttsOfficialFollowup`. They keep raw
  preference values inside the process (the Kokoro, providers and official
  globals include headers or keys); the scripts print redacted summaries.
- **Spend.** native, cancel and regional play silent WAVs and send nothing
  to a provider. kokoro and alignment use the configured Kokoro server.
  providers sends one sentence per case to each configured provider it
  enables, cloud services included. official spends Zotero credits: one
  handoff sentence per tier (Standard 1, Premium 10 credits a minute) plus
  the tier switches of `official-08` and `official-11`. Configured
  providers and Zotero's Standard and Premium voices are authorized for
  these checks; keep each bounded and never loop.
- **The owner's paused player.** A Read Aloud player the owner left open,
  even paused, can keep provider changes from applying. Ask the owner to
  close it before the providers and official groups instead of closing it
  yourself.
- **Never drive the owner's readers:** no play, pause, voice pick or close.
  While `native-05` or `regional-04` holds its prototype patch, every
  document opened gets the fixture's voices in place of Zotero's Standard
  and Premium ones, so open nothing else until that group's cleanup.
  `official-02` prints the source of the prototype override it removes; if
  it is a test transport rather than Zotero's own method, report it.

## Run order

Run a group from its first script through its cleanup. Scripts that share
a number are alternatives for one step. Items are the case's item numbers;
Expected condenses what the run recorded as PASS.

### native: handoff, keys, fallback and cancellation (silent transport)

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `native-00-startup-diagnostic.js` | Runs `diagnostics.startup()` right after the install | 1 | The build's version; every step `ok`, including `prepared voice switching`; `failed: []` |
| `native-01-baseline-snapshot.js` | Stores the 15 touched plugin prefs and `reader.readAloudVoices`, with user-value flags, in `Zotero.__ztts95Baseline` | setup | Summary with memory, favorites and the voice map as lengths only; readers; position store `lastError: null` |
| `native-02-disable-sync-and-mute.js` | Turns WebDAV position sync, settings sync and auto-upload off, sets volume 0, turns the debug store on | setup | The three switches `false`, `volume: 0`, `debugStoring: true` |
| `native-03-import-fixture.js` | Imports `fixture-a.pdf` and keeps its identity in `Zotero.__ztts95Fixture` | setup | A new `itemID` and `key`, no `error` |
| `native-04-open-fixture.js` | Opens the fixture and waits for its Read Aloud manager | setup | `called: true`; final row `internal: true, manager: true` |
| `native-05-install-native-transport.js` | Closes the fixture, replaces `_getReadAloudRemoteInterface` on the reader prototype with a silent-WAV transport (`native95-a` to `-d`, `en-US`, word granularity, timestamps spread over each segment's words), reopens the fixture and injects the transport | setup | `opened`, `patchHeld`, `remoteInjected` and `readerReady` all `true` |
| `native-06-seed-voice-and-pause.js` | Sets a temporary memory on `native95-a`, opens the player, waits for voices and segments, pauses | setup | Final `selectedVoice: native95-a` with voices and segments loaded; the fixture paused |
| `native-07-trusted-start-audio-clock.js` | Reopens the fixture on the transport, starts it with a trusted Shift+Space, rewinds to segment 0 and samples the clock for 3 s | setup | Keys `[0,1,true,true]`; context `suspended` then `running`, clock advancing (beta3: about 2.9 s), position moving. A frozen clock makes the playback checks below NOT TESTABLE |
| `native-08-word-handoff.js` | Plays from segment 0, delays target `native95-b` by 700 ms, presses a trusted Shift+.; wraps the old source's `stop` and the prepared controller's `_playAudioBuffer` | 3 | Old voice selected and alive while `preparing`; stages `word` then `committed`; one numeric `stop(when)` (beta3: 1.2607 at clock 0.992); `last` `{kind: word, index: 0, charStart: 22, offset: 1.25}`; first prepared play at that offset; one target segment request, no sample |
| `native-09-source-position-probe.js` | Read-only: compares the active segment with segment 0 of the manager and of the controller | 3 | Active segment `same: true` as the manager's segment 0, with its `sourcePosition` |
| `native-10-menu-and-trusted-keys.js` | On the paused fixture: trusted Shift+, and Shift+. across both wraps, a one-voice attempt, a repeated key, an editable field, next rebound to Shift+F9 and then cleared; restores the binding | 2 | Menu `native95-a` to `-d`; `b→a`, `a→d`, `d→a`, each key `[0,1,true,true]`; a repeat does not advance; in the editable field `keydown` returns 2 and nothing changes; Shift+F9 moves `b→c` and returns 0 once cleared; `pausedThroughout: true`, `sampleCalls: 0`; next binding back to its default. The one-voice attempt is NOT TESTABLE: the live reader rejects the replaced voice array |
| `native-11-sentence-fallback.js` | Omits timestamps, delays the target by 350 ms, presses a trusted Shift+. | 4 | Old audio reaches segment 1; `last` `{kind: sentence, index: 1, offset: 0}`; the target's current and next sentences requested once each; no early stop, no repeated sentence |
| `native-12-rapid-and-return-cancel.js` | With `sameForAllDocuments` off for the script: two Shift+. 35 ms apart; then Shift+. followed by Shift+, back to the current voice | 6 | Only `pending: native95-c` survives and commits, no stale target plays; the return gives `stage: cancelled, pending: null` at once, the old controller stays alive and `native95-b` is never requested; pref restored |
| `native-13-pause-and-failure.js` | Pauses 220 ms after a Shift+. with a delayed target; then makes `native95-b` reject | 6 | After the pause: `pending: null`, old voice and controller kept after the delayed reply. Failure: `stage: failed`, `native95-a` still selected, active, unpaused, same controller; toast `Could not switch to Native Fixture B. Try again, or pause before changing the voice.` |
| `native-14-regional-menu-probe.js` | Adds an `en-GB` and an `en-AU` voice to the catalog, reloads the menu for GB, AU and US, restores catalog and region | 2 | Each region's list follows the catalog (one GB, one AU, four US voices); `restored` list and region as before. `favoritesOnly` is only recorded: this transport bypasses the plugin's favorites filter |
| `native-15-preparation-overtaken.js` | Shortens old buffers to 0.4 s, delays `native95-b` by 1.2 s, switches through `diagnostics.voiceSwitch(1, index)` and traces 3.3 s | 5 | Position advances (beta3: 0 to 6) while `prepared` moves ahead (`[0]` to `[0,7]`); the commit is never behind the reading position; `overtook: true`; transport values and pref restored |
| `native-16-cleanup-and-restore.js` | Closes and erases the fixtures, restores the prototype method and every snapshotted pref, deletes the globals | 8, cleanup | `fixtureReadersRemaining: 0`, `fixtureItemsRemaining: 0`; prefs and user-value flags as in the baseline (memory and voice map `equalToBaseline: true`); position rows as in the baseline, `queued: 0`, `lastError: null` |

### cancel: cancelling a pending switch (silent transport)

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `cancel-00-setup-and-helpers.js` | Snapshots the same prefs into `Zotero.__ztts95Followup`, defines a per-reader silent transport (`followup95-a` to `-d`, `en-US`, sentence granularity) and helpers; turns sync and `sameForAllDocuments` off, sets volume 0 and a temporary memory on `followup95-a` | setup | Redacted baseline; temporary switches `false`, `volume: 0`, `debugStoring: true` |
| `cancel-01-open-fixture-a.js` | Imports `fixture-a.pdf` and opens it in front, guarded to the transport | setup | `reader: true`, no `loadError` |
| `cancel-02-open-fixture-b.js` | Imports `fixture-b.pdf` and opens it in the background | setup | The same for B |
| `cancel-03-open-players-and-pause.js` | Opens both players and parks both paused on `followup95-a` at segment 0 | setup | `fixtureWindowsDistinct: true`; four `standard` voices and `segmentGranularity: sentence` in each; both paused |
| `cancel-04-independent-playing-guard.js` | Replaces each fixture's status callback so Zotero's one-playing-reader rule cannot pause the other, then plays both | setup | `bothActivePlaying: true` and `status: READY` (beta3-followup read `NOT TESTABLE` because its audio stayed suspended, which the next script does not need) |
| `cancel-05-cancellation-actions.js` | For each action: fixture A plays, `followup95-b` is delayed 600 ms, `diagnostics.voiceSwitch(1, index)` starts a switch, and 180 ms later `setSpeed`, `skipAhead('sentence')`, `selectVoice(followup95-c)` or `deactivate` with the player closed | 6 | Every action `status: PASS`: `pending: followup95-b`, then at once `stage: cancelled, pending: null`, and no further target request 700 ms later; skip moves to position 1; the manual pick selects `followup95-c`; deactivate leaves `active: false, popupOpen: false` |
| `cancel-06-cleanup-and-restore.js` | Pauses and closes both players, waits for delayed replies, restores remote slots, status callbacks and instance methods, closes and erases both fixtures, restores prefs with the WebDAV switches last | 8, cleanup | Per fixture `restoredSlots`, `restoredCallbacks`, `restoredMethod` and `erased` `true`; `errors: []`; prefs as in the baseline; `fixtureReadersRemaining: 0`, `fixtureItemsRemaining: 0`; rows and queue as in the baseline |

### kokoro: real Kokoro word handoff, next and previous

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `kokoro-00-baseline-snapshot.js` | Snapshots the same 15 plugin prefs, `local.engine`, `local.baseURL`, `local.voice`, `local.headers` and the voice map into `Zotero.__ztts95Kokoro`, with readers, selected tab and position store | setup | `stored: true`; `engine: kokoro`, headers as a length only; readers listed by title |
| `kokoro-01-disable-sync-and-mute.js` | Turns sync and `sameForAllDocuments` off, sets volume 0, turns the debug store on | setup | Those values |
| `kokoro-02-open-fixture.js` | Imports `fixture-a.pdf`, opens it in the background, opens the player on the remembered voice and pauses | setup | `status: PASS`; `segmentGranularity: sentence`; `localVoices` lists the Kokoro voices of the menu (beta6: 30) |
| `kokoro-03-word-handoff-next.js` | Repositions to the longest segment, starts with a trusted Shift+Space, waits for a running clock, presses a trusted Shift+. toward the next menu voice; instruments the target controller, the old source's stop and the prepared plays | 3 | `status: PASS`: `wordDecision: shared-word-boundary`, `stage: committed`, `last.kind: word` in the same segment; target audio ready while the old segment still plays (beta6: 313 ms, segment 7, 24/24 timings); one numeric stop; prepared play at `last.offset` (beta6: 1.000375, charStart 20); `oneTargetSegmentRequest`, `noSample`, `sourcePositionRetained` and `sharedSegments` `true`; `patchErrors: []` |
| `kokoro-04-word-handoff-previous.js` | The same with a trusted Shift+, back to the previous voice | 3 | `status: PASS` with the same identity fields (beta6: ready at 148 ms, stop 0.372, offset 0.6205, charStart 14) |
| `kokoro-05-cleanup-and-restore.js` | Closes and erases the fixture, restores prefs with the WebDAV switches last, selects the original tab | 8, cleanup | `fixtureReadersRemaining: 0`, `fixtureItemsRemaining: 0`; prefs and user-value flags as in the baseline (headers, memory and voice map `equalToBaseline: true`); original tab selected; the owner's reader unchanged; rows and queue as in the baseline |

### alignment: real Kokoro timestamps for a numeric phrase

Its setup and cleanup scripts are byte-identical to the kokoro group's;
they are kept apart because they come from another run (beta5).

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `alignment-00-baseline-snapshot.js` | Same script as `kokoro-00` | setup | As `kokoro-00` |
| `alignment-01-disable-sync-and-mute.js` | Same script as `kokoro-01` | setup | As `kokoro-01` |
| `alignment-02-open-fixture.js` | Same script as `kokoro-02` | setup | As `kokoro-02` (beta5: 30 Kokoro voices) |
| `alignment-03-numeric-phrase-timestamps.js` | Sends `We scanned 3 by 3 mm today.` through the fixture's remote interface for `local::af_bella` and `local::af_jadzia`, without playing it | 3 | For each voice, audio bytes above 0 and 7 rows whose `sourceSlice`s are `We`, `scanned`, `3`, `by`, `3`, `mm`, `today`; no `error`. A small negative first `start` is the provider's data, which the matcher accepts since beta6 |
| `alignment-04-cleanup-and-restore.js` | Same script as `kokoro-05` | 8, cleanup | As `kokoro-05` |

### regional: regional pools with generic and wildcard fallbacks (#97)

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `regional-00-baseline-snapshot.js` | Like `native-01`, plus the selected tab, into `Zotero.__ztts97Baseline` | setup | Redacted summary with `selectedTabId` |
| `regional-01-disable-sync-and-mute.js` | Turns the three WebDAV switches off, sets volume 0, turns the debug store on | setup | The switches `false`, `volume: 0` |
| `regional-02-import-fixture.js` | Imports `fixture-a.pdf` into `Zotero.__ztts97Fixture` | setup | A new `itemID`, no `error` |
| `regional-03-open-fixture.js` | Opens the fixture and waits for its manager | setup | `called: true`; manager present |
| `regional-04-install-regional-transport.js` | Closes the fixture and patches the reader prototype with a silent transport: `regional97-a` and `-c` (`en-US`), `-b` (`en`), `-wild` (`*`), `-gb` (`en-GB`); reopens, injects and reloads voices | setup | `patchHeld`, `remoteInjected` and `readerReady` `true`; five voices loaded |
| `regional-05-seed-voice-and-pause.js` | Sets a temporary memory on `regional97-a` at speed 1.25, opens the player, pauses | setup | `active: true`, `paused: true`, `selectedVoice: regional97-a`, `language: en`; `allVoices: 5`, `voicesForLanguage: 4`; menu A, C, B, wildcard, with `en-GB` outside; at most four silent setup requests |
| `regional-06-regional-keys-paused.js` | Trusted Shift+. and Shift+, from `regional97-a`; a temporary menu of A with the generic and wildcard voices; generic B with a stale requested region `US`; restores menu, region and voice | 2 | `sequence` `[regional97-c, regional97-a, regional97-c, regional97-a]`, keys `[0,1,true,true]`; the singleton stays on `regional97-a`; generic B moves to `regional97-wild`; `pausedThroughout: true`; `speedPreserved: true`; `callsDuring` with 0 requests, 0 samples, 0 segments |
| `regional-07-mechanism-diagnostic.js` | Reads `diagnostics.voiceSwitch(undefined, index)` | 1 | `mechanism: prepared-native-voice-v1`; bindings `Shift+,` and `Shift+.`; fixture `handoff` null while paused |
| `regional-08-cleanup-and-restore.js` | Restores the fixture's remote slots, closes and erases it, restores the prototype method, prefs and debug store, selects the original tab, deletes the globals | 8, cleanup | Fixture readers and items 0; `patchRestored: true`; prefs and user-value flags as in the baseline; `selectedTab.restored: true`; rows and queue as in the baseline, `lastError: null` |

### providers: handoffs within and across configured providers

Per case: one `providers-08` spec, then `providers-09`, `providers-10`
until the handoff is terminal, and `providers-11`. The English-pool specs
use the fixture as opened; the MiMo and Fish Speech specs need
`providers-07` first; the Chatterbox specs need the chatterbox-fish mode
(`providers-03`, `providers-04`, `providers-05`) and then `providers-07`.
Between modes or languages, close the fixture with `providers-12` and
continue from `providers-03`.

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `providers-00-baseline-redacted.js` | Snapshots every provider, general and sync pref with the voice map, readers, tab and position store into `Zotero.__zttsAllHandoff` | setup | `stored: true`; keys, headers, presets and memory only as `set` and `chars` |
| `providers-01-config-summary.js` | Read-only, redacted summary of the provider settings and saved presets | setup | Which providers are filled in (2026-09-13: all but Cloudflare) |
| `providers-02-disable-sync-and-mute.js` | Turns sync and `sameForAllDocuments` off, sets volume 0, turns the debug store on | setup | Those values |
| `providers-03-mode-all-configured.js` | Chooses the mode that enables every configured provider | setup | `{"mode":"all-configured"}` |
| `providers-03-mode-chatterbox-fish.js` | Chooses the mode that enables Fish and the saved Chatterbox preset | setup | `{"mode":"chatterbox-fish"}` |
| `providers-04-apply-config.js` | Resets provider prefs from the baseline and enables the mode's providers (the Chatterbox mode copies its preset into the OpenAI fields), keeping sync off and volume 0 | setup | `enabled` flags match the mode; key and headers only as `set` and `chars` |
| `providers-05-open-fixture.js` | Imports and opens `fixture-a.pdf`, opens the player, pauses, counts voices per provider | setup | `status: PASS` (2026-09-13, all configured: 2114 voices) |
| `providers-06-inspect-menu.js` | Read-only counts and samples of the current-language menu | setup | The pool's providers (2026-09-13 English menu: 222 rows) |
| `providers-07-set-language-mul.js` | Sets the fixture to Multiple languages without persisting it | setup | `status: PASS`, `lang: mul`; Fish Speech and OpenAI-compatible rows in the menu (72 all configured, 30 in the chatterbox-fish mode) |
| `providers-08-spec-fish-same.js` | Fish cloud, within-source, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-azure-same.js` | Azure, within-source, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-speechify-same.js` | Speechify, within-source, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-kokoro-same.js` | Kokoro, within-source, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-system-same.js` | Windows System, within-source, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-azure-to-fish-next.js` | Azure to Fish, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-fish-to-azure-previous.js` | Fish to Azure, previous | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-fish-to-kokoro-next.js` | Fish to Kokoro, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-kokoro-to-fish-previous.js` | Kokoro to Fish, previous | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-kokoro-to-speechify-next.js` | Kokoro to Speechify, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-speechify-to-kokoro-previous.js` | Speechify to Kokoro, previous | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-speechify-to-system-next.js` | Speechify to Windows System, next | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-system-to-speechify-previous.js` | Windows System to Speechify, previous | 3 | Word handoff, `shared-word-boundary` |
| `providers-08-spec-mimo-same.js` | MiMo, within-source, next; after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-fishspeech-same.js` | Fish Speech, within-source, next; after `providers-07` | 4 | Sentence fallback (2026-09-13: `audio-not-ready-for-current-segment`) |
| `providers-08-spec-fish-to-fishspeech-next.js` | Fish to Fish Speech, next; after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-fishspeech-to-fish-previous.js` | Fish Speech to Fish, previous; after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-fishspeech-to-mimo-next.js` | Fish Speech to MiMo, next; after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-mimo-to-fishspeech-previous.js` | MiMo to Fish Speech, previous; after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-chatterbox-same.js` | Chatterbox, within-source, next; chatterbox-fish mode, after `providers-07` | 4 | Sentence fallback (2026-09-13: `old-source-not-playing`) |
| `providers-08-spec-fish-to-chatterbox-next.js` | Fish to Chatterbox, next; chatterbox-fish mode, after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-08-spec-chatterbox-to-fish-previous.js` | Chatterbox to Fish, previous; chatterbox-fish mode, after `providers-07` | 4 | Sentence fallback, `no-remaining-word-boundary` |
| `providers-09-start-handoff.js` | Finds the spec's adjacent pair in the regional pool, selects the source, repositions to the longest segment, starts with a trusted Shift+Space, waits up to 6.3 s for a running clock, instruments controllers, the old source's stop and prepared plays, then presses a trusted Shift+. or Shift+, | 3, 4 | `status: STARTED` with the spec's `source` and `expectedTarget`, `patchErrors: []`; `NOT TESTABLE` when the pair is not adjacent or the clock never runs |
| `providers-10-poll-handoff.js` | Polls the diagnostic for one bounded window; repeat until terminal | 3, 4 | `COMPLETED` (stage `committed`) |
| `providers-11-capture-handoff.js` | Stores the result, pauses the fixture, removes the instrumentation | 3, 4 | `PASS_OR_FALLBACK`; `actualTarget` equals `expectedTarget`; `last.kind: word` when both voices have word timings and the target is ready in the current segment, otherwise a sentence fallback explained by `wordDecision`; prepared play at the diagnostic's segment and offset; `patchErrors: []` |
| `providers-12-close-fixture.js` | Closes and erases the fixture, clears the fixture and run state | cleanup | `readerClosed: true`, `itemErased: true` |
| `providers-13-cleanup-restore.js` | Closes any fixture, restores prefs with the WebDAV switches last, the debug store and the tab, writes `cleanup.json` and finalizes `evidence.json` and `report.md` under `root`, deletes the global | 8, cleanup | `restored` as in the baseline (secrets `equalToBaseline: true`), the owner's reader unchanged, `selectedTabRestored: true`, rows and queue as in the baseline, `runtimeSnapshotPresent: false`; `errors` empty apart from `artifact finalization` when `root` holds no evidence from this run |

### official: same-tier handoffs on Standard and Premium

Run `official-04`, `official-05`, `official-06` until terminal and
`official-07` once per tier. `official-03` and `official-09` run twice:
reopen after `official-10`, close again after `official-11`. Restore the
override with `official-12` only after the second close, so that the
Kokoro-enabled fixture also opens on Zotero's own Standard and Premium
voices.

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `official-00-baseline-redacted.js` | Snapshots the prefs `providers-00` covers, plus any own `_getReadAloudRemoteInterface` on the first reader's prototype, into `Zotero.__zttsOfficialFollowup` | setup | `stored: true`; `nativeStub` `true` or `false`; secrets only as `set` and `chars` |
| `official-01-mute-and-disable-providers.js` | Disables every plugin provider, sync and `sameForAllDocuments`; sets volume 0; turns the debug store on | setup | Every provider `enabled` false; switches `false`; `volume: 0` |
| `official-02-remove-native-test-stub.js` | Removes that prototype override while fixtures are open, so they get Zotero's own Standard and Premium catalogs | setup | `removed: true` with `previousSource`, or `removed: false` with `reason: no ReaderTab own native test stub` |
| `official-03-open-fixture.js` | Imports and opens `fixture-a.pdf`, opens the player, pauses, counts voices per tier | setup | `status: PASS` (2026-09-13: standard 28, premium 1452) |
| `official-04-spec-standard.js` | Selects Standard, takes the first two voices of the current-language pool, selects the first, repositions to the longest segment, pauses | setup | `status: PASS`, `selectedTier: standard`, `poolCount` at least 2 |
| `official-04-spec-premium.js` | The same for Premium | setup | `status: PASS`, `selectedTier: premium` |
| `official-05-start-handoff.js` | Starts with a trusted Shift+Space, waits up to 6.3 s for a running clock, instruments the target controller, audio requests, the old source's stop and prepared plays, presses a trusted Shift+. | 3 | `status: STARTED`, `patchErrors: []` |
| `official-06-poll-handoff.js` | Polls for one bounded window; repeat until terminal | 3 | `COMPLETED` |
| `official-07-capture-handoff.js` | Stores the result, pauses, removes the instrumentation | 3 | `PASS_WORD`: `shared-word-boundary`, `last.kind: word` in the current segment, 27/27 timings, `patchErrors: []` (2026-09-13: Standard ready at 2392 ms, charStart 97; Premium at 3168 ms, charStart 122) |
| `official-08-tier-menus.js` | On the paused fixture, selects Standard and then Premium and reads each menu | 2 | `status: PASS`; each menu holds only its own tier, `foreignTierRows: 0` (6 and 13 voices); each manual tier change rebuilds the controller at the same position, which is not a #95 handoff |
| `official-09-close-fixture.js` | Closes and erases the fixture | cleanup | `status: PASS`, `readerClosed: true`, `itemErased: true` |
| `official-10-enable-kokoro.js` | Enables the Kokoro provider, keeping sync off and volume 0; then reopen with `official-03` | setup | `local.enabled: true`, `endpointConfigured: true`, `volume: 0` |
| `official-11-tier-menus-with-kokoro.js` | Selects Local, Standard and Premium in turn and reads each menu; then close with `official-09` | 2 | `status: PASS`; local 30, standard 6, premium 13 (2026-09-13), `foreignTierRows: 0` in each; every change rebuilds the controller at the same position |
| `official-12-restore-native-test-stub.js` | Puts the override removed by `official-02` back as found | cleanup | `restored: true`, or `restored: false` with `reason: no pre-existing ReaderTab native test stub` |
| `official-13-cleanup-restore.js` | Restores prefs with the WebDAV switches last, the debug store and the tab, counts plugin and dead-object lines in the debug output, writes `cleanup.json`, `evidence.json` and `report.md` under `root`, deletes the global | 8, cleanup | `restored` as in the baseline; `selectedTabRestored: true`; rows and queue as in the baseline; `deadObjectLines: 0`; `nativeStubRestored: true` and `status: PASS`. Without an override at `official-00`, `nativeStubRestored` is false and `status` reads `FAIL` by construction: judge the other fields |

## Cleanup

- **One group at a time.** Every group ends with its own cleanup script,
  and every cleanup restores the plugin volume before the WebDAV switches.
  Never start another group before that cleanup has completed or Zotero
  has been restarted: kokoro and alignment share one global, and native
  and regional patch the same reader prototype.
- **native** (`native-16`) and **regional** (`regional-08`) close and
  erase the fixture, put back the `_getReadAloudRemoteInterface` they found
  on the reader prototype, then restore prefs in snapshot order: volume
  first, then the WebDAV switches, the voice map, and memory last. Unlike
  the later groups they re-enable the switches before the voice map and
  memory, so an automatic settings upload can follow (beta3 recorded one).
  They restore the method as an own property of the prototype, which
  `official-00` then reports as `nativeStub: true`.
- **cancel** (`cancel-06`) pauses both players, waits for delayed replies,
  restores each fixture's remote slots, status callbacks and instance
  method, closes and erases both fixtures, restores memory and the voice
  map, then the other prefs including volume, and the WebDAV switches
  last.
- **kokoro** (`kokoro-05`) and **alignment** (`alignment-04`) close and
  erase the fixture, restore the other prefs including volume, then the
  voice map and memory, then the WebDAV switches, and select the original
  tab. They leave `Zotero.__ztts95Kokoro` in the process, raw Kokoro
  headers included: once the output checks out, run
  `delete Zotero.__ztts95Kokoro`.
- **providers** closes each fixture with `providers-12`; `providers-13`
  restores prefs in the kokoro order, then the debug store and the tab,
  and deletes its global.
- **official** closes the fixture with `official-09`, puts the prototype
  override back exactly as found with `official-12`, and ends with
  `official-13`, which restores prefs in the kokoro order, the debug store
  and the tab, and deletes its global.
- **End state.** Every snapshotted value and user-value flag equals the
  baseline (memory, voice maps, keys and headers compared by equality and
  length only), and so do the debug store, the selected tab where the
  group records it, the owner's reader (active, paused, voice, position),
  the position rows with an empty queue and the verified XPI hash. No
  fixture reader or item, injected method, status callback, prototype
  patch or runtime global is left, apart from the one noted above. Read
  `zotero_read_errors` last and report plugin entries apart from fixture
  teardown and Zotero noise.

## Limits

- **Heard audio.** Every group runs at plugin volume 0, and native, cancel
  and regional play silent WAVs. The scripts prove controller adoption,
  scheduled source stops, offsets and request counts, not that speech was
  heard; pronunciation, the perceptual gap at the handoff and whether the
  highlight keeps pace need a human.
- **Timing accuracy.** Boundaries come from each provider's timestamps (the
  controlled transports spread them evenly over silence), and nothing here
  grades their accuracy. Cross-source provider cases reuse cached audio,
  so their readiness times are not cold-request latency, and the pairs are
  a sample, not every combination.
- **Granularity.** The native transport uses `segmentGranularity: word`;
  its handoff proves the native source and controller behavior, not the
  visible word highlight at production sentence granularity.
- **Suspended audio.** A context left `suspended` at `currentTime` 0 makes
  every playback check NOT TESTABLE; the mechanism checks still run. In
  beta3-followup fresh contexts stayed suspended even inside a trusted key
  handler, so its word handoff with the PDF highlight, the shared voice and
  the armed stop's return went unobserved. The provider and official
  starts report NOT TESTABLE after 6.3 s without a running clock; an
  earlier 2.7 s window timed out for Speechify and Fish Speech before the
  retries passed.
- **Not covered live.** The runs left these NOT TESTABLE or to unit tests,
  and no script here checks them: a one-voice list (the live reader
  rejected a replaced voice array), favorites-only filtering (the native
  transport bypasses the plugin's filter), cancellation after the word
  stop is armed, cancellation by tab close and shutdown, and item 7, the
  shared voice across two playing tabs.
- **Test-only states.** The cancel group's status guard keeps two fixtures
  playing at once, which Zotero itself prevents (`reader.js:2164-2189`
  pauses the other readers); do not count it as an ordinary Zotero state.
  The official group's manual tier changes rebuild the native controller:
  they check the menus, not a #95 handoff.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-13-1.12.5-beta2 | None: an install record with a clean startup diagnostic; behavior not run, superseded by beta3 | [report](../../runs/2026-09-13-1.12.5-beta2/report.md); no scripts |
| 2026-09-13-1.12.5-beta3 | 1–6 and 8 PASS on a controlled native transport; 7 NOT TESTABLE (exploratory shared-voice attempts); the one-voice list, favorites-only filtering and armed-stop cancellation NOT TESTABLE | [report](../../runs/2026-09-13-1.12.5-beta3/report.md) · [scripts](../../runs/2026-09-13-1.12.5-beta3/scripts/) |
| 2026-09-13-1.12.5-beta3-followup | 6 PASS (speed, skip, manual voice pick, deactivate) and 8 PASS; the word handoff with the PDF highlight (3), shared voice (7) and the armed stop's return (6) NOT TESTABLE because fresh audio contexts stayed suspended | [report](../../runs/2026-09-13-1.12.5-beta3-followup/report.md) · [scripts](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/) |
| 2026-09-13-1.12.5-beta5 | 3 FAIL with real Kokoro (a negative leading timestamp forced a sentence fallback); numeric-phrase alignment PASS; 8 PASS; the reverse probe NOT TESTABLE (exploratory instrumentation) | [report](../../runs/2026-09-13-1.12.5-beta5/report.md) · [scripts](../../runs/2026-09-13-1.12.5-beta5/scripts/) |
| 2026-09-13-1.12.5-beta6 | 3 PASS in both directions with real Kokoro; 8 PASS | [report](../../runs/2026-09-13-1.12.5-beta6/report.md) · [scripts](../../runs/2026-09-13-1.12.5-beta6/scripts/) |
| 2026-09-13-1.12.6-beta | 1 and 2 PASS for #97 on a paused controlled transport; 8 PASS | [report](../../runs/2026-09-13-1.12.6-beta/report.md) · [scripts](../../runs/2026-09-13-1.12.6-beta/scripts/) |
| 2026-09-13-1.12.6-beta-all-providers | 3 (word) and 4 (sentence fallback) PASS in 8 within-source cases and 7 cross-source pairs both ways; 8 PASS; three first attempts NOT TESTABLE and then passed (a 2.7 s start window for Speechify and Fish Speech, the MiMo spec sent before the fixture); its manual Standard and Premium probe is outside #95 | [report](../../runs/2026-09-13-1.12.6-beta-all-providers/report.md) · [scripts](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/) |
| 2026-09-13-1.12.6-beta-all-providers/official-followup | 3 PASS (Standard and Premium same-tier word handoffs); 2 PASS (each tier menu holds only its own tier, with and without Kokoro); 8 PASS | [report](../../runs/2026-09-13-1.12.6-beta-all-providers/official-followup/report.md) · [scripts](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/) |

## Where each script comes from

| Script | Executed as | Run |
| --- | --- | --- |
| `native-00-startup-diagnostic.js` | [00-startup.js](../../runs/2026-09-13-1.12.5-beta3/scripts/00-startup.js) | 2026-09-13-1.12.5-beta3 |
| `native-01-baseline-snapshot.js` | [01-baseline-snapshot.js](../../runs/2026-09-13-1.12.5-beta3/scripts/01-baseline-snapshot.js) | 2026-09-13-1.12.5-beta3 |
| `native-02-disable-sync-and-mute.js` | [02-disable-sync-and-mute.js](../../runs/2026-09-13-1.12.5-beta3/scripts/02-disable-sync-and-mute.js) | 2026-09-13-1.12.5-beta3 |
| `native-03-import-fixture.js` | [03-fixture-import.js](../../runs/2026-09-13-1.12.5-beta3/scripts/03-fixture-import.js) | 2026-09-13-1.12.5-beta3 |
| `native-04-open-fixture.js` | [04-fixture-open-and-readiness.js](../../runs/2026-09-13-1.12.5-beta3/scripts/04-fixture-open-and-readiness.js) | 2026-09-13-1.12.5-beta3 |
| `native-05-install-native-transport.js` | [05-native-transport-stub.js](../../runs/2026-09-13-1.12.5-beta3/scripts/05-native-transport-stub.js) | 2026-09-13-1.12.5-beta3 |
| `native-06-seed-voice-and-pause.js` | [06-seed-fixture-voice-and-pause.js](../../runs/2026-09-13-1.12.5-beta3/scripts/06-seed-fixture-voice-and-pause.js) | 2026-09-13-1.12.5-beta3 |
| `native-07-trusted-start-audio-clock.js` | [07-trusted-start-and-audio-clock.js](../../runs/2026-09-13-1.12.5-beta3/scripts/07-trusted-start-and-audio-clock.js) | 2026-09-13-1.12.5-beta3 |
| `native-08-word-handoff.js` | [08-word-handoff-native.js](../../runs/2026-09-13-1.12.5-beta3/scripts/08-word-handoff-native.js) | 2026-09-13-1.12.5-beta3 |
| `native-09-source-position-probe.js` | [08b-source-position-probe.js](../../runs/2026-09-13-1.12.5-beta3/scripts/08b-source-position-probe.js) | 2026-09-13-1.12.5-beta3 |
| `native-10-menu-and-trusted-keys.js` | [09-list-and-trusted-keys.js](../../runs/2026-09-13-1.12.5-beta3/scripts/09-list-and-trusted-keys.js) | 2026-09-13-1.12.5-beta3 |
| `native-11-sentence-fallback.js` | [10-sentence-fallback-native.js](../../runs/2026-09-13-1.12.5-beta3/scripts/10-sentence-fallback-native.js) | 2026-09-13-1.12.5-beta3 |
| `native-12-rapid-and-return-cancel.js` | [11-rapid-and-return-cancel.js](../../runs/2026-09-13-1.12.5-beta3/scripts/11-rapid-and-return-cancel.js) | 2026-09-13-1.12.5-beta3 |
| `native-13-pause-and-failure.js` | [12-pause-and-failure.js](../../runs/2026-09-13-1.12.5-beta3/scripts/12-pause-and-failure.js) | 2026-09-13-1.12.5-beta3 |
| `native-14-regional-menu-probe.js` | [14-regional-menu-probe.js](../../runs/2026-09-13-1.12.5-beta3/scripts/14-regional-menu-probe.js) | 2026-09-13-1.12.5-beta3 |
| `native-15-preparation-overtaken.js` | [22-preparation-overtaken.js](../../runs/2026-09-13-1.12.5-beta3/scripts/22-preparation-overtaken.js) | 2026-09-13-1.12.5-beta3 |
| `native-16-cleanup-and-restore.js` | [99-cleanup-and-restore.js](../../runs/2026-09-13-1.12.5-beta3/scripts/99-cleanup-and-restore.js) | 2026-09-13-1.12.5-beta3 |
| `cancel-00-setup-and-helpers.js` | [00-setup-and-helpers.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/00-setup-and-helpers.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-01-open-fixture-a.js` | [01-open-fixture-a.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/01-open-fixture-a.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-02-open-fixture-b.js` | [02-open-fixture-b.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/02-open-fixture-b.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-03-open-players-and-pause.js` | [03-open-popups-and-prepare.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/03-open-popups-and-prepare.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-04-independent-playing-guard.js` | [05-enable-independent-playing.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/05-enable-independent-playing.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-05-cancellation-actions.js` | [07-cancellation-actions.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/07-cancellation-actions.js) | 2026-09-13-1.12.5-beta3-followup |
| `cancel-06-cleanup-and-restore.js` | [08-cleanup-and-restore.js](../../runs/2026-09-13-1.12.5-beta3-followup/scripts/08-cleanup-and-restore.js) | 2026-09-13-1.12.5-beta3-followup |
| `kokoro-00-baseline-snapshot.js` | [00-baseline-snapshot.js](../../runs/2026-09-13-1.12.5-beta6/scripts/00-baseline-snapshot.js) | 2026-09-13-1.12.5-beta6 |
| `kokoro-01-disable-sync-and-mute.js` | [01-disable-sync-and-mute.js](../../runs/2026-09-13-1.12.5-beta6/scripts/01-disable-sync-and-mute.js) | 2026-09-13-1.12.5-beta6 |
| `kokoro-02-open-fixture.js` | [02-fixture-a-open.js](../../runs/2026-09-13-1.12.5-beta6/scripts/02-fixture-a-open.js) | 2026-09-13-1.12.5-beta6 |
| `kokoro-03-word-handoff-next.js` | [04-real-kokoro-word-handoff.js](../../runs/2026-09-13-1.12.5-beta6/scripts/04-real-kokoro-word-handoff.js) | 2026-09-13-1.12.5-beta6 |
| `kokoro-04-word-handoff-previous.js` | [05-real-kokoro-warmed-reverse.js](../../runs/2026-09-13-1.12.5-beta6/scripts/05-real-kokoro-warmed-reverse.js) | 2026-09-13-1.12.5-beta6 |
| `kokoro-05-cleanup-and-restore.js` | [99-cleanup-and-restore.js](../../runs/2026-09-13-1.12.5-beta6/scripts/99-cleanup-and-restore.js) | 2026-09-13-1.12.5-beta6 |
| `alignment-00-baseline-snapshot.js` | [00-baseline-snapshot.js](../../runs/2026-09-13-1.12.5-beta5/scripts/00-baseline-snapshot.js) | 2026-09-13-1.12.5-beta5 |
| `alignment-01-disable-sync-and-mute.js` | [01-disable-sync-and-mute.js](../../runs/2026-09-13-1.12.5-beta5/scripts/01-disable-sync-and-mute.js) | 2026-09-13-1.12.5-beta5 |
| `alignment-02-open-fixture.js` | [02-fixture-a-open.js](../../runs/2026-09-13-1.12.5-beta5/scripts/02-fixture-a-open.js) | 2026-09-13-1.12.5-beta5 |
| `alignment-03-numeric-phrase-timestamps.js` | [06-real-kokoro-numeric-alignment.js](../../runs/2026-09-13-1.12.5-beta5/scripts/06-real-kokoro-numeric-alignment.js) | 2026-09-13-1.12.5-beta5 |
| `alignment-04-cleanup-and-restore.js` | [99-cleanup-and-restore.js](../../runs/2026-09-13-1.12.5-beta5/scripts/99-cleanup-and-restore.js) | 2026-09-13-1.12.5-beta5 |
| `regional-00-baseline-snapshot.js` | [00-baseline-snapshot.js](../../runs/2026-09-13-1.12.6-beta/scripts/00-baseline-snapshot.js) | 2026-09-13-1.12.6-beta |
| `regional-01-disable-sync-and-mute.js` | [01-disable-sync-and-mute.js](../../runs/2026-09-13-1.12.6-beta/scripts/01-disable-sync-and-mute.js) | 2026-09-13-1.12.6-beta |
| `regional-02-import-fixture.js` | [02-fixture-import.js](../../runs/2026-09-13-1.12.6-beta/scripts/02-fixture-import.js) | 2026-09-13-1.12.6-beta |
| `regional-03-open-fixture.js` | [03-open-and-readiness.js](../../runs/2026-09-13-1.12.6-beta/scripts/03-open-and-readiness.js) | 2026-09-13-1.12.6-beta |
| `regional-04-install-regional-transport.js` | [04-native-transport-regional.js](../../runs/2026-09-13-1.12.6-beta/scripts/04-native-transport-regional.js) | 2026-09-13-1.12.6-beta |
| `regional-05-seed-voice-and-pause.js` | [05-seed-and-pause.js](../../runs/2026-09-13-1.12.6-beta/scripts/05-seed-and-pause.js) | 2026-09-13-1.12.6-beta |
| `regional-06-regional-keys-paused.js` | [06-regional-keys-paused.js](../../runs/2026-09-13-1.12.6-beta/scripts/06-regional-keys-paused.js) | 2026-09-13-1.12.6-beta |
| `regional-07-mechanism-diagnostic.js` | [07-diagnostic.js](../../runs/2026-09-13-1.12.6-beta/scripts/07-diagnostic.js) | 2026-09-13-1.12.6-beta |
| `regional-08-cleanup-and-restore.js` | [99-cleanup-and-restore.js](../../runs/2026-09-13-1.12.6-beta/scripts/99-cleanup-and-restore.js) | 2026-09-13-1.12.6-beta |
| `providers-00-baseline-redacted.js` | [00-baseline-redacted.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/00-baseline-redacted.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-01-config-summary.js` | [01-config-summary.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/01-config-summary.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-02-disable-sync-and-mute.js` | [02-disable-sync-and-mute.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/02-disable-sync-and-mute.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-03-mode-all-configured.js` | [03-mode-all-configured.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/03-mode-all-configured.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-03-mode-chatterbox-fish.js` | [03-mode-chatterbox-fish.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/03-mode-chatterbox-fish.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-04-apply-config.js` | [04-apply-config.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/04-apply-config.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-05-open-fixture.js` | [05-open-fixture.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/05-open-fixture.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-06-inspect-menu.js` | [05-inspect-menu.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/05-inspect-menu.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-07-set-language-mul.js` | [05-set-fixture-language-mul.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/05-set-fixture-language-mul.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fish-same.js` | [07-spec-fish-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-fish-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-azure-same.js` | [07-spec-azure-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-azure-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-speechify-same.js` | [07-spec-speechify-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-speechify-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-kokoro-same.js` | [07-spec-kokoro-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-kokoro-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-system-same.js` | [07-spec-system-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-system-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-azure-to-fish-next.js` | [07-spec-cross-azure-fish-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-azure-fish-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fish-to-azure-previous.js` | [07-spec-cross-fish-azure-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fish-azure-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fish-to-kokoro-next.js` | [07-spec-cross-fish-kokoro-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fish-kokoro-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-kokoro-to-fish-previous.js` | [07-spec-cross-kokoro-fish-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-kokoro-fish-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-kokoro-to-speechify-next.js` | [07-spec-cross-kokoro-speechify-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-kokoro-speechify-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-speechify-to-kokoro-previous.js` | [07-spec-cross-speechify-kokoro-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-speechify-kokoro-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-speechify-to-system-next.js` | [07-spec-cross-speechify-system-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-speechify-system-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-system-to-speechify-previous.js` | [07-spec-cross-system-speechify-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-system-speechify-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-mimo-same.js` | [07-spec-mimo-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-mimo-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fishspeech-same.js` | [07-spec-fishspeech-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-fishspeech-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fish-to-fishspeech-next.js` | [07-spec-cross-fish-fishspeech-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fish-fishspeech-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fishspeech-to-fish-previous.js` | [07-spec-cross-fishspeech-fish-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fishspeech-fish-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fishspeech-to-mimo-next.js` | [07-spec-cross-fishspeech-openai-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fishspeech-openai-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-mimo-to-fishspeech-previous.js` | [07-spec-cross-openai-fishspeech-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-openai-fishspeech-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-chatterbox-same.js` | [07-spec-chatterbox-same.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-chatterbox-same.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-fish-to-chatterbox-next.js` | [07-spec-cross-fish-chatterbox-forward.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-fish-chatterbox-forward.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-08-spec-chatterbox-to-fish-previous.js` | [07-spec-cross-chatterbox-fish-reverse.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/07-spec-cross-chatterbox-fish-reverse.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-09-start-handoff.js` | [08-start-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/08-start-handoff.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-10-poll-handoff.js` | [09-poll-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/09-poll-handoff.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-11-capture-handoff.js` | [10-capture-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/10-capture-handoff.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-12-close-fixture.js` | [11-close-fixture.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/11-close-fixture.js) | 2026-09-13-1.12.6-beta-all-providers |
| `providers-13-cleanup-restore.js` | [99-cleanup-restore.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/99-cleanup-restore.js) | 2026-09-13-1.12.6-beta-all-providers |
| `official-00-baseline-redacted.js` | [00-baseline-redacted.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/00-baseline-redacted.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-01-mute-and-disable-providers.js` | [01-mute-disable-providers.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/01-mute-disable-providers.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-02-remove-native-test-stub.js` | [02-remove-native-test-stub.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/02-remove-native-test-stub.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-03-open-fixture.js` | [03-open-fixture.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/03-open-fixture.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-04-spec-standard.js` | [04-spec-standard.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/04-spec-standard.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-04-spec-premium.js` | [04-spec-premium.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/04-spec-premium.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-05-start-handoff.js` | [05-start-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/05-start-handoff.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-06-poll-handoff.js` | [06-poll-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/06-poll-handoff.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-07-capture-handoff.js` | [07-capture-handoff.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/07-capture-handoff.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-08-tier-menus.js` | [08-cross-tier-entrypoint.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/08-cross-tier-entrypoint.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-09-close-fixture.js` | [09-close-fixture.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/09-close-fixture.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-10-enable-kokoro.js` | [11-enable-kokoro-local.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/11-enable-kokoro-local.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-11-tier-menus-with-kokoro.js` | [12-cross-tier-local.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/12-cross-tier-local.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-12-restore-native-test-stub.js` | [10-restore-native-test-stub.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/10-restore-native-test-stub.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
| `official-13-cleanup-restore.js` | [99-cleanup-restore-executed-rev1.js](../../runs/2026-09-13-1.12.6-beta-all-providers/scripts/official-followup/99-cleanup-restore-executed-rev1.js) | 2026-09-13-1.12.6-beta-all-providers/official-followup |
