[Checklist index](../../README.md) · [All scripts](../README.md) · [Case](../../cases/zotero-tiers.md) · [Tester workflow](../../../../agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-tiers'`), with
`params: { fixtureItemID: 25290 }` on every `start` (the standing library
item `ZTTS Fixture A`). `08`/`09` bracket the tester's own
`zotero_plugin_install` reinstall call, which is not a script. `03b`/`04b`
run BEFORE `03`/`04` (reordered — see Limits): both need Standard ON at
start and leave it ON, while `03`/`04` leave it OFF for the next item's
setup — the table's order satisfies every script's precondition.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-snapshot.js` | Zotero/reader state, error ring, debug store, a typed snapshot of every pref the case touches (all 8 providers' `.enabled`, both Zotero switches, volume, `sameForAllDocuments`, `readAloud.memory`, `reader.readAloudVoices`, both WebDAV switches recorded only) | Applies the run's own state (volume 0) once the snapshot is captured | — |
| `01-pane-structure.js` | Item 1: opens the pane fresh, reads every `groupbox` id in DOM order, the Zotero section's `h2`/note/`?`/two rows | 17 groupboxes (not the case's stated 16 — see Limits), `zoteroH2HasLink: false`, both rows present with no fields | — |
| `02-headless-check.js` | Item 2: `diagnostics.zoteroTiers()` + Test connection beside Standard, polled | `sawTesting`, final text equals the diagnostic's own message | — |
| `03b-language-coverage-allvoices.js` | Requires Standard ON at start (self-heals to ON on its own throw otherwise). A correction to item 3's language sub-check (see Limits): global language coverage from `_allVoices.language`, both on vs. Standard off | `lostToDisabling: []` (no language was Standard-exclusive on this profile) | `fixtureItemID` |
| `04b-lastmove-popup-only-close.js` | Requires Standard ON at start. Investigates `lastMove` staying null: same manager instance, popup-only close/reopen instead of a full tab close. Now closes the tab and WAITS for it to leave `Zotero.Reader._readers` before its own restore click (see Limits — the guard blocks that click while the reopened popup is still up) | `lastMoveAfterReopenSamePopup: null` even with `sameManagerInstance: true` — see Limits | `fixtureItemID` |
| `03-disable-standard.js` | Item 3: captures "both on" state, clicks Disable (no player open), reopens fresh to check `hidden`/`options`/`_allVoices`-by-index/voice-browser tiers. Leaves Standard OFF, for `04`'s own setup | `fixtureOptionsHasStandard: false`; `#ztts-voices-tiers` drops `Zotero Standard` entirely — fixed in beta2, was a real bug through beta (see Limits) | `fixtureItemID` |
| `04-hidden-selection-moves.js` | Item 4: setup re-enables Standard (a no-op if `04b` already left it on), picks the tier (at once) + a distinct voice (the #108 handoff), closes, disables (item 3's way), reopens. Leaves Standard OFF, for `05` | `voicePickLanded: true`; `selectedTierIsNotStandard: true`; `lastMove: null` — see Limits | `fixtureItemID` |
| `05-enable-restores-memory.js` | Item 5: Enable beside Standard, polled: pref-based break (not label-based — see Limits), then reopens and picks the tier to check the memory recall | `memoryRecallMatches: true`; `voicesTiersChildrenAfterEnable` shows `Zotero Standard (28)` again | `fixtureItemID` |
| `06-reading-guard.js` | Item 6: fixture popup open+paused, Disable beside Premium, reads the `ztts-notice` dialog, presses Stop and continue, POLLS for real settlement (dialog gone AND the pref moved, up to 10 s — a fixed 500 ms sleep raced this on one run, see Limits) before reading state, restores via Enable | `dialogNamesFixture: true`; `prefAfterStop: false`; `fixtureActiveAfterStop: false`; `strayDialogCount: 0`; restore `pref: true` | `fixtureItemID` |
| `07-everything-off.js` | Item 7: disables every enabled provider (this profile: only `fish`) + both Zotero tiers, each driven to an EXPLICIT target state (not just flipped — see Limits), checks the status line/`#ztts-voices-tiers`/`providerTiers()`, restores all through Enable | `fixtureOptions` = Zotero's 3, all `disabled: true`; status line reads `ztts-no-providers-on` — fixed in beta2, was a real bug through beta (see Limits); `restoreFailed: []` | `fixtureItemID` |
| `08-before-reload.js` | Item 9 setup: opens the fixture fresh, leaves the tab open, snapshots `providerTiers()`/`zoteroTiers()`/errors | — | `fixtureItemID` |
| `09-after-reload.js` | Item 9: after the tester's own reinstall, polls the surviving tab, re-reads a FRESH pane's switches, diffs the debug log tail for new dead-object lines | `readerSurvived: true`; `switchesMatchPrefs: true`; `deadObjectMentionsInTail: 0` | — (reads `state.fixture` from `08`) |
| `10-cleanup-restore.js` | Restores every pref from `state.baseline`, in order, `readAloud.memory` last; closes the settings window; reports the error ring | Every restored pref `matches: true` | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` +
  `diagnostics.zoteroTiers().feature === "zotero-tiers"` +
  `diagnostics.providerTiers()` carrying a `hidden` field (done directly).
- Fixture: the **standing** item `ZTTS Fixture A`, itemID **25290** (found
  by `zotero_db_query` on the title) — never imported or erased here.
- State touched, restored by `10`: `readAloud.volume`, all 8 providers'
  `.enabled` (only `fish` was on), both Zotero switches,
  `sameForAllDocuments`, `readAloud.memory`, `reader.readAloudVoices`,
  `Zotero.Debug.storing`; the two WebDAV switches are read only.
- Every `openFixturePausedFresh` helper (03–08) opens the fixture, pauses
  at once, then **settles**: polls `providerTiers()` up to 6 s until
  `tiers`/`options` stop changing, since the catalog's async fetch (Fish's
  339-voice listing) can still be running when the pause-loop exits — see
  Limits. It never refuses a metered (no `::`) `readAloud.memory` voice:
  this case is authorized to touch Zotero's own voices (A3–A7 are it).

## Limits

- **`manager.languages` is scoped to the CURRENTLY SELECTED TIER, not a
  union across tiers**: a "both on" capture read either 9 languages
  (Standard's) or ~67 (Fish's) depending on which tier the popup happened
  to open on. Item 3's check reads `manager._allVoices[i].language`
  instead (global, tier-independent — `.locale` is the plugin's own
  separate `BrowserVoice` type, not this). `03b` redoes it that way: PASS,
  `lostToDisabling: []`.
- **FIXED in 1.12.11-beta2 — the voice browser's `#ztts-voices-tiers`
  used to keep a hidden Zotero tier's column.** Through beta: Standard
  disabled still listed `Zotero Standard (0)` instead of dropping it, and
  EVERYTHING off (`07`) read the status line `ztts-no-voices` instead of
  `ztts-no-providers-on`, since `tiers.length` was 2, not 0
  (`ui/voice-browser-rows.ts`'s `listedColumns()` ~246 appended both
  `ZOTERO_TIERS` regardless of `hiddenZoteroTiers()`, and
  `listBrowserVoices()`'s "keep an unlisted column" safety net ~428
  re-added them, not yet in `known`). **beta2 fix, confirmed live this
  run**: the safety net merges back only a plugin provider's column now
  (`isZoteroTier`) — `03` reads `voicesTiersChildrenAfterDisable:
  ["Fish Audio (339)", "Zotero Premium (1452)"]`, `07` reads
  `voicesStatusAfterAllOff: "No provider is on: enable one above."`,
  `voicesTiersChildCountAfterAllOff: 0`. The player's dropdown
  (`buildTierOptions`) was unaffected throughout, on both builds.
- **A same-instant `providerTiers()` read after opening can catch
  `buildTierOptions`' "nothing has voices yet" fallback while `tiers` in
  the SAME read is already correct** — a timing artifact of the async
  catalog fetch, not a product bug: a re-read 3 s later with no further
  action shows the correct list. Every open in this kit now settles (see
  "Before you start"); an unsettled `options` read will see this.
- **`lastMove` stays `null` through the case's own "close and reopen"
  procedure for a Zotero-tier hide, confirmed on two different closes**:
  a full tab close+reopen (`04`) and a popup-only close+reopen on the
  SAME manager instance (`04b`, `sameManagerInstance: true`) both read
  `lastMove: null`, though `selectedTier` correctly avoids `standard`
  either way. Read from `provider-tiers.ts`'s `retagAndMove`: it only
  records a move when `manager._selectedTier` is ALREADY a string at the
  moment `_resolveVoice` runs; a manager whose session was stopped (by
  either close) does not carry one into its next resolve, so
  `strandedTarget`'s `selected === null` short-circuit fires — Zotero's
  own resolve lands elsewhere directly, since `withoutTiers` already
  dropped Standard's voices before it looks. The mechanism itself is real
  (provider-tiers case B's item 5, writing `_selectedTier` directly before
  `_resolveVoice()`), but is not reachable through the reading guard's own
  mandatory stop-then-switch path (item 6). Item 4's literal expectation
  of a populated `lastMove` looks like a wrong expectation, not a bug; the
  observable behavior it cares about (lands on a real voice, never
  `standard`) held both times.
- **A poll that breaks on "the button's label is not Checking..." alone
  races the click**: the very first read, before the handler has run at
  all, can still show the pre-click label, satisfying "not Checking" and
  ending the loop before anything happened (found live: `pref:false,
  label:"Enable"` moments before a fresh read showed `pref:true,
  label:"Disable"`). `02` was never affected. `05`/`06`/`07` now break on
  the PREF reaching its target, falling back to "Checking seen, then
  cleared" only on a failed check.
- Two `zotero_execute_js`/`one()` calls for `04b` raced (a bridge timeout
  on the first did not mean it had not started server-side); the two
  flipped the same switch concurrently, and Standard was found off with
  two failed self-restores until a manual click cleared it. `one()`'s
  "busy" lock does not protect against a timeout followed by a fresh
  `start()` — wait for `status().busy: false` before retrying.
- **`03b`/`04b` each require Standard ON at start** (found running the
  table's OLD order for the first time): both cycle on→off→on and throw
  if it is not already on, since `03`/`04` deliberately leave it OFF for
  the next item's setup. Each throw's catch self-heals (clicks Enable
  before rethrowing), so state is not corrupted, but the attempt is
  wasted. The reorder above avoids it; retry the same script once
  Standard is back on if it still throws.
- **The reading guard can leave TWO `<dialog id="ztts-notice">` open at
  once if a caller's own next action fires before the first invocation
  settles** (found on `06`'s old fixed `sleep(500)`): a single, isolated
  click resolves fast and correctly (dialog gone ~110 ms; the write
  follows at once for Disable, or after Enable's own ~650-750 ms check —
  confirmed live, cleanly, twice) — the mechanism itself is correct. But
  `06`'s 500 ms read was sometimes too early, and its own immediate
  "restore" click (on a toggle whose label had not yet updated) fired a
  SECOND `refuseWhileReading` while the first was mid-flight, stacking a
  second `openNotice()` dialog on the first; `getElementById` only ever
  finds the OLDER one, so the switch stayed stuck refused for 15 s+ until
  both were closed by hand. `06` now polls for real settlement (dialog
  gone AND the pref moved, up to 10 s) before anything else, and throws
  if a stray dialog remains. Not reachable by a real user:
  `showModal()` traps input outside itself.
- **`07`'s old `clickAndWaitSettled` always flipped whatever the pref
  CURRENTLY was, not an explicit target** (downstream of the `06` race
  above): with Premium's guard-triggered disable landing a beat after
  `06` stopped watching it, `07` began "disable everything" with Premium
  ALREADY off; its blind flip clicked it back ON mid-pass, and the run's
  own `fixtureTiersEmpty`/`allOptionsDisabled` checks correctly caught
  the wrong state (`["premium"]`, `false`) — a real finding, not a false
  pass. Fixed with an explicit `desired: false`/`true` per phase; a
  switch already at target is left untouched, reported `skipped: true`.
  Re-run cleanly after: `zoteroPremiumBefore: true`,
  `voicesStatusAfterAllOff: "No provider is on: enable one above."`,
  `restoreFailed: []`.
- Item 8 (backup/restore) was not run this pass (optional per the brief).

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 1.12.11-beta, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #111 verification) | 1 PASS (groupbox count 17, not the case's 16), 2 PASS, 3 PASS (options/tiers; voice-browser column FAIL, see Limits), 4 PASS (voice pick + selection avoids standard; `lastMove` null, see Limits), 5 PASS (memory recall confirmed), 6 PASS, 7 PASS (switches/options; status line FAIL, see Limits), 9 PASS, 8 not run | First run of this case's kit; `01`, `05`, `06`, `07` revised mid-run for a label-attribute bug and a click-poll race; `03`/`04`/`05`/`06`/`07`/`08` gained a settle-wait and stopped refusing a metered `readAloud.memory` voice |
| 2026-09-15 | 1.12.11-beta2, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #111 second-pass verification) | 1 PASS, 2 PASS, 3 PASS (voice-browser column now correct, the beta bug fixed), 4 PASS, 5 PASS, 6 PASS (cleanly, 101 ms settle after the `06` fix), 7 PASS (status line now correct, the beta bug fixed; re-run cleanly after the `07` fix), 9 PASS, 8 not run (optional) | Second run, re-verifying the beta2 fix for A3/A7 plus a full re-check of the rest; `03b`/`04b` hit their own Standard-ON precondition on the table's old order and were retried after self-healing (table reordered above so this does not recur); `04b` revised for the guard-race/stale-close bug, `06` for the settlement-poll bug, `07` for the flip-vs-target bug (both found live this run, see Limits) — all three re-run clean after the fix; `00`/`10` unchanged |
