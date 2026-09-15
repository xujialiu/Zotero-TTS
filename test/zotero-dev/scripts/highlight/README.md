# Scripts: The highlight and its colors

[Case](../../cases/highlight.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

The issue #114 slice of this case — item 3.5's `style` field now carrying
all six `zotero-tts.highlight.*` prefs, and item 5.5's Sentence-switch
timing rule ("a paused session keeps its sentence until it resumes") — was
verified together with
[highlight-levels.md](../../cases/highlight-levels.md), whose kit already
had fixture A open, playing, on a real-word-timing voice. That script is
`08-sentence-switch.js` in
[`../highlight-levels/`](../highlight-levels/README.md); this folder holds
no script of its own for it. The rest of this case (`patched`,
`sentenceSlot`, `activeWordTimestamp`, the screenshot, the attach-on-open
behavior of 3.5; the color-live and Restore-default-colors behavior of 5.5
beyond the Sentence switch) was outside this run's brief and is not
claimed here — see the case file's own history for when those last ran.

## Where each part was verified

| Item | What `08-sentence-switch.js` shows |
| --- | --- |
| 3.5's `style` | `before.style` — all six keys (`wordColor`, `wordAlpha`, `sentenceColor`, `sentenceAlpha`, `sentence`, `word`), read through `diagnostics.highlight()[reader].style`, which is `loadSettings(prefs).highlight` itself, not the narrower `HighlightStyle` TypeScript shape (that type only names `sentence`; `word` is carried at runtime because the settings object has it) |
| 3.5's `sentenceSlot: "ours"`, `activeWordTimestamp: "real"` | `before.view.sentenceSlot` and (via the same reader's `wordTiming` in `highlightLevels()`, cross-checked in `06-word-switch.js`) `"real"` |
| 5.5's Sentence-switch timing | `rightAfterFlip` (same script as the flip: `style.sentence` already `false`, but `sentenceSlot` still `"ours"` — unmoved) vs. `afterPush` (350 ms later, still playing: `sentenceSlot: "empty"`, slot `null`) — the exact "next state push" gap the case describes |

## Limits

- Only the `style` field and the Sentence-switch's "next push" timing were
  in scope this run. `patched`, `awaitingPage`, the attach-on-open
  behavior, the `highlight: effective granularity null` log line, and the
  screenshot are unclaimed here — fixture A was closed at this run's
  cleanup before any of those were considered.
- See [`../highlight-levels/README.md`](../highlight-levels/README.md)'s
  Limits for what applies equally to any script touching these fixtures
  (the EPUB's audio, `selectVoice()`, the resident settings pane).

## Runs

- **2026-09-16, 1.12.11-beta3, Zotero 10.0.3-beta.1+cfec88e31**: 3.5's
  `style` field and 5.5's Sentence-switch timing rule, both PASS. Full
  table on this run's reply (issue #114 verification); the script is
  `../highlight-levels/08-sentence-switch.js`.
