[Checklist index](../../README.md) · [All scripts](../README.md) · [Case](../../cases/zotero-tiers.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-tiers'`), with
`params: { fixtureItemID: 25290 }` on every `start` (the standing library
item `ZTTS Fixture A`). `08`/`09` bracket the tester's own
`zotero_plugin_install` reinstall call, which is not a script. `03b`/`04b`
run BEFORE `03`/`04` (reordered — see Limits): both need Standard ON at
start and leave it ON, while `03`/`04` leave it OFF for the next item's
setup — the table's order satisfies every script's precondition. `10`/`11`
(issue #130) are their own self-contained pair — opening the pane fresh
rather than reusing `01`'s, needing no fixture — and run any time after
`09`; `12` (renamed from `10`) always runs last.

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
| `10-signed-out-greyed.js` | Item 10 (issue #130): opens the pane fresh, self-heals both switches ON, disables Standard (item 3's way, real click), shadows `Zotero.Sync.Data.Local.hasCredentials` to `() => false` (own descriptor kept) and fires `api-key`, then dispatches a raw `command` event at the greyed button | `standardAfterSignOut.disabled: true`; `premiumAfterSignOut.disabled: false`, same reason on both lines; `zoteroTiers().signedIn: false`; every reader `signedIn: false`; `commandEventWasNoOp: true` | — |
| `11-signed-in-again.js` | Item 11 (issue #130): restores `hasCredentials` (the kept descriptor) and fires `api-key` again, then enables Standard the item-5 way (polled on the PREF); closes the pane | `standardDisabledFalse: true`; both result lines `''`; every reader `signedIn: true`; `standardResultMatchesExpected: true` | — |
| `12-cleanup-restore.js` | Restores every pref from `state.baseline`, in order, `readAloud.memory` last; closes the settings window; reports the error ring | Every restored pref `matches: true` | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` +
  `diagnostics.zoteroTiers().feature === "zotero-tiers"` +
  `diagnostics.providerTiers()` carrying a `hidden` field (done directly).
- Fixture: the **standing** item `ZTTS Fixture A`, itemID **25290** (found
  by `zotero_db_query` on the title) — never imported or erased here.
- State touched, restored by `12`: `readAloud.volume`, all 8 providers'
  `.enabled` (only `fish` was on), both Zotero switches,
  `sameForAllDocuments`, `readAloud.memory`, `reader.readAloudVoices`,
  `Zotero.Debug.storing`; the two WebDAV switches are read only. `10`/`11`
  touch `Zotero.Sync.Data.Local.hasCredentials` (own descriptor kept and
  restored inside `11`) and fire two `api-key` notifications — not
  restored by `12`, since `11` already leaves everything signed back in.
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
- **FIXED in 1.12.11-beta2 — the voice browser's `#ztts-voices-tiers` used
  to keep a hidden Zotero tier's column** (`ui/voice-browser-rows.ts`'s
  `listedColumns()`/`listBrowserVoices()` safety net, not yet in `known`):
  confirmed live both ways, `03`/`07` reading the stale column through
  beta and the correct one (`voicesStatusAfterAllOff: "No provider is on:
  enable one above."`) from beta2 on. The player's dropdown
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
- Two `one()` calls for `04b` raced once (a bridge timeout on the first
  did not mean it had not started server-side), flipping the same switch
  concurrently until a manual click cleared it: wait for `status().busy:
  false` before retrying rather than assuming a timed-out call never ran.
- `03b`/`04b` each require Standard ON at start (they cycle on→off→on);
  the table above is ordered so `03`/`04` (which leave it OFF) run after
  them — each throw's catch self-heals regardless, so retrying the same
  script clears it.
- **The reading guard can leave TWO `<dialog id="ztts-notice">` open at
  once if a caller's next action fires before the first settles** (found
  on `06`'s old fixed `sleep(500)`): a single, isolated click resolves
  correctly (~110 ms; not reachable by a real user, since `showModal()`
  traps input outside itself) — the mechanism itself is correct, but an
  early read plus an immediate restore click can stack a second dialog,
  which `getElementById` never finds, stuck refused for 15 s+. `06` now
  polls for real settlement (dialog gone AND the pref moved, up to 10 s)
  and throws if a stray dialog remains.
- **`07`'s old `clickAndWaitSettled` flipped whatever the pref CURRENTLY
  was, not an explicit target** (downstream of the `06` race above):
  Premium's guard-triggered disable landing a beat late meant `07` began
  with Premium already off, and its blind flip clicked it back ON
  mid-pass — caught correctly by `07`'s own checks (`["premium"]`,
  `false`), a real finding, not a false pass. Fixed with an explicit
  `desired: false`/`true` per phase, left untouched when already there
  (`skipped: true`); re-run cleanly after.
- Item 8 (backup/restore) was not run in either zotero-tiers pass
  (optional per the brief).
- **Toggling a provider/tier `.enabled` pref while ANOTHER reader's own
  session is already active logs a caught `[zotero-tts] can't access
  property "length", list is undefined`** (`live-voice-list.ts` `load()`,
  `stage._allVoices` undefined — column 77 of the built bundle; found live
  by `10`/`11` against the owner's own open tab, `applied` staying 0 for
  its `liveVoiceList()` entry every time, reproduced once more in
  isolation): traced to an in-place reinstall leaving that reader hooked
  to the OLD plugin instance's `loadVoices` wrapper, which the NEW
  instance's `attach()` then captures as `entry.original` and calls with
  a `stage` the old wrapper never populates. Harmless — the session's own
  playback is unaffected — reported to the main session, not a limit of
  these checks; only surfaces when a reader was already active before an
  in-place reinstall, which prior runs of this kit did not have.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 1.12.11-beta, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #111 verification) | 1 PASS (groupbox count 17, not the case's 16), 2 PASS, 3 PASS (options/tiers; voice-browser column FAIL, see Limits), 4 PASS (voice pick + selection avoids standard; `lastMove` null, see Limits), 5 PASS (memory recall confirmed), 6 PASS, 7 PASS (switches/options; status line FAIL, see Limits), 9 PASS, 8 not run | First run of this case's kit; `01`, `05`, `06`, `07` revised mid-run for a label-attribute bug and a click-poll race; `03`/`04`/`05`/`06`/`07`/`08` gained a settle-wait and stopped refusing a metered `readAloud.memory` voice |
| 2026-09-15 | 1.12.11-beta2, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #111 second-pass verification) | 1 PASS, 2 PASS, 3 PASS (voice-browser column now correct, the beta bug fixed), 4 PASS, 5 PASS, 6 PASS (cleanly, 101 ms settle after the `06` fix), 7 PASS (status line now correct, the beta bug fixed; re-run cleanly after the `07` fix), 9 PASS, 8 not run (optional) | Second run, re-verifying the beta2 fix for A3/A7 plus a full re-check of the rest; `03b`/`04b` hit their own Standard-ON precondition on the table's old order and were retried after self-healing (table reordered above so this does not recur); `04b` revised for the guard-race/stale-close bug, `06` for the settlement-poll bug, `07` for the flip-vs-target bug (both found live this run, see Limits) — all three re-run clean after the fix; `00`/`10` unchanged |
| 2026-09-22 | 1.14.1-beta2, Zotero 10.0.3-beta.3+80bc5565e | the #130 closing comment | 10 PASS (`standardAfterSignOut`/`premiumAfterSignOut` exact reason text, every reader `signedIn: false`, `commandEventWasNoOp: true`), 11 PASS (ungreyed at once, every reader `signedIn: true`, Enable re-check matches `zoteroTiers()`'s own message) | First run of `10`/`11`, new for issue #130; both written and run clean first time, no revision needed; found live (see Limits) — toggling either switch while the owner's own OTHER open tab already had an active session logged a caught, harmless `[zotero-tts]` error unrelated to these items' own PASS/FAIL |
