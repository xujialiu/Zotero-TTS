# Scripts: Word highlight on / off (issue #67, 1.11.6; issue #114, 1.12.11)

[Case](../../cases/word-highlight-key.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Since issue #114 this case's own item 4.10 is verified together with
[highlight-levels.md](../../cases/highlight-levels.md) (the key now works
the plugin's Word switch, not Zotero's pref directly) — the scripts that
ran for it live in [`../highlight-levels/`](../highlight-levels/README.md),
not here, since the two cases share fixtures A/B and the EPUB, the isolation
setup (`00`/`01`/`02`), and the trusted-press helper. This folder holds no
scripts of its own; a run of THIS case alone (without highlight-levels)
would still need equivalent setup and should start from that kit.

## Where each part of 4.10 was verified

| 4.10 part | Script (in `../highlight-levels/`) |
| --- | --- |
| The diagnostic (`highlightKey()` shape) | `11-shift-w-fixture-a.js` (`ret1`/`ret2`), `13-shift-w-picking.js` |
| PDF, playing (rect, position, controller identity, toast text and ~950 ms fade) | `11-shift-w-fixture-a.js` |
| Sentence off / Sentence on starting states | `11-shift-w-fixture-a.js` |
| Hand-edited profile, both prefs `false` | `12-shift-w-hand-edited.js` (settings window closed first — `11`'s own attempt was contaminated by a resident pane watcher, see that kit's Limits) |
| EPUB, playing (spotlight color) | `13-shift-w-picking.js`, read via `_getSpotlightColor` since the EPUB's audio never actually advances in this environment (see `../highlight-levels/README.md` Limits) |
| Paused, both documents | `11-shift-w-fixture-a.js` (fixture A); the EPUB's paused state is exercised throughout `08-sentence-switch.js` of the same kit |
| No active segment | `14-no-active-segment.js` |
| Idle reader | `13-shift-w-picking.js` |
| Library tab, nothing speaking | `13-shift-w-picking.js` |
| Two tabs | `13-shift-w-picking.js` |
| A voice without word timing | `15-mai-voice-no-timing.js` |
| The recorder row | `16-restore-defaults-and-recorder.js` |

## Limits

- **The library-tab press returned `keydown() = 2`, not the `0` this case
  states** (`13-shift-w-picking.js`, `libRet`), though every OBSERVABLE
  effect matched: the switches and Zotero's pref were untouched and no
  toast appeared in the chrome document. `2` most likely comes from
  Zotero's own item-tree quicksearch-by-letter handling a bare `W`
  keystroke while the library pane has focus (a Zotero behavior, not this
  plugin's), rather than from the highlight shortcut itself — a later
  press in the SAME run, with a reader focused and its shortcut cleared,
  correctly read `0` (`16-restore-defaults-and-recorder.js`,
  `clearedPressRet`). Not chased further; flagged here so the case's `0`
  is read as "not consumed by us", not literally zero on every profile.
- See [`../highlight-levels/README.md`](../highlight-levels/README.md)'s
  own Limits for the `selectVoice()`, EPUB-audio, resident-settings-pane,
  `data-l10n-id`-vs-`id`, `_activeSegment` and `one()`-timing findings that
  apply equally here.

## Runs

- **2026-09-16, 1.12.11-beta3, Zotero 10.0.3-beta.1+cfec88e31**: all of
  4.10 PASS (library-tab `keydown()` value NOT TESTABLE as literally `0`,
  see Limits — its observable effects PASS). Full table on this run's
  reply (issue #114 verification), scripts and state in
  `../highlight-levels/`.
