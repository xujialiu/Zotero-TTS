---
status: accepted
date: 2026-09-23
issue: 133
---

# Every voice plays on the Engine, behind Read Aloud's manager

*The product argument — what this is for and what it gives up — is
[design 0005](../design/0005-the-plugin-plays-its-own-voices.md).*

For every voice in the Player — the plugin's providers' and the Zotero
voices alike — the audio is fetched, read ahead, decoded, stretched, paused
between sentences, played, skipped and failed by the Engine, the plugin's
own code, instead of by Read Aloud's engine. The Engine sits exactly where
Read Aloud's engine sits today: Read Aloud's manager asks the selected voice
for a controller, and the voice answers with the Engine's. The manager,
and everything Zotero drives from it, stays Zotero's in this step.

This is the next piece taken off Read Aloud under ADR 0003. The Player is
already the plugin's, and so is the intent of the Follow on a PDF (#90).

## The seam

In Zotero 10.0.3's reader bundle (`resource/reader/reader.js`), the manager
builds its engine in one place. `ReadAloudManager._createController`
(82653-82718) calls `this._voice.getController(this._segments,
backwardStopIndex, this._forwardStopIndex)` (82664) — for every voice in the
Player a `RemoteReadAloudVoice`, whose `getController` (40476) returns a new
`RemoteReadAloudController` — and from then on talks only to what came back:

- it listens for seven events: `BufferingChange`, `ActiveSegmentChanging`,
  `ActiveSegmentChange`, `ActiveWordChange`, `Complete`, `Error` and
  `ErrorCleared` (82675-82711);
- it reads `buffering`, `error`, `activeTimestampIndex` and
  `lastSkipGranularity`, writes `speed` and `paused`, and calls `skipBack`,
  `skipAhead`, `retry`, `destroy`, `getTimestampsForSegment`,
  `getSegmentToAnnotate` and `syncActiveWordToPlayback`;
- for credits it reads `minutesRemaining` and `hasStandardMinutesRemaining`
  and calls `refreshCreditsRemaining` and `resetCredits`, which the Engine
  hands to a Zotero voice as Read Aloud's classes do and answers with
  nothing for a plugin voice.

One gate is not part of that contract. The manager's `activeTimestamp`
getter (82229) returns null unless `this._controller instanceof
RemoteReadAloudController` (82230), and the word highlight is drawn from it
through `_computeActiveWordSourcePosition` (83939). A controller that is not
an instance of that class gets the sentence highlight and never the word.
The Engine's controller has to pass that check, or the getter has to be
shadowed — one more hook either way.

Everything else the reader does with reading state goes through the
manager, not the controller. `_onReadAloudEngineStateChanged` (83870) keeps
the native `savedPosition` from `manager.activeSegment` and reports the
status; `_pushReadAloudToViews` (83917) hands every view a snapshot composed
from the manager (83923), which is what the Highlight and the Follow draw
from. Segmentation runs only for an active manager:
`_requestReadAloudSegments` (84048) returns unless `manager.active` (84055),
and then calls `manager.setSegments`. An Engine behind the manager therefore
inherits Segmentation, the Highlight, the Follow and the Position unchanged.

## What goes

Six files exist to bend Read Aloud's engine, 1,521 lines between them, and
they name 42 private members of the engine and its manager: 25 of the
engine's (`_segments` and `_forwardStopIndex` exist on both) and 17 of the
manager's.

- `volume.ts` shadows `_initAudioContext` to put a gain ahead of
  `_filterChainInput`, and wraps `_createController` to reach each new
  controller (#62).
- `pauses.ts` shadows `_scheduleSpeak`, the gap timer, and recomputes the
  one delay it is handed (#44).
- `playback-notice.ts` patches `_speak`, `_scheduleSpeak` and
  `_playAudioBuffer` and reads `_isPlaying`, `_sourceNode`, `_delayTimeout`
  and the audio context's state, to tell when playback waits for audio
  (#119, #120).
- `voice-switch.ts` builds a second controller through the voice's
  `getController`, fills it with `_getAudioData` and moves playback with
  `_playAudioBuffer`, `_speakInternal` and sixteen of the controller's own
  fields — its position, buffers, clock and source node — so a voice change
  takes over at a word boundary instead of restarting the sentence (#95,
  #108).
- `unchanged-voice.ts` shadows the manager's `_applyVoice`, so a voice list
  that lands mid-sentence does not rebuild the controller and restart the
  sentence (#75).
- `upcoming-segments.ts` reads the controller's `_segments` and `_position`,
  so the plugin's own read-ahead warms its audio cache past Read Aloud's
  window of three segments, two fetches at a time (`_prefetchFrom`,
  40258-40260).

Every one of those names is Zotero's to change in any release, and the
feature built on it would stop the day one moved, without an error — the
kind of feature PHILOSOPHY keeps out. All of it goes: the engine's 25 go
with the engine, and of the manager's 17, the ones that exist to keep a
playing controller alive go too (the wrapper on `_createController`, the
shadow on `_applyVoice`). The ones that belong to the Voice catalog's memory
(`_persistedVoices`, `_persistCurrentVoice`, `_pendingSetVoice` and the voice
fields) stay until the Voice catalog moves.

## Why now

Most of the plugin's engine bugs are in that list, each fixed by bending
Read Aloud's engine further:

- **#75.** Reopening the player restarted the first sentence a second in:
  the manager rebuilds the controller when its voice list lands.
- **#42.** A clip that arrived but would not decode stopped the reading
  without a message, and Retry could not restart it: `_fetchAudio` (40351)
  is the only writer of the engine's error state (40360), and a decode
  failure dispatches `Error` with none set (`notes/NOTES_2026-09-01.md`).
- **#44.** The pause between sentences was server data that only a few
  Premium voices carried.
- **#66, #70.** Volume above 100% did nothing and was then capped: the
  engine has no gain stage, and the one the plugin inserted feeds Read
  Aloud's compressor, which halves any boost.
- **#95, #108.** A voice change restarted the current sentence; keeping the
  old voice until the new one is ready takes a second controller built
  behind the manager's back.
- **#119, #120.** "Preparing" had to be inferred from the engine's timers,
  its source node and its audio context.
- **The silent rate limit**, still open in `notes/NOTES.md`: the engine
  knows three error words, `network`, `quota-exceeded` and `unknown`, so a
  provider's 429 can only be called a spent quota, and Zotero's popup shows
  nothing for that one.

With the Engine the plugin's, each of those is ordinary code under its own
tests, and no Zotero update can undo it.

## Scope, settled with the owner

- **The Engine only.** Segmentation, the Highlight, the Follow, the
  Position, the Voice catalog with its per-language memory, and the Player
  stay as they are.
- **Parity first.** The first version sounds and behaves as today: every
  provider, speed, volume, the pause between sentences, skipping, pausing,
  the voice handoff, the notices, errors and Retry. What the Engine makes
  possible — naming the provider and the cause of a failure, read-ahead
  fitted to each provider — comes later, each as a decision of its
  own. ADR 0006 is how the sound itself stays the same.
- **Three deliberate departures** (settled 2026-09-23).
  - *The word comes from the audio clock.* Read Aloud's engine arms one
    wall-clock `setTimeout` per timestamp from `source.start` (40087-40137):
    the word leads the sound by the output latency (about 0.2 s over
    Bluetooth), keeps walking while the output is suspended or stalled, and
    never re-syncs on a long segment. The Engine reads the word off the
    audio clock — the context's time since the source started, mapped back
    to the original audio as ADR 0006 describes, less the output latency.
    The sound is unchanged; the highlight moves into step with it.
  - *Five faults of Read Aloud's engine are fixed, not copied.* The resume
    offset is never reset (`_indexAtPause`, `_pausedAt`; 40147, 40163-40166,
    39318), so a later return to a sentence once paused on starts at a
    stale offset or skips it — the Engine uses a paused offset only for its
    own resume. A failed read-ahead is sticky (40359-40361, 40185-40188) —
    the Engine asks once more when playback reaches the segment. A decode
    failure sets no error (40177-40184), so Retry does nothing and
    `manager.retry()` shows playing with nothing playing (82595-82601) — the
    Engine reports it as `unknown`. The 600 ms skip debounce outlives
    `destroy` (40222 against 40397-40402), so a skip then a close still
    fetches and bills the target — the Engine cancels it. And each
    controller's AudioContext is never resumed (39931-39962), so a session
    started without user activation is mute — the Engine resumes it on Play.
  - *A plugin update pauses the reading.* Read Aloud's controller outlives a
    plugin upgrade today; the Engine goes with the old instance. At shutdown
    it leaves the manager paused at the active segment, and the successor
    builds its controller on the next Play, from that segment.
- **Copied although questionable**, for parity: the stretch runs on the main
  thread over the whole buffer at every play, resume and speed step, and at
  speeds other than 1× its time is part of the gap between sentences — kept,
  because the owner listens at 1.4× and it shapes that rhythm; the end of the
  document rewinds to where the run began (39500); a rate limit still maps to
  `quota-exceeded`; the long-pause rewind still applies only to voices whose
  locale starts with `en` (40206); and a controller rebuilt between sentences
  still restarts the run (82656-82662), which is the manager's and outside
  this step.
- **No switch back.** No setting returns any voice to Read Aloud's
  engine. The patches above are deleted in the same change; the
  way back is the previous release.
- **The release gate.** The tester runs a parity checklist on the beta;
  then the owner listens to the beta through ordinary reading until they
  say it is ready. The Zotero voices, which the owner does not use, are
  played for real by the tester: a few sentences each of Standard and
  Premium, switched on for the run and restored after, on the owner's
  account and credits (agreed 2026-09-23). An account with no credits left
  exercises the quota path instead.
- **Next: the Voice catalog.** Read Aloud's engine plays only voices of Read
  Aloud's own catalog, which is why the plugin's voices ride Zotero's voice
  request today — the request Zotero makes only while signed in (#130,
  worked around in 1.14.1) and the hook a reader tab carries across updates
  (#131, open). Once the Engine plays the plugin's voices, the catalog can
  move into the Player, and the manager needs only enough of a voice to
  keep Segmentation and the Highlight running. Recorded here as the next
  step; its design is not decided.
- **The Zotero voices too** (settled 2026-09-23, reversing the first
  answer, which rested on the 2026-09-15 premise of a separate player
  calling Zotero's API itself). Standard and Premium are fetched through the
  very call Read Aloud's engine makes, `voice.provider.remote.getAudio(
  segment, voice.impl)` (40357). Everything that decides the bill sits below
  that call and stays Zotero's: the `read-aloud` cache keyed by voice, text,
  `cacheVersion` and timestamps (`xpcom/reader.js` 1751, 1838-1841), the
  `noStore` skip (1797-1799), the billed `tts/speak` request
  (`xpcom/sync/syncAPIClient.js` 690-697), its 5xx retry and its error words
  (719-737). What sits above it the Engine keeps as Read Aloud's for these
  voices: 3 segments ahead, 2 fetches at once (40258-40260), 600 ms after a
  skip (39904, 40222), duplicate fetches merged (40329-40335) and up to 32
  decoded clips kept (39901, 40148) — that clip cache is all that stops a
  replayed `noStore` answer from being billed twice — and no plugin
  read-ahead. Samples stay Read Aloud's: `getSampleController` (40479-40481)
  is reached only from Read Aloud's popup (38585-38592) and its first-run
  preview, never from the Player, and Zotero samples are free (`tts/sample`,
  `syncAPIClient.js` 679-686).

## Considered options

- **Keep patching Read Aloud's engine.** Nothing new to build, and every
  feature above keeps working until an update renames one of the 42
  members. Each new wish in this area would be another patch.
- **Replace the whole Read Aloud stack at once**: the Engine, Segmentation
  and the Highlight together. Segmentation cannot be reached without an
  active manager — `buildSDTReadAloudSegments` is private to the bundle,
  which exports only `window.createReader` (85740) — so it would be ported:
  about 870 lines over `sentencex` (7,600 lines) and `eld` (737 lines and
  2 MB of data), per `notes/NOTES_2026-09-15.md`. Far larger, and a
  regression could come from either half with no telling which.
- **The Voice catalog first.** Not possible while Read Aloud's engine plays
  the audio: it plays only the voices of its own catalog.
- **Keep the Zotero voices on Read Aloud's engine.** Five of the six files
  above — volume, pauses, the preparing notice, the voice switch and
  `unchanged-voice.ts` — would have stayed for those voices alone, still
  tied to the private members this record drops; the Player would have had
  two engines behind every control; and a change between a Zotero voice and
  a plugin voice would have crossed engines, which `voice-switch.ts` cannot
  do, so the sentence would have restarted. Stripping those features from
  the Zotero voices instead would have left the volume control doing
  nothing for them.

## Consequences

- The Engine's controller lives in the plugin's sandbox and is driven by a
  manager in the reader's compartment. What the manager touches is created
  in the reader's window or exported into it, results are cloned in, and
  reader arrays are walked by index (`MEMORY/code.md`, Compartments).
- The manager still destroys and rebuilds its controller on a voice or
  language change and whenever `_applyVoice` runs (#75). The Engine has to
  survive a rebuild without restarting the segment; that is what lets
  `unchanged-voice.ts` go. As built, a tab's reading is one session that
  outlives its controllers: a controller asked for with the same voice over
  the same segments carries on, one asked for after `repositionTo`, with
  other segments or another voice starts afresh, as a new controller of
  Read Aloud's would, and a destroyed controller no other follows within the
  task ends the session. The Handoff (#95, #108) takes the reading over
  inside the session first and then replays the pick through the manager's
  own `selectVoice`, whose rebuild carries on.
- The hooks the Engine needs — the voice's `getController` and the
  `instanceof` gate — are verified against Zotero 10.0.3, recorded in
  `notes/NOTES.md` and pinned to Zotero 10 (PHILOSOPHY rule 5). The gate is
  met by shadowing the manager's `activeTimestamp` per tab, the pattern
  `pauses.ts` and `volume.ts` use today, rather than by building the Engine's
  controller on Zotero's class, whose prototype is reachable only from a
  live instance. Two more, found in the building (2026-09-23): the voice's
  prototype is reachable only from a live voice, and on a tab's first open
  nothing of the plugin runs between the voice list landing and the first
  `getController`, so the public `setSegments` is wrapped to patch it in
  time; and a voice list landing between two sentences asks for a
  controller at the run's start exactly as a jump there would (82659-82663),
  so the public `repositionTo` is wrapped to mark a jump. Both are the
  manager's public methods; the private members the Engine still reads are
  `_controller`, `_activeSegment` and `_activeTimestampIndex`, in the
  `activeTimestamp` shadow, and `_backwardStopIndex` once, when a reading
  open under another controller is taken over.
- One AudioContext per reading session rather than per controller, so a
  rebuilt controller keeps its sound; it is closed when the session ends.
- The stand-in timings — one timing over the whole sentence for a voice
  without word timing, and for bracket-only, empty or refused tiny text —
  stay where the plugin's interface makes them: the Engine keeps whatever
  the fetch answers, and the highlight module tells a stand-in by its
  shape, as before.
- Samples left to Read Aloud lose the plugin's volume: `volume.ts` gained
  `RemoteSampleReadAloudController` too, through the base class the two
  shared, so a sample played from Zotero's own player (shown only with
  *Use plugin player* off) now plays at Zotero's level. Accepted with the
  owner on 2026-09-23: #134 removes that switch, and it ships in the same
  release as the Engine (ADR 0007). Zotero's own player has no sample
  button in 10.0.3-beta.3 — it plays one when a voice is picked in it while
  paused (38585-38593) — and with that player never shown, nobody picks
  there.
- The live kit follows: 154 files under `test/zotero-dev/` read Read Aloud's
  controller internals, 44 of them in `scripts/voice-switch/`, and are
  rewritten against the Engine.
- For scale: Read Aloud's engine is about 1,900 lines
  (`notes/NOTES_2026-09-15.md`); the Engine is expected to be of that
  order, less the time-stretch and chain ADR 0006 copies.
- The owner reads with both Zotero voices switched off and Fish Audio as
  the only provider (profile read 2026-09-23), so the owner's listening
  never exercises the Zotero voices; the tester's checklist has to.
- A plugin voice's credit calls do nothing, which ends the `tts/credits`
  poll Read Aloud's manager runs every 60 s while a controller exists and
  the user is signed in (82641-82646). Today it runs through every Fish
  session, because the combined interface passes the call through
  (`remote-interface.ts` 620-630).
- Credit display is untouched. Read Aloud's popup shows the balance, the
  low-balance warning and the purchase link when the Player is off; the
  Player shows none of them, nor the first-run notice, and calls a daily
  limit a connection failure, while the settings pane says credits are
  shown and bought in the player (`zotero-tts.ftl` 103, 106). Found on
  2026-09-23; the owner chose not to open an issue for it then. On
  2026-09-24, with #134, #140 was opened for it, and both strings now say
  credits are bought on zotero.org.
