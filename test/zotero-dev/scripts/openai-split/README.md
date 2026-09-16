# Scripts: The OpenAI section split into OpenAI, Xiaomi MiMo and OpenAI Compatible (issue #113)

[Case](../../cases/openai-split.md) · [Checklist index](../../README.md) · [Tester workflow](../../../../agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'openai-split'`). `00` and
`01` are quick reads/short writes and fit one `start()` call each; `04` runs
long (two 15 s voice-pick polls) and must go through the runner, never a
direct `zotero_execute_js` call (hits the bridge's ~30 s timeout otherwise —
found live 2026-09-16). `01` is self-contained and safe to run again after
each of item 1's two installs, under a fresh `runId`.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-legacy-read.js` | Zotero/reader state, error ring, debug store, the CURRENTLY installed build's own `diagnostics.openaiSplit()` (report/legacyPrefs/sections, and whether `staleDefaults` exists at all — only the fixed build adds it), the nine legacy `openai.*` fields' `hasUserValue` | Applies the run's own state once captured: `readAloud.volume` → 0, `webdav.autoUploadSettings` → false | — |
| `01-post-install-item1.js` | Run AFTER each `zotero_plugin_install` + a direct `diagnostics.startup()` check (neither is a script). Self-contained `diagnostics.openaiSplit()` read (`baseURL` masked to a length — the fixed build already masks it to a number at the source, unlike the pre-fix build; handles both shapes), an independent `prefHasUserValue`/default-defined cross-check per legacy field, `reader.readAloudVoices`/`readAloud.memory` scanned for `openai::` ids (full pref names + the global flag — a RELATIVE name with the flag reads `undefined`, this run's found-and-fixed mistake) | `report: null`, `legacyPrefs: []`, all nine `staleDefaults`, sections byte-identical across both installs — see the case's item 1 | — |
| `02-pane-structure-item2.js` | Item 2: opens the pane fresh (driving notes §1), every `groupbox` id in DOM order, the legacy menulist/groupbox gone, the three sections' headings/links/field ids/placeholders/buttons | 19 groupboxes, alphabetical order, no `ztts-openai-server`/`ztts-provider-openai` | — |
| `03-test-connections-item3.js` | Item 3: Test connection for openai-official, mimo, compatible, and compatible with its address emptied then restored — each click wrapped in an `http-on-modify-request` observer (masked host tag + path + method + `Authorization`/`CF-Access-Client-Id` presence). Reuses `02`'s open pane | The case's two corrected failure strings (below); `mimo`/`compatible`'s real "Connected…" text once they hold working credentials | — |
| `04-enable-verify-item4.js` | Item 4: enables both providers SEQUENTIALLY (see Limits — two live bugs fixed), `providerTiers()` labels, fields locked, the voice browser's tier column and each provider's voice list, then a fixture (`fixture-b.pdf`) proving the fallback debug line + header separation for one voice per provider (the #108 handoff: `selectTier` then `selectVoice` then resume/poll/pause, `Components.utils.waiveXrays`) | Both `.enabled` true, fields disabled, tier column has both entries at the documented counts, both fallback lines, correct header presence per provider | — |
| `05-cleanup-restore.js` | Closes/erases the fixture FIRST (state `item4Fixture`, falls back to a title search), then disables both providers, restores `readAloud.memory` and `reader.readAloudVoices` (Zotero's own `selectTier`/`selectVoice` rewrite this regardless of the plugin — see Limits) byte-exact from `state.baseline`, then `readAloud.volume` and `webdav.autoUploadSettings` (last write) | Both `.enabled` false, both voice prefs byte-identical to `00`'s reading, volume/webdav restored | `item4Fixture`, `memoryBeforeFixture`, `baseline` |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` (the
  `OpenAI section split` step) + `diagnostics.openaiSplit()`'s `staleDefaults`
  key (present only on the fixed build — the version string does not tell
  two same-numbered betas apart) — done directly, not a script.
- Fixture: `fixture-b.pdf`, imported fresh in `04`, erased in `05`
  (baseline.md's general fixture procedure). `readAloud.memory` is set to
  the first voice immediately before `Zotero.Reader.open` (the
  `voice-switch` kit's `kokoro-02-open-fixture.js` pattern), then restored
  verbatim; `reader.readAloudVoices` is restored too (see Limits).
- State touched, all restored by `05`: `readAloud.volume`,
  `webdav.autoUploadSettings`, `readAloud.memory`,
  `reader.readAloudVoices`, `mimo.enabled`, `compatible.enabled`. Never
  `readAloud.favoriteVoices` (confirmed unwritten every run so far).
- **A player open anywhere blocks item 4's Enable clicks by design**
  (reading-guard.ts): confirm with `Zotero.Reader._readers[i]
  ._internalReader._readAloudManager.active` (paused counts) before
  attempting one; the owner's player is closed by the tester itself with
  `toggleReadAloudPopup(false)`, noted in the report (settled 2026-09-16).
  `04`'s OWN fixture counts too, which is why `05` closes it before
  attempting a Disable (see Limits).

## Limits

- **Two live script bugs this run (fixed in the kit; neither is a plugin
  bug), same root cause**: `onToggle`'s (ui/provider-rows.ts) own first
  `await refuseWhileReading(...)` runs BEFORE `hold()` sets the button
  disabled/"Checking…", so a poll reading immediately after `toggle.click()`
  can see the unchanged pre-click state and wrongly conclude the check
  already finished — hit on `04`'s Enable (read stale leftover text from a
  previous Test-connection click; a SECOND `refuseWhileReading` right
  before the pref write then raced this script's own fixture becoming
  active and silently refused mimo's write) and on `05`'s original
  Disable-before-close ordering (the reading-guard dialog it never noticed
  was orphaned when the settings window closed mid-await, leaving both
  switches on). Fixed by waiting for a "started" signal before "settled",
  and by closing the fixture before attempting any Disable.
- **The #108 voice-pick handoff needs an explicit `m.selectVoice(id)`
  before the resume/poll/pause dance** (`04`'s first draft omitted it and
  timed out every time, confirmed via the debug log: "kept the controller:
  the voice list landed on the voice already playing" — nothing had asked
  it to change). Fixed; follows `scripts/provider-tiers/04-per-provider-memory.js`'s
  proven pattern.
- **A second same-tier voice pick can miss the 15 s window**: switching
  compatible away to mimo and back, then picking a SPECIFIC second
  compatible voice (`Emily.wav`), did not land within 15 s even though the
  underlying mechanism (fetch, debug line, headers) fired for whichever
  voice stayed selected (`Abigail.wav`) — matches
  `provider-tiers/04-per-provider-memory.js`'s own documented finding about
  the same handoff's two commit paths. Report whichever voice actually
  produced the evidence rather than failing the item over the exact name.
- **The diagnostic's masking shape changed with the fix**: the pre-fix
  build's `openaiSplit()` returns `sections.compatible.baseURL` raw (a
  string); the fixed build (7f7d953) masks it to a length (a number) at
  the source, like `apiKey`/`headers` always were. A script that does
  `String(baseURL).length` unconditionally double-masks a number into
  `"36".length` = 2 — handle both shapes (`00`/`01` do).
- The CRITICAL migration-reruns-on-reinstall bug this kit's first run
  found is fixed and reverified this run (see Runs) — no longer a live
  limit.
- `Zotero.ZoteroTTSRun.state` DID survive across this run's separate
  `start()` calls, small and large alike (`04`'s fixture id, `00`'s full
  `readerReadAloudVoices` snapshot via `state.baseline`) — the first run's
  `state.snapshot` non-survival was not reproduced; still design scripts
  not to depend on it (see `01`'s header).

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 (first) | 1.12.12-beta (buggy, 3c40365) | issue #113 verification reply | 1 first install PASS / second install FAIL (critical), 2 PASS, 3 mechanism PASS (2 case corrections), 4/5 NOT TESTABLE (owner's player open) | Found the migration-reruns bug; all five scripts kept |
| 2026-09-16 (re-run) | 1.12.12-beta (fixed, 7f7d953) | this run's reply (issue #113 verification) | 0 PASS, 1 PASS (both installs byte-identical, fix holds), 2 PASS, 3 PASS (mimo/compatible now "Connected…", message corrections confirmed), 4 PASS (both enabled, 28/9 voices, both fallback lines + header separation), 5 PASS (all state restored byte-exact) | Two script bugs found and fixed live (see Limits); kit fully reusable |
