[Checklist index](../README.md) · [Scripts](../scripts/sentence-pauses/README.md)

## The pauses between sentences and paragraphs (issue #44)

Item 3.10 of the checklist, under its original number.

### 3.10

10. **The pauses** (issue #44, 1.10.8). `diagnostics.pauses()` per
    reader. Popup closed: `patched.controller` false, `count` 0. A
    session on a plugin voice: `patched: {manager: true, controller:
    true}`, `voice.nativeSentenceDelay` 0, at the defaults `gaps:
    {sentence: 0, paragraph: round(200/speed)}`, `count` up one per
    boundary, `last.paragraph` true exactly into segments 5/9/12/15
    with `last.scheduled` 200 and `last.delay` round(200/speed), false
    elsewhere with 0 and 0. Mid-session, sentence 1000 and paragraph
    400 at 2× → `gaps {500, 700}` and the next boundaries' `last.delay`
    accordingly; `_allVoices.length` unchanged, `active` still true, no
    `#ztts-notice`. Both switches off → `gaps {0, 200}` and
    `last.delay === last.scheduled`. `Premium Voice 1` (spends: at most
    three sentences, only with Premium credit on the account —
    `selectTier('premium')` before `selectVoice`, and resume, poll and
    pause in ONE script, since every round trip is billed audio):
    `nativeSentenceDelay` 300; at the defaults `last.scheduled` 300 or
    500 → `delay` 0 or 100 at 2×; switches off → `delay === scheduled`.
    An in-place reinstall under the paused session → `patched` both
    true again, `count` 0, `diagnostics.patches().pauses` = one entry
    per open tab plus one per tab with a session (`{6, 6}` measured
    with four tabs and two sessions), no dead-object burst. The pane:
    the two rows under *Use one speed everywhere*, bound to the four
    prefs; writes through the number inputs and the checkboxes reach the
    prefs; the `?` tooltips open. By ear only: the pacing at 1× and 2×.
