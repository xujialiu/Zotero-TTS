[Checklist index](../README.md) · [Scripts](../scripts/paragraph-parts/README.md)

## 3j. A sentence across Zotero's paragraph break, read as one (issue #104, 1.12.8)

Zotero's document worker cuts a PDF into blocks with a model, and now and
then it starts a new block on an ordinary line in the middle of a
paragraph; its part-linking rule (`canLinkParagraphs`, worker.js:155896 in
10.0.2-beta.9) rejoins two blocks only when the first one's last line runs
full (`lastLineRag` within 1 pt, 155928), which a line cut mid-paragraph
never does. Read Aloud cuts sentences per chain
(`sdt_segments_buildSDTReadAloudSegments`, reader.js:71256), so the
sentence across the break was spoken as two, the second marked
`paragraphStart`. The plugin's `_loadSDT` shadow (`skipped-lines.ts`, the
walk of #87) now runs a second sieve after the restore
(`src/read-aloud/paragraph-parts.ts`, the four tests in its header) and
writes the part link Zotero refused; Zotero's own chain walk, cut, rects,
highlights and follow do the rest. The switch is
`readAloud.joinSplitSentences` (Settings → Zotero-TTS → Reading → *Read a
sentence Zotero split in two as one*), default true, read when the
structure loads, so every flip needs a fresh tab. The document is the
owner's manuscript, attachment `2YW7BJTZ` (parent `Y79TCS3K`; `RW6PYBBQ` a
second copy, `X7VC7KZS` the publisher's version), all three open in the
owner's tabs, whose structures were loaded before the build: a check
imports a fresh standalone copy of the file (`importFromFile`, the path
from `getFilePathAsync`), opens it in a new tab with the player opened
muted and paused in the same script, and erases the copy at the end. Read
the structure from that reader (`_internalReader._sdt.structure.content`),
never through `Zotero.SDT.getPack`, and the segments from
`_internalReader._readAloudSegments.segments`. The kit's probes come from
the research run of 2026-09-14 (`.tmp/zotero-dev/paragraph-parts/`) and
run through the runner (`scripts/_shared/run.js`). The numbers before the
fix were measured on 1.12.7, the ones after it on 1.12.8-beta and -beta2
(2026-09-14). Pages in prose are 1-based, the debug line's numbering;
`sourcePosition.pageIndex` and the `page` of a `joined` entry are 0-based.

1. **Attached and switched on.** With the player open on the fresh copy:
   `diagnostics.skippedLines()` for that reader → `patched: true`,
   `enabled: true`, `joinEnabled: true`, `loaded: true`;
   `diagnostics.startup()` lists the step `skipped lines` as ok.
2. **The sentence is one segment.** On the fresh copy of `2YW7BJTZ`, the
   segment holding `image magnification error correction is not required`
   also holds `no significant change in AL is expected.`: one hit, not
   two — 179 characters, `anchor: null`, `sourcePosition.pageIndex 12`
   with three rects: the tail of the line at y ≈ 249 (from x 203.6), the
   whole line at ≈ 225.5, the head of the line at ≈ 202 (to x 142).
   `skippedLines().joined` for the reader holds `{ after: 108, before:
   109, page: 12 }` and `{ after: 109, before: 110, page: 12 }` among its
   18 entries (17 on 1.12.8-beta, before the bracket-group rule), and the
   debug output one line per join, the texts cut to 30 characters each
   side: `paragraph parts joined on page 13: "…correction is not required
   for" + "longitudinal monitoring of ind…" (blocks 108 and 109)`. Before
   the fix (1.12.7): segments 210 `That said, … not required for` (67
   characters) and 211 `longitudinal monitoring … is expected.` (111,
   `anchor: "paragraphStart"`), 559 segments in all, blocks 108 and 109
   unlinked, the pack with 0 part links.
3. **The breaks counted.** Over the same reader: the segments that end
   without sentence-final punctuation while the next starts lowercase,
   and how many of them are chain boundaries. Before the fix: 19 of 559,
   all 19 chain boundaries (the first five at 54, 55, 58, 73, 92 — pages
   4→4, 4→4, 4→5, 5→6, 6→7). After it: 1 of 541 (18 joins) — segment 88,
   `Image analysis` | `was performed using OCTAVA …`, a heading with a
   paragraph and an image between it and the continuation, no paragraph
   pair, rightly refused (on 1.12.8-beta, 2 of 542 and 17 joins: the
   second was `…the five selected features` | `(Table 4) exhibited …`,
   which the bracket-group rule of beta2 takes) — the segment count and
   the `paragraphStart` count each down by exactly `joined.length`
   (559 → 541, 195 → 177). `RW6PYBBQ`: 23 of 560 before, 1 of 538 after
   (22 joins, the same heading). `X7VC7KZS`: 2 of 122 before (28 blocks,
   1 part link), 0 of 120 after (2 joins) — and its real paragraphs stay
   apart: `paragraphStart` 36 → 34, exactly `joined.length`. Every cut
   left is named by the kit's `11-remaining-cuts.js` with the sieve test
   it failed.
4. **The switch off.** `readAloud.joinSplitSentences` false, a second
   fresh copy: `skippedLines()` → `joinEnabled: false, joined: []`, the
   two halves back as separate segments, the count of item 3 back to 19.
   True again, a fresh copy: item 2 again. The #87 restore is untouched
   either way (`enabled: true`, `restored` as before).
5. **The pane.** Settings → Zotero-TTS, the Reading group: the row *Read a
   sentence Zotero split in two as one* directly under *Read a page's
   first line when Zotero would skip it*, checked, bound to
   `readAloud.joinSplitSentences`; its `?` opens `#ztts-help-tip` with the
   tip verbatim from `ztts-help-split-sentences`. Close the window
   afterwards; never switch the locale with it open.
6. **Heard and seen.** The sentence spoken without a pause at `for |
   longitudinal`, the sentence highlight covering both lines. By ear and
   by eye; not a bridge check.
