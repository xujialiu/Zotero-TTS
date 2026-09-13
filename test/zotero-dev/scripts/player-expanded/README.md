# Scripts: 3e. Open the player expanded (issue #81)

[Case](../../cases/player-expanded.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

The kit checks the expanded opening live: the first visible state in a tab
and in a separate window, folding by hand, setting changes while a player
is open or still opening, fault recovery and a plugin reload. These are
zotero-dev bridge snippets, sent one at a time through `zotero_execute_js`
in chrome scope, each returning a JSON string; they are not a Node test
runner. Reusing them means adapting the literals named below and taking a
fresh baseline first. The PASS results under Runs are the old run's, not a
fresh pass.

## Before you start

- **Build and bridge:** the [baseline](../../baseline.md) first:
  `zotero_ping`, the build under test named by `zotero_plugin_list`, and
  `Zotero.ZoteroTTS.diagnostics.startup()` with every step `ok` and
  `failed: []`. The build needs `diagnostics.playerExpanded()`, which
  arrived in 1.12.3-beta. Drive by the
  [tester workflow](../../../../agents/zotero-tester.md): a bare
  `undefined` result is the ~8 s eval timeout, not an answer.
- **Two groups, never interleaved:** `tabs-*` needs a PDF and an EPUB,
  each open in exactly one reader tab, because it finds readers by item
  ID; `window-*` needs one attachment open twice, as a reader tab and as a
  separate reader window, and finds readers by instance ID. Run one group
  through its cleanup and restoration, from its own baseline, before the
  other starts.
- **Baseline, before any write:** the effective value and user-value
  presence of `extensions.zotero.reader.readAloudVoices` and, under
  `extensions.zotero.zotero-tts.`, `readAloud.openExpanded`,
  `readAloud.volume`, `readAloud.memory`, `webdav.syncSettings`,
  `webdav.autoUploadSettings` and `webdav.syncPositions`; also
  `Zotero.Debug.storing` and the rows of an awaited
  `diagnostics.position()`. Then suspend the three WebDAV switches, set
  the plugin volume to 0 and make sure `readAloud.memory` names a listed
  free voice, since opening a player starts playback. A read taken after
  these writes is never the baseline, and the run's `DO_NOT_RUN_*` files
  are not a snapshot script.
- **Fixtures:** standalone attachments imported the way the baseline does
  (`Zotero.Attachments.importFromFile({ file, libraryID:
  Zotero.Libraries.userLibraryID, title })`), each new ID and title
  confirmed as the run's own. `Zotero.Reader.open(id)` opens a tab and
  `Zotero.Reader.open(id, null, { openInWindow: true })` the separate
  window; poll for `_internalReader._readAloudManager` before driving
  either. Any PDF and EPUB will do, such as `test/fixtures/fixture-a.pdf`
  and `test/fixtures/return-key/return-key.epub`; the reports do not name
  the files the run imported. Set `openExpanded` to true before `tabs-01`
  and `window-01`: no retained script does.
- **Literals to replace:** `const id=25428` (the PDF attachment) in
  `tabs-01`, `tabs-02` and `tabs-03`; `const id=25429` (the EPUB
  attachment) in `tabs-04`; the ReaderWindow instance ID `'oxkx7jxW'` in
  `window-01` to `window-05`; `itemID=25430` and
  `targetIDs=['7mAE7agJ','oxkx7jxW']` (the ReaderTab, then the
  ReaderWindow) in `window-06`. All of them belonged to deleted fixtures.
  Read each new reader's `_instanceID`, constructor, `tabID` and window
  type first, and report results by those and the title, never by item ID
  alone.
- **The duplicate tab:** `window-01` samples the ReaderWindow. To sample
  the ReaderTab of the same attachment, put in the tab's instance ID, add
  the two lines that
  [follow-up-evidence.md](../../runs/2026-09-12-1.12.3-beta/follow-up-evidence.md)
  quotes (a focus, then `Zotero_Tabs.select(reader.tabID, true)`) before
  the document read, and archive that variant with the new run.
- **The selected tab:** a player opened through the API renders only in
  the tab selected at the time. `tabs-01` and `tabs-02` select the PDF tab
  themselves; `tabs-04` does not, so select the EPUB tab before it.
  `window-01` focuses its window.
- **Shared state:** `tabs-05` erases the IDs in the chrome-scope array
  `globalThis.__ztts81.created`, which the run's own import step must
  create with just the fixture IDs it imported, and which nothing may
  delete before `tabs-05` runs. The `window-*` scripts share no global;
  `window-02` to `window-04` put synthetic popups (`#ztts81-missing`,
  `.ztts81-fault-popup`) into the window reader's document, and
  `window-03` and `window-04` start by sweeping the second kind.
- **Never driven:** the owner's own readers and documents; no player
  toggles, pauses, key presses or DOM patches there. The `tabs-*` lookups
  take the first tab with the literal item ID, so run them only once that
  ID is a verified fixture's. `tabs-04` patches
  `HTMLButtonElement.prototype.click` in the EPUB fixture's reader window
  alone.

## Run order

Each group runs top to bottom. A step between scripts that no retained
script performs is named in the row that needs it.

| Script | What it does | Items | Expected |
| --- | --- | --- | --- |
| `tabs-01-pdf-first-frame.js` | Closes the PDF tab's player, selects the tab, clicks the toolbar Read Aloud button, samples the popup every 20 ms (up to 3 s) until the diagnostic reports it ready, expanded and not pending, then pauses the fixture if it plays. Needs `openExpanded` true. | 2, 8 | `closedBeforeOpen: true` and `styleInstalled: true` before the click; `success: true`; `visibleBeforeReady: 0`; `firstVisibleSample` expanded and ready (24 ms in the run); `diag.pending: false` |
| `tabs-02-options-fold.js` | Clicks the open, expanded PDF player's Options button and reads it 180 ms later. Then close and reopen with `tabs-01`, which must expand again (26 ms in the run). | 3, 6 | `after.expanded: false`, `after.ready: true`; `active` and `paused` as in `before`; `diag` `ready: true`, `expanded: false`, with no second automatic click |
| `tabs-03-disable-while-expanded.js` | With the PDF player open and expanded, sets `openExpanded` false and reads 150 ms later. Then, without a retained script: the next opening stays collapsed with `clicked: false`, and setting `openExpanded` true over that collapsed player leaves it alone. | 4, 6 | `after.expanded: true`; `after.style` empty; `active` and `paused` as in `before`; `pref: false` |
| `tabs-04-disable-while-pending.js` | In the selected EPUB tab: closes its player, sets `openExpanded` true, turns clicks inside the popup into no-ops on the reader window's button prototype, opens the player, catches the pending state, restores the click, sets `openExpanded` false and reads 120 ms later. | 4 | `pending.visibility: "hidden"` with `pending.diag.pending: true` (22 ms in the run); `released` visible, `ready: true`, `diag.pending: false`; `patchRestored: true`; `error: null` |
| `tabs-05-fixture-cleanup.js` | Once both fixture readers are closed, erases every item listed in `globalThis.__ztts81.created`. | cleanup | every entry `found: true`, `erased: true`; an awaited `diagnostics.position()` back at the baseline rows (65 in the run) |
| `window-01-first-visible.js` | Focuses the separate reader window, opens its player, samples every 10 ms (up to 5 s) until a visible, expanded and ready sample, and closes the player in `finally`. | 2, 8 | `target.constructor: "ReaderWindow"`, `windowType: "zotero:reader"`; `firstVisible` equal to `firstExpanded` (41.9 ms in the run); the tab variant `"ReaderTab"`, `"navigator:browser"`, the same (342.7 ms) |
| `window-02-missing-options-button.js` | Appends a synthetic popup without an Options button (`#ztts81-missing`) to the window reader's document, reads it 150 ms later and removes it. | 7 | `beforeStyle: "hidden"`, `afterStyle: "visible"`; `diagnostic` `ready: true`, `expanded: false`, `clicked: false`, `pending: false`, `outcome: "failed"`; the error "player Options button not found" logged |
| `window-03-throwing-access-confounded.js` | Refreshes `openExpanded`, appends a synthetic popup whose Options button throws when its `click` is read, records it hidden, then detaches the gate stylesheet itself before a 250 ms read; reattaches it and refreshes the setting. | 7, mechanism only | `getterCalls: 1`; `before.visibility: "hidden"`, `before.styleTextLength` nonzero (84); `diagnostic` `enabled: false`, `outcome: "failed"`; `after.styleTextLength: 0`; the thrown error in the error buffer. `after.visibility` is not evidence |
| `window-04-noncommit-timeout.js` | Refreshes `openExpanded`, appends a synthetic popup whose Options button does nothing, and samples it at once, at 100 ms and at about 1,150 ms. | 7 | `pending` hidden with `diagnostic` `clicked: true`, `pending: true`, `outcome: "pending"`; `after` visible, `ready: true`, `pending: false`, `outcome: "failed"` (`elapsedMs: 1180` in the run); the error "player expansion timed out" logged |
| `window-05-after-plugin-reload.js` | Read-only, after three steps without a retained script: the window's real player opened (it expands) and paused at once, its popup and manager state recorded; `zotero_plugin_reload` with `{"pluginId":"zotero-tts@xujialiu.top"}`; `diagnostics.startup()`. | 5 | startup every step `ok`; `popup` `expanded`, `ready`, `visible`; `diagnostic` `clicked: false`, `pending: false`, `outcome: "existing"`; `manager` `active`, `paused`, voice, tier and speed as before the reload; `styleTextLength` nonzero (84) |
| `window-06-cleanup.js` | Closes the players and then the readers of the two listed instances, waits up to 6 s for them to go, erases the fixture item, reads the position rows and clears `openExpanded`'s user value. | cleanup | `remainingReaders: []`; `erased: true`, `eraseError: null`; `positionRows` at the baseline (65 in the run); `fixtureReaderLeftovers: []`; `prefAfter` `effective: false`, `hasUserValue: false` |

## Cleanup

Each group restores all of this before the other group starts.

- **Fixture DOM patches first:** `tabs-04` restores its click patch in
  `finally` (`patchRestored: true`); `window-02` removes its node,
  `window-03` reattaches the stylesheet, and `window-03` and `window-04`
  remove their `.ztts81-fault-popup` nodes. Confirm no `ztts81` node is
  left, since the sweeps do not match `#ztts81-missing`.
- **Then owned readers and items:** close a player only with
  `toggleReadAloudPopup(false)`, then its reader. `window-06` does both for
  its two instances before erasing the item; the `tabs-*` group has no
  retained close step, so close the two fixture tabs the same way, by
  verified ID, before `tabs-05`. The position rows must be back at the
  baseline.
- **Then the other preferences, the WebDAV switches still suspended:**
  `readAloud.openExpanded` to its snapshot, value and user-value presence
  (`window-06`'s `clearUserPref` is right only when the baseline had no
  user value, as in the run); `reader.readAloudVoices`; `readAloud.memory`
  verbatim, last of these; `Zotero.Debug.storing` as found.
- **Plugin volume and sync switches last:** `readAloud.volume` to its
  snapshot value and user-value state, then the three WebDAV switches to
  the values captured before the first write, never to a read taken after
  setup. An originally enabled auto-upload may upload once on restore:
  record it; clearing the switch instead was the first pass's incident.
- **Byte-identical at the end:** every preference above, value and
  user-value presence alike, re-read against the snapshot, including
  `reader.readAloudVoices` and `readAloud.memory`, which the follow-up
  never compared; no fixture item, reader or `ztts81` node left; the
  owner's readers as found.
- **Not restore scripts:** the run's `restore-original-transports.js`
  wrote that run's own switch values, and its `DO_NOT_RUN_*` files are the
  incident's snapshot and clear. Neither is part of the kit.

## Limits

- **A sampler is not a recording:** `tabs-01` (20 ms) and `window-01`
  (10 ms) read computed style on a timer, so a collected sample is not
  every rendered frame, and a final expanded diagnostic says nothing about
  the first one. Whether a collapsed flash or an unacceptable delay shows
  is a human check: ask the user (item 8).
- **`window-03` is confounded:** it removes the gate stylesheet itself
  before its visibility read, so `after.visibility: "visible"` does not
  show that the exception path revealed the player. It establishes only
  that the handler ran, disabled the gate and emptied the stylesheet;
  visible recovery on that path rests on the unit tests. A better live
  check would keep the stylesheet connected and not rely on a transient
  diagnostic.
- **`window-04` bounds the timeout:** release by the 1,180 ms sample shows
  the 1,000 ms timer had fired by then, not when it fired.
- **`tabs-04`'s playback fields are inert:** it reads the manager at
  `reader._readAloudManager`, which a chrome reader instance does not have
  (it is `reader._internalReader._readAloudManager`), so its pause guard
  never runs and `after.active` and `after.paused` always read false.
  Pause the EPUB fixture separately if its opening started playback.
- **`tabs-01` matches the diagnostic by item ID:** with the same
  attachment open in a second reader it can read the other reader's entry,
  which is why the first pass's separate-window sampling stayed PENDING.
  The `window-*` scripts pair readers by instance ID and array index.
- **Not covered live:** the native low-quota reminder (item 6) never
  appeared, NOT TESTABLE; a document-access failure (item 7) has unit
  tests only; installing over an already-open player (item 5) was not
  exercised, and `window-05` follows `zotero_plugin_reload`, not the
  in-place reinstall a real upgrade takes; nobody listened to the audio.
- **Observed without a retained script:** item 1's toolbar and trusted
  `Shift+Space` openings, the EPUB opening (49 ms, trusted shortcut), the
  first pass's separate-window final state, `Shift+O` folding, voice and
  speed kept (item 6), the opening while disabled, enabling over a
  collapsed player, and new readers attaching and detaching on close. A
  run that repeats them writes those scripts and archives them with its
  evidence.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-12-1.12.3-beta, first pass | PASS: 1; 2 (PDF, EPUB, the separate window's final state); 3; 4; 5 (new readers, close); 6 (observed state only); 8 (PDF and EPUB samples only). NOT TESTABLE: the quota reminder (6). PENDING: separate-window samples (8), install with an open player (5), live fault recovery (7) | [issue-81.md](../../runs/2026-09-12-1.12.3-beta/issue-81.md) · [scripts](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/README.md) |
| 2026-09-12-1.12.3-beta, follow-up | PASS: 2 and 8 (separate-window and duplicate-tab samples); 5 (plugin reload, startup); 7 (missing button, noncommitting click, and the throwing access for its mechanism only). Not established live: that throwing path's visible recovery (7). Not tested: a document-access failure (7), the quota reminder (6) | [issue-81.md](../../runs/2026-09-12-1.12.3-beta/issue-81.md) · [follow-up-evidence.md](../../runs/2026-09-12-1.12.3-beta/follow-up-evidence.md) · [scripts](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/README.md) |

## Where each script comes from

| Script | Executed as | Run |
| --- | --- | --- |
| `tabs-01-pdf-first-frame.js` | [pdf-first-frame.js](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/pdf-first-frame.js) | 1.12.3-beta first pass |
| `tabs-02-options-fold.js` | [manual-collapse-pdf.js](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/manual-collapse-pdf.js) | 1.12.3-beta first pass |
| `tabs-03-disable-while-expanded.js` | [setting-disable.js](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/setting-disable.js) | 1.12.3-beta first pass |
| `tabs-04-disable-while-pending.js` | [pending-disable.js](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/pending-disable.js) | 1.12.3-beta first pass |
| `tabs-05-fixture-cleanup.js` | [fixture-cleanup.js](../../runs/2026-09-12-1.12.3-beta/scripts/first-pass/fixture-cleanup.js) | 1.12.3-beta first pass |
| `window-01-first-visible.js` | [window-first-visible.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/window-first-visible.js) | 1.12.3-beta follow-up |
| `window-02-missing-options-button.js` | [missing-button.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/missing-button.js) | 1.12.3-beta follow-up |
| `window-03-throwing-access-confounded.js` | [throwing-access-confounded.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/throwing-access-confounded.js) | 1.12.3-beta follow-up |
| `window-04-noncommit-timeout.js` | [noncommit-timeout.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/noncommit-timeout.js) | 1.12.3-beta follow-up |
| `window-05-after-plugin-reload.js` | [post-reload.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/post-reload.js) | 1.12.3-beta follow-up |
| `window-06-cleanup.js` | [cleanup.js](../../runs/2026-09-12-1.12.3-beta/scripts/follow-up/cleanup.js) | 1.12.3-beta follow-up |

Every kit file is a byte-identical copy of the original it names.
