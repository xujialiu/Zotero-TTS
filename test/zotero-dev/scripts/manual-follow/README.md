# Scripts: 3i. Manual navigation while the sentence remains visible (issue #100)

[Case](../../cases/manual-follow.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

This kit checks Keep auto-scroll while the sentence is visible on disposable
PDF and EPUB fixtures: a partly visible sentence keeps following, one that
leaves the view pauses it and following resumes by itself on reentry, plus
multiline EPUB sentences, paginated navigation, the off rule and controlled
sentence transitions. The files are zotero-dev bridge snippets, sent one at
a time through `zotero_execute_js` in chrome scope, not a Node test runner.
`quick-*` is the compact merged-build pass (settings, one reentry cycle per
format); `matrix-*` covers every item a run has checked live. The two share
no state. Reusing them means adapting the literals named below and taking a
fresh baseline; old PASS results are not a fresh pass.

## Before you start

- **Build and bridge.** `zotero_ping` and `zotero_plugin_list` first. Run
  the group's baseline (`quick-01`, `matrix-01`) before anything changes,
  then its close-preferences script (`quick-02`, `matrix-02`), then
  `zotero_plugin_install` with the xpi and the startup script (`quick-03`,
  `matrix-03`). Prove the build by its bundle hash, not the version string.
  An open settings window keeps the old pane: reopen it with
  `zotero_open_preferences` before `quick-04` or `matrix-12`. The quick run
  closed it again with `quick-02` before `quick-05` and reopened it before
  `quick-14`. All four runs used Zotero 10.0.2-beta.9 on Windows.
- **Fixtures.** `test/fixtures/fixture-a.pdf` and
  `test/fixtures/return-key/return-key.epub`, imported as fresh attachments
  with timestamped titles by `quick-06` or `matrix-05`; `matrix-20` imports
  the EPUB a second time for the paginated flow. Nothing else in the
  library is touched, and cleanup erases all of them.
- **Literals to replace.**
  - *Fixture paths*: `quick-06`, `matrix-05` and `matrix-20` hard-code
    `C:\Users\xujia\orca\workspaces\zotero_plugin_tts\scroll\test\fixtures\`,
    a worktree that no longer exists; point them at the current checkout.
  - *Scroll targets*, measured at these runs' reader size: PDF `scrollTop`
    200 (one fragment still visible) in `quick-09`, `matrix-13` and
    `matrix-14`, and 800 (fully outside) there and in `matrix-31` and
    `matrix-34`; 50 in `matrix-24`; 20 in `matrix-26`. Scrolled EPUB
    `scrollY` 50 and 800 in `quick-10`, `matrix-15` and `matrix-16`; 180
    and 800 in `matrix-18` and `matrix-19`, plus 700 in `matrix-18`.
  - *Sentence positions*: position 0 in most checks; the three-line EPUB
    sentence 2 in `matrix-17` and `matrix-19`; paginated position 50 in
    `matrix-22` and `matrix-23`; PDF segments 11 (visible at `scrollTop`
    800) and 12 (page two) in `matrix-31` and `matrix-32`.
  - *Wheel point*: frame x + 100, y + min(500, height / 2); y + 500 in
    `matrix-26`; the frame's center in `matrix-18` and `matrix-19`.
  - If the window size or a fixture changed, measure the fragment rects
    first; the beta4 archive's
    `09-state-geometry.js`
    reads them. Item IDs and reader indices need no editing: the import
    scripts store the IDs in the shared global, and every check finds its
    reader by item ID.
- **Shared globals.** `quick-*` keeps its snapshot in
  `Zotero.__ztts127Baseline` (`quick-01`) and its fixtures and readers in
  `Zotero.__ztts127` (`quick-06`, `quick-07`). `matrix-*` uses
  `Zotero.__ztts100Baseline` (`matrix-01`) and `Zotero.__ztts100`
  (`matrix-05`; `pdf` and `epub` readers from `matrix-06` to `matrix-08`,
  `epubPaginated` from `matrix-20` and `matrix-21`). The groups cannot be
  mixed. Never rerun a baseline in a resumed run: it would replace the
  snapshot with the run's temporary state.
- **Mixed provenance.** `matrix-17` to `matrix-19`, `matrix-25` to
  `matrix-30`, `matrix-33` and `matrix-39` come from the beta2 and beta3
  runs. They use the same globals, fixtures and reader slots as the beta4
  scripts around them, but never ran in this order: check every return.
- **The owner's readers.** The baseline lists every open reader; in these
  runs a paused PDF and an active, paused EPUB session with its player
  open. The scripts act only on fixture readers: never play, pause,
  reposition or close a baseline reader. Before a fixture player opens,
  check that `readAloud.memory` names a free voice (beta4 and 1.12.7 got
  `local::af_sarah`), so nothing metered speaks.
- **Mute first.** `quick-05` and `matrix-04` set the plugin volume to 0 and
  switch WebDAV position sync, settings upload and settings sync off
  before any player opens.

## Run order

### quick

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `quick-01-baseline.js` | Snapshots prefs with user flags (bracket prefs included), readers, selected tab, settings window, errors and position store | setup | Summary with memory and voice map as lengths only; `Zotero.__ztts127Baseline` set |
| `quick-02-close-preferences.js` | Closes the settings window before the install; run it again after `quick-04` | setup | `present: true`, `error: null`, `closed: true` |
| `quick-03-startup.js` | `Zotero.ZoteroTTS.diagnostics.startup()` | setup | The build's version; 23 steps `ok`, `failed: []` |
| `quick-04-settings-ui.js` | Reads the keep-following checkbox, its label and help, and case 3g's bracket controls | 1 | Checked; label "Keep auto-scroll while the sentence is visible"; help says following resumes automatically when any part of the current sentence becomes visible again; bracket controls present |
| `quick-05-mute-and-disable-sync.js` | Plugin volume 0, the three WebDAV switches off, debug store on | setup | `during`: volume 0, switches `false` |
| `quick-06-import-fixtures.js` | Imports the PDF and EPUB fixtures | setup | Two new item IDs and keys |
| `quick-07-open-readers.js` | Opens the PDF in the background and the EPUB in front, waits for page mapping and sets scrolled flow before any player | setup | Both `reader: true`; EPUB `flowError: null`, `flow: "scrolled"`, `ranges: true` |
| `quick-08-open-players-paused.js` | Opens and pauses both fixture players | setup | PDF 17 and EPUB 241 segments; `active` and `paused` true at position 0; a free voice; `following: true`, `visibilityPaused: false` |
| `quick-09-pdf-reentry.js` | Sentence mode: trusted wheel, move out to 800, wait 500 ms, move back to 200 without a relock | 2 | Wheel `trusted: true`. Outside: rect [212.9, -615.9, 624.3, -582.9], `visibleFragments: 0`, position 0, `following: false`, `visibilityPaused: true`, reason `wheel`, unchanged after 500 ms. Reentry settles at `scrollTop` 0 with `following: true`, `visibilityPaused: false`, reason `visible` |
| `quick-10-epub-reentry.js` | The same cycle in the scrolled EPUB: out to 800, back to 50 | 2 | Outside rect [440, -765.1, 919.7, -727.1] with the same states; reentry settles at `scrollY` 0 with `following: true`, reason `visible` |
| `quick-11-close-fixtures.js` | Closes each fixture player, then its reader | cleanup | `popupError` and `closeError` null, `left: 0` |
| `quick-12-erase-fixtures.js` | Erases both fixture items | cleanup | `erased: true`, `error: null` |
| `quick-13-restore-state.js` | Restores every snapshotted pref and user flag, then the baseline tab | cleanup | Summary equal to the baseline; position store as in the baseline |
| `quick-14-final-audit.js` | After reopening settings: readers, tab, settings controls, prefs, fixtures, position store, patches, new errors by content | cleanup | All equal to the baseline; fixtures `exists: false`; new relevant errors only the two manifest warnings about the `-beta` version string |

### matrix

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `matrix-01-baseline.js` | Snapshots prefs with user flags, readers with titles and bookmarks, selected tab, settings window, errors and position store | setup | Summary with memory and voice map as lengths only; `Zotero.__ztts100Baseline` set |
| `matrix-02-close-preferences.js` | Closes the settings window before the install | setup | `closed: true` |
| `matrix-03-startup.js` | `Zotero.ZoteroTTS.diagnostics.startup()` | setup | 23 steps `ok`, `failed: []` |
| `matrix-04-mute-and-disable-sync.js` | Plugin volume 0, the three WebDAV switches off, debug store on | setup | `during`: volume 0, switches `false` |
| `matrix-05-import-fixtures.js` | Imports the PDF and EPUB fixtures into `Zotero.__ztts100` | setup | Two new item IDs and keys |
| `matrix-06-open-pdf.js` | Opens the PDF in the background and waits for its manager | setup | `reader`, `manager`, `view` and `controller` true |
| `matrix-07-open-epub-scrolled.js` | Opens the EPUB in front and sets scrolled flow before any player | setup | `reader: true`, `flow: "scrolled"`; beta4 hit an EPUB page-mapping race at this step, which `matrix-08` retries |
| `matrix-08-reapply-epub-flow.js` | Sets scrolled flow again once the reader is ready | setup | `error: null`, `flow: "scrolled"`, `ranges: true` |
| `matrix-09-open-players-paused.js` | Opens and pauses both fixture players | setup | PDF 17 and EPUB 241 segments, paused at position 0; `following: true`, `visibilityPaused: false`, `keepFollowingWhileVisible: true` |
| `matrix-10-audio-clock.js` | Reads each fixture's AudioContext twice, 550 ms apart; gate for `matrix-33` | setup | `moving: true` means a live clock; in beta4 the contexts stayed `suspended` at 0 |
| `matrix-11-trusted-start-clock.js` | Starts each fixture with a trusted Shift+Space, samples for 1.5 s and pauses; gate for `matrix-33` | setup | With working audio the context turns `running` and time and position advance (beta3's probe: 0 to 1.72 s, position 0 to 1); beta4 stayed suspended at 0, so natural progression was NOT TESTABLE |
| `matrix-12-setting-ui.js` | Clicks the checkbox off and on, restores the pref, reads label and help | 1 | checked/pref/user `true/true/false`, then `false/false/true`, then `true/true/false`, restored as found; label as in `quick-04`; help includes "resumes automatically" |
| `matrix-13-pdf-reentry-sentence.js` | Sentence mode, two cycles: partial move to 200, out to 800 with three state pushes and 500 ms, back to 200 | 2 | Partial: rect [212.9, -15.9, 624.3, 17.1] visible, `following: true` while `interacting`. Outside: `following: false`, `visibilityPaused: true`, reason `wheel`, `scrollTop` stays 800 through pushes and wait. Reentry settles at 0 with `following: true`, `visibilityPaused: false`, reason `visible`, no lock |
| `matrix-14-pdf-reentry-outside.js` | The same in outside mode, with one repeat | 2 | As `matrix-13`; beta4 returned `restoredMode.user: false` (see Limits) |
| `matrix-15-epub-reentry-sentence.js` | Scrolled EPUB, sentence mode: partial to 50, out to 800 with pushes and 500 ms, back to 50, repeated | 2 | Box [440, 34.9, 919.7, 72.9] at 0, [440, -15.1, 919.7, 22.9] at 50 keeps `following: true`; outside `following: false`, `visibilityPaused: true`, reason `wheel`; reentry settles at 0 with reason `visible` |
| `matrix-16-epub-reentry-outside.js` | The same in outside mode | 2 | As `matrix-15` |
| `matrix-17-epub-multiline-setup.js` | Repositions the scrolled EPUB to its three-line sentence 2 and reads the rects | setup | `flow: "scrolled"`, position 2, three rects at document y 113.1-133.1, 143.6-163.6 and 174.2-194.2 |
| `matrix-18-epub-multiline-sentence.js` | Sentence mode: move to 700 without input, then partial (180) and complete (800) moves, each followed by an explicit lock | 3 | The input-free move should leave `following: true` (item 7; beta2 and beta3 recorded that value only for the PDF). At 180 `visibleFragments: 1`, `following: true` held and settled. At 800 `visibleFragments: 0`, `following: false`, reason `wheel`. The lock gives `following: true`, reason `explicit` |
| `matrix-19-epub-multiline-outside.js` | Outside mode: partial (180) and complete (800) moves on the same sentence | 3 | Setup `visibleFragments: 3`; at 180 `visibleFragments: 1`, `following: true`; at 800 `following: false`, reason `wheel`; the lock restores `following: true`; beta3 returned `restoredMode.user: false` |
| `matrix-20-import-paginated-epub.js` | Imports the EPUB again as `epubPaginated` | setup | A new item ID |
| `matrix-21-open-paginated-epub.js` | Opens it, waits for page mapping and sets paginated flow before its player | setup | `flowError: null`, `flow: "paginated"`, `ranges: true` |
| `matrix-22-open-paginated-player.js` | Opens and pauses its player, then repositions to 50 | setup | 241 segments, paused, position 50 |
| `matrix-23-paginated-reentry.js` | Both modes, two cycles each: next page, 500 ms and three pushes, previous page | 5 | Offset 10799 to 21598: at once `following: true`, `interacting: true`, then `following: false`, `visibilityPaused: true`, reason `navigation`, unchanged by the pushes. Previous page: offset 10799, three fragments, `following: true`, reason `visible`. `returnedPromise: false` |
| `matrix-24-off-pdf.js` | Keep off: trusted wheel with the sentence visible, move to 50, scroll back, explicit lock | 6 | At once `following: false`, reason `wheel`, `visibilityPaused: false`, one visible fragment; still false after scrolling back; `_lockPositionToReadAloud()` gives `following: true`, reason `explicit`; prefs restored |
| `matrix-25-off-setup.js` | Keep off, sentence mode, PDF at position 0, paused and locked | setup | `keep: false` with a user value, `following: true` |
| `matrix-26-off-wheel.js` | Trusted wheel, move to 20 | 6 | `following` true to false at once, reason `wheel`; still false at 20 |
| `matrix-27-off-resume.js` | Direct `play()` and native `toggleReadAloudPaused(false)` on the fixture, each paused again | 6 | Both resumes `active: true`, `paused: false`, `following: false`, reason `wheel` |
| `matrix-28-off-later-sentence-and-mode.js` | Scroll back, `skipAhead` to the next sentence, mode outside and back to sentence | 6 | `following: false`, reason `wheel` throughout; position 1 |
| `matrix-29-off-explicit-return.js` | Calls `_lockPositionToReadAloud()` | 6 | `following` false to true, reason `explicit` |
| `matrix-30-off-restore-prefs.js` | Restores keep and mode from the baseline, flags included | cleanup | Both equal the baseline (in these runs keep `true` without a user value, mode `sentence` with one) |
| `matrix-31-speech-reentry.js` | Outside mode: wheels the sentence out (800), then makes the visible segment 11 the view's active segment | 5 | Outside `following: false`, `visibilityPaused: true`; after the transition `following: true`, `visibilityPaused: false`, reason `visible`, position 0, no lock call |
| `matrix-32-uninterrupted-follow.js` | Sentence mode, no input: makes segment 12 on page two the active segment | 5 | `following: true`, reason `visible`; a follow target issued (`last.reason: "sentence"`, `issued: true`, `scrollTop` 1813) |
| `matrix-33-natural-playback.js` | Only when `matrix-10` or `matrix-11` showed a live clock: plays the PDF for 3.5 s, then pauses | 5, 7 | `clockMoved: true`, context `running`, positions advance (beta3: 1 to 2), `following: true` throughout; otherwise NOT TESTABLE |
| `matrix-34-hidden-close-pdf.js` | Wheels the sentence out (800), suspends and restores the view, then closes the PDF player and reader | 7 | Hidden and restored: `following: false`, `visibilityPaused: true`, no resume while outside; `left: 0`; error counts equal before and after the close |
| `matrix-35-close-fixtures.js` | Closes the scrolled and paginated EPUB players and readers | cleanup | `left: 0` for both |
| `matrix-36-erase-fixtures.js` | Erases the three fixture items | cleanup | `erased: true`, `error: null` for each |
| `matrix-37-restore-state.js` | Restores every snapshotted pref and user flag, then the baseline tab | cleanup | Summary equal to the baseline; volume diagnostics at the baseline level; position store as in the baseline |
| `matrix-38-final-audit.js` | After reopening settings if the baseline had them open: readers, tab, prefs, fixtures, position store, patches, error counts | cleanup | All equal to the baseline; fixtures `exists: false`; plugin and dead-object counts as before the run |
| `matrix-39-console-dead-objects.js` | Reads the console service for "can't access dead object" | 7 | `matchingDeadObjectMessages: 0`, or only messages older than the run |

## Cleanup

- **Order.** Close the fixture readers, player first, then reader
  (`quick-11`; `matrix-34` for the PDF, `matrix-35` for both EPUBs). Erase
  the fixture items (`quick-12`, `matrix-36`). Restore the prefs
  (`quick-13`, `matrix-37`). Reopen the settings window if the baseline had
  it open, then audit (`quick-14`; `matrix-38`, then `matrix-39`).
- **Restore order.** The restore script writes keep-following, the plugin
  volume, same-for-all-documents, the bracket prefs (`quick-13` only) and
  Zotero's highlight granularity, then Zotero's voice map before the
  memory, then the auto-scroll mode, and the three WebDAV switches last.
  The volume is back before sync is, so no temporary value reaches WebDAV.
  A user flag whose saved value equals the default is recreated through a
  temporary default-branch value. Most check scripts also restore the mode
  and keep prefs they change in their own `finally`; the off block leaves
  keep off from `matrix-25` until `matrix-30` restores it.
- **Must end identical.** Every snapshotted pref value and user flag; the
  baseline readers (item, tab, active and paused state, player, position,
  flow, voice); the selected tab; whether the settings window is open; the
  position store's rows, queue and `lastError`. The memory and voice map
  are compared by presence and length and never printed.
- **Not restored by the scripts.** Both baselines turn `Zotero.Debug`
  storing on if it was off: switch it off again after the audit when
  `debugStoringBefore` was false. Delete the transient globals last
  (`Zotero.__ztts127` and `Zotero.__ztts127Baseline`, or the `__ztts100`
  pair), as beta3 did.
- **Interrupted runs.** Still close and erase the fixtures and restore
  from the original snapshot, never from the run's temporary values: the
  plugin volume before the sync switches, the sync switches last.

## Limits

- **Trusted input, controlled movement.** The wheel events are trusted
  (`windowUtils.sendWheelEvent`, `isTrusted: true`) but moved no pixels in
  this bridge; the measured movement is a `scrollTo` right after. The
  scripts prove input provenance and the reaction to the resulting
  geometry, not natural wheel scrolling.
- **Targets, not animation.** The diagnostic's `last` records follow
  targets requested; smooth animation and comfort are for a human.
- **Controlled transitions.** `matrix-31` and `matrix-32` set the active
  segment directly: they prove the reaction to a new visible or next
  sentence, not natural speech progress.
- **Natural audio.** In beta4 both fixture AudioContexts stayed `suspended`
  at `currentTime` 0, so natural progression was NOT TESTABLE and the
  playback check of `matrix-33` was not run; it last passed in beta3, with
  a Fish voice. 1.12.7 did not retry.
- **Scope of `quick-*`.** Sentence mode and the scrolled EPUB only, with
  no partial-visibility step and no clicks on the setting.
- **Item 1.** No current script re-checks that toggling the setting
  leaves reader state untouched; only beta2's superseded UI script
  recorded it.
- **Item 3.** The fixtures have no PDF next-page or next-column fragment
  and no sentence taller than the viewport (beta2 PENDING, beta3 NOT
  TESTABLE); only the multiline EPUB sentence is live. Word highlighting
  was the profile's setting; an off-screen current word was not arranged.
- **Item 4.** Held keys (ArrowDown went to the shortcut layer, PageDown
  gave no hold trace), scrollbar and selection-edge drags, and touch or
  hand panning were NOT TESTABLE through the bridge; no script covers them.
- **Item 5.** A trusted PageDown did not move the paginated EPUB (it
  returned `[2,true]`, offset unchanged); history and find navigation are
  not scripted; `navigateToNextPage()` returned synchronously. Long or
  failed asynchronous navigation and Promise identity have only unit
  coverage.
- **Item 6.** A trusted Shift+Enter (Go to reading position) did not
  restore following through the bridge (beta3 NOT TESTABLE); the scripts
  call `_lockPositionToReadAloud()` or `setPositionLocked(true)` directly.
  Toggling the keep switch while disengaged is not scripted, only the mode.
- **Item 7.** Zoom, independent split views and dispose or reload with
  pending gesture work are not scripted. `matrix-34` and `matrix-38` count
  `Zotero.getErrors()` entries, a ring whose length proves little;
  `quick-14` compares new entries by content and `matrix-39` reads the
  console. Check the debug store for dead-object bursts.
- **Mode flag.** `matrix-14` and `matrix-19` restore `autoScrollMode` with
  a plain write, which dropped its user flag in these runs because the
  saved value equals the default; `matrix-28` switches the mode the same
  way. Later scripts may carry the dropped flag; `matrix-30` and
  `matrix-37` restore it from the baseline, so judge flags by the final
  audit.
- **Timing.** `matrix-23` took about 10 s in beta4, close to the bridge's
  eval timeout; a bare `undefined` return means the eval timed out.

## Runs

The run archive that held each run's report and scripts was removed on
2026-09-14 (a run's table is on its issue since then); the last column names
what it held, and the git history before that day still has the files.

| Run | Items observed | Evidence |
| --- | --- | --- |
| `2026-09-13-1.12.6-beta2-manual-follow` | 1, 2, 3 (EPUB multiline), 5, 6, 7 PASS under the earlier model (switch-on recovery needed an explicit return); 7 FAIL: two dead-object errors at fixture disposal; NOT TESTABLE: 4 (held keys, pointer, touch, scrollbar, hand panning), 5 (trusted PageDown); PENDING: 3 (PDF next-page or cross-column, oversized) | report (2026-09-13, 1.12.6-beta2 manual-follow), scripts (2026-09-13, 1.12.6-beta2 manual-follow), manifest (2026-09-13, 1.12.6-beta2 manual-follow) |
| `2026-09-13-1.12.6-beta3-manual-follow` | 1, 2, 3 (EPUB multiline), 5, 6, 7 PASS under the earlier model, including disposal without dead-object errors; NOT TESTABLE: 6 (trusted Shift+Enter return), 5 (PageDown), 4 (drag and pan), 3 (cross-page, oversized) | report (2026-09-13, 1.12.6-beta3 manual-follow), scripts (2026-09-13, 1.12.6-beta3 manual-follow), manifest (2026-09-13, 1.12.6-beta3 manual-follow) |
| `2026-09-13-1.12.6-beta4-manual-follow` | 1, 2, 5, 6, 7 PASS with automatic reentry (5's speech reentry and uninterrupted follow as controlled state); NOT TESTABLE: natural audio progression (5), natural wheel, drag and smoothness (4) | report (2026-09-13, 1.12.6-beta4 manual-follow), scripts (2026-09-13, 1.12.6-beta4 manual-follow) |
| `2026-09-13-1.12.7-beta-manual-follow` | 1, 2 PASS on the merged build (one PDF and one scrolled EPUB cycle, sentence mode); natural audio not retried | report (2026-09-13, 1.12.7-beta manual-follow), scripts (2026-09-13, 1.12.7-beta manual-follow) |

## Where each script comes from

The middle column is the file's name in that run's archive, removed on
2026-09-14 and kept in the git history before that day.

| Script | Executed as | Run |
| --- | --- | --- |
| `quick-01-baseline.js` | `00-baseline.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-02-close-preferences.js` | `01-close-preferences.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-03-startup.js` | `02-startup.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-04-settings-ui.js` | `03-ui-settings.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-05-mute-and-disable-sync.js` | `04-prepare-mute.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-06-import-fixtures.js` | `05-import-fresh-fixtures.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-07-open-readers.js` | `06-open-readers-flow-before-player.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-08-open-players-paused.js` | `07-open-pause-both.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-09-pdf-reentry.js` | `09-pdf-reentry-cycle.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-10-epub-reentry.js` | `10-epub-reentry-cycle.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-11-close-fixtures.js` | `11-close-fixtures.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-12-erase-fixtures.js` | `12-erase-fixtures.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-13-restore-state.js` | `13-restore-state.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `quick-14-final-audit.js` | `14-final-audit.js` | 2026-09-13-1.12.7-beta-manual-follow |
| `matrix-01-baseline.js` | `01-baseline-snapshot.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-02-close-preferences.js` | `00-close-preferences.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-03-startup.js` | `02-startup.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-04-mute-and-disable-sync.js` | `03-prepare-mute.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-05-import-fixtures.js` | `04-import-fresh-fixtures.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-06-open-pdf.js` | `05-open-pdf.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-07-open-epub-scrolled.js` | `06-open-epub-flow-before-player.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-08-reapply-epub-flow.js` | `06b-finish-epub-flow.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-09-open-players-paused.js` | `07-open-pause-both.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-10-audio-clock.js` | `08-audio-clock-probe.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-11-trusted-start-clock.js` | `10-trusted-start-clock.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-12-setting-ui.js` | `11-ui-help.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-13-pdf-reentry-sentence.js` | `12-pdf-reentry-sentence.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-14-pdf-reentry-outside.js` | `13-pdf-reentry-outside.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-15-epub-reentry-sentence.js` | `14-epub-reentry-scrolled-sentence.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-16-epub-reentry-outside.js` | `15-epub-reentry-scrolled-outside.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-17-epub-multiline-setup.js` | `21-epub-scrolled-setup-rev2.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-18-epub-multiline-sentence.js` | `22-epub-scrolled-visibility-sentence.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-19-epub-multiline-outside.js` | `14b-epub-scrolled-outside.js` | 2026-09-13-1.12.6-beta3-manual-follow |
| `matrix-20-import-paginated-epub.js` | `16-import-paginated-epub.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-21-open-paginated-epub.js` | `17-open-paginated-before-player.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-22-open-paginated-player.js` | `18-open-pause-paginated.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-23-paginated-reentry.js` | `19-epub-paginated-reentry-both-modes.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-24-off-pdf.js` | `20-off-pdf.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-25-off-setup.js` | `38-off-pdf-setup-lock-oneline.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-26-off-wheel.js` | `39-off-pdf-wheel-min.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-27-off-resume.js` | `41-off-pdf-resume-min.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-28-off-later-sentence-and-mode.js` | `42-off-pdf-persistence-min.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-29-off-explicit-return.js` | `43-off-pdf-explicit-restore.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-30-off-restore-prefs.js` | `44-restore-off-preferences.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-31-speech-reentry.js` | `21-controlled-speech-reentry-pdf.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-32-uninterrupted-follow.js` | `22-controlled-normal-follow.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-33-natural-playback.js` | `51-pdf-playback-advancement-min.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
| `matrix-34-hidden-close-pdf.js` | `23-hidden-paused-close-pdf.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-35-close-fixtures.js` | `24-close-remaining-fixtures.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-36-erase-fixtures.js` | `25-erase-fixtures.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-37-restore-state.js` | `26b-restore-state-corrected.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-38-final-audit.js` | `28-final-audit-corrected.js` | 2026-09-13-1.12.6-beta4-manual-follow |
| `matrix-39-console-dead-objects.js` | `65-console-dead-object-inspection.js` | 2026-09-13-1.12.6-beta2-manual-follow, rerun unchanged in beta3 |
