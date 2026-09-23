[Checklist index](../README.md) · [Scripts](../scripts/engine/README.md)

## The Engine: every voice on the plugin's own engine (issue #133)

Every voice of the Player — the plugin's providers' and Zotero's Standard
and Premium — plays on the plugin's own engine behind Read Aloud's manager
(ADR 0005, 0006). The first version must behave as before, item for item,
with three deliberate differences (items 22–24). This case is the parity
checklist of the issue's plan; run it with the [baseline](../baseline.md)
and end with item 3.26's teardown ([playback](playback.md)).

**The mechanism.** `Zotero.ZoteroTTS.diagnostics.engine()` →
`{feature: 'engine-v1', pauses, volume, readers: [...]}`, one entry per
reader: `hooks` — `getController`, `activeTimestamp`, `setSegments`,
`repositionTo`, all `true` once a session has started in the tab;
`controller: {ours: true, live: true}` while a session is open (null with
the player closed); `session` — `voice`, `position`, `currentIndex`,
`paused`, `speed`, `buffering`, `error`, `playing`, `inGap`,
`skipPending`, `ended`, `activeTimestampIndex`, `playbackTime`,
`clipDuration`, `gaps: {count, last: {ms, paragraph, speed, at}}`,
`notices: {waits, shown, starts, failed}`, `handoff`, `store: {requests,
clips, timings, inflight, msPerChar}`; `audio: {state, sampleRate,
latency, gain, contexts}`; `stats: {controllers, carriedOn, started,
ended, adopted, late, fallbacks}`. `stats.fallbacks` is 0 throughout: a
fallback means the Engine failed to build a controller and Read Aloud's
own engine played, with the error in the console. The manager's own state
(`active`, `paused`, `activeSegment`, `activeTimestamp`, `buffering`,
`error`, `speed`) is read beside it. The voice switch keeps
`diagnostics.voiceSwitch()`, now `mechanism: engine-handoff-v1`.

**What only a human can judge**: that the voices sound as before (the
copied stretch and chain are proven bit-identical in the unit tests,
`test/core/engine/`), that the word keeps time with the voice on the
owner's own headphones, and the owner's ordinary reading of the beta —
the release gate after this case.

**Spending.** Items 20–21 play Zotero's Standard and Premium for a few
sentences each on the owner's account and credits, agreed 2026-09-23:
switch both on for the run and restore the switches after. With no
credit left, item 21's out-of-credits path runs instead of the sentences.

### 1

1. **The start point.** Unchanged, Zotero's: the active segment if still
   listed, else the selection, then an explicit target, then the saved
   position near the view, then the first visible block; unpausing with a
   selection starts there (#105, [selection-start](selection-start.md)).
   Check each through the player: `session.position` equals the index of
   `manager.activeSegment` once it plays.

### 2

2. **Sentence to sentence.** A plugin voice reading `fixture-a.pdf`: at
   each boundary the manager's `activeSegment` goes to null, then to the
   next segment just before its audio (`session.currentIndex` follows);
   the finished sentence stays drawn through the gap as before.
   `stats.controllers` stays 1 for a plain reading.

### 3

3. **The pause between sentences.** The pane's two settings, read at every
   boundary (issue #44): at the defaults `gaps.last` is `{ms: 0,
   paragraph: false}` between sentences and `{ms: round(200/speed),
   paragraph: true}` before a paragraph; sentence 1000 and paragraph 400
   at 2× give `ms` 500 and 700 from the next boundary; both switches off
   give the voice's own delay (0 for a plugin voice), plus 200 before a
   paragraph at every speed. A pause inside the gap drops the rest of it:
   `inGap` false at once, and Play starts the next sentence from 0.

### 4

4. **Read-ahead and the provider-observed concurrency.** For a plugin
   voice, never more than three requests at once: Read Aloud's window of
   two plus the plugin's own warm chain of one (`Prefetch` on), and one
   more while a voice is being prepared (item 17). The debug log's
   `prefetch: <provider>: N chars ready ahead of playback` lines go on
   past Read Aloud's three segments; `store.requests` grows by at most
   the segments read plus three.

### 5

5. **Caches.** The plugin's audio cache as before: a second reading of the
   same sentences logs `(cached)` on every `word timestamps` line; the
   cache empties at restart. The Engine's decoded clips: `store.clips` at
   most 32. Zotero's own disk cache for the Zotero voices is untouched
   (item 20).

### 6

6. **Speed.** 0.5×–3.0×: a change mid-sentence re-stretches at the same
   position, a hard cut (`playbackTime` continues from where it was, the
   sentence does not restart); paused, in the gap or while buffering it
   applies at the next start. The slider, the presets and the keys (±0.05,
   reset to 1.0) unchanged ([player-controls](player-controls.md)).

### 7

7. **Volume.** `audio.gain` = the level ÷ 100 on every open session, moved
   at once by the pane and by `Shift+↑` / `Shift+↓` without a new context
   (`audio.contexts` unchanged); the keys act only while a session is
   open; a stored level above 100 never reaches the gain
   ([volume](volume.md)).

### 8

8. **Windows output-device change.** Windows only: pull the output device
   out mid-sentence; within about 0.4 s `audio.contexts` goes up by one and
   the sentence goes on from where it stopped. Not testable on macOS
   (Gecko follows the default device there); say so.

### 9

9. **The word.** With a voice that times words (Fish Audio, Kokoro,
   Speechify, Azure): `activeTimestampIndex` walks the words and
   `manager.activeTimestamp` is the timing the index names — the gate of
   `reader.js` 82230 is passed. A voice without timings, bracket-only,
   empty or refused tiny text: one timing `{start: 0, end: 86400}` over the
   sentence (the stand-in), so Word shows the sentence; text the page does
   not show: no timing at all. Kokoro's rewritten words stay aligned (#86,
   [kokoro-word-alignment](kokoro-word-alignment.md)), bracket offsets
   too ([angle-brackets](angle-brackets.md)). Switching to Word mid-sentence
   lights the current word at once; `Shift+W`'s toast still tells a voice
   without word timing ([word-highlight-key](word-highlight-key.md)).

### 10

10. **Skip.** Sentence ±1 (±5 with accelerate) and the paragraph rules,
    clamped to the document; the audio stops and the highlight and scroll
    jump at once; the skipped unit flashes 2 s when it differs from the
    highlight level; the audio of the target starts about 600 ms after the
    last skip (`skipPending` true meanwhile); while paused only the
    highlight moves and nothing is fetched; the plugin's keys are taken
    before Zotero's.

### 11

11. **Pause and resume.** A hard cut with the lit word kept
    (`activeTimestampIndex` unchanged while paused); resume within 5 s at
    the exact place, after 5 s one word back and after 20 s two, for `en`
    voices only; paused while buffering plays the sentence from its start;
    the EPUB resume guard (the position pull) unchanged
    ([reading-positions](reading-positions.md)).

### 12

12. **Buffering and "Preparing…".** The Player dims Play with
    "Buffering…" while `session.buffering`; "Preparing…" shows after
    300 ms of waiting for audio (`notices.shown` up one), never in the gap,
    and clears when the source starts with the output running
    (`notices.starts` up one); a failure replaces it; the voice switch's
    notice has priority ([playback-notice](playback-notice.md)). After a
    skip it shows from 300 ms until the target plays, as before.

### 13

13. **Errors.** A failed request (a server stopped, a wrong key): the
    highlight lands on the segment, `error` is one of `network`,
    `quota-exceeded`, `unknown` (a provider's 429 is `quota-exceeded`), the
    manager pauses and the Player shows "!" with the message; Play fails
    again at once without a request; Retry asks again. A Zotero voice's
    `daily-limit-exceeded` passes through (item 21).

### 14

14. **Late answers.** A tab closed while its sentences are on their way:
    no `can't access dead object` in the console, `stats.late` counts what
    landed after (read before the close from another tab's diagnostics is
    not possible — read `diagnostics.patches().lateResults` for the reader
    realm's and the debug line `late audio dropped` for the Engine's), and
    the warm chain stops (`prefetch: <provider>: stopped, the reader is
    gone`) ([late-audio](late-audio.md)).

### 15

15. **End of the document.** After the last sentence the manager pauses
    with `activeSegment` null, the session stays open, `position` back
    where that reading began; Play starts there. The saved position keeps
    the last sentence read.

### 16

16. **Annotating while reading.** A highlight made from the Player under
    half-way and under 3 s into a sentence lands on the previous sentence,
    else on the current one.

### 17

17. **The Handoff** (#95, #108), every direction, the Zotero voices
    included: a voice picked while reading shows "Preparing voice: X" and
    the old voice reads on; `voiceSwitch().readers[i].handoff` shows
    `pending`, `stage` (`preparing`, `word` once armed, `sentence` while
    preparing ahead) and `wordDecision`; the new voice takes over at the
    first word both voices time at least 40 ms ahead, else at the next
    sentence (`last.kind` `word` or `sentence`); `stats.carriedOn` up one
    at the switch, `stats.started` unchanged; picks within 120 ms are one
    switch; 60 s per request and 120 s per switch, then "failed" and the
    old voice reads on; a skip, a speed change, a jump or Stop calls it off
    (`stage: cancelled`). Paused: silent preparation, "ready" once the
    paused word is known, and Play starts the new voice at the next word;
    otherwise the old voice resumes and hands over later. A provider or
    language pick while paused applies at once and Play starts the
    sentence over ([voice-switch](voice-switch.md),
    [voice-notice](voice-notice.md)).

### 18

18. **One reading across tabs.** Starting in another tab pauses this one;
    the stop key closes every player, keeps each place and shows its toast
    ([stop-key](stop-key.md)); each closed player's session `ended` true
    and its `audio.state` `closed`.

### 19

19. **The OS media keys** through Zotero's hidden popup: play/pause, next
    and previous paragraph, on the Engine's controller.

### 20

20. **Samples.** Zotero's own popup and dialogs keep Read Aloud's sample
    controller: a sample built the popup's way
    (`voice.getSampleController([{ text }])`) is not the Engine's
    (`engine.owns` false) and plays. The voice browser's samples
    unchanged ([voice-samples](voice-samples.md)).

### 21

21. **Zotero's Standard and Premium, played by the Engine.** With both
    switched on for the run: a few sentences each; `controller.ours` true,
    `session.voice` Zotero's id, the audio fetched through Zotero's own call
    (the debug log shows no plugin provider line for them) and cached by
    Zotero as before; `manager.minutesRemaining` and the Player's credit
    display as before, `refreshCreditsRemaining` asks Zotero for a Zotero
    voice and nothing for a plugin voice; the manager's minute-by-minute
    credit request goes quiet during a plugin-voice session. With no credit
    left: the out-of-credits path (`quota-exceeded` or
    `daily-limit-exceeded`) instead. Restore both switches.

### 22

22. **The word follows the sound** (a departure). With `audio.latency`
    above zero (a Bluetooth output, when there is one), the first word of
    a sentence lights `latency` seconds after its source starts, and a
    stalled output holds the word. By eye: the word no longer leads the
    voice on wireless headphones.

### 23

23. **Five faults gone** (a departure). (a) Pause on a sentence, play on
    into the next, skip back to the paused one: it starts from its
    beginning. (b) A read-ahead that failed once (a server stopped for a
    moment, then back) is asked for again when reading reaches it, and the
    reading goes on. (c) Audio that will not decode (a server answering
    garbage): `error: unknown`, the "!" and a working Retry. (d) A skip,
    then Stop within 600 ms: no request for the skipped-to sentence.
    (e) A session started by a script with no click or key in the reader:
    `audio.state` goes `running` on Play, and it is heard.

### 24

24. **A plugin update pauses the reading** (a departure). An in-place
    install under a playing session: the reading stops at its sentence,
    `stats.adopted` 1 in the new instance, `controller.ours` true,
    `session.paused` true at the same `position`; Play goes on from that
    sentence. Under a paused session the same, without a sound.
