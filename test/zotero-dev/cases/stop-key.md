[Checklist index](../README.md) · [Scripts](../scripts/stop-key/README.md)

## Stop reading everywhere (issue #71)

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key.

Item 4.9 of the checklist, under its original number.

### 4.9

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
