[Checklist index](../README.md)

## The Sentence and Word switches (issue #114, 1.12.11)

The settings pane's **Highlight** section holds two switches of the
plugin's own, one per level, each the label of its color's row: **Sentence**
above **Word**, both on by default, never both off — the last switch still
on is greyed. Both on: the word being spoken in the word color with its
sentence in the sentence color under it; Sentence only: the sentence; Word
only: the word alone. There is no paragraph level. The old *keep the
sentence highlighted too* switch is gone, its job the Sentence switch's;
everyone starts with both on at the upgrade. Zotero still draws the
highlight, so its own pref `reader.readAloud.highlightGranularity` is
**pinned** to the switches — `word` while Word is on, `sentence` otherwise
— written at startup, on a switch change, and written back inside its own
observer whenever anything else writes it (`src/core/highlight-pin.ts`);
Zotero's per-reader observer repaints every open tab inside that write.
Zotero's own **Highlight current** menulist (Settings → General → Read
Aloud) is greyed with a hint while the plugin runs
(`src/ui/zotero-highlight-menu.ts`). `Shift+W` works the Word switch;
turning it off with Sentence off turns Sentence on in the same press
(`src/core/highlight-level.ts` `toggleWord`); its toast names what is
highlighted now. The sentence under the word stays the plugin's own
drawing, now read from the Sentence switch (`src/read-aloud/highlight-style.ts`
`style.sentence`).

Run the baseline first. Fixtures: `fixture-a.pdf` and the return-key EPUB
("ZTTS Return-Key EPUB", in the library since 2026-09-08), read on a voice
with real word timing (`Azure-en-US-ChristopherNeural`, as 4.10 did) and,
for item 8, one without (`azure::en-US-Ethan:MAI-Voice-2`, its audio
cached). No reading guard applies — a switch may be used while a tab reads
— so the owner's paused player may stay; it repaints with every open tab,
which is the feature. The sandbox diagnostic is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels())`; a
`preference=`-bound checkbox is driven by setting `checked` and dispatching
`command`. **Record Zotero's `reader.readAloud.highlightGranularity` and
the two switch prefs before the run**: the switches go back to no user
value at the end (`Zotero.Prefs.clear`), and Zotero's pref cannot hold
anything but the pinned value while the plugin runs, so the report names
what it held before and what it holds after. Expected values below come
from the design and the diagnostics the build carries; the first run
corrects them.

1. **The section.** Edit → Settings → Zotero-TTS → Highlight, after the
   auto-scroll rows: an hbox with `checkbox#ztts-highlight-sentence`
   (label `Sentence`, zh-CN `句子`), `input#ztts-highlight-sentenceColor`,
   the `Opacity (%)` label, `input#ztts-highlight-sentenceAlpha` and a `?`
   (`ztts-help-highlight-switches`) whose tip opens at once (`ztts-help-tip`
   `state: "open"`) reading "Both on: the word being spoken in its color,
   with its sentence in the sentence color under it. One off: only the
   other is highlighted, and the last one on cannot be turned off. A voice
   without word timing highlights the sentence either way. Zotero's own
   Highlight current setting follows this choice and cannot be changed
   there."; below it the same hbox for `checkbox#ztts-highlight-word`
   (`Word` / `单词`) with `ztts-highlight-wordColor` / `ztts-highlight-wordAlpha`.
   No element with `sentenceUnderWord` in its id or `preference`, no
   `#ztts-highlight-preview-sentence`; `#ztts-highlight-preview` holds one
   line whose spans are `ztts-highlight-preview-word-before`, `-word` and
   `-word-after`. Both checkboxes `checked`, neither `disabled`, no color or
   opacity input `disabled`; the prefs `zotero-tts.highlight.sentence` and
   `zotero-tts.highlight.word` read `true` with no user value;
   `zotero-tts.highlight.sentenceUnderWord` has no user value
   (`Services.prefs.prefHasUserValue` `false`). Its *value* reads
   `undefined` only after a Zotero restart: an in-place reinstall never
   unregisters the default the previous build's `prefs.js` declared, so
   until then it still reads that default, `true` (measured 2026-09-16).
2. **The diagnostic.** `highlightLevels()` → `switches: { sentence: true,
   word: true }`; `pin: { started: true, wanted: "word", zotero: "word",
   pinned: true, snapped: N }` (`N` counts the foreign writes undone since
   the plugin started — 0 on a fresh start, and it grows only in items 6
   and 7); `menu: { started: true, windows: [...] }` with one entry per
   open Zotero settings window, `{ found: true, disabled: true }` once its
   General pane has loaded; `readers[]` one per open reader, `{ itemID,
   state: "word", wordTiming: "real" | "stand-in" | "none" }`, `state`
   equal to the reader's own
   `_internalReader._state.readAloudState.highlightGranularity`.
   `Zotero.Prefs.get('reader.readAloud.highlightGranularity')` = `"word"`.
   `diagnostics.startup()` lists the step `highlight levels` with `ok:
   true`, right before `highlight colors`.
3. **Startup pins the pref and drops the old switch.** On the *previous*
   build (1.12.11-beta2, no pin), write
   `Zotero.Prefs.set('reader.readAloud.highlightGranularity', 'paragraph')`
   and `Zotero.Prefs.set('zotero-tts.highlight.sentenceUnderWord', false)`,
   then install this xpi in place. Afterwards Zotero's pref reads `word`,
   `pin.snapped` is `0` (the startup write is an apply, not a snap), every
   open reader's `state` is `word`, and the old switch's pref has no user
   value any more (`Services.prefs.prefHasUserValue` `false`; its value
   still reads the previous build's default `true` until a restart, item
   1). A tab open across the upgrade draws at `word` — Zotero's observer
   fired inside the startup write. A settings window open on General
   across the install is greyed by the new instance (item 8).
4. **The switches drive the screen — Word.** Fixture A playing on
   ChristopherNeural, the pane open on Highlight. Uncheck **Word**: in the
   same script, `zotero-tts.highlight.word` `false`,
   `zotero-tts.highlight.sentence` `true`, `pin.zotero` `"sentence"`, every
   reader's `state` `"sentence"`, the PDF's
   `_primaryView._readAloudHighlightedPosition` gone from one word rect
   to the segment's rects — the widths follow the segment on screen
   (18–54 pt for a word and 150 pt and wider for the segment on
   2026-09-16, 14–20 against 106–361 on 2026-09-08), so read them as a
   narrow rect against wide ones — `_position` unchanged, the word index
   still advancing, the controller the same object; the preview's
   `#ztts-highlight-preview-word` `style` is the sentence style (the same
   `background-color` as `-word-before`); `#ztts-highlight-sentence`
   `disabled="true"`, `ztts-highlight-wordColor` and `-wordAlpha`
   `disabled`; the sentence row's inputs enabled. Check **Word** again:
   `word` everywhere, one word rect, nothing `disabled`. Paused, the same
   flip repaints the same way with `paused` true throughout (4.10). EPUB
   playing: the `ReadAloudActiveSegment` spotlight between one word
   (`#3478f6b3`) and the whole segment (`#ffff00b3`).
5. **The switches drive the screen — Sentence.** Both on, fixture A
   playing. Uncheck **Sentence**: `zotero-tts.highlight.sentence` `false`,
   `pin.zotero` stays `"word"`, the readers' `state` stays `word`;
   `diagnostics.highlight()` for the PDF view reports `style.sentence:
   false`, and at the next state push (a word onset while playing, ≤ ~115
   ms) `_readAloudSentenceHighlightedPosition` is `null` and the word rect
   is drawn alone — the sentence's pieces are gone (checklist 5.5's rule:
   a paused session keeps its sentence until it resumes); `ztts-highlight-word`
   `disabled="true"`, `ztts-highlight-sentenceColor` / `-sentenceAlpha`
   `disabled`; the preview's `-word-before` and `-word-after` `style` empty.
   EPUB: the `ReadAloudActiveSentence` slot and the `ZoteroTTSSentenceHead`
   / `Tail` spotlights absent after the next push. Check **Sentence**
   again: the pieces are back at the next push, nothing `disabled`.
6. **Never both off.** With Sentence unchecked, the Word checkbox is
   `disabled` — a click cannot uncheck it. A script writing
   `Zotero.Prefs.set('zotero-tts.highlight.word', false)` with the pane
   open then reads `highlightLevels().switches` = `{ sentence: true, word:
   false }` and `zotero-tts.highlight.sentence` `true` (the pane's refresh
   writes it back on), `pin.zotero` `"sentence"`, and the Sentence checkbox
   checked and `disabled`. With the pane closed the same write leaves the
   two prefs `false`, but `switches` still reads `{ sentence: true, word:
   false }` and Zotero's pref `sentence` — both off reads as the sentence
   everywhere. Restore both to `true` afterwards.
7. **Zotero's pref is pinned.** Both on. In one script,
   `Zotero.Prefs.set('reader.readAloud.highlightGranularity', 'paragraph')`
   followed by `Zotero.Prefs.get(...)` — the get already returns `"word"`
   (the snap lands inside the write); `pin.snapped` one higher; every
   reader's `state` `"word"`; nothing in the error console. The same with
   `'sentence'`. With Word off (pinned `sentence`), a foreign `'word'` snaps
   to `sentence`. A write of the pinned value itself changes nothing and
   counts nothing.
8. **Zotero's menulist is greyed.** Open Edit → Settings on its General
   pane: `#read-aloud-highlight-granularity-menulist` has `disabled="true"`
   and `tooltiptext` `Chosen in Zotero-TTS's settings, under Highlight`
   (zh-CN `在 Zotero-TTS 设置的“高亮”一节里选择`), its `value` the pinned
   level; `menu.windows` holds `{ found: true, disabled: true }`. A window
   opened on the Zotero-TTS pane first reads `{ found: false, disabled:
   false }` until General is shown, then `true` (the MutationObserver
   route). A settings window open on General *across* the in-place install
   of item 3 is greyed by the new instance too. Closing the window drops
   its entry from `menu.windows`. Forcing the choice through the binding —
   `menulist.value = 'sentence'` and a `command` event — writes the pref,
   the pin writes it back inside the write, and the menulist's `value`
   reads `word` again.
9. **`Shift+W`.** Trusted presses as 4.10 (`nsITextInputProcessor` on the
   chrome window, the event from `reader._iframeWindow.KeyboardEvent`).
   From both on: a press → `word` `false`, `sentence` `true`, Zotero
   `sentence`, the toast `Highlight: sentence` (zh-CN `高亮：句子`) for
   ~950 ms; a press → both `true`, Zotero `word`, the toast `Highlight:
   word and sentence` (`高亮：单词和句子`). From Sentence off and Word on:
   a press → `{ sentence: true, word: false }`, the toast `Highlight:
   sentence`. From Sentence on and Word off: a press → both on. On the MAI
   voice with Word coming on: the long toast `Highlight: word (this voice
   has no word timing, so the sentence stays highlighted)` for ~5 s, the
   view's `granularity` still `sentence` with `activeWordTimestamp:
   "stand-in"`. `diagnostics.highlightKey(true)` reports `levels` (the
   pair set), `after.switches` equal to it, `after.pref` the pinned level
   and every reader's `after.readers[].state` at it in the same call, and
   `toast` the text. The rest of 4.10 — the library tab, the idle reader,
   two tabs, the recorder row — runs under 4.10 with its new expectations.
10. **Restore default colors.** With Sentence unchecked and a color
    changed, the button writes the six `zotero-tts.highlight.*` prefs back
    (`wordColor` `#3478f6`, `wordAlpha` `70`, `sentenceColor` `#ffff00`,
    `sentenceAlpha` `70`, `sentence` `true`, `word` `true`): both
    checkboxes checked and enabled, the preview both colors, Zotero `word`.
11. **A plugin reload** (`zotero_plugin_reload`): afterwards `pin.started`
    `true`, Zotero's pref still `word`, the settings window's menulist
    greyed again (the old instance put its attributes back, the new one
    greyed it), `menu.windows` correct, `diagnostics.startup()` clean; the
    error console holds nothing of the plugin's (the stop path logs
    nothing on live windows).
12. **Automated, not live.** The two switches travel with the settings
    backup and the WebDAV sync like every other setting
    (`test/core/settings-backup.test.ts`, `test/core/settings.test.ts`);
    `toggleWord`, the pin's write-back and the menu's restore are unit
    tests (`test/core/highlight-level.test.ts`, `test/core/highlight-pin.test.ts`,
    `test/ui/zotero-highlight-menu.test.ts`).
13. **Touches.** `zotero-tts.highlight.sentence` and `.word` (cleared at
    the end), `zotero-tts.highlight.sentenceUnderWord` (item 3 writes it
    on the old build; it ends `undefined`), `reader.readAloud.highlightGranularity`
    (reported before and after; it ends at the pinned `word`), the
    fixture tabs and their positions, `reader.readAloudVoices` +
    `readAloud.memory` for the voice picks (`selectVoice` back to the
    original before any pref restore, then byte for byte), the settings
    windows the run opened (closed). The switches never start or stop
    playback.
