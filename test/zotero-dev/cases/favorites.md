[Checklist index](../README.md) · [Scripts](../scripts/favorites/README.md)

## Favorite voices

Hearts, *Offer only favorite voices*, the default it allows and the ♥ in
the player's list.

Items 2.3–2.5 and 2.8 of the checklist, under their original numbers.

### 2.3

3. **Only a favorite can be the default** while only favorites are
   offered: a non-favorite row is refused silently (grayed, `BLOCKED_ROW_TITLE`),
   the memory unchanged; a favorite row makes the default (memory
   `{id, lang}`, the status line names it, Zotero's entry for its
   language gains it); the default row clicked again clears it
   (`Zotero's own choice per language`).

### 2.4

4. **Hearts.** ♥ appends to `readAloud.favoriteVoices`, un-♥ removes;
   an un-♥ and re-♥ reorders the pref (append) — parsed-equal, not
   byte-identical, by design. The Local list itself does not change.

### 2.5

5. **Offer only favorite voices, both ways.** The switch off clears the
   status line's not-a-favorite warning and unblocks every row; on
   again blocks them. **Since 1.10.2 the switch refuses to go on while
   the default is not a favorite** — the notice names the voice and the
   two ways out (`src/ui/voice-list-switches.ts`), the pref stays false.

### 2.8

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
