[Checklist index](../README.md) · [Scripts](../scripts/word-highlight-key/README.md)

## Word highlight on / off (issue #67, 1.11.6; issue #114, 1.12.11)

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key.

Item 4.10 of the checklist, under its original number. Since issue #114
the key works the plugin's own **Word** switch (`zotero-tts.highlight.word`)
rather than Zotero's pref: Zotero's `reader.readAloud.highlightGranularity`
follows through the pin (`src/core/highlight-pin.ts`), and Zotero's
observer repaints every open reader inside that write as before. The
switches themselves are [highlight-levels.md](highlight-levels.md).

### 4.10

10. **Word highlight on / off** (issue #67, 1.11.6; issue #114, 1.12.11).
    `Shift+W` (`shortcuts.toggleWordHighlight`) flips
    `zotero-tts.highlight.word`; turning it off while
    `zotero-tts.highlight.sentence` is `false` turns the sentence on in the
    same press, so nothing is ever left unhighlighted. The pin writes
    Zotero's `reader.readAloud.highlightGranularity` — `word` while Word
    is on, `sentence` otherwise — inside the switch's write, and Zotero's
    observer repaints **every** open reader inside that. There is no
    paragraph level. `diagnostics.highlightKey()` is the mechanism, a
    trusted press the behavior. Two fixtures plus the return-key EPUB (in
    the library as "ZTTS Return-Key EPUB" since 2026-09-08).
    - **The diagnostic.** No press: `{shortcut: "Shift+W", before:
      {switches: {sentence, word}, pref, readers: [{itemID, state,
      wordTiming}]}}` — `pref` is Zotero's level, `word` when
      `switches.word` is `true` and `sentence` otherwise; every reader's
      `state` equals its own
      `_internalReader._state.readAloudState.highlightGranularity` and
      `pref`; `wordTiming` is one of `real | stand-in | none`.
      `highlightKey(true)` runs the very `toggleWordHighlight` the key
      runs, on the reader `pickReader` would pick: `picked` its itemID,
      `levels` the pair set, `after.switches` equal to it, `after.pref`
      the pinned level, **every** reader's `after.readers[].state` = that
      level in that same call, `toast` the toast's text.
    - **PDF, playing** (fixture A on `Azure-en-US-ChristopherNeural`).
      From both switches on, the press turns Word off: the flip lands
      inside the write — the switch pref, Zotero's pref and the state at
      7–13 ms, and `_primaryView._readAloudHighlightedPosition` goes from
      one word rect to the segment's rects and back on the next press —
      the widths follow the segment on screen (14–20 pt against 106–361
      on 2026-09-08, 18–54 against 150 and wider on 2026-09-16), a narrow
      rect against wide ones — same `_position`, the word index still
      advancing — no restart, no new `word timestamps` line, the
      controller the same object. `#ztts-speed-toast` in the reader
      iframe's document reads `Highlight: sentence` on the first press
      and `Highlight: word and sentence` on the second (zh-CN `高亮：句子`
      / `高亮：单词和句子`), inline `opacity: 1` at the press and `0` by
      ~950–1050 ms.
    - **Sentence off.** With `zotero-tts.highlight.sentence` `false` and
      Word on (the word alone on screen), a press ends with `{sentence:
      true, word: false}` — the toast `Highlight: sentence`, the whole
      segment drawn; the next press `{sentence: true, word: true}`. On a
      profile with both prefs `false` (hand-edited), the first press reads
      the pair as the sentence and turns the word on: `{sentence: true,
      word: true}`.
    - **EPUB, playing.** The `ReadAloudActiveSegment` spotlight between
      one word (6–7 chars, 1 rect, `#3478f6b3`) and the whole segment (192
      chars, 3 rects, `_getSpotlightColor` `#ffff00b3`), same `_position`.
    - **Paused, both documents.** The primary flips the same way,
      `paused` stays true, `_position` and the active word index do not
      move: the pause leaves `activeTimestampIndex` alone, so the word
      the pause stopped on is what the flip draws.
    - **No active segment.** After the end of a document the controller
      rewinds and `_activeSegment` is null: the switch, the pref and the
      state flip, the last highlight stays where it was, and the next
      segment draws at the new level. Read `_activeSegment` in the same
      script that presses — fixture A ends in 35–60 s at 1.5×, two bridge
      calls.
    - **Idle reader.** Fixture B's tab selected, no session ever opened:
      the press flips the switch and the pref, the toast shows in B's own
      document, and no player opens (`popupOpen` false, `active` false, no
      `.read-aloud-popup`).
    - **Library tab, nothing speaking.** `keydown()` does not read `1` —
      it read `0` on 2026-09-08 and `2` on 2026-09-16, Zotero's own key
      handling on the library pane, not the plugin's — the switch and
      the pref untouched, no toast in the chrome document or in any
      reader's, the item-tree selection and quick search unchanged: the
      key has no reader to act on and is left alone.
    - **Two tabs.** A speaking in the background, B selected and idle:
      the picked reader is the hidden speaking one, both readers'
      `state` follow, and the toast lands in the **main window's**
      document, as the speed keys do.
    - **A voice without word timing** (`azure::en-US-Ethan:MAI-Voice-2`,
      issue #73; its audio is cached). A press that turns Word on shows
      `Highlight: word (this voice has no word timing, so the sentence
      stays highlighted)` for ~5 s (`opacity` 1 through 4.9 s, 0 by 5.2 s)
      against the ordinary toast's ~0.95 s; `diagnostics.highlight()` for
      that view reports `granularity: "sentence"`, `activeWordTimestamp:
      "stand-in"`, `state.highlightGranularity: "word"`, and the primary
      stays the whole segment in `#ffff00b3`.
    - **The recorder row.** Edit → Settings → Zotero-TTS: **Word
      highlight on / off** sits after *Player options* and before *Stop
      reading everywhere* (other rows between them since);
      `#ztts-key-toggleWordHighlight` reads
      `Shift+W`. Its `?` (`ztts-help-key-word-highlight`) opens
      `ztts-help-tip` at once — `state: "open"`, `label` = "Turns the Word
      switch of the Highlight section on and off without leaving the
      document, for every tab, and it stays until changed again. Turning
      it off never leaves nothing highlighted: the sentence comes on. A
      voice without word timing keeps highlighting the sentence either
      way." — with Zotero's native tooltip `closed`. Clear → `Not set`,
      the pref `''`, and a trusted Shift+W in a reader is then not
      consumed (`keydown()` = 0, the switches untouched, `highlightKey()`
      reads `shortcut: ""`); Restore default shortcuts → `Shift+W`. A
      recording started on *Player options* and given Shift+W ends with
      `#ztts-key-message` reading `Already used by "Word highlight on /
      off".` and the binding still `Shift+O`.
    - **Touches.** `zotero-tts.highlight.word` and `.sentence` (restore
      to no user value), `reader.readAloud.highlightGranularity` (pinned
      by the plugin — report what it held before and after; it ends at
      `word` with the switches at their defaults),
      `shortcuts.toggleWordHighlight`, and for the no-timing item
      `reader.readAloudVoices` + `readAloud.memory` (`selectVoice` back to
      the original **before** any pref restore, then check byte for byte;
      the pick spreads to the user's own tabs through memory-sync). The
      key never starts or stops playback.
