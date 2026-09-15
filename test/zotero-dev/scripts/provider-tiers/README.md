[Checklist index](../../README.md) · [All scripts](../README.md) · [Case](../../cases/provider-tiers.md) · [Tester workflow](../../../../agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'provider-tiers'`), with
`params: { fixtureItemID: <id> }` on `start` (item 08 also takes
`logBeforeLength`, captured by a tiny direct `zotero_execute_js` call
`String((await Zotero.Debug.get()).length)` right before the reinstall —
never pipe the whole log through a param).

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-snapshot.js` | Zotero/reader state, error ring, debug store, a typed snapshot of every pref the case touches | Applies the run's own state (volume 0, both WebDAV switches off) once the snapshot is captured | — |
| `01-enable-system.js` | The System section's Enable button (pane route), falls back to a raw pref write and says so | `enabledAfter: true` | — |
| `02-open-fixture-item1.js` | Opens the fixture, pauses in the same script, then item 1/2: `providerTiers()`/`patches()` right after the popup opens | `tiers` includes every enabled provider + standard/premium, never `local`; `patchesAfterOpen.live === total` | `fixtureItemID` |
| `03-dropdown-rows.js` | Item 2 (`options` populated) and item 3 (the tier dropdown's DOM rows) | Rows match `options` in order, `selected` on `selectedTier`, closes on Escape (falls back to a second trigger click) | — |
| `04-per-provider-memory.js` | Item 4 (rewritten for the paused-preview handoff, issue #108): each pick is `selectTier`/`selectVoice`, a fresh gesture + `manager.play()`, poll ≤15s for the pick to land, `manager.pause()` — repeated for system → a second system voice → fish → system, then labels + `providerTiers()`. Probes the audio device first (≤2s, any advancing pair). Reads every `m.voices`/`m.voicesForLanguage` array **by index**, never `.map`/`.filter`/`.every`/`.some` with a chrome callback — see Limits | Steps 2–4 PASS; step 5 (the per-provider memory) FAILED — see Limits | — |
| `05-stranded-selection.js` | Item 5: force `_selectedTier = 'azure'` (waived), call `_resolveVoice()` directly | `lastMove` present, `voices.length > 0` | — |
| `06-provider-switch-between-opens.js` | Item 6: `sameForAllDocuments` false, close/flip `system.enabled`/reopen twice, dropdown agrees | Polls up to 10 s for the re-enabled tier to reappear (`loadVoices()` is fire-and-forget; a single read can catch a stale cached resolve — see the run log) | — |
| `07-voice-browser.js` | Item 7: `#ztts-voices-tiers`, `defaultVoice()`, `languageColumn()`; also snapshots `patches()` "before reload" for item 8 | Rows sorted by name, `same: true` per reader | — |
| `08-after-reload-dispose.js` | Item 8: after an in-place reinstall (done by the harness between 07 and this script), survival, `live === total`, no new dead-object lines, then closes the fixture tab | `resolveShadow`/`createElementWrapped` true again; **`total` does not drop on its own — see the run log** | `logBeforeLength` |
| `09-cleanup-restore.js` | Restores every pref from `state.baseline`, in order, `readAloud.memory` last; reports the settings window and the error ring | Every restored pref reports `matches: true` | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` +
  `diagnostics.providerTiers().feature === "provider-tiers"` before running
  the kit (not a script here — done directly, per the tester workflow).
- Fixture: a **standing** library item (`ZTTS Fixture A`, a fixed itemID
  passed as `params.fixtureItemID`) — never imported or erased by this kit;
  only its tab is closed, by item 8's own script.
- State touched, restored by `09`: `readAloud.volume`,
  `webdav.syncPositions`, `webdav.autoUploadSettings`,
  `readAloud.sameForAllDocuments`, `system.enabled` (or whichever second
  provider substitutes for it), `readAloud.memory`,
  `extensions.zotero.reader.readAloudVoices`, `Zotero.Debug.storing`.
  `webdav.syncSettings` is read for the record and never written.
- **Read the owner's other open tabs before touching anything**: a tab
  whose Read Aloud manager is `active` (paused counts) is "reading" to
  memory-sync, whatever the popup's visible state. With
  `sameForAllDocuments` on, a pick on the fixture calls `spreadVoice` for
  every such tab — it skips a reader already on the chosen voice, so it is
  usually inert, but confirm no other active reader's language/provider
  overlaps the fixture's before assuming so.

## Limits

- **Reader-realm array iteration with a chrome callback is unreliable,
  regardless of waiving — corrected 2026-09-15, superseding the note this
  replaced.** `m.voices.map(v => v.id)` / `.every(...)` / `.filter(...)` /
  `.some(...)` answered the string `"undefined"` for every element's `.id`
  (and a wrong boolean from `.every`/`.some`), proven side by side against
  a manual `for` loop reading the identical 339-entry array correctly at
  the same instant — waived or not. This is MEMORY.md's documented
  find/some/filter pitfall on a reader-realm array given a chrome
  callback, extended here to map/every too; the previous fix note ("waive
  before reading array elements") was a misattribution. Read such arrays
  by index (04's `toIds`/`toLabels`/`allStartWith`/`anyLabelMatches`/
  `firstOtherThan`); a `JSON.parse`'d diagnostics result (`pt.readers`,
  `vs.readers`) is a plain chrome array and unaffected.
- **The audio-device probe needs more than one pair 500 ms apart.** A
  fresh reader's first `play()` can leave `_audioContext` "suspended" at
  `currentTime` 0 past 500 ms; a second resume on the same reader reached
  "running" and advancing within ~600 ms. 04 now samples up to 2 s and
  accepts any consecutive advancing pair, still failing within ~2 s (not
  15 s) when genuinely frozen.
- **Item 4's per-provider memory (case step 5) did not hold — 2026-09-15,
  Zotero-TTS 1.12.10-beta3, Zotero 10.0.3-beta.1+cfec88e31, second run.**
  After system (voice A) → a second system voice (voice B, explicit pick)
  → fish → system, `selectTier('system')` (resumed/polled/paused) landed
  (word-boundary commit, t=14851 ms of the 15 s poll) on voice A, not
  voice B — even though `reader.readAloudVoices`'s `en.tierVoices.system`
  correctly held voice B going into that call. The wrong landing then
  persisted over the correct value; `tierVoices` still ended with the key
  `system` last (that part holds), only the voice is wrong. Reproduced
  once cleanly; a full-trace retry (`.tmp/zotero-dev/
  provider-tiers-item4-memory-probe/`) instead stalled 30 s+ on an
  unrelated long sentence at the same document position before reaching
  the reselect step, so it is not a second data point either way — not
  retried a third time to stay inside budget. Not isolated to a line:
  `manager._persistedVoices.voice` reads as singular, not per-tier
  (provider-tiers.ts's own use of it in `retagAndMove`); provider-tiers.ts's
  `_resolveVoice` shadow is not responsible (`strandedTarget` only acts on
  a tier with no voices, and `system` had voices throughout). Item 5
  (direct `_resolveVoice()`) and item 6 (popup close/reopen) do not go
  through `selectTier` and are unaffected. Flagged for the main session —
  the case's step 5 wording may need to change from an expectation to an
  open question.
- **`patches().providerTiers.total` does not drop when a tab closes** —
  only `live` does (`Components.utils.isDeadWrapper`, recomputed on every
  read). `total` shrinks only at the *next* `shadow()` call, i.e. the next
  reader attach (`proto-patches.ts`'s own comment: "a dead entry releases
  its captured original at the next attach"), confirmed live 2026-09-15:
  `live` 6→4 within 1.3 s of closing the fixture tab, `total` still 6
  after a forced GC/CC. The case's item 8 wording ("total down by 2")
  should read "live down by 2, total at the next attach" — flagged for
  the main session to correct there, not fixed in this script.
- Both runs below reported every restored pref `matches: true`.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 1.12.10-beta3, Zotero 10.0.3-beta.1+cfec88e31 | first run's reply (issue #110) | 1 PASS, 2 PASS, 3 PASS, 4 NOT TESTABLE (wrong expectation — superseded below), 5 PASS, 6 PASS (re-enable confirmed only after a longer poll), 7 PASS, 8 PASS (`total`/`live` wording correction above) | First run of this case's kit; `04` and `06` revised mid-run, fixed in the scripts as committed |
| 2026-09-15 | 1.12.10-beta3, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #110), item 4 only | step 2 PASS, step 3 PASS, step 4 PASS, step 5 FAIL (per-provider memory — see Limits), step 6 PASS | Second run, item 4 only (00/01/02/09 reused unchanged); `04` rewritten for the resume/poll/pause handoff and the array-iteration fix above; `system.enabled`'s pane route did not settle in ~25s this time and fell back to a raw pref write (unrelated to item 4) |
