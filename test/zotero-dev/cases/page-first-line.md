[Checklist index](../README.md)

## 3b. A page's first line put back (issue #87, 1.11.7)

Zotero's document worker labels a page's first line `excluded` now and
then when a sentence runs onto it from the page before — a single line in
the top band — and Read Aloud's chain jumps over it (`collectChainTexts`,
reader.js:71332 in 10.0.2-beta.9), so the sentence is spoken without the
line and the highlight walks past it. The plugin shadows `_loadSDT` on the
internal reader's prototype per tab and relinks the chain through such a
line before the segments are built (`src/read-aloud/skipped-lines.ts`, the
five tests in its header). The document is the owner's manuscript,
attachment `J5TFSPZC` (in the trash but openable; `4G2EJQSB` is the same
file under the same parent and may be the owner's own open tab — use
`J5TFSPZC`): 140 segments with the line lost, 141 with it back; block 16
of the pack is the line `2023, had not. The omission matters most in
myopia, in which the exposure of interest,` (86 characters, page 3's top
line at y 706–717), between blocks 15 and 17. The other known losses are
`G7YLAA9Z` (page 32, under a real running head) and `UAL5Y6BV` (three
lines: pages 23, 254 and 263). A tab is opened and closed by the run and
the item's reading position moves; nothing else is touched. The switch is
`readAloud.restoreSkippedLines` (Settings → Zotero-TTS → Reading → *Read a
page's first line when Zotero would skip it*), default true; it is read
when the structure loads, so every flip needs a fresh tab. The pack is
`.zotero-sdt-cache` beside the attachment; reading it with
`Zotero.SDT.getPack` regenerates a stale one in the background and shifts
its block indices — read the structure from the reader
(`_internalReader._sdt.structure.content`) instead. Every number below
was measured on 1.11.7-beta10, Zotero 10.0.2-beta.9 (2026-09-10).

1. **Attached.** With the player open: the debug line `skipped lines
   attached to a reader` once per tab (and once per open reader at an
   in-place install), `diagnostics.skippedLines()` → `patched: true,
   enabled: true` for every open reader, and `diagnostics.startup()`
   listing the step `skipped lines` as ok. `patches()` unchanged: `live`
   counts steady per open reader, every interface `hijacked`.
2. **The line is back in the sentence.** A fresh tab on `J5TFSPZC` with
   the player open: one debug line `skipped line restored on page 3:
   "2023, had not. The omission matters most in myopia, in which the
   exposure of interest," (86 chars) between blocks 15 and 17`;
   `skippedLines()` → `loaded: true, excluded: 1` (2 with the switch off),
   `restored: [{ index: 16, after: 15, before: 17, page: 2, chars: 86,
   head: "2023, had not. The omission matters most in myopia, in which"
   }]` (`head` is the first 60 characters). The pack: `content[16].flowClass`
   `body`, `[15].nextPart [16]`, `[16].previousPart [15]`, `[16].nextPart
   [17]`, `[17].previousPart [16]` — each `nextPart` / `previousPart` is
   one index path, `[16]`, not a list. The controller's `_segments`:
   **141**, and **segment 28** reads `Sampson et al. report that 60% of
   the myopia studies they reviewed, all published after 2023, had not.`
   (102 characters) with `sourcePosition.pageIndex 1`, `rects [[90, 85,
   521.8, 96]]` and `nextPageRects [[90, 706, 159.3, 717]]`; segment 29
   reads `The omission matters most in myopia, in which the exposure of
   interest,axial elongation, is also the source of the error.` (121
   characters) wholly on page 3, `rects [[164.3, 706, 521.7, 717], [90,
   685.6, 315.2, 696.5]]`. The missing space in `interest,axial` is
   Zotero's own: `getPartBoundarySeparator` (reader.js:70971–70987) joins
   two parts with a space only when the first ends with a letter or digit
   and the second starts with one. The words under `nextPageRects`:
   `_readAloudSegments.getWordTextSpans` +
   `_sdt.mapper.textNodeSpansToSourcePosition` put ` 2023` at `pageIndex
   2 [90, 706, 114, 717]`, `had` at `[121, 706, 136.3, 717]`, `not` at
   `[142.3, 706, 157.3, 717]`.
3. **Spoken and highlighted.** `repositionTo(28)` (re-read `_controller`
   on every poll — a reposition replaces it): `[zotero-tts] local: N word
   timestamps for 102 chars (1 bridged)`. `_segmentTimestamps.get(28)`
   holds one span per word, `2023` among them as a bridged span with the
   server's own times (#86's aligner; on 1.11.7-beta10, built before #86
   merged, there were 19 spans and `2023` had none — the cursor aligner
   dropped a number Kokoro reports in words), `had` at `[94, 97)` and
   `not` at `[98, 101)`. Paused with `had` active:
   `_computeActiveWordSourcePosition` → `pageIndex 2`, `[121, 706, 136.3,
   717]`; `diagnostics.highlight()` → `segmentPage 1`,
   `activeWordTimestamp "real"`, `sentenceSlot "ours"`, `secondaryTrim
   { page: 2, rects: 1, holes: 1, pieces: 2 }`; `sentenceInView()` →
   `whole [233.7, 3598.7, 1270.0, 4044.7]` (446 px across both pages),
   `fits: true`, `cut: false` once the sentence is in the viewport. By
   eye: the yellow sentence runs off page 2's last line onto page 3's
   `2023, had not.`, the blue word on `had`.
4. **The switch off.** `readAloud.restoreSkippedLines` false, a fresh tab
   on the same item: no `skipped line restored` line (only the attach
   line), `skippedLines()` → `enabled: false, restored: [], excluded: 2`,
   `content[16].flowClass` back to `excluded`, **140** segments and
   segment 28 the 138-character `Sampson et al. report that 60% of the
   myopia studies they reviewed, all published after axial elongation, is
   also the source of the error.` Back to true, a fresh tab: item 2 again.
5. **The other losses.** `G7YLAA9Z`: one line, `skipped line restored on
   page 32: "subject’s axial length to that assumed by the system
   (24.46mm). Also eyes with longer" (85 chars) between blocks 225 and
   228` (a curly `’`), `restored [{ index: 227, after: 225, before: 228,
   page: 31, chars: 85 }]`, `excluded 70`, 978 segments; block 226 — the
   page number `23` between them — stays `excluded`; segment 460 reads
   `…adjusting the image scale by the ratio of each subject’s axial length
   to that assumed by the system (24.46mm).` (182 characters, `pageIndex
   30`, `nextPageRects [[108, 706, 415.3, 718]]`) and segment 461 `Also
   eyes with longer axial lengths…`. `UAL5Y6BV`: **three** lines —
   `page 23: "4,565. By the beginning of the 1980s, there were five times
   more bank" (69 chars) between blocks 118 and 120`, `page 254: "8, 1980),
   which is also cited in Griffin, The Year of Dangerous Days:" (69 chars)
   between blocks 1676 and 1678`, `page 263: "complaint (see Table C, page
   67):" (33 chars) between blocks 1731 and 1733` — the last two are
   endnote continuations (a date and a citation cut in half) that the
   issue's coarser candidate sieve had missed; a run that restores one is
   the regression. `excluded 39`, 5526 segments; segment 304 is `In 1976
   the number was 4,565.` with `nextPageRects [[77, 702.5, 113.2, 715.6]]`
   and segment 305 reads through the line.
6. **Nothing else moves.** The IOVS article of §3a — attachment
   `MDAUAFUE`, the only one of that item's three PDFs with a pack: no
   `skipped line restored` line, `restored: []`, `excluded: 23`, 429
   segments — its running heads and DOI banner stay out.
7. **The pane.** Settings → Zotero-TTS, the Reading group: the row *Read
   a page's first line when Zotero would skip it* between *Extra pause
   between paragraphs* and *Prefetch upcoming sentences* (index 5 of 8),
   checked, bound to `readAloud.restoreSkippedLines`; its `?` opens
   `#ztts-help-tip` (`state: "open"` on the first poll after the approach;
   read its `label` in the same script that hovers, the next icon
   re-labels it) with the tip verbatim from `ztts-help-skipped-lines`.
   Close the window afterwards; never switch the locale with it open.
8. **Reading Mode.** On the manuscript after item 2, Reading Mode shows
   the line in its place — it renders the same structure. By eye; not
   run on 2026-09-10.
9. **Errors.** Nothing from `[zotero-tts]`, no `zotero-tts.js` frame, no
   `can't access dead object` at a tab's close or at the in-place install,
   and `Failed to load SDT` never logged. The `uncaught exception:
   undefined` lines stamped at the addon's `updateDate` second are the
   install's own, as are the `browser/menubar.ftl` and `branding/brand.ftl`
  misses.
