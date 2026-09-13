[Checklist index](../README.md) · [Scripts](../scripts/reading-positions/README.md)

## Reading positions

The store, the close capture, the resume, Zotero's own copies and the
end of a document.

Items 5.1–5.4 and 5.8 of the checklist, under their original numbers.

### 5.1

1. **The store follows the reading.** `diagnostics.position()` while
   speaking → the fixture's `stored` a zero-area point at one decimal
   (`{"pageIndex":P,"rects":[[x,y,x,y]]}`, issue #14), moving with the
   sentence; `database.rows` up by one within ~10 s, `store.queued` 0,
   `lastError` null. The sampler reads Zotero's `savedPosition`, not the
   controller's `_position`, so a document that ran to its end keeps the
   last sentence read as its bookmark while Zotero has already rewound
   `_position` to the run's start (item 5.8).

### 5.2

2. **Close capture.** Popup closed, tab closed: `tabHooks`/`captureHooks`
   back to the baseline's (0 with no other tab open), the `trace`
   `tab.onClose fired` → `reader.uninit fired` →
   the notifier, the row kept with the sentence paused on. One close
   pokes the position transport once (issue #40, 1.10.4).

### 5.3

3. **Resume.** Reopen; `diagnostics.smartKey()` → `resume at the stored
   position`; Shift+Space → the `trace` line `resume item <id> target
   {…}`, speaking within ~3 s from the **start** of the sentence paused
   on, `_position` that segment.

### 5.4

4. **Zotero's own copies** (issue #39). Fixture-c playing, paused on
   page 1; `diagnostics.position()` → the fixture's `zoteroSaved` and
   `zoteroPersisted` both `{"kind":"pdf",…}` and `stored` the point (the
   two copies need not describe the same segment: the setting is written
   from the debounced view state and lags the in-memory copy by one).
   Move the view to page 8 — `view.navigate(Cu.cloneInto({ pageIndex: 7 },
   reader._iframeWindow))`; the bare object reads as empty over there —
   and, a second later (the 300 ms view-state debounce and the
   synced-setting write; measured null at 0.9 s), `position()` again →
   `zoteroPersisted` null, `zoteroSaved` unchanged (Zotero's in-memory
   copy stays until the tab closes), `stored` unchanged; cross-check
   `Zotero.Items.get(id).getAttachmentLastReadAloudPosition()` → null.
   (By the code, not measured: back within five pages the next view-state
   change rewrites the setting from the in-memory copy, `reader.js`
   84641-84647.) Close the tab, reopen: `smartKey()` still resumes at the
   stored position (item 5.3).

### 5.8

8. **The end of a document, and what a resume does** (2026-09-06, from
   a surprise in section 4; driven before item 5.7's reload). A fixture
   read to its last segment on a plugin voice: at `Complete` the manager
   stays `active` and goes `paused`, `_activeSegment` null (`reader.js`
   82687-82692), and the controller rewinds `_position` to
   `_backwardStopIndex ?? 0` — the **run's** start, not the document's
   (`reader.js` 39500) — while `_currentIndex` and `_indexAtPause` keep
   the last segment. `smartKey()` then reports `togglePaused (resume…)`,
   and Shift+Space replays from the rewind target: `_currentIndex` snaps
   to it within ~100 ms and the position walks forward one segment at a
   time (`reader.js` 84210-84228 → 82548-82557; no reposition anywhere),
   with no `[zotero-tts]` line — the plugin's stored-position restore
   runs only on an **idle** manager. The store still names the last
   sentence actually read (item 5.1), so a popup closed after a completed
   document and a Shift+Space later resume at the end, not at the run's
   start. Zotero's own behavior, not a fault.
