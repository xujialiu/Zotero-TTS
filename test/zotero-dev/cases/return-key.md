[Checklist index](../README.md) · [Scripts](../scripts/return-key/README.md)

## Shift+Enter — go to reading position (issue #76, 1.11.5)

Trusted presses through `nsITextInputProcessor` on the main chrome
window (rulebook step 9); `keydown()` = 1 means someone consumed the
key.

Item 4.4 of the checklist, under its original number.

### 4.4

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
