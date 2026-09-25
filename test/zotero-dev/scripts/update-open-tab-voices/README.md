# Scripts: a tab open across an update keeps building its voice list (issue #131)

[Case](../../cases/update-open-tab-voices.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `00-baseline.js` | Zotero/reader state, error ring + dead/target-message baseline, debug store on, position rows, named-pref snapshot (volume, memory, zotero-standard.enabled), closes a stray settings window | Volume becomes 0; memory already a listed (`::`) voice on this profile (recorded, not changed); rows/switch snapshotted for the return check | none |
| `01-open-fixture-and-player.js` | Imports fixture-a.pdf, opens it in a tab, selects it, opens its Read Aloud player natively (`toggleReadAloudPopup(true)`) and pauses it in the SAME script, confirms the selected voice is listed | Reader ready within the ceiling; `active:true, paused:true`; `selectedVoiceID` has `::`; `liveVoiceList()` entry `applied:1` (the automatic startup-time populate, see Limits) | `root`, `fixturesDir` |
| `02-item1-plant-leftover.js` | Item 1: sets the fixture manager's OWN `loadVoices` to a `Cu.exportFunction`-wrapped no-op that resolves without touching `this`, simulating the leftover an earlier instance leaves | Own property replaced; `state.fakeLoadVoicesAsRead` holds the identity-stable, READ-BACK reference (see Limits on why) for item 3's negative check | none (reads `state.fixture`) |
| `03-flip-switch-and-check.js` | Items 1/2/3/4: flips `zotero-standard.enabled` `params.flips` times (default 2; item 4 passes 1), waits each round to fully settle, records new `list is undefined` console entries (timestamp-scoped to the round), the entry's `applied/loading/revision`, the manager's own-vs-prototype `loadVoices`, and `pluginPlayer()`'s last row (the fixture's, by insertion order) | Item 1 (1.14.3, leftover): 1 new error per round, `applied` stays 0. Items 2-4 (fix build): 0 new errors, `applied` +1 per round, prototype method source starts `async loadVoices(` | `flips`, `label` |
| `04-close-and-reopen-fixture.js` | Item 4: closes the current fixture reader (`reopen:false`), or reopens the SAME item + its player, paused (`reopen:true`) | Closed reader gone from `Zotero.Reader._readers`; reopened reader ready, voice still listed | `reopen` |
| `05-cleanup.js` | Closes the fixture reader, erases the fixture item, restores volume/memory/zotero-standard.enabled (memory last) and the debug store, reports position rows/settings window/errors/startup | Rows back to the baseline count; every restored pref `matches:true`; `startup()` still all `ok` on the left-installed build | none |
| `06-observe-owner-tab.js` | Brief items 2/3, observe-only: flips the switch once (either direction) and reads a NAMED owner reader's `liveVoiceList()` entry and manager own-property state before/after, and whether its session (`active/paused/selectedVoiceID`) moved | On 1.14.3: 1 new error, `applied` unchanged; on the fix: 0 errors, `applied` +1; `sessionUnchanged:true` both times | `ownerItemID` (never hard-coded) |

## Before you start

- Build and bridge: `zotero_ping`; WebDAV isolation (workflow "Test WebDAV
  first") runs once per session, outside this kit — this kit's own scripts
  never read or write `webdav.*`. Install the xpi under test; confirm the
  version with `zotero_plugin_list`; `diagnostics.startup()` all `ok`
  before driving anything. Prove the bundle by `native(manager,
  "loadVoices")` in the installed `content/zotero-tts.js` — present once
  on the fix, absent on 1.14.3 (`getPrototypeOf(proto)` proves nothing:
  present on both, 4/6 times — corrected mid-run 2026-09-25).
- The case's own installs/reinstalls between scripts are made directly by
  the tester (`zotero_plugin_install`, never a kit script), the same
  pattern `plugin-lifecycle`'s kit already established.
- Fixture: `fixture-a.pdf`, imported once by `01` and erased by `05`;
  never an owner tab. `06`'s `ownerItemID` names a reader the kit never
  imports or erases, and never plays/pauses/clicks — passed by the tester,
  found via a `zotero_execute_js` reader listing first.
- State touched, restored by `05` (plus the standalone WebDAV restore
  outside this kit): `readAloud.volume`, `readAloud.memory`,
  `zotero-standard.enabled`, `Zotero.Debug.storing`. `06` flips
  `zotero-standard.enabled` an extra time in each direction (net zero);
  re-confirm the final value against the baseline after running it.
- Window: minimize before this kit's bridge-only work (workflow "Minimize
  by default") — missed at the start of the 2026-09-25 run and corrected
  only at cleanup; do it from the first script next time.

## Limits

- **A fresh instance's own startup already runs one automatic refresh**
  for every reader whose player is already open (not just the fixture's):
  `liveVoiceList()` reads `applied:1, revision:1` (or, with a leftover
  already captured as `entry.original`, `applied:0, revision:1`) before
  any explicit flip. This is `revision +1` only (no `invalidate()`), unlike
  a pref-flip's `+2` — read a script's own "before", never assume `0/0`.
- **A single flip bumps `revision` by 2**, not 1: `invalidate()` once,
  `load()`'s own `++` once. A wait condition using `revision > before`
  alone is satisfied by the instant between the two (load() not yet
  started, `loading` still 0) — a false "settled" read at ~40ms live
  2026-09-25, while the real load() began ~150ms later. `03`/`06` wait for
  `revision >= before + 2`.
- **Fish's real remote `getVoices()` can take longer than 10s.** The
  first clean-up pass used a 10s per-round ceiling; round 2's flip fired
  while round 1's `load()` was still in flight, and the revision-supersede
  guard silently discarded round 1's later, successful completion —
  `applied` only +1 for 2 flips, with 0 errors either way (not a bug, just
  an unclean reading). Fixed to a 60s per-round ceiling (`load()`'s own
  `withTimeout` ceiling is 45s), awaited properly.
- **An un-awaited async `waitFor` test is always truthy.** `v = test()` on
  an async `test` reads the pending Promise object itself, not its
  resolved value — the loop returns on its first iteration regardless of
  the real state. Every `waitFor` in this kit now does `v = await test()`.
- **Cross-compartment identity of an exported function is unstable
  across the wrap boundary.** `Cu.exportFunction(fn, manager)`'s OWN
  return value does not `===` a later read of the property it was
  assigned to (`manager.loadVoices`), even in the same script, immediately
  after assignment — confirmed live 2026-09-25 (`read1 === read2` across
  two property reads: true; either read `===` the `exportFunction` return
  value: false). `02` captures the identity check by reading the property
  BACK right after assignment, never the `exportFunction` return value.
- **`pluginPlayer()` rows carry no itemID** (`ui/player.ts`'s own
  `inspect()`, noted already by `plugin-lifecycle`'s kit): the fixture's
  row is identified by insertion order (last attached, last row).
- The owner's OTHER reader in this profile ("Four Thousand Weeks",
  popup closed) never responded to any flip (`isPlayerOpen` false) and
  was never read by `06`; only the tester-named `ownerItemID` is.

## Runs

| Run | Coverage | Result |
| --- | --- | --- |
| 2026-09-25 · fix build 1.14.4-beta8 (SHA-256 `7d3f55a957d16849adeb5d8d72e18cbbef112c4b7662b7f7326c74199beb1f54`) over released 1.14.3 (SHA-256 `351ca70df1bf26ab00e6108150c5e1910956683dd634535f7937160298907607`), issue #131 | Baseline; fixture opened under the pre-existing beta7 and carried across every install; item 1's leftover plant + reinstall (red state); item 2's fix install (repair, no leftover survives as `entry.original`); item 3's second fix reinstall (leftover confirmed nowhere on the manager); item 4's plain close/1.14.3/reopen/fix update; brief items 2/3's owner-tab observation (My Vampire System, itemID 24246 — its OWN, pre-existing leftover, unrelated to anything planted this run); full restore | All four case items PASS; owner-tab observation PASS (matches item 2/3's expectation); see the verification report for the full table |
