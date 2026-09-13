# Scripts: 3f. Auto-scroll modes (issue #93)

[Case](../../cases/auto-scroll.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

This kit checks the auto-scroll modes live: the Highlight setting's two
options, their help icons and binding, and, in a PDF and an EPUB reader,
the outside and sentence targets, manual intent with its explicit return,
paginated EPUB pages and the Shift+A toggle. The files are zotero-dev
bridge snippets, sent one at a time through `zotero_execute_js` in chrome
scope, each returning JSON; they are not a Node test runner. Reusing them
means adapting the literals named below and taking a fresh baseline
(section 0) first. The PASS results under Runs are history, not a fresh
pass.

## Before you start

- **Two independent sequences.** `settings-*` is the beta4 help check: it
  only reads and clicks the settings pane and may run while the owner's
  readers stay open. `reader-*` is the beta3 pass: it drives two
  attachments in reader tabs the run opens itself. Each has its own setup
  and restoration; run either alone, or both with settings first.
- **Build and bridge.** `zotero_ping`, install the candidate with
  `zotero_plugin_install`, confirm its `-betaN` in `zotero_plugin_list`
  and prove the bundle by hash, then run `settings-01` or `reader-01`
  before anything else. A settings window left open through a reinstall
  keeps the old pane: close and reopen it. Every settings script needs
  the window open and navigates to `zotero-tts-pane` itself.
- **The default mode changed.** These runs saw `outside` as the default;
  `sentence` has been the default since (case item 1). Every recorded
  default selection and user-flag observation reverses on a current build.
- **Fixtures.** Nothing is imported from `test/fixtures/`: the reader
  sequence used two attachments already in the library, PDF item `25417`
  (title `PDF`, key `CZN9P5B5`, the article "Getting the scale right:
  ocular magnification, machine learning and optical coherence tomography
  angiography in high myopia") and EPUB item `25387` (`ZTTS Return-Key
  EPUB`, the 60-paragraph `test/fixtures/return-key/return-key.epub` an
  earlier pass imported). Open the PDF first with
  `Zotero.Reader.open(25417)`, polling `_internalReader` and
  `_readAloudManager` under the rulebook's ceiling; open the EPUB after
  the PDF checks, without opening its player. If either is gone, import a
  substitute with `Zotero.Attachments.importFromFile` (a PDF with a real
  cross-page or cross-column sentence; the return-key EPUB), replace its
  ID, and erase it at the end.
- **The owner's state.** Item `25417` is a real article in the owner's
  library. Before opening either attachment, snapshot its Read Aloud
  bookmark and view state (page index, scale, top, left; the EPUB's CFI
  and flow). Never drive a reader tab the owner had open: if one of these
  attachments is already open in the owner's tab, stop and ask.
- **Literals to adapt.**
  - Item IDs: `25417` in `reader-04` to `reader-10`; `25387` in
    `reader-11` to `reader-15`.
  - Reader indices: the PDF scripts read `diagnostics.autoScroll()[0]`,
    the first tab in `Zotero.Reader._readers`, so no reader may be open
    before the PDF; the EPUB scripts take the first `kind: "epub"` entry.
    `settings-07` observes `_readers.filter(Boolean)[0]`, read only.
  - `reader-06` scrolls to `scrollTop` `3130`, the offset that clipped
    beta2's sentence: choose one that clips the current sentence.
  - `reader-07` stops once `_position >= 54`, beta2's start `51` plus
    three: use the current position plus three.
  - `reader-12` calls `repositionTo(50)`, a sentence outside the first
    spread, and `scrollTo(0,1950)`, an offset that clips the sentence in
    scrolled flow.
  - Wheel points: `sendWheelEvent(800,600,…)` in `reader-08` (main
    window, over the PDF page) and `+600`/`+500` from the EPUB iframe box
    in `reader-13`; check that they land on the page at the window's size.
  - `reader-03` records `Ctrl+Shift+F9`; pick another chord if the owner
    uses it. No script names a voice ID or a file path.
- **Shared state.** No script leaves a global for another; each finds its
  reader by item ID. What carries over is Zotero's state:
  - `reader-02` leaves the mode at `outside`, now a user value;
    `reader-05` and `reader-06` do not set the mode and need it.
  - `reader-04` starts the PDF session with a trusted Shift+Space and
    pauses it; `reader-05` to `reader-10` use that session. Keep each
    fixture's tab selected: only `reader-04`, `reader-09`, `reader-10`,
    `reader-11` and `reader-15` select it themselves.
  - Before `reader-05`, scroll by hand until a fitting current sentence
    lies wholly inside the old quarter-screen band at an edge (beta2:
    `scrollTop` `2914`; beta3: `6900`).
  - Before `reader-09`, return with a trusted paused Shift+Enter in the
    PDF (no retained script), so PageDown starts from `following: true`.
    `reader-09` counts `[zotero-tts] pdf follow: manual keyboard` lines in
    `Zotero.Debug.get()`, so the debug store must be on. `reader-10`
    expects the `following: false` that PageDown leaves.
  - `reader-11` needs the EPUB idle. Then start its session with a
    trusted Shift+Space (`reader-04` with `25387` sends the same press)
    and pause it before `reader-12`, which ends in paginated flow at
    offset `0`. Before `reader-14`, switch the view to scrolled flow
    (`setFlowMode('scrolled')`, as `reader-12` does); `reader-15` uses the
    paused session `reader-14` leaves.
  - `reader-10` and `reader-14` restore the mode with a bare
    `clearUserPref`, which is right only when the baseline mode had no
    user value.
- **Keep auto-scroll while the sentence is visible (#100).** These
  scripts ran on 1.12.3, before the switch existed. `reader-08`,
  `reader-09` and `reader-13` expect a trusted wheel or PageDown to
  disengage following at once, and `reader-10` expects the disengagement
  they leave. With the switch on, the default, following stays true while
  any part of the sentence remains visible. Record
  `readAloud.keepFollowingWhileVisible` with its user flag and set it to
  `false` for the whole reader sequence; the switch-on behavior is
  [case 3i](../../cases/manual-follow.md).
- **Voice, spend and sound.** No script picks a voice: Shift+Space starts
  whatever the Read Aloud memory names for the document, the profile's
  Fish voice on beta2 and beta3. Before the first press, check that the
  memory names a listed voice of ours, not a metered Zotero voice (an ID
  without `::`). Configured providers are authorized for tests; the
  scripts that play (`reader-04`, `reader-07`, `reader-08`, `reader-13`,
  `reader-14`) synthesize a few sentences each, so never loop them. None
  needs sound: set `readAloud.volume` to `0` before `reader-04`, after
  recording it and its user flag.
- **Sync.** If `webdav.syncSettings` or `webdav.syncPositions` is on, turn
  it off before the first change so temporary preferences and reading
  positions are not uploaded. No script uploads to WebDAV.
- **Audio probe.** `reader-04` is the probe. A `suspended` context with a
  frozen clock makes the audio-driven counts of `reader-07` and
  `reader-14` NOT TESTABLE (machine); their mechanism halves still run.

## Run order

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| [settings-01-startup.js](settings-01-startup.js) | Runs `diagnostics.startup()` | setup | `version` is the build under test, every step `ok: true`, `failed: []` (21 steps on 1.12.3-beta4) |
| [settings-02-baseline.js](settings-02-baseline.js) | Records the mode, its user flag, the settings window and the reader count | setup | The values to restore; beta4: `sentence`, `user: true`, settings open, one reader |
| [settings-03-reader-snapshot.js](settings-03-reader-snapshot.js) | Lists open readers by title with `active` and `popupOpen` | setup | The owner's readers, observed and never operated; beta4: one reader, active, popup closed |
| [settings-04-radio-help-rows.js](settings-04-radio-help-rows.js) | Navigates to the pane and reads the radiogroup's rows | 1 | `loaded: true`, `childCount: 2`; each row one radio and one adjacent `.ztts-help`: `sentence` / `Center each sentence` with `ztts-help-auto-scroll-sentence`, `outside` / `Scroll when outside the view` with `ztts-help-auto-scroll-outside`; distinct `helpAttr` texts |
| [settings-05-hover-sentence-help.js](settings-05-hover-sentence-help.js) | Hovers the sentence `?` with trusted mouse moves | 1 | `tipStates` ends `open`; `tipLabel` explains centering the whole sentence even when visible, without re-centering per word; `defaultState: "closed"` |
| [settings-06-hover-outside-help.js](settings-06-hover-outside-help.js) | Hovers the outside `?` the same way | 1 | `tipState: "open"`; a different `tipLabel`: a fully visible sentence stays, centering only when clipped; `defaultState: "closed"` |
| [settings-07-radio-binding.js](settings-07-radio-binding.js) | Clicks both radios, sends one ArrowDown, restores the mode in `finally`, observes the first reader before and after | 1 | `clicks.outside` and `clicks.sentence` move the pref and `groupValue` together, `user: true` only on the non-default value; `afterRestore` equals `before`; `readerAfter` matches `readerBefore` except the clock; `keyboard` claims nothing |
| [reader-01-identity-startup.js](reader-01-identity-startup.js) | Runs `diagnostics.startup()` before any reader opens | setup | `version` is the build under test, every step `ok`, `failed: []` (21/21 on 1.12.3-beta2 and beta3) |
| [reader-02-radio-and-shortcut-row.js](reader-02-radio-and-shortcut-row.js) | Clicks `sentence` then `outside` in the pane and reads the Shift+A row | 1, 8 | Rows `Center each sentence` = `sentence`, `Scroll when outside the view` = `outside`; `afterSentence: "sentence"`, `afterOutside: "outside"`, `uiValue: "outside"`; `shortcut.exists: true`, `text: "Shift+A"`, `disabled: false`; `clear.exists: true` |
| [reader-03-shortcut-recorder.js](reader-03-shortcut-recorder.js) | Records a custom chord, clears it, restores the binding in `finally` | 8 | `custom.pref: "Ctrl+Shift+F9"`, `cleared.pref: ""`, `restored` equals `old` (beta3: `Shift+A`, `user: false`), `error: null` |
| [reader-04-audio-clock-probe.js](reader-04-audio-clock-probe.js) | Selects the PDF tab, starts playback with a trusted Shift+Space, samples the clock for 2 s, pauses | setup | `samples.last.ctx: "running"` and `time` above `first.time` (beta3: `0` to `1.2507` at position `51`) |
| [reader-05-pdf-outside-visible.js](reader-05-pdf-outside-visible.js) | Pushes three state updates while a fitting sentence sits in the old edge band | 2 | `delta: 0`; every tick's `last` has `reason: "none"`, `issued: false` |
| [reader-06-pdf-clipped-target.js](reader-06-pdf-clipped-target.js) | Scrolls so the sentence is cut and pushes one state update | 2 | `target.reason: "cut"`, `issued: true`, `top` centering the whole range, clamped (beta2: `2634.104` from `3130`); an unchanged `after.scrollTop` is NOT TESTABLE, not a FAIL |
| [reader-07-pdf-sentence-audio.js](reader-07-pdf-sentence-audio.js) | Sets `sentence`, plays to the stop position, pauses, restores the mode | 3 | `distinctPositions` three consecutive sentences (beta2: `51, 52, 53`), `clock` rising from `first` to `last`, a repeated fitting sentence `reason: "none"`, `issued: false`; `playError: null`; `restored` is the mode before |
| [reader-08-pdf-manual-intent.js](reader-08-pdf-manual-intent.js) | Sends a trusted wheel, calls `play()`, pauses | 4 | `before.following: true`; `disengaged` `following: false`, `reason: "wheel"`; `resumed` still `false` / `"wheel"` with the clock moving. `following: true` with `reason: "resume"` is the beta2 regression |
| [reader-09-pdf-pagedown-routing.js](reader-09-pdf-pagedown-routing.js) | Sends a trusted PageDown to the PDF document and records its event path | 4 | `seen` holds PDF window and document entries with `key: "PageDown"`, `isTrusted: true`; `after.logDelta: 1`; `after.following: false`, `reason: "keyboard"`; `page` unchanged (native page turn NOT TESTABLE) |
| [reader-10-pdf-shortcut.js](reader-10-pdf-shortcut.js) | Presses trusted Shift+A, Shift+A with a repeat keydown, and Shift+A again; clears the mode's user value | 8 | From `outside`: `mid` `sentence` with toast `Auto-scroll: center each sentence`, `repeat` `outside` with `Auto-scroll: when outside the view` (one switch), `after` `sentence`; `following` (`false`), `locked`, `paused`, `pos` and the paused clock unchanged throughout |
| [reader-11-epub-shortcut-before-playback.js](reader-11-epub-shortcut-before-playback.js) | Presses Shift+A twice in the idle EPUB, restores the mode | 8 | `mid.mode` flipped with its toast, `after.mode` back; `active: false`, `paused`, `positionLocked`, `scrolling` unchanged; `restored` equals the old value and flag |
| [reader-12-epub-paginated-scrolled.js](reader-12-epub-paginated-scrolled.js) | In outside mode repositions the paginated view, then in scrolled flow pushes state with the sentence visible and clipped; restores paginated flow, the first page and the mode | 2, 6 | `paginated.flow: "paginated"`, a later `offset` (beta3: `10799`), `diag.last.reason: "page"`; `scrolledVisible.delta: 0`, `following: true`; `scrolledCut.last.reason: "cut"` (beta3: `top` `1437.65`), `scrollY` unchanged; `restored` paginated at offset `0` |
| [reader-13-epub-manual-intent.js](reader-13-epub-manual-intent.js) | Trusted wheel, `play()`, paused Shift+Enter, trusted PageDown into the inner document, Shift+ArrowRight | 4 | `disengaged` `false` / `"wheel"`; `resumed` still `false` / `"wheel"`; `afterReturn` `true` / `"explicit"`; `pageRet: [1, true]`, trusted `PageDown` in `seen`, `afterPage` `false` / `"keyboard"`; the closing Shift+ArrowRight is the paragraph action, not sentence-skip evidence |
| [reader-14-epub-scrolled-sentence.js](reader-14-epub-scrolled-sentence.js) | Sets `sentence` in scrolled flow, plays through at least three sentences, settles each target with `scrollTo`, pauses, clears the mode | 3 | `flow: "scrolled"`; at least three `distinctPositions` (beta3: `59` to `62`); `clock.moved: true`; each position's issued `top` equals its `expected` full-range center (beta3: within `0.0001`), one target per stable sentence (a single range mount may precede it); `playError` and `restoreError` null |
| [reader-15-epub-arrowright.js](reader-15-epub-arrowright.js) | Presses a trusted unmodified ArrowRight while paused | 4 | `ret: [1, true]`, `delta: 1` (beta3: `62` to `63`), `after.paused: true`, `following: true`, `reason: "explicit"` |

## Cleanup

- **Settings sequence.** `settings-07` restores the mode and its user
  flag in its own `finally`; compare `afterRestore` with `before` and the
  observed reader with `readerBefore`. Nothing else changes: leave the
  settings window as `settings-02` found it.
- **Reader sequence, in this order:**
  1. Pause any playing fixture session and close each player with
     `toggleReadAloudPopup(false)`.
  2. Put back each attachment's Read Aloud bookmark and view from the
     baseline snapshot, never from an archived run: the PDF's bookmark
     and view state (page index, scale, top, left), the EPUB's CFI
     bookmark and paginated flow at offset `0`.
  3. `reader.close()` both fixture tabs; erase any substitute import.
  4. Restore the case's preferences with their user flags:
     `readAloud.autoScrollMode`, `readAloud.keepFollowingWhileVisible`,
     `shortcuts.toggleAutoScroll` (`reader-03` has already restored it),
     then `reader.readAloudVoices`, and `readAloud.memory` last of these,
     once the tabs are closed so no reader persists over them.
  5. Last, as the tester workflow requires: `readAloud.volume` with its
     user flag, then the WebDAV sync switches.
- **Byte-identical at the end:** every preference above, value and user
  flag (the memory and the voice list also by SHA256 and length); both
  attachments' bookmarks and view state; `diagnostics.position()` with
  the baseline's row count, no open readers, `queued: 0` and
  `lastError: null`; the settings window and `Zotero.Debug` storing as
  found.
- **Errors.** Beta2 and beta3 ended with only Zotero's teardown
  `InvalidStateError: Navigated away from page`, one Xray warning from
  assigning the bookmark across compartments during restoration, and a
  bridge `c is null` probe error. A `[zotero-tts]` line or a dead-object
  burst in the debug store is a finding.

## Limits

- **Smooth scrolling does not animate on this bridge.** The issued target
  (`last.top`, `issued`) is the evidence; the physical offset in the PDF
  clipped, scrolled EPUB clipped and sentence-mode checks is NOT TESTABLE
  (beta2, beta3). `reader-14` settles each target with a direct
  `scrollTo`, which claims nothing about native animation.
- **PageDown's native page turn** left the PDF unmoved through the TIP
  route: the follow intent passed, the page-turn pixels are NOT TESTABLE
  (beta2, beta3).
- **Keyboard traversal of the radio group** is NOT TESTABLE through
  trusted keys (beta4); the ArrowDown inside `settings-07` claims nothing.
- **Never covered live:** item 5 (oversized sentences, a wordless voice,
  a column-crossing PDF sentence), item 7 (hidden playback, secondary
  views, dispose and reload), item 6's spread-crossing sentence following
  a real word, section changes and paginated sentence mode, and item 8
  while playing or while typing in an editable control. Unit coverage is
  not a live pass.
- **Beta3 rows with no retained script:** the native play/pause resume
  (`reader.toggleReadAloudPaused(false)`) in both formats, the PDF's
  paused Shift+Enter return, the EPUB session start with its helper
  flags, and the paginated fitting sentence under three state pushes;
  beta2's diagnostic mode after a radio click has none either. A new run
  writes these checks and retains them.
- **Recorded values and the retained PDF scripts differ.** `reader-06`
  samples once after 350 ms where the reports watched for 1.6 s, and
  `reader-07` stops at position `54`, so beta3's positions `56` to `58`
  cannot have come from it unchanged. Its literals are the run's to set.
- **Switch off only.** The manual-intent scripts cover the legacy
  disengagement; disappearance, reentry and `visibilityPaused` with the
  switch on are case 3i's.
- **Human judgment:** the comfort of per-sentence movement, smoothness,
  interruption while an animation visibly moves, and whether highlights
  feel stable. Backup, restore and sync of the mode are automated tests.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-12-1.12.3-beta2 | 1, 2, 3 PASS; 4 PASS for wheel and PageDown intent, FAIL for playback resume (`following: true`, `reason: "resume"`); clipped and sentence-mode movement and the PDF page turn NOT TESTABLE; cross-page, cross-column and EPUB checks PENDING after the failure | [report](../../runs/2026-09-12-1.12.3-beta2/report.md) · [scripts](../../runs/2026-09-12-1.12.3-beta2/scripts/) |
| 2026-09-12-1.12.3-beta3 | 1, 2, 3, 4, 6, 8 PASS in PDF and EPUB; smooth-scroll movement and the PDF page turn NOT TESTABLE; 5 and 7 not claimed | [report](../../runs/2026-09-12-1.12.3-beta3/issue-93.md) · [scripts](../../runs/2026-09-12-1.12.3-beta3/scripts/) |
| 2026-09-12-1.12.3-beta4 | 1 PASS (help icons, tooltips, radio binding, the open reader untouched); radio keyboard traversal NOT TESTABLE | [report](../../runs/2026-09-12-1.12.3-beta4/help.md) · [scripts](../../runs/2026-09-12-1.12.3-beta4/scripts/) |

## Where each script comes from

| Script | Executed as | Run |
| --- | --- | --- |
| `settings-01-startup.js` | [startup.js](../../runs/2026-09-12-1.12.3-beta4/scripts/startup.js) | 2026-09-12-1.12.3-beta4 |
| `settings-02-baseline.js` | [baseline.js](../../runs/2026-09-12-1.12.3-beta4/scripts/baseline.js) | 2026-09-12-1.12.3-beta4 |
| `settings-03-reader-snapshot.js` | [reader-snapshot.js](../../runs/2026-09-12-1.12.3-beta4/scripts/reader-snapshot.js) | 2026-09-12-1.12.3-beta4 |
| `settings-04-radio-help-rows.js` | [inspect-rows.js](../../runs/2026-09-12-1.12.3-beta4/scripts/inspect-rows.js) | 2026-09-12-1.12.3-beta4 |
| `settings-05-hover-sentence-help.js` | [hover-sentence.js](../../runs/2026-09-12-1.12.3-beta4/scripts/hover-sentence.js) | 2026-09-12-1.12.3-beta4 |
| `settings-06-hover-outside-help.js` | [hover-outside.js](../../runs/2026-09-12-1.12.3-beta4/scripts/hover-outside.js) | 2026-09-12-1.12.3-beta4 |
| `settings-07-radio-binding.js` | [radio-binding.js](../../runs/2026-09-12-1.12.3-beta4/scripts/radio-binding.js) | 2026-09-12-1.12.3-beta4 |
| `reader-01-identity-startup.js` | [identity-startup.js](../../runs/2026-09-12-1.12.3-beta2/scripts/identity-startup.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-02-radio-and-shortcut-row.js` | [ui-binding-shortcut.js](../../runs/2026-09-12-1.12.3-beta3/scripts/ui-binding-shortcut.js) | 2026-09-12-1.12.3-beta3 |
| `reader-03-shortcut-recorder.js` | [shortcut-recorder.js](../../runs/2026-09-12-1.12.3-beta3/scripts/shortcut-recorder.js) | 2026-09-12-1.12.3-beta3 |
| `reader-04-audio-clock-probe.js` | [audio-clock-probe.js](../../runs/2026-09-12-1.12.3-beta2/scripts/audio-clock-probe.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-05-pdf-outside-visible.js` | [pdf-outside-visible.js](../../runs/2026-09-12-1.12.3-beta2/scripts/pdf-outside-visible.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-06-pdf-clipped-target.js` | [pdf-clipped-target.js](../../runs/2026-09-12-1.12.3-beta2/scripts/pdf-clipped-target.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-07-pdf-sentence-audio.js` | [pdf-sentence-audio.js](../../runs/2026-09-12-1.12.3-beta2/scripts/pdf-sentence-audio.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-08-pdf-manual-intent.js` | [pdf-manual-intent.js](../../runs/2026-09-12-1.12.3-beta3/scripts/pdf-manual-intent.js) | 2026-09-12-1.12.3-beta3 |
| `reader-09-pdf-pagedown-routing.js` | [pagedown-routing.js](../../runs/2026-09-12-1.12.3-beta2/scripts/pagedown-routing.js) | 2026-09-12-1.12.3-beta2, rerun unchanged in 2026-09-12-1.12.3-beta3 |
| `reader-10-pdf-shortcut.js` | [pdf-shortcut.js](../../runs/2026-09-12-1.12.3-beta3/scripts/pdf-shortcut.js) | 2026-09-12-1.12.3-beta3 |
| `reader-11-epub-shortcut-before-playback.js` | [epub-shortcut-before-playback.js](../../runs/2026-09-12-1.12.3-beta3/scripts/epub-shortcut-before-playback.js) | 2026-09-12-1.12.3-beta3 |
| `reader-12-epub-paginated-scrolled.js` | [epub-paginated-scrolled.js](../../runs/2026-09-12-1.12.3-beta3/scripts/epub-paginated-scrolled.js) | 2026-09-12-1.12.3-beta3 |
| `reader-13-epub-manual-intent.js` | [epub-manual-intent.js](../../runs/2026-09-12-1.12.3-beta3/scripts/epub-manual-intent.js) | 2026-09-12-1.12.3-beta3 |
| `reader-14-epub-scrolled-sentence.js` | [epub-scrolled-sentence.js](../../runs/2026-09-12-1.12.3-beta3/scripts/epub-scrolled-sentence.js) | 2026-09-12-1.12.3-beta3 |
| `reader-15-epub-arrowright.js` | [epub-arrowright.js](../../runs/2026-09-12-1.12.3-beta3/scripts/epub-arrowright.js) | 2026-09-12-1.12.3-beta3 |
