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
| `04-per-provider-memory.js` | Item 4 (beta5: tier/language picks apply at once, no resume; only `selectVoice` is the #108 handoff): `selectTier('system')` at once → `selectVoice(<2nd system voice>)` resumed/polled(≤15s)/paused, retried once on a timeout → `selectTier('fish')` at once → `selectTier('system')` at once (the per-provider memory), then labels + `providerTiers()` + the memory-hook debug line. Probes the audio device first (≤2s). Reads every `m.voices`/`m.voicesForLanguage` array **by index** — see Limits | Step 1 PASS; step 2 (the voice pick) is timing-sensitive, not reliably observed within the poll — see Limits; steps 3–4 PASS once step 2 lands | — |
| `05-stranded-selection.js` | Item 5: force `_selectedTier = 'azure'` (waived), call `_resolveVoice()` directly | `lastMove` present, `voices.length > 0` | — |
| `06-provider-switch-between-opens.js` | Item 6: `sameForAllDocuments` false, close/flip `system.enabled`/reopen twice, dropdown agrees | Polls up to 10 s for the re-enabled tier to reappear (`loadVoices()` is fire-and-forget; a single read can catch a stale cached resolve — see the run log) | — |
| `07-voice-browser.js` | Item 7: `#ztts-voices-tiers`, `defaultVoice()`, `languageColumn()`; also snapshots `patches()` "before reload" for item 8 | Rows sorted by name, `same: true` per reader | — |
| `08-after-reload-dispose.js` | Item 8: after an in-place reinstall (done by the harness between 07 and this script), survival, `resolveShadow`/`createElementWrapped`/`tierMemoryHook` true again, `live === total`, no new dead-object lines, then closes the fixture tab and polls ≤5s for `live` to drop by 2 while `total` holds | Confirmed; a fixed 800ms wait undercounted once — see Limits | `logBeforeLength` |
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
- **Item 4's voice-pick step is timing-sensitive; the per-provider memory
  itself is not the problem — corrected 2026-09-15 (third run, 1.12.10-beta5),
  superseding the beta3 note this replaced.** On beta3 (second run) the
  memory recall looked broken outright: system (voice A) → a second voice
  (voice B) → fish → system landed back on voice A, not the explicitly
  picked B. On beta5 the SAME chain — run manually right after the
  scripted attempt below gave up — landed correctly on voice B every time:
  the recall works. What the scripted run actually hit is earlier in the
  chain: `selectVoice` to the second voice commits instantly only when the
  outgoing and incoming voice share a word boundary at the exact paused
  position (`wordDecision: "shared-word-boundary"`, ~750 ms, seen once);
  otherwise it waits for the CURRENT sentence to finish
  (`wordDecision: "paused-sentence-fallback"`, `stage` stuck at
  `"preparing"` throughout) — which did not happen within a 15 s poll or a
  15 s retry (30 s cumulative, twice) at this run's paused position. This
  also explains the second run's own abandoned second attempt ("stalled
  30 s+ on an unrelated long sentence"), previously unexplained. Not a
  hang: `Zotero.ZoteroTTS.diagnostics.voiceSwitch()` shows `pending` set
  and `audioReady` progressing the whole time. `04`'s retry-on-timeout is
  harmless but not a reliable fix; a deterministic check needs either a
  much longer window or control over the paused position.
- **`patches().providerTiers.total` does not drop when a tab closes** —
  only `live` does (`Components.utils.isDeadWrapper`, recomputed on every
  read). `total` shrinks only at the *next* `shadow()` call, i.e. the next
  reader attach (`proto-patches.ts`'s own comment: "a dead entry releases
  its captured original at the next attach"). The case's item 8 states it
  this way now. Reconfirmed 2026-09-15 (third run): `live` 6→4, `total`
  steady at 6 — but not within `08`'s own 800 ms fixed wait (read
  unchanged at 6/6; a follow-up read ~15 s later caught the drop), so `08`
  now polls up to 5 s instead.
- **`02`'s `memoryVoiceHasNamespace`/`memoryVoiceWarning` always reads
  false/fires** — found 2026-09-15 (third run), not fixed: it stringifies
  the parsed `{id, lang}` object instead of `.id`, so
  `String(...).includes('::')` is always false even for one of our own
  voices (the fixture still opened correctly on the fish:: memory voice
  regardless). Informational only, gates nothing; read
  `memoryVoice && memoryVoice.id` next time `02` is touched.
- **`06`'s `diagnosticsWithoutSystem` (the disable half) reads stale** —
  found 2026-09-15 (third run), not fixed: a single `providerTiers()` read
  200ms after reopening still showed the pre-disable `tiers`/`options`
  (including `system`) and item 5's leftover `lastMove`, while the ACTUAL
  DOM (`dropdownRowsWithoutSystem`) correctly showed only 3 rows with no
  `system` and `fish` selected — the same class of staleness the re-enable
  half already polls up to 10s for (`systemReappearedMs`), just not yet
  applied to the disable half. Item 6 is still a PASS on the DOM evidence,
  which is what the case's "the dropdown's rows agree" asks for.
- All three runs below reported every restored pref `matches: true`.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 1.12.10-beta3, Zotero 10.0.3-beta.1+cfec88e31 | first run's reply (issue #110) | 1 PASS, 2 PASS, 3 PASS, 4 NOT TESTABLE (wrong expectation — superseded below), 5 PASS, 6 PASS (re-enable confirmed only after a longer poll), 7 PASS, 8 PASS (`total`/`live` wording correction above) | First run of this case's kit; `04` and `06` revised mid-run, fixed in the scripts as committed |
| 2026-09-15 | 1.12.10-beta3, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #110), item 4 only | step 2 PASS, step 3 PASS, step 4 PASS, step 5 FAIL (per-provider memory — see Limits), step 6 PASS | Second run, item 4 only (00/01/02/09 reused unchanged); `04` rewritten for the resume/poll/pause handoff and the array-iteration fix above; `system.enabled`'s pane route did not settle in ~25s this time and fell back to a raw pref write (unrelated to item 4) |
| 2026-09-15 | 1.12.10-beta5, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #110), full case | 1 PASS, 2 PASS, 3 PASS, 4 step 1 PASS / step 2 timing-sensitive, not landed within the scripted poll (see Limits) / steps 3–4 PASS via a manual continuation, 5 PASS, 6 PASS, 7 PASS, 8 PASS (confirmed by a manual follow-up read; script's own wait was too short — fixed after) | Third run, full case on beta5 (System substitutes for Kokoro throughout); `04` rewritten for beta5's at-once tier/language picks (only `selectVoice` keeps the #108 resume dance) plus a step-2 retry-on-timeout; `08`'s close poll widened from a fixed 800ms to up to 5s; `01` again fell back to a raw pref write (pane route did not settle in ~25s) |
