[Checklist index](../README.md) · [Scripts](../scripts/decomposed-text/README.md)

## Text stored decomposed (issue #74, 1.11.3)

Items 3.16–3.18 of the checklist, under their original numbers.

### 3.16

16. **A document stored decomposed keeps its highlight** (issue #74,
    1.11.3). `test/fixtures/ro-diacritics/ro-diacritics.epub`, imported as
    a standalone attachment: three paragraphs of the same Romanian
    sentences, stored comma-below precomposed, cedilla precomposed and
    NFD (`s U+0326` for ș, `a U+0306` for ă). Azure-Alina, granularity
    `word`, reading inside the third paragraph. Check:
    `diagnostics.highlight()` on the view and
    `view._getSpotlightColor('ReadAloudActiveSegment')` through the
    primary view. Expected: the word color (`#3478f6b3` at the default
    alpha), `sentenceSlot: "empty"` — on an EPUB at Word the pieces
    carry the sentence and Zotero's own slot is cleared on purpose;
    `"ours"` is the PDF path's value — with `sentencePieces` holding a
    head and a tail; a screenshot with the word lit inside the sentence,
    as on the first two paragraphs. Was: `#00000000` and
    `sentencePieces: false`, nothing drawn at all — the patch compared
    Zotero's NFC segment text with the DOM's own form by `===`.

### 3.17

17. **The transparent primary clears when Word is left** (issue #74).
    With the popup still open on that EPUB, set
    `extensions.zotero.reader.readAloud.highlightGranularity` to
    `sentence`. Check: `view._getSpotlightColor('ReadAloudActiveSegment')`
    on the next segment. Expected: the sentence color (`#ffff00b3` at the
    default). The flag clears on the next state push, so a paused manager
    still reads `#00000000` right after the pref write. Was: `#00000000`
    until the popup was closed and reopened.

### 3.18

18. **Azure word timestamps survive every Romanian encoding.** The same
    fixture, all three paragraphs, and `ro-diacritics.pdf` beside it
    (PDF.js hands its text decomposed). Check: the `[zotero-tts] azure: N
    word timestamps for M chars` line per segment against the segment's
    word count. Expected: N equals the word count for every segment —
    the title's 2, then 8/13/9/12, 7/13/9/12 and 8/13/9/12 per
    paragraph, in the EPUB and in the PDF (the PDF's char counts are
    larger) — and no `no word timestamps` line for
    Alina: Azure echoes back the form it was sent, so the alignment
    matches in every encoding.
