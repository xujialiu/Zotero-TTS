[Checklist index](../../README.md) · [All scripts](../README.md) · [Case](../../cases/signed-out-voices.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'signed-out-voices'`),
no `params` needed (the fixture is imported by `00`, never a standing
item). `00`–`03` and `04`–`06` may run as two groups (found live: a script
bug split them this way once — see Limits); every script re-locates the
fixture reader from `Zotero.Reader._readers` by `state.fixtureItemID`
rather than trusting a stale object across scripts.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-setup.js` | Zotero/reader state, error ring, debug store, a typed snapshot of every pref the case touches; imports `fixture-a.pdf` as a standalone attachment and opens it (never its popup — item 1 needs the "before" count) | Memory voice has `::` (one of ours); applies the run's own state (volume 0) | — |
| `01-item1-plugin-list-asked.js` | Item 1: `setLoggedIn(false)` on the fixture tab BEFORE its first popup open, then opens+pauses in the same script, settles, reads `liveVoiceList()`/`providerTiers()`/`_allVoices`/the debug log | `asked: false`, `remote: true`, `applied` +1; `tiers` has no `standard`/`premium`; the "not asked for" debug line present; `zoteroTiers().signedIn: true` (the account, not the tab) | — |
| `02-item2-plugin-player-shows.js` | Item 2: `diagnostics.pluginPlayer()`, the fixture's entry found by `open === true` (unique — the owner's own entry is `open: false` throughout this run, checked) | `state.opened: true`, `providers` = item 1's `tiers` with labels, no Zotero tiers, `voices.length > 0`, `error: null` | — |
| `03-item3-it-reads.js` | Item 3: plays (muted), polls ≤10 s for `active && !paused` AND a new `<provider>: N word timestamps for M chars` debug line, checks `manager._voice.tier`, pauses again, closes the popup | `sawTimestampLineWithin10s: true`; `voiceTierIsNotZotero: true` | — |
| `05-item5-signed-in-again.js` | Item 4 since #134 (was item 5): `setLoggedIn(Zotero.Sync.Runner.enabled)`, reopens+pauses+settles, checks `liveVoiceList()`/`providerTiers()`/the debug log (scoped to THIS open only). Its second pass, with `usePluginPlayer` false, reads fields #134 removed: rewrite it without that pass on the next run | `asked: true`, `remote: true`, both Zotero tiers back in `tiers` | — |
| `06-cleanup-restore.js` | Closes and erases the fixture tab (`database.rows` checked before/after), restores every pref from `state.baseline`, `readAloud.memory` last, restores `Zotero.Debug.storing`, reports the error ring | `rowsBackToBaseline: true`; every restored pref `matches: true` | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` +
  `diagnostics.liveVoiceList()`/`providerTiers()` carrying the `asked`/
  `remote` and `signedIn`/`loginRowReplaced` keys (issue #130's own).
- Fixture: imported fresh by `00` as `ZTTS signed-out-voices A`, erased by
  `06` — never a standing item, since the case is specifically about a
  tab's `_state.loggedIn` from the moment it opens.
- State touched, restored by `06`: `readAloud.volume`,
  `readAloud.usePluginPlayer`, all 10 providers' `.enabled` and both
  Zotero switches (recorded only — this case never writes them),
  `readAloud.memory` (recorded only). The fixture tab's own
  `_state.loggedIn` is set by `01`/`04`/`05` with Zotero's own
  `setLoggedIn`, never touching the account.
- `01`–`05` each settle after opening the popup: poll `providerTiers()`
  for the fixture (matched by title) up to 6 s until `tiers`/`options`
  stop changing, the same async-catalog timing artifact the zotero-tiers
  kit found (its own Limits).
- The owner's own reader (whatever tab they have open) is read-only
  throughout — `02` proves its `pluginPlayer()` entry uniquely by
  `open === true`, never assumed by array position.

## Limits

- **`00`'s first version reported `baseline` in its own result but never
  wrote it to `state.baseline`**, so `04` (the first script to need it)
  threw `state.fixtureItemID/baseline is missing`, found live: `00`–`03`
  had already run correctly (their evidence stands), so the fix was a
  one-line `S.baseline = baseline;` plus re-injecting the already-captured
  values into the live `Zotero.ZoteroTTSRun.state` rather than re-running
  the network-bound `00`–`03` group. `04`–`06` then ran clean.
- **Toggling a provider/tier `.enabled` pref while ANOTHER reader's own
  session is already active logs a caught `[zotero-tts] can't access
  property "length", list is undefined`** (`live-voice-list.ts` `load()`,
  `stage._allVoices` undefined — column 77 of the built bundle; found live
  during the zotero-tiers kit's `10`/`11` against the owner's own open
  tab this same run, `applied` staying 0 for its `liveVoiceList()` entry
  every time): traced to an in-place reinstall leaving that reader hooked
  to the OLD plugin instance's `loadVoices` wrapper. Harmless (playback is
  unaffected) and not reachable by this case's own scripts (the fixture
  reader is always freshly attached), but worth knowing before reading the
  error ring at the end of a run that also reinstalled over an active
  reader — see the zotero-tiers kit's own Limits for the full citation.
- `Zotero.Prefs.clearUserPref` does not exist (only `Services.prefs`'s
  does) — found live in a throwaway probe's cleanup, corrected there; none
  of the kept kit scripts use it.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-22 | 1.14.1-beta2, Zotero 10.0.3-beta.3+80bc5565e | the #130 closing comment | 1 PASS, 2 PASS, 3 PASS, 4 PASS (DOM sub-check re-run clean after the no-click fix — see Limits), 5 PASS | First run of this new case's kit; `00` fixed mid-run for the missing `state.baseline` write (state patched live rather than re-importing); `04` revised for the options-panel click (found live, re-verified against a fresh fixture after `06` had already erased the first one, then cleaned up itself) |
| 2026-09-24 | 1.14.4-beta6 (issue #134 regression) | plugin-player kit's report | 1 PASS (`asked:false, remote:true`; the "not asked for" debug line present; `tiers:["fish"]`, no standard/premium; `_allVoices` all `fish`; `zoteroTiers().signedIn:true`), 2 PASS (`pluginPlayer()`'s active entry: `opened:true`, `providers:[{fish,"Fish Audio"}]`, no Zotero tiers, `voices.length:9`, `error:null`) | Ad hoc reads reusing `fixture-a.pdf` (the plugin-player kit's own PDF fixture, already open, rather than a fresh import — case items renumbered by #134, the old items 4-5 are gone) |
