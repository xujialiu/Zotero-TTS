[Checklist index](README.md)

Issue #81: [expanded player opening](cases/player-expanded.md) passed its
core live checks, including PDF/EPUB and separate-window first-visible-state
samples, missing-button recovery, timeout recovery, and reload. See the
[run report](runs/2026-09-12-1.12.3-beta/issue-81.md) for remaining checks and
the restoration incident. Neither final diagnostics nor sampled states
alone establish absence of a perceptible flash. The throwing-access live
test proves the error handler clears the stylesheet but its visibility
observation is confounded by the harness removing that stylesheet. The
follow-up did not verify raw voice-preference/memory equality after testing.

## 8. What only a human can check

Handed round in the old form (MEMORY/MEMORY.md, "The user takes over only"):
  at most three self-contained steps, the UI named by what it says on
screen, the complete Run JavaScript code, the expected output.

- *Backup settings…* / *Restore settings…* and *Export/Import reading
  positions…*: the file dialogs, the confirm, the message line, the
  provider check after a restore (issue #21).
- *Restore settings from server…*: the picker listing every machine's
  file with its date, the confirm, the restore.
- How a voice sounds; whether the word highlight keeps pace with the
  audio (Azure, Kokoro, System on Windows) and the sentence highlight
  with OpenAI and with the System voices on macOS.
- Shift+Enter's scroll-back as it looks on screen — the EPUB's and the
  snapshot's smooth navigate, and the PDF's, which the bridge cannot
  move (§4.4) — and whether the sentence highlight flickers on the
  press; the popup in motion; the speed toast's fade.
- The pane in a Chinese Zotero after a restart (issue #30): how the
  wording reads, whether the labels fit their 8em / 12em columns, the
  `?` tooltips' text; and the English pane unchanged from before.

## 9. Not covered, and why

- Auto-scroll modes (#93, [section 3f](cases/auto-scroll.md)): the beta3
  bridge pass verified mode targets, real clocks, input intent and the
  shortcut, but PDF and scrolled EPUB smooth requests did not change
  physical offsets in the observation windows. Smoothness, visual
  centering and interruption during visible movement need normal use.
  The run did not cover a real oversized/wordless voice, a suitable
  cross-column PDF sentence, a spread-crossing EPUB sentence following
  real words, hidden-reader recovery or every secondary-view lifecycle.
  Existing deterministic unit coverage is not a live pass for those
  cases. See the [beta3 report](runs/2026-09-12-1.12.3-beta3/issue-93.md).
- EPUB and snapshot readers: `test/fixtures/return-key/` holds an EPUB
  and an HTML snapshot of the same sixty numbered paragraphs (issue
  #76, `build.py`), and §4.4 drives both. The snapshot reads aloud only
  when imported as a real snapshot: `Zotero.SDT._getProcessorType`
  takes `isPDFAttachment()`, `isEPUBAttachment()` or
  `isSnapshotAttachment()` (sdt.js:405-416), the last being
  `LINK_MODE_IMPORTED_URL` + `text/html` (`xpcom/data/item.js`); an
  `importFromFile()` of the .html gives `imported_file`, the reader
  logs `SDT pack unavailable: unavailable` (reader.js:83984) and the
  manager activates with `_segments: null` and no controller — what
  the 2026-08-31 note recorded. Import it with
  `Zotero.Attachments.importSnapshotFromFile({ file, url, title,
  contentType: 'text/html', charset: 'utf-8', parentItemID })`
  (`xpcom/attachments.js:293`; `text/html` requires a parent, lines
  310-317), then `await Zotero.SDT.ensure(id, { isPriority: true })` →
  `true` (68 ms measured 2026-09-08), and Read Aloud segments it (241
  segments). The pack lives in the attachment's storage directory and
  goes with the item. The EPUB needs none of this and also covers the
  `dc:language` path of issue #26. Reading Mode (`SDTView`) is a
  PDF-only toggle (reader.js:30199, 36720), so that third DOM view is
  not reachable from these fixtures.
- Linux: the System provider has no backend there, and §1.8's platform
  sentence is all it does; everything else is the same code. Windows and
  macOS each have their own System backend (issue #23), so §1.8 runs on
  whichever is at hand and says which.
- The whole-sentence follow (§3a) has no hand-written fixture: a
  two-column PDF built like the others on 2026-09-10 (43-line columns, a
  sentence across the column break and one across the page break) came
  back from Zotero's segmenter as two segments each — 0 of its 81
  segments carried `nextPageRects`, and the column-crossing half was
  merged with the sentence before it — so neither cut state could be
  built on it, and it was dropped. A real journal article joins such
  sentences (the IOVS article: 3 of 429 with `nextPageRects`); §3a names
  one. Snapshots and Reading Mode keep Zotero's start-of-segment
  navigation (reader.js:53250); EPUB now uses #93's whole-range follow
  in scrolled layout and native page navigation in paginated layout.
- A provider failing mid-document (Zotero's error UI, the 429 that maps
  to the silent `quota-exceeded`, notes/NOTES.md "Still open"): needs a
  server that fails on cue.
- Zotero's near-view position drop (five pages), the smooth follow, the
  #15 latexit shape, the shutdown flushes: as marked above.
