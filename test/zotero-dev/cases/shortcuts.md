[Checklist index](../README.md)

## 4. Shortcuts, the toast, the recorder, two tabs

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key. Two fixtures open, A speaking.

1. **Speed keys.** Shift+C: `manager.speed` +0.1, the toast `N×` in the
   visible document for ~900 ms, memory `speed`, every language entry's
   `speed`, the log `spread read-aloud speed N to M reader(s)`, the idle
   tab's manager takes the speed without persisting. Shift+X back;
   Shift+Z to 1 (the toast reads `1.0×`: `toFixed(1)`); the popup's own
   `setSpeed(1.7, true)` restores.
2. **Skips.** ArrowRight/ArrowLeft ±1 segment, Shift+Arrow to the
   previous/next `paragraphStart` anchor (derive from the controller's
   `_segments`), `view._readAloudPositionLocked` true after each — the
   flag is already true when a session starts, so force it false
   (`Components.utils.waiveXrays(view)._readAloudPositionLocked = false`)
   before each press, or the check proves nothing.
3. **Shift+Space.** `diagnostics.smartKey()` predicts each press:
   playing → `togglePaused (pause)`; paused → resume; idle with nothing
   stored → `startReadAloud (plain start)` (the press supplies the
   activation itself); idle with a stored position → section 5.
4. **Shift+Enter — go to reading position** (issue #76, 1.11.5).
   Consumed only with a session open. The key locks the view, forgets a
   DOM view's Read Aloud state and re-emits the manager's, so the view
   navigates on that push, playing or paused; the PDF view is left
   alone. `diagnostics.returnKey()` is the mechanism, a trusted press
   the behavior, and one `[zotero-tts] return to spoken: …` line per
   press names the branch. Force the lock false before every press
   (`Components.utils.waiveXrays(view)._readAloud.positionLocked =
   false`; `._readAloudPositionLocked` on a PDF): it is already true
   when a session starts, and a scroll only unlocks while
   `_readAloud.state?.active && !_readAloud.scrolling`
   (reader.js:55153), so a scroll during Zotero's own follow is
   absorbed and proves nothing. Scroll away and press in **one**
   script: a playing document's own follow puts the view back between
   two calls.
   - **EPUB, scrolled flow** (`test/fixtures/return-key/return-key.epub`
     as a standalone attachment), playing and paused, 3.5 screens away.
     The log line `dom view, state forgotten`; in the first sample
     `locked: true` and `stateHeld: false`; then `scrolling: true` with
     `stateHeld` and `sameSegment` true and the spoken paragraph's rect
     back inside the viewport — 19 ms playing, 27 ms paused (scrollY
     5212 → 1158, 5631 → 1498) — and `scrolling: false` by ~150 ms.
     The controller is the same object and its clock and `_position`
     go on: no restart, no second `word timestamps` line. Paused,
     `paused` stays true in every sample. Was: playing, the view
     returned only at the next sentence (5468 ms); paused, never.
   - **EPUB, paginated flow** (`view.setFlowMode('paginated')`), five
     pages away by `navigateToNextPage()`, which unlocks by itself. The
     same flags, and `view.flow._offsetLeft` back to the exact page it
     left at 17 ms playing / 29 ms paused (64794 → 10799,
     75593 → 21598).
   - **The lock survives, and still lets go.** After a return the next
     segment change raises `scrolling` again with `locked` kept; ≥
     500 ms later a scroll drops `locked` within 20 ms — the press
     leaves no stuck scroll flag to eat the next manual scroll.
   - **PDF** (fixture A, paused, page 1 → the bottom of page 2). The
     log line `pdf view, state kept`, `view: "pdf"`, `locked: true`
     after the press and `scrolling` up ~29 ms in. The PDF view needed
     no fix (#76 left it alone: it navigates on any push while locked);
     what varies is whether the bridge can see its smooth scroll —
     Zotero scrolls `viewerContainer` with `behavior: 'smooth'`
     (reader.js:76470), which held still in the 17:07 run of
     2026-09-08 (the same call with `'auto'` landed at once) and moved
     in the 23:00 run on the same machine (`scrollTop` 0 → 126 → 853 →
     1304 inside 600 ms, `scrolling` true from 45 ms). Count `locked`
     and `scrolling`; the scroll itself is eyes only. The EPUB's smooth
     navigate (53243) does move, in both flows.
   - **HTML snapshot** (`return-key.html`, imported the way §9 says),
     playing and paused, 3.5 screens away: the same flags on the same
     timings as the EPUB — `dom view, state forgotten`, `locked: true`
     and `stateHeld: false` at once, `scrolling: true` with the state
     re-held on the same segment by ~25 ms, `scrolling: false` by
     ~125 ms, the controller and `_position` unmoved, paused stays
     paused. Like the PDF and unlike the EPUB, the scroll itself does
     not move here: `SnapshotView.navigateToSelector` ends in a smooth
     `scrollIntoView` of the iframe, and the same selector with
     `behavior: 'auto'` centers the paragraph at once while `'smooth'`
     holds one scrollY for 900 ms. Eyes only for the scroll.
   - **No session.** Shift+Enter is not consumed (`keydown()` 0, the
     event not `defaultPrevented` at the main window), no log line,
     and ArrowRight still pages by exactly one page.
   Each DOM press also logs, from the null state, `highlight:
   effective granularity null (… state missing)` and `the sentence
   goes back to one piece` before the push restores them — within one
   task, before any paint; whether anything flickers is §8.
5. **Shift+O.** `diagnostics.playerOptions(true)` flips `expanded`; the
   real press flips it back, on the picked reader only. The diagnostic
   presses the button of **every** reader with a player, so with two
   players open the other one is left expanded — restore it by clicking
   its own Options button.
6. **Tab routing.** A paused in the background, B visible: the key goes
   to B, the toast in B's document. A speaking in the background, B
   visible: the key goes to A (speaking wins), the toast in the chrome
   window; both managers move under global speed.
7. **One voice everywhere across tabs.** Both sessions open: a
   `selectVoice` in A → `spread read-aloud voice … : <lang>: resynced`,
   B's `selectedVoiceID` follows within ~2 s, the memory follows,
   `diagnostics.readAloudMemory()` shows both with `listsDefault: true`;
   the reverse from B.
8. **The recorder.** Click a shortcut field → `Press the new keys… (Esc
   cancels)`; Shift+V through the TIP on the pref window → the field and
   the pref read `Shift+V`, the new key fires on a reader and the old
   one does not; a bare letter is rejected with the modifier message;
   Escape cancels. Restore the pref; the row repaints from its own
   handlers only.
9. **Stop reading everywhere** (issue #71). `Shift+S`
   (`shortcuts.stopReading`) closes every open player in every window
   and shows a toast; `diagnostics.stopKey()` is the mechanism, the
   trusted press the behavior. Two fixtures.
   - **The diagnostic.** Nothing open: `{shortcut: "Shift+S", taken:
     false, open: []}`. Two sessions open: `taken: true`, `open` the
     two itemIDs in reader order; `taken` is "bound and something to
     stop", so with the binding cleared it reads false. `stopKey(true)`
     runs the very `stopReading()` the key runs, routed as a press on
     the main window: `count: 2`, `after: []`, `toast: "Stopped Read
     Aloud in 2 tabs"`, and `players()` reports every reader `open:
     false` (`popupInDom` may still be true — the element leaves on
     React's next render).
   - **The press in the reader.** Tab A selected, both sessions open:
     `keydown()` = 1, both readers `open: false` already at the first
     poll sample (the close is synchronous), and `#ztts-speed-toast`
     **in tab A's iframe document** reads `Stopped Read Aloud in 2
     tabs` with inline `opacity: 1` for ~900 ms, then `0` with the
     element left in the DOM. The chrome window's document has no toast
     element at all. `stopKey()` after → `taken: false`.
   - **From the library tab.** Both sessions open and paused — nothing
     speaking, so `pickReader` picks no reader: select `zotero-pane`,
     press, and the toast lands in the **chrome window's** document
     (`win.document.getElementById('ztts-speed-toast')`) with the same
     text, while the readers' own toasts stay as they were.
   - **The singular.** One session only: `Stopped Read Aloud in one
     tab`. The element is created on first use and reused, so the old
     text is what it holds before the press.
   - **Nothing open: the key falls through.** `keydown()` = 0, the
     toast's text and opacity unchanged, `_state.primaryViewState`
     identical, no find popup — the return value is decisive here,
     since the reader has no meaning of its own for Shift+S.
   - **The recorder row.** Edit → Settings → Zotero-TTS: **Stop reading
     everywhere** is the last row, directly after *Player options*;
     `#ztts-key-stopReading` reads `Shift+S`. Its `?`
     (`ztts-help-key-stop`) opens `ztts-help-tip` at once — `state:
     "open"`, `label` = "Closes the Read Aloud player in every tab at
     once. Each tab keeps its place, and Read Aloud picks up there when
     you start it again. While no player is open the key keeps its
     usual meaning." — with Zotero's native tooltip `closed`. Clear →
     `Not set` and the pref `''`; Restore defaults → `Shift+S`. Start a
     recording on *Player options* and press Shift+S:
     `#ztts-key-message` reads `Already used by "Stop reading
     everywhere".`, the recording ends and the binding stays `Shift+O`;
     a fresh recording is cancelled by Escape (`keydown()` = 1, label
     back, message cleared).
   - **The key free.** With `shortcuts.stopReading` set to `''` and a
     player open, the press is not consumed (`keydown()` = 0), the
     player stays open and no dialog, find bar or view change follows;
     `stopKey()` reads `taken: false`, `shortcut: ""`.
   - **Touches.** `readAloud.memory` (point it at a listed free voice
     first, restore verbatim last), `reader.readAloudVoices` (a fixture
     session on an `en` document rewrites the `en` entry, 846 → 837
     chars — rebuild it byte-identical), `shortcuts.stopReading` and
     `shortcuts.toggleOptions`; the settings auto-upload fires on every
     shortcut pref change. **Every press and every `stopKey(true)`
     closes the user's own players too**, and a script-reopened player
     is mute — run it only with none of theirs open, or with their
     consent.
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
