[Checklist index](../README.md) · [Scripts](../scripts/voice-browser/README.md)

## The voice browser: the listing, the default voice and speed

Item 1.9 is Zotero's own voices as the plugin's sandbox lists them for
the browser.

Items 1.9, 2.1, 2.2 and 2.7 of the checklist, under their original numbers.

### 1.9

9. **Zotero's own voices from the sandbox.** `diagnostics.zoteroVoices()`
   → `voices` > 0 with `tiers` counts matching the browser's columns,
   the `favorites` split, `sample.bytes` > 0.

### 2.1

1. **The listing.** The status line leaves `Listing voices…` (the open
   and the poll in one script); the tier column with counts; under Local
   every voice labeled `Azure-`, `Kokoro-`, `System-` or `OpenAI-`
   (`pluginVoiceLabel`, `src/read-aloud/voice-catalog.ts`) and none of
   Zotero's own Windows voices bare (`Microsoft David`); `Multiple
   languages` first in Local's language column; `diagnostics.languageColumn()`
   equal to the DOM column entry for entry. The language column is never
   trimmed by favorites-only (derive from `voice-browser-rows.ts`).

### 2.2

2. **Where it opens, how the default is marked.** `diagnostics.defaultVoice()`
   → `memory`, the default's `rows`, `opensOn`; the pane's selected tier
   and language, the default row painted with `ROW_DEFAULT_STYLE` and
   the `DEFAULT_ROW_TITLE` tooltip. Both columns open scrolled to the
   selection (issue #33): for `#ztts-voices-locales` with its selected
   entry and `#ztts-voices-list` with the default row, the entry's
   `offsetTop` lies within `[scrollTop, scrollTop + clientHeight]`, and
   `scrollTop` is above 0 where the default sits deep in its language
   (the Kokoro default under English (United States) does). A visible
   row clicked leaves its column's `scrollTop` as it was. A language
   clicked opens the voice list anew: `scrollTop` 0 for a language
   without the default, whatever the previous list's scroll, and the
   default row centered again on the click back to its language. The
   diagnostic's `status` is the pane's line:
   equal, byte for byte, to `#ztts-voices-status`'s `textContent` read in
   the same script — with the not-a-favorite warning on it (2.5), and
   with a provider's listing trouble after the dash when one fails;
   `problems` is that trouble, `favorite` whether the default is marked
   (issue #32).

### 2.7

7. **The speed slider.** `input` moves only the sample rate; `change`
   commits: memory `speed`, every `reader.readAloudVoices.<lang>.speed`,
   the status line's `N×` — and back, byte-identical after the round
   trip.
