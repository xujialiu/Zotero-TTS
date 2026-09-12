[Checklist index](../README.md)

## 3a. The whole sentence on screen (issue #83, 1.11.7)

Since #90, `pdf-follow.ts` owns following and calls the retained #83
geometry from state updates, rather than waiting for Zotero's native lock.
It measures the whole sentence, both pages, keeps Zotero's trigger, adds
"any part outside the viewport less the margin", and scrolls
`#viewerContainer` itself (`src/read-aloud/sentence-in-view.ts`). Run the
geometry checks with the PDF renderable and the host not minimized;
hidden deferral and manual intent are checked in §3d. The
document is a real two-column article — the hand-written fixtures
cannot serve, see §9 — the IOVS "Association of Retinal Biomarkers With
the Subtypes of Ischemic Stroke and an Automated Classification Model"
(429 segments; page-crossing: 44, 82, 113; taller than the viewport:
113, 220, 267); any two-column journal article whose page-crossing
sentences carry `nextPageRects` does, with its own numbers. Every number
below was measured at viewport 1198 × 1141, page-width, scale 1.4191,
margin `followMargin(1141)` = 24, `fits` limit 1093 px (2026-09-10); at
another viewport a centering target is `(whole.top + whole.bottom) / 2 −
clientHeight / 2` and a wordless giant's is `head.top − margin`. The
player runs on a Kokoro voice (real word timing:
`manager.activeTimestamp.end` is small; the stand-in is `{ start: 0,
end: 86400 }`). The tab is opened and closed by the run and the item's
reading position moves; nothing else is touched.

1. **Attached.** With the player open: the debug line `pdf follow
   attached` for the view, `diagnostics.sentenceInView()` → `kind: 'pdf',
   owned: true, patched: true, following: true`, and
   `diagnostics.startup()` listing the step `sentence in view` as ok.
   The native `_readAloudPositionLocked` is intentionally false; it is
   not the follow-status assertion. An idle newly installed controller
   reports `last: null`, not a previous build's target.
2. **A page-crossing sentence is shown whole.** View at scrollTop 0,
   `view.lockPositionToReadAloud()`, `manager.repositionTo(82)` (exact;
   `jumpTo` lands one earlier): within ~1.5 s one line `sentence in
   view: zotero on page 2: scrollTop 0 -> 2768, sentence 889 px,
   viewport 1141 px` — `zotero` because from the top of the document
   Zotero's own trigger fires first, `cut` when the view starts nearer;
   the target is ours either way, the whole's center less half the
   viewport — and `sentenceInView()` → `whole [129.2, 2894.0, 1069.0,
   3783.3]`, `fits: true`, `cut: false`, the head at y 126 and the
   tail's bottom at y 1015. Zotero alone targets 2318.5 and leaves the
   tail 323 px below the edge.
3. **A column-crossing sentence too.** From sentence 100 (scrollTop
   3829), `repositionTo(101)`: `sentence in view: cut on page 3:
   scrollTop 3829 -> 3492, sentence 748 px`, `last.reason: 'cut'`, both
   parts inside at y 197–945.
4. **Shift+Enter brings the tail in.** Pause with sentence 82 active,
   then use a trusted manual navigation to put its head in the middle
   half of the viewport and its tail off screen. Confirm `following:
   false`; programmatic container scrolling alone no longer disengages.
   No plugin follow line while disengaged; then a trusted
   Shift+Enter (§4.4's TIP): `keydown` = 1, `return to spoken: pdf view,
   state kept`, then `sentence in view: cut on page 2: … -> 2768`,
   `cut: false`, `following: true`. A pause exactly between sentences
   can have no active segment; use an active sentence for the geometry
   assertion, rather than calling the absent target a recovery failure.
5. **A sentence wholly on screen is left alone.** On an ordinary
   sentence after the follow settles: `last.reason: 'none'`,
   `issued: false`, no line — Zotero's own method keeps the horizontal
   axis. Over 30 s of playing at 3× (ten sentences): 4 lines, one per
   sentence Zotero would also have scrolled for plus the cut ones; never
   one per word.
6. **A sentence taller than the viewport follows the word.** Sentence
   220 (1283 px): `fits: false`, `cut: true`, and while the active word
   is on screen `last.reason: 'none'`, `issued: false` — no scroll.
   Playing, 4 `sentence in view: part on page 8: …` lines for its 21
   words, each target the word's center, moving up as the word crosses
   into the right column; two lines 43 ms apart are expected, the word
   moves inside the animation and the targets differ. With no word
   position — a wordless voice, or `activeWordSourcePosition` set to
   null on the view's state for the probe — the head goes to the top
   edge plus the margin, once: `cut on page 8: scrollTop 9000 -> 10670`
   = head top 10694.15 − 24.
7. **Manual navigation stays disengaged.** Send a trusted PageDown or
   use the wheel. Expect plugin `following: false`, `pending: false`,
   and `reason: 'keyboard'` or `'wheel'`; `last.at` stops changing across
   multiple naturally advancing sentences. Explicit skip/return then
   reengages and updates the target. Separately, a script-issued scroll
   or native false lock write must not disengage following (§3d).
8. **Pass-through.** `view.navigateToPosition(position,
   cloneInto({ block: 'nearest' }, iframeWindow))`: Zotero's own instant
   jump, no `sentence in view` line, `last` unchanged.
9. **Errors.** Nothing from `[zotero-tts]`, no `zotero-tts.js` frame, no
   `can't access dead object`. Zotero's own `AudioContext was prevented
   from starting automatically` / `NotAllowedError: The play method is
   not allowed` (reader.js:38319, 39944, 40037) follow every
   script-started playback and are not the plugin's.
