[Checklist index](../README.md) · [Scripts](../scripts/word-highlight-key/README.md)

## Word highlight on / off (issue #67, 1.11.6)

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key.

Item 4.10 of the checklist, under its original number.

### 4.10

10. **Word highlight on / off** (issue #67, 1.11.6). `Shift+W`
    (`shortcuts.toggleWordHighlight`) writes Zotero's own pref
    `extensions.zotero.reader.readAloud.highlightGranularity` — `word` ↔
    `sentence`, from `paragraph` the first press goes to `word` — and
    Zotero's observer repaints **every** open reader inside the write.
    `diagnostics.highlightKey()` is the mechanism, a trusted press the
    behavior. Two fixtures plus the return-key EPUB (in the library as
    "ZTTS Return-Key EPUB" since 2026-09-08).
    - **The diagnostic.** No press: `{shortcut: "Shift+W", before:
      {pref, readers: [{itemID, state, wordTiming}]}}` — every reader's
      `state` equals its own
      `_internalReader._state.readAloudState.highlightGranularity`, and
      `wordTiming` is one of `real | stand-in | none`. `highlightKey(true)`
      runs the very `toggleWordHighlight` the key runs, on the reader
      `pickReader` would pick: `picked` its itemID, `level` the other
      value, `after.pref` = `level`, **every** reader's
      `after.readers[].state` = `level` in that same call, `toast` the
      toast's text.
    - **PDF, playing** (fixture A on `Azure-en-US-ChristopherNeural`).
      The flip lands inside the write: pref and state at 7–13 ms, and
      `_primaryView._readAloudHighlightedPosition` goes from the
      segment's rects (3 rects, 106–361 pt wide) to one word rect
      (14–20 pt) and back, same `_position`, the word index still
      advancing — no restart, no new `word timestamps` line, the
      controller the same object. `#ztts-speed-toast` in the reader
      iframe's document reads `Highlight: word` / `Highlight: sentence`
      with inline `opacity: 1` at the press and `0` by ~950–1050 ms.
    - **EPUB, playing.** The `ReadAloudActiveSegment` spotlight between
      the whole segment (192 chars, 3 rects, `_getSpotlightColor`
      `#ffff00b3`) and one word (6–7 chars, 1 rect, `#3478f6b3`), same
      `_position`.
    - **Paused, both documents.** The primary flips the same way,
      `paused` stays true, `_position` and the active word index do not
      move: the pause leaves `activeTimestampIndex` alone, so the word
      the pause stopped on is what the flip draws.
    - **No active segment.** After the end of a document the controller
      rewinds and `_activeSegment` is null: the pref and the state flip,
      the last highlight stays where it was, and the next segment draws
      at the new level. Read `_activeSegment` in the same script that
      presses — fixture A ends in 35–60 s at 1.5×, two bridge calls.
    - **Idle reader.** Fixture B's tab selected, no session ever opened:
      the press flips the pref, the toast shows in B's own document, and
      no player opens (`popupOpen` false, `active` false, no
      `.read-aloud-popup`).
    - **Library tab, nothing speaking.** `keydown()` = 0, the pref
      untouched, no toast in the chrome document or in any reader's,
      the item-tree selection and quick search unchanged — the key has
      no reader to act on and is left alone.
    - **Two tabs.** A speaking in the background, B selected and idle:
      the picked reader is the hidden speaking one, both readers'
      `state` follow, and the toast lands in the **main window's**
      document, as the speed keys do.
    - **A voice without word timing** (`azure::en-US-Ethan:MAI-Voice-2`,
      issue #73; its audio is cached). At `word` the toast reads
      `Highlight: word (this voice has no word timing, so the sentence
      stays highlighted)` and stays ~5 s (`opacity` 1 through 4.9 s, 0
      by 5.2 s) against the ordinary toast's ~0.95 s;
      `diagnostics.highlight()` for that view reports `granularity:
      "sentence"`, `activeWordTimestamp: "stand-in"`,
      `state.highlightGranularity: "word"`, and the primary stays the
      whole segment in `#ffff00b3`.
    - **The recorder row.** Edit → Settings → Zotero-TTS: **Word
      highlight on / off** sits between *Player options* and *Stop
      reading everywhere*; `#ztts-key-toggleWordHighlight` reads
      `Shift+W`. Its `?` (`ztts-help-key-word-highlight`) opens
      `ztts-help-tip` at once — `state: "open"`, `label` = "Switches the
      Read Aloud highlight between the word being spoken and the whole
      sentence — the same choice as Zotero's own Highlight current
      setting, for every tab, and it stays until changed again. A voice
      without word timing keeps highlighting the sentence either way."
      — with Zotero's native tooltip `closed`. Clear → `Not set`, the
      pref `''`, and a trusted Shift+W in a reader is then not consumed
      (`keydown()` = 0, the pref untouched, `highlightKey()` reads
      `shortcut: ""`); Restore default shortcuts → `Shift+W`. A
      recording started on *Player options* and given Shift+W ends with
      `#ztts-key-message` reading `Already used by "Word highlight on /
      off".` and the binding still `Shift+O`.
    - **Touches.** `reader.readAloud.highlightGranularity` (restore what
      the profile had — it is the user's Settings → General → Read Aloud
      → Highlight current), `shortcuts.toggleWordHighlight`, and for the
      no-timing item `reader.readAloudVoices` + `readAloud.memory`
      (`selectVoice` back to the original **before** any pref restore,
      then check byte for byte; the pick spreads to the user's own tabs
      through memory-sync). The key never starts or stops playback.
