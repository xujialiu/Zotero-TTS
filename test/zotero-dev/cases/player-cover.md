# The docked bars lie over the document (issues #135, #137)

[Checklist index](../README.md)

Run baseline section 0 and cleanup section 7. Use disposable PDF and EPUB
fixtures, muted output, and the EPUB in both scrolled and paginated flow.
Keep exact preference values and user-value flags. Restore the player
layout, the split view and the auto-scroll settings, and native voice
memory last. The owner's profile holds `local::af_fake` in
`readAloud.memory`, so override it with a listed voice before any player
opens, and put it back byte for byte at cleanup. Never touch the owner's
readers.

Boxes are `getBoundingClientRect()` in the reader document, CSS px. The
2026-09-23 research run measured the toolbar's bottom at 41 and the
document area's bottom at 912, with 1.14.4-beta2. Take the numbers below
as offsets from whatever the window gives.

## 1. The document area never changes size

- On PDF and on EPUB, record the boxes of `#split-view` and
  `#reader-ui .split-view` with the player closed. Then open the player
  from its toolbar icon, close it, open it again, and step Shift+P through
  Top bar → Bottom bar → Floating panel → Top bar. In every state both
  boxes equal the closed ones: top at the toolbar's bottom, bottom at the
  document area's bottom. `#ztts-player-style` holds no `#split-view`
  rule.
- The player frame spans `#split-view`'s width. The Top bar is
  toolbar bottom → +34, and the Bottom bar is document bottom − 34 →
  document bottom.
- On EPUB, sample every 50 ms for 400 ms after each open, close and
  Shift+P step. The view never carries `mask-resizing`, and its computed
  `filter` stays at reader.css's resting `blur(0px)`, never `blur(10px)`
  (#124's probe).

## 2. The find bar clears the Top bar

- With the Top bar, on PDF and on EPUB, open the find bar with
  `reader._internalReader.toggleFindPopup({ primary: true, open: true })`.
  `.find-popup`'s top is toolbar bottom + 15 + 34 (90 on the research
  window), wholly below the frame's bottom. `elementFromPoint` 4 px into
  the search box answers the input, not `#ztts-player-frame`.
- With the Bottom bar and the Floating panel, the find bar's top is
  toolbar bottom + 15 (56), Zotero's own place.
- Side by side (`body.enable-vertical-split-view`), with the Top bar, the
  find bars of both views sit at + 49. Stacked
  (`enable-horizontal-split-view`), the lower view's find bar sits 15 px
  below its own top, with no margin. On 2026-09-24,
  `toggleFindPopup({ primary: false, open: true })` did not open the
  secondary view's find bar at all, so a `.find-popup` element appended
  to the live `.secondary-view` stood in for it.

## 3. Zotero's popups sit by their text (#137)

- On PDF, with the Top bar and then the Bottom bar, raise the selection
  popup with `view._setSelectionRanges(...)`, the call a mouse selection
  ends in; a DOM `Selection` raises none on desktop. Measure the popup's
  top minus the selected word's top with the player open, then closed.
  Both differences are equal, 0.00 px apart; the research fixture gave
  40.97.

## 4. Following keeps the sentence out from under a bar

- `diagnostics.autoScroll()`, which answers the PDF follow
  (`kind: 'pdf'`) or the EPUB one (`kind: 'epub'`) per reader, reports
  `covered: { top: 34, bottom: 0 }` with the Top bar,
  `{ top: 0, bottom: 34 }` with the Bottom bar, and `{ top: 0, bottom: 0 }`
  with the Floating panel, on a playing or paused PDF and an EPUB in
  scrolled flow. With the player closed the EPUB reports zeros, and the
  PDF `null`, since it measures only while a sentence is active. A
  paginated EPUB reports zeros with any layout.
- In `outside` mode, with the Top bar, scroll a PDF so that the current
  sentence lies wholly within the top 34 px of the viewport. The
  placement scroll itself sets off the follow, with the fixture paused
  throughout: `last.reason` is `cut`, and the sentence then lies between
  viewport top + 34 and the viewport's bottom. Do the same with the Bottom
  bar and the bottom 34 px, and with an EPUB in scrolled flow.
- A paginated EPUB with the Top bar turns no page for a sentence at a
  page's top: `last` does not change and no navigation is recorded.
- With *Keep following while the sentence is visible* on, scroll by
  trusted wheel input until the current sentence lies only under the Top
  bar. Following disengages (`automatic: false`, the player shows M).
  Repeat at the same scroll position with the Floating panel: the sentence
  counts as visible and following stays on (A).

## 5. The divider faces the document

- With the Top bar, the player's root has a 1 px `border-bottom` and no
  `border-top`. With the Bottom bar it has a 1 px `border-top`.

## Human only

- Whether the page still visibly blurs or jumps when the player opens,
  closes or changes layout. Screenshots are static, so the owner judges
  this by eye.
- Whether the Top bar's divider reads as the bar's edge over the page.
