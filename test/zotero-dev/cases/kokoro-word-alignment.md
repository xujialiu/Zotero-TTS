[Checklist index](../README.md) · [Scripts](../scripts/kokoro-word-alignment/README.md)

## Kokoro word timestamps on rewritten words (issue #86)

Items 3.24 and 3.25 of the checklist, under their original numbers.

### 3.24

24. **Numbers, a curly apostrophe, and a word with `point` inside**
    (issue #86, 1.11.7-beta9; measured live 2026-09-10).
    `test/fixtures/numbers/numbers.pdf`, Kokoro-af_alloy, highlight Word.
    Zotero cuts the page into six segments — the lead sentence (37 chars),
    then `In the reviewers’ … than they are.` as **one** 203-char segment
    (it does not break after `mm.`, as on the document the bug was found
    in), then `About 1,000 …` (78), `The pre-trained …` (54), `A
    magnification error …` (99) and the last paragraph (152). Play each
    from `manager.repositionTo(index)`, then read
    `controller._segmentTimestamps.get(index)` — re-read `mgr._controller`
    after the reposition, it rebuilds the controller — with each span's
    slice of the segment text. Expected, the mechanism: the log lines
    `local: 5 word timestamps for 37 chars`, `local: 37 word timestamps
    for 203 chars (5 bridged)`, `local: 14 word timestamps for 78 chars (3
    bridged)`, `local: 9 word timestamps for 54 chars (2 bridged)`, `local:
    18 word timestamps for 99 chars (2 bridged)`, `local: 31 word
    timestamps for 152 chars` — never a `dropped` (before the fix: 6
    timestamps for a two-sentence segment, the third of them `point`
    inside `branchpoints`). The 203-char segment's 37 spans, in reading
    order: `In, the, reviewers’, 29.83, mm, example, eye, a, scan,
    labelled, 3, ×, 3, mm, covers, 3.7, ×, 3.7, mm, Vessels, in, that, eye,
    therefore, look, narrower, their, branchpoints, denser, and, the,
    avascular, zone, smaller, than, they, are`. Every span starts and ends
    at a word boundary; `29.83` one span (chars 18–23) from the server's
    `twenty-nine` (0.624 s, where `reviewers’` ends) to its `three`
    (1.786 s); both `3`s and both `3.7`s spans of their own; `×` a span of
    its own here (the fixture's text layer has spaces around it) and
    joined with the digit after it (`×3`, `×3.7`) on the manuscript, whose
    layer has none; no span for `,` or `.` — `eye` ends at 2.774 s, the
    comma's end, and the final period (char 202) lies outside `are`
    (199–202); `branchpoints` one whole span (137–149). The second
    paragraph: `1,000` (6–11), `0.99` (33–37), the `76` of `76%` (54–56,
    the `%` out), `pre-trained` one span (4–15), `1.6` (31–34), the `1` of
    `[1]` (51–52), the `20` of `-20%` (26–28, the hyphen out) and `+10` of
    `+10%` (33–36, the `+` in). The third paragraph: 31 spans, one per
    word, no note on its log line. A timeline sampled every 40 ms walks in
    reading order and never onto a later line: at speed 3, `29.83` lit
    337–736 ms after the segment starts (audio 0.624–1.786) and
    `branchpoints` 3353–3554 ms (audio 9.749–10.274). Two screenshots,
    paused by polling `mgr._activeTimestampIndex` at 8 ms and
    `togglePaused()` in the same script: `29.83` alone lit, then the whole
    of `branchpoints` alone. `diagnostics.highlight()` →
    `activeWordTimestamp: "real"`; its `patched` and `sentenceSlot` are
    item 3.5's, and read `false` / `"empty"` on a tab attached while the
    window was minimized (issue #88) — not this item's. A
    segment's first span may start slightly negative (`-0.001`), the
    server's own first caption start passed through.

### 3.25

25. **A reply whose words are all rewritten falls back to the sentence**
    (issue #86; measured live 2026-09-10). With that session open,
    `voice.provider.remote.getAudio({ text: '29' }, voice.impl)` (a
    `Cu.cloneInto` segment is enough from chrome): the server says
    `twenty-nine`, nothing pairs, the log reads `local: no word timestamps
    for 2 chars (none of the 1 words the server returned is in the text),
    highlighting the sentence`, and the timestamps are the stand-in `[{
    start: 0, end: 86400, charStart: 0, charEnd: 2 }]` — never a
    word-colored sentence.
