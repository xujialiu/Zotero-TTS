[Checklist index](../README.md)

## 2. The voice browser, favorites, the default voice

1. **The listing.** The status line leaves `Listing voices…` (the open
   and the poll in one script); the tier column with counts; under Local
   every voice labeled `Azure-`, `Kokoro-`, `System-` or `OpenAI-`
   (`pluginVoiceLabel`, `src/read-aloud/voice-catalog.ts`) and none of
   Zotero's own Windows voices bare (`Microsoft David`); `Multiple
   languages` first in Local's language column; `diagnostics.languageColumn()`
   equal to the DOM column entry for entry. The language column is never
   trimmed by favorites-only (derive from `voice-browser-rows.ts`).
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
3. **Only a favorite can be the default** while only favorites are
   offered: a non-favorite row is refused silently (grayed, `BLOCKED_ROW_TITLE`),
   the memory unchanged; a favorite row makes the default (memory
   `{id, lang}`, the status line names it, Zotero's entry for its
   language gains it); the default row clicked again clears it
   (`Zotero's own choice per language`).
4. **Hearts.** ♥ appends to `readAloud.favoriteVoices`, un-♥ removes;
   an un-♥ and re-♥ reorders the pref (append) — parsed-equal, not
   byte-identical, by design. The Local list itself does not change.
5. **Offer only favorite voices, both ways.** The switch off clears the
   status line's not-a-favorite warning and unblocks every row; on
   again blocks them. **Since 1.10.2 the switch refuses to go on while
   the default is not a favorite** — the notice names the voice and the
   two ways out (`src/ui/voice-list-switches.ts`), the pref stays false.
6. **Samples.** ▶ on a Kokoro voice, on a System voice (on a profile
   that keeps the provider off, enable it through the pane's switch for
   the item and disable it after — the switch's own check and the Local
   tier's 787 ↔ 796 relisting prove it came and went, 2026-09-06) and on
   a Zotero voice: glyph `▶` → `…` → `■` → `▶` within ~10 s, and the
   status line
   says how it ended (issue #48): with audio, no `Sample failed:` — the
   default line stays; on a machine with no audio sink the element
   errors ~7 ms after `playing` (`MediaError.code` 3,
   `OnMediaSinkAudioError`) and the line reads `Sample failed: the audio
   arrived, but playback stopped: decoding or output failed
   (OnMediaSinkAudioError)`. A `■` that comes back with the default line
   intact and nothing heard is the swallowed error, the bug itself. A
   failure before playback starts (synthesis, a blob the element refuses)
   still reads `Sample failed: <reason>`, without the "audio arrived"
   clause. `diagnostics.sampleSpeed()` → `startingSpeed` the memory's
   speed, `playing.playbackRate` 1.5, `preservesPitch` true,
   `afterSetRate` 2, and `outcome`: `ended` with audio, `error: decoding
   or output failed (OnMediaSinkAudioError)` without a sink; `neither
   ended nor failed within 3 s` is a stall to report.
   **Switching** (issue #61, 1.11.1): the clicks and a 25 ms poll of
   every row's glyph in ONE script, with the window's
   `HTMLMediaElement.prototype.play`/`pause` timed (waive the Xrays,
   number the elements through a WeakMap, restore in `finally`). With a
   sample playing, ▶ on another voice: in the click's own task the
   playing row is `▶` and the new one `…`, and the playing element's
   `pause()` is stamped 0–2 ms after the click at a `currentTime` below
   its duration; the pair (old `■`, new `…`) is never seen; the new row's
   `■` and its element's `play()` come with its fetch (0.3–1 s for a
   Zotero sample), or at the first poll when the sample is cached
   (`pause` at 1 ms, `play` at 4 ms). ▶ on a third voice while one
   loads: the loading row `▶` and the third `…` in that click's task, no
   `play()` when the superseded fetch lands, and a later ▶ on it is `■`
   in its own task — the arrival was cached. ▶ on the loading row itself:
   `▶` at once, nothing when its fetch lands. ▶ on a cached voice while
   another loads: the loading row `▶` and this one `■` in the same task,
   on a new element. Two cached rows clicked in one task: exactly one
   `play()`, on the second's element, and the first's element has no
   `src`; 5 ms apart, the first's `play` is followed by its `pause` and
   only the second's element is unpaused at its `■`. At every snapshot
   at most one row is `…` or `■`, and the status line never reads
   `Sample failed:`. A sample arriving after the window closed is not
   observable here (the prototype wrapper dies with the window); the
   unit test covers it. That the old voice falls silent at the click is
   the user's to hear.
7. **The speed slider.** `input` moves only the sample rate; `change`
   commits: memory `speed`, every `reader.readAloudVoices.<lang>.speed`,
   the status line's `N×` — and back, byte-identical after the round
   trip.
8. **The ♥ in the player's own list** (issue #45, 1.10.9). With *Offer
   only favorite voices* **off** and at least one voice under the
   reading language marked: one `style#ztts-favorite-marks` in the
   reader document's `head` — put there when the reader opens, before
   any popup — holding one 38 px gutter rule plus one rule per
   favorite. Open the popup, open the voice dropdown (behind the
   player's **Options** button), and read
   `getComputedStyle(row, '::after').content`: `"♥"` at
   `rgb(224, 36, 94)` on a marked row, `none` on an unmarked one, and
   the marked row's `.label` `textContent` the plain `Provider-voice`
   label — the mark is CSS, never the label. Zotero's own ✓ is
   `::before` at `inset-inline-start: 5px` on the same row and the two
   do not collide. `diagnostics.favoriteMarks()` for that reader:
   `present` true, `rules` the number of favorites, `options` the rows
   the open dropdown holds, `matched` the favorites **among those
   rows** — not `rules`, since a favorite under another language is not
   listed (measured: 14 of 18, the four multilingual ones sitting under
   *Multiple languages*). `matched` 0 with `options` above 0 is the id
   scheme having moved, which is the one way this fails silently; 0
   with the dropdown closed is expected, Zotero renders the list only
   while it is open. Then, with the dropdown still open, write a ♥ away
   and back: the row's `::after` follows **inside `Zotero.Prefs.set`**,
   same node, same id, same label, no popup reopen and no reading guard
   — the only setting that may be changed while a tab reads, since the
   ids Zotero holds do not move. The switch **on**: the stylesheet's
   text is empty, `rules` 0, the element still in place, the rows back
   to Zotero's 22 px. Once per Zotero update the run has to see a
   **Zotero-tier** favorite marked (their ids carry no `::`; reach the
   tier with `selectTier('standard')` and never `selectVoice` it) and
   to re-measure the gutter: with the stylesheet emptied and restored,
   row height, dropdown width, `scrollWidth` and `scrollHeight` were
   identical (24 / 284 / 282 / 874) and no label was clipped, so the
   16 px cost nothing but the indent. Windows, 2026-09-05: 24 / 284 /
   282 / 1042 (86 rows; 81 on 2026-09-06 — the row count is the list's,
   not an expectation), the widest label 199.88 px in the 234 px left
   to it, the same both ways.

9. **Cloudflare's voices in the browser** (1.11.3, issue #72). With the
   provider on, the Local tier grows by exactly 66 (787 → 853 on Windows,
   2026-09-07; the base is the profile's). Rows labeled `Cloudflare-`,
   by language entry: English (United States) 45, English (United
   Kingdom) 4, English (Ireland) 1, English (Australia) 2, English
   (Philippines) 1, Spanish (Mexico) 3, Spanish (Spain) 4, Spanish
   (Colombia) 1, Spanish (Latin America) 2, Chinese 1, Japanese 1,
   Korean 1 — 66, and none under Multiple languages. Labels read
   `Cloudflare-Aura-1 Angus (male)`, `Cloudflare-Aura-2 Amalthea
   (female)`, `Cloudflare-MeloTTS Chinese`. One sample of
   `Cloudflare-MeloTTS Chinese` → `audio/wav` (MeloTTS is uncompressed,
   about 88 KB per second: 216 422 bytes for 2.45 s), the glyph
   `▶` → `…` → `■` → `▶` within about 2.2 s, no `Sample failed:`; one
   sample of `Cloudflare-Aura-1 Angus (male)` → `audio/mpeg`, 17 084
   bytes for 2.85 s. **Two samples only**: Aura bills per character
   (about 1.4 Neurons on aura-1, 2.7 on aura-2, of 10,000 free a day),
   MeloTTS per second of audio.

10. **Speechify's voices in the browser** (1.11.7, issue #79). With the
    provider on, the Local tier grows by exactly **992** (700 → 1692 on
    macOS, 2026-09-09; the base is the profile's), every row labeled
    `Speechify-`; off again, none. By language entry: English (United
    States) 84, English (United Kingdom) 37, French (France) 51,
    Japanese 44, Korean 36, Cantonese 10, and **none** under Multiple
    languages or Chinese — every voice carries one locale, and Mandarin
    is not among them. Labels read `Speechify-George (male)`, and where
    a name and gender repeat the id follows: `Speechify-Dominic (male,
    dominic)` beside `Speechify-Dominic (male, dominic_32)`, likewise
    Edmund, Geffen and Harper. **One sample only** — the account is on
    the Free plan, 50,000 characters a month: `Speechify-George (male)`
    → `audio/mpeg`, 29 229 bytes for the 52-character sample (64 kbps
    MP3), the glyph `▶` → `…` → `■` → `▶` within about 3.8 s, no
    `Sample failed:`.
