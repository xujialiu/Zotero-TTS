---
status: accepted
date: 2026-09-25
issue: 142
---

# The paragraph pause is the whole pause, and a switch off means none

*The product argument — what this is for and what it gives up — is
[design 0008](../design/0008-one-number-one-pause.md).*

`computeGap` (`src/core/engine/gap.ts`) waits exactly one setting before the
next Segment: `readAloud.paragraphDelayMs` where the Segment's `anchor` is
`paragraphStart`, `readAloud.sentenceDelayMs` everywhere else, divided by the
speed and rounded to whole milliseconds. A setting whose switch
(`…Enabled`) is off gives 0. The four prefs keep their names, types,
defaults (on / 0, on / 200) and 0..5000 clamp, and no stored value is
converted.

This replaces the arithmetic of issue #44, which kept Read Aloud's: the
sentence part plus, before a paragraph, a paragraph part. There, a switch
that was off fell back to Zotero's own number for its part — the voice's
`sentenceDelay` from the catalog (`impl.sentenceDelay ?? 0`, reader.js
40464; 300 on Premium Voice 1-3 and 0 on the other 2264 voices listed on
2026-09-04), or `DELAY_PARAGRAPH`, 200 (reader.js 39296). Neither number
enters the gap any more: `ZOTERO_PARAGRAPH_MS` is gone, and `gapBefore`
takes no voice. The Session's `catch` around `gapBefore`
(`src/core/engine/session.ts`) still waits Read Aloud's own sum when the
settings cannot be read at all; that is the fallback for a broken read, not
a meaning of the switches.

## Why

- **One number, one pause.** Under the sum, the pause at a paragraph was
  two settings added up, shown on no row of the pane, and changing the
  sentence pause silently changed it. With the sentence switch off, a
  Premium Voice 1-3 paused 300 + 200 at a paragraph while every other voice
  paused 200.
- **The same numbers as the phone.** xujialiu/OpenReader#60 (its ADR 0047)
  reads the paragraph pause as the whole pause and plays one set below the
  sentence pause as set. The plugin now reads the same four numbers the
  same way, so a pair entered on both devices gives the same pauses. The
  phone has no switches; 0 is its off, which is what the plugin's switches
  now mean.
- **Off means off, for every voice.** The owner settled on 2026-09-25 that
  a switch off is 0 for both settings, rather than a return to Zotero's
  pacing. It also removes the last place where the catalog's
  `sentenceDelay` changed what a reader heard.

## Alternatives

- **The paragraph switch off returns Zotero's whole pause** — the voice's
  `sentenceDelay` plus 200, so 500 on Premium Voice 1-3 and 200 elsewhere,
  unscaled. Faithful to Read Aloud, but it keeps a voice-dependent pause
  behind a switch the owner wanted to mean "none". Turned down.
- **The paragraph switch off gives a flat 200.** Voice-independent, but a
  switch that turns a pause *off* into a fixed pause *on* reads wrong.
  Turned down.
- **Raise the paragraph pause to the sentence pause, or offer only values
  above it.** Turned down in OpenReader#60: the setting would silently do
  nothing in that range, or silently change when the sentence pause moves.
- **Convert stored values once** (paragraph += sentence where both are on).
  The defaults read the same under both meanings (sentence 0), so only a
  user with a non-zero sentence pause hears a difference: a shorter pause
  at a paragraph, fixed by entering the pause they want. A conversion would
  also have to recognize an old settings backup restored later, which
  carries no marker of which meaning it was written under.

## Consequences

- A Premium Voice 1-3 with the sentence switch off now runs sentence to
  sentence, where it used to pause 300 ms: the voice's catalog delay is no
  longer reachable from the pane.
- `diagnostics.engine()`'s `gaps.last.ms` is one setting ÷ speed or 0; the
  live checks are `test/zotero-dev/cases/sentence-pauses.md` and item 3 of
  `test/zotero-dev/cases/engine.md`.
