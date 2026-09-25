[Checklist index](../README.md) · [Scripts](../scripts/sentence-pauses/README.md)

## The pauses between sentences and paragraphs (issues #44, #142)

Item 3.10 of the checklist, under its original number.

### 3.10

10. **The pauses** (issue #44, 1.10.8; the Engine since issue #133; the
    paragraph pause the whole pause and off meaning none since issue #142).
    `diagnostics.engine()` per reader; its top-level `pauses` is the four
    settings as the Engine reads them. A session on a plugin voice:
    `gaps.count` up one per boundary, `gaps.last.paragraph` true exactly
    into segments 5/9/12/15 with `gaps.last.ms` round(200/speed), false
    elsewhere with 0, `gaps.last.speed` the speed. Mid-session, sentence
    1000 and paragraph 400 at 2× → `gaps.last.ms` 500 between sentences
    and 200 into a paragraph from the next boundary on (the paragraph pause
    alone, not added); `_allVoices.length` unchanged, `active` still true,
    no `#ztts-notice`. Sentence 500 and paragraph 200 at 1× → 500 and 200.
    Sentence off with paragraph 400 at 1× → 0 and 400; paragraph off with
    sentence 1000 at 2× → 500 and 0. Both switches off → `ms` 0 everywhere
    at every speed. `Premium Voice 1` (spends: at most three sentences, only
    with Premium credit on the account — `selectTier('premium')` before
    `selectVoice`, and resume, poll and pause in ONE script, since every
    round trip is billed audio): 0 between sentences and 0 into a paragraph
    while both switches are off, its catalog 300 ignored; at the defaults 0
    and round(200/speed). A pause in the gap: `inGap` false at once, `gaps.count`
    unchanged until the next boundary. The pane: the two rows under *Use one
    speed everywhere*, bound to the four prefs; writes through the number
    inputs and the checkboxes reach the prefs; the `?` tooltips open. By
    ear only: the pacing at 1× and 2×.
