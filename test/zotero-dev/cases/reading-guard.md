[Checklist index](../README.md) · [Scripts](../scripts/reading-guard/README.md)

## The reading guard (issues #11, #71, #80)

Item 3.9 of the checklist, under its original number.

### 3.9

9. **The reading guard** (issues #11, #71). `diagnostics.players()` →
   per reader `{itemID, open, popupOpen, active, paused, popupInDom}`;
   `open` is `popupOpen || active` (paused counts, and so does a popup
   that has not started), and `paused` is `null` while `open` is false,
   since a manager that never ran reads `paused: true`. No player open:
   every reader `open`, `popupOpen`, `active`, `popupInDom` false. A
   session in tab A (script-started and mute is fine — the guard reads
   flags, not audio): `open: true, popupOpen: true, active: true,
   paused: true, popupInDom: true`. The popup goes up before the manager
   activates (~10 ms against ~1 s on a first open), and both count.
   Each of the five refusals — a provider's Enable/Disable
   (`#ztts-enable-<id>`), *Offer only favorite voices*
   (`#ztts-favorites-only`), a ♥ while only favorites are offered, a
   restore from a file or from WebDAV — opens `#ztts-notice`, an
   `html:dialog` of the pane's own document, within ~10 ms of the
   click: children `[style, div, div, div]`, the title strip
   `Zotero-TTS`, `⚠️`, a bold lead `Read Aloud is open in a tab:` — or
   `… in N tabs:` — one `  • <item title>` line per tab, a blank line,
   then `Stopping it there lets this change through; each tab keeps its
   place, and Read Aloud picks up there when you start it again. Or
   close the player in that tab yourself, then try again.` (`those
   tabs` in the plural). The last div holds exactly two buttons,
   `["Stop reading and continue", "Cancel"]`, and
   `document.activeElement` is Cancel.
   **The buttons' box** (issue #80). Zotero's
   `chrome://zotero/skin/preferences.css` caps every button of the
   settings window at `max-height: 25px` on macOS, and its type selector
   carries no `@namespace`, so it reaches an `html:button` too. Per
   button, `getBoundingClientRect()` against a `Range` over its contents
   (`selectNodeContents`; `off` = label-box center − button-box center,
   positive is low): at the pane's 13 px font a border box of
   **23.33 px** — inside the cap, which therefore never binds —
   `clientHeight` **19** and `scrollHeight` **19** (nothing overflows),
   computed `max-height` still `25px` and `appearance` still `auto`, and
   the label at gapTop **2.67**, gapBottom **4.67**, **off −1.00 px**,
   which is where the window's own native buttons sit (Zotero's *Test
   connection*: −0.50). The old `padding: 5px 14px` asked for 31.33 px,
   was clamped to 25, and drew the label at **+2.17**. By eye, on a
   screenshot of the button row: the macOS **rounded pill**, not the
   square bevel the theme falls back to above 25 px, and no descender
   clipped — the `p` of *Stop*, the `g` of *reading*.
   **The centering holds when the cap does bind.** On the live dialog
   `btn.style.paddingBlock = '5px'` takes the natural height back to
   31.33 px and the cap clamps it: computed `height` **25px**, gapTop
   **3.5**, gapBottom **5.5**, **off −1.00**, `clientHeight` and
   `scrollHeight` 21. That is the flex centering doing the work — inert,
   it would give the old 6.67 / 2.33 / **+2.17**, Gecko leaving an
   overflowing button's content at the top of its content box.
   `btn.style.paddingBlock = ''` returns every number to the paragraph
   above. This is the check that a larger Zotero UI font, where the line
   alone outgrows the cap, is still centered.
   **Cancel** — the button, a trusted Enter on it, or a trusted Escape
   (`keydown()` 0: Gecko's own dialog cancel): the dialog leaves the DOM
   within ~150 ms, the pref is unchanged, the unbound checkbox snaps
   back to the pref, a provider button keeps its label and its result
   line, `players()` is unchanged.
   **Stop reading and continue**: within ~200 ms the dialog goes, every
   open player closes — `open`/`popupOpen`/`active` false for each — and
   the setting is written in the same turn, no second click. The write
   is the row's own: `favoritesOnly` flips, a ♥ appends to
   `readAloud.favoriteVoices` and the glyph repaints, `<id>.enabled`
   flips and the button's label with it. With nothing open, none of the
   five asks anything: no dialog, the write goes straight through.
   `diagnostics.players(true)` runs that same `stopAll()`: `before` the
   open ones, `stopped` their itemIDs, `after` sampled at once —
   `popupInDom` **still true**, the element leaves on React's next
   render — and `later` at +1 s with `popupInDom` false.
   On a provider the guard asks **twice**: before the click's write, and
   again after a connection check that passed (Local's takes ~700 ms;
   another provider's may take 15 s). Open a session while the check
   runs — the click and `toggleReadAloudPopup(true)` in one script, no
   await between them — and the second dialog appears when the check
   lands. Stop there **keeps the check**: the result line still reads
   `Connected. N voices available. …` and the pref is written; Cancel
   there clears the line and drops the outcome.
   Unit-tested, not driven live (`test/ui/reading-guard.test.ts`,
   `test/read-aloud/player-stop.test.ts`): the two restores (a file
   picker and an OS confirm need a human), the `confirmEx` fallback
   where `showModal` is unavailable, and a player that refuses to close
   (the change stays refused, the OK-only notice names what is left).
   Reopening a stopped tab's player restores Zotero's saved place — one
   segment before where the manager stood, on a PDF, and on a
   never-played session that compounds one per close/reopen cycle
   (measured 2026-09-08: 4 → 3 → 2 → 1 → 0, the stored rect moving with
   it). That is the resume path, the same on the headphone button, not
   the guard — item 5.3's ground.
   **State**: Stop closes every open player in the profile, the user's
   own included — run it with none of theirs open, or with their
   consent; a script-reopened player is mute, so nothing restores them
   but the headphone button. A fixture session on an `en` document
   rewrites `reader.readAloudVoices` (`en.voice`, `en.tierVoices.local`):
   snapshot it before and rebuild it after.
