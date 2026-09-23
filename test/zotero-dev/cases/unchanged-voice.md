[Checklist index](../README.md) · [Scripts](../scripts/unchanged-voice/README.md)

## A voice list landing on the playing voice keeps the sentence (issue #75, 1.11.4; the Engine since issue #133)

Item 3.27 of the checklist. It was item 3.19 until 2026-09-10, when the
checklist change for #68 wrote over it, and is back here under a new number.

### 3.27

27. **A voice list landing on the voice already playing keeps the
    sentence** (issue #75, 1.11.4; issue #133). `fixture-a.pdf` as a
    standalone attachment, the memory pointed at `local::af_bella`. A
    tab's **first** open resolves the voice before playback; the case is
    the **second and later** opens, where the still-populated list starts
    playback at once and `loadVoices` lands 1.2–1.6 s later —
    `_resolveVoice`'s keep-branch (reader.js:82428-82432) calls
    `_applyVoice`, which recreates the controller unconditionally
    (reader.js:82523). Until issue #133 a shadow on `_applyVoice` skipped
    that rebuild; since then the manager rebuilds and the Engine carries
    the reading on across it. Check: close the player
    (`toggleReadAloudPopup(false)`), wait a second, start again with a
    trusted `Shift+Space` (`nsITextInputProcessor`, rulebook step 9), and
    sample every 100 ms for 12 s the manager's `active`/`paused` and
    `activeTimestampIndex`, and from `diagnostics.engine()` the tab's
    `session.playbackTime`, `session.currentIndex`, `audio.contexts` and
    `stats`. Expected: `stats.carriedOn` up **one** at the landing,
    `stats.started` unchanged, `audio.contexts` unchanged, `playbackTime`
    monotonic (never back to 0), the word index never replaying and the
    manager's word back within a frame of the rebuild; in the log one
    `engine: controller started`, `hid 9 system voices from the Local
    tier`, then `engine: controller carried-on for local::af_bella`, and
    the first segment's `local: N word timestamps for M chars` line
    **once**. Zotero's own start (`Ctrl+Shift+R`) after another close is
    the same. Contrasts, with
    `zotero-tts.readAloud.sameForAllDocuments` set to `false` for the
    voice change only (memory-sync's `spreadVoice` would otherwise carry
    the pick into every other reading tab, a metered one included):
    `selectVoice('local::am_puck')` while reading goes through the
    Handoff ([voice-switch](voice-switch.md)) and ends in one more
    `carried-on`; `selectTier('local')`, the chip of the current tier,
    carries on too. Rewind with `skipBack('paragraph')` and resume with
    `play()` rather than closing and reopening the popup, or the reopen's
    own carry-on is counted too. Read the counts as increments, never as
    absolutes. Was, on 1.11.4-beta5 (the first attempt at the fix): the
    clock back to 0 about 1.3–1.65 s after the press, the word index
    replaying from 0, the same `word timestamps … (cached)` line twice —
    the guard walked `_allVoices` and `voicesForLanguage` with `find` /
    `some`, whose callback the reader realm silently never honors
    (`undefined` / `false`, while an index loop over the same arrays
    finds the voice). **State**: the memory (byte-identical restore,
    the last write), `extensions.zotero.reader.readAloudVoices` (the
    fixture rewrites its `en` entry — snapshot and rebuild), the fixture
    item (erased in a call of its own). Keep `readAloud.memory` on a
    listed **free** voice throughout: a session on a `d072a0bf-…` id is
    metered. **Budget**: five short Kokoro readings of a 17-segment
    fixture; the fixture ends inside the 12 s window at 1.7×, and the
    session then rewinds to the run's start still active, so a later
    start resumes at segment 15–16.
