[Checklist index](../README.md)

## 3c. The colors follow the first page (issue #88, 1.11.7)

The plugin's PDF highlight patch reaches Zotero's Page prototype only
through a page object, and a view has none before pdf.js has rendered
one: the first half second of a tab, a minimized window, a tab hidden for
a minute (Zotero releases a hidden tab's pages after
`SUSPEND_WHEN_HIDDEN_AFTER`, 60 s, reader.js:30708 in 10.0.2-beta.7 and
beta.9, and `_handlePageDestroy` empties `view._pages`). Until 1.11.7
`attach` returned false on such a view and nothing retried, so a tab
open across a background upgrade with the window minimized, or a player
opened at once on a fresh tab, kept Zotero's pale highlight for its
whole session. Now the view's methods are shadowed at once, and a shadow
on `PDFView.prototype._render` lands the page half at the view's first
page, before it is painted (`src/read-aloud/highlight-style.ts`,
`patchPDF` / `patchPDFPages`). The pages are released and taken back
through Zotero's own `reader._internalReader.setSuspended(true / false)`,
what its 60 s timer calls, so the window is never minimized by the run.
The fixture is `test/fixtures/fixture-a.pdf` on a voice with real word
timing (System on macOS has none); the tab is opened and closed by the
run, the plugin is reinstalled in place (the same xpi) and the item's
reading position moves; nothing else is touched. Every number below was
measured on 1.11.7-beta11, Zotero 10.0.2-beta.7, macOS (2026-09-10).

1. **Attached with both halves at once.** The plugin attaches at the
   reader's open (`watchReader`), before pdf.js paints, so a tab the run
   opens takes item 4's path — the lines `without pages` and `at its
   first page`, 50–110 ms apart — and both halves land together only
   where the pages are already rendered when the plugin attaches: its
   own start, or an in-place reinstall with the tab open. With the
   fixture tab open, rendered, its player paused, the xpi reinstalled in
   place: `diagnostics.highlight()` → `kind: 'pdf', patched: true,
   awaitingPage: false, pages: 2`, the debug line `highlight style
   attached to a PDF view` (unchanged), `diagnostics.patches().highlight`
   → `{total: 3, live: 3}` for one PDF tab (the page method,
   `setReadAloudState` and `_render`; was 2), and no dead-object line. A
   fresh PDF tab reads `patched: true, awaitingPage: false` before its
   popup has ever opened, with `granularity: null, state: null` (section
   3, item 5).
2. **Released pages under an in-place reinstall.** With the player open
   and paused on that tab, `reader._internalReader.setSuspended(true)` →
   `view._pages.length` 0 within 30 ms (27 measured), the session still
   `active: true, paused: true` on the same view object; then the xpi
   reinstalled in place: the new instance's startup attaches to the tab
   with `diagnostics.highlight()` → `patched: false, awaitingPage: true,
   pages: 0`, `patches().highlight` → `{total: 2, live: 2}`, and the
   debug line `highlight style attached to a PDF view without pages, the
   colors follow its first page`; no `JavaScript Error` of the plugin's
   and no dead-object line from the old instance's dispose (three
   in-place installs in the run, none).
3. **The colors land with the first page, before it is painted.**
   `reader._internalReader.setSuspended(false)` → `patched: true,
   awaitingPage: false` within 125 ms (`pages: 1` at the flip, 2 once
   the second page renders), the debug line `highlight style attached to
   a PDF view at its first page` followed in the same millisecond by
   `highlight: primary #3478f6b3 (…)` and `highlight: secondary
   #ffff00b3 (…)` in the pane's colors — the page's first paint went
   through the patch, which is the "before it is painted" evidence —
   and `patches().highlight` → `{total: 3, live: 3}`. The player resumed:
   `_position` advancing, `sentenceSlot: "ours"`, `secondaryTrim` with
   pieces, a screenshot with the word in the word color inside the
   sentence color.
4. **A player opened before the first page.** The tab closed and
   reopened from one chrome script that polls every 20 ms and calls
   `reader._internalReader.startReadAloudAtPosition()` the moment
   `_internalReader._primaryView` exists with `_pages` still empty
   (measured: the view at 388 ms after `Zotero.Reader.open`, pages 1 at
   556 ms and 2 at 673 ms, the manager `active` at 2145 ms): the two
   lines in order — `without pages` at the open, `at its first page`
   49 ms later — then `patched: true, awaitingPage: false, pages: 2`,
   `sentenceSlot: "ours"`, `activeWordTimestamp: "real"`, and a
   screenshot in the pane's colors. A session started from chrome sits
   `suspended` behind the autoplay gate; on macOS a trusted Shift+Space
   pair (pause, then resume) through `zotero_send_keys` resumes it and
   playback advances, which is how "while it speaks" is checked. If the
   pages are already there when the player opens, the item reads as
   item 1 and says so.
5. **Not the DOM views.** An EPUB tab
   (`test/fixtures/ro-diacritics/ro-diacritics.epub`): the line
   `highlight style attached to a DOM view` at the reader's open, `kind:
   'dom', patched: true` with no `awaitingPage` field,
   `patches().highlight` → `{total: 3, live: 3}` for the tab; with the
   player open `granularity: 'word'`, `sentencePieces: { head:
   "Fixtura ", tail: null }` on the first word.
