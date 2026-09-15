# Scripts: The OpenAI section split into OpenAI, Xiaomi MiMo and OpenAI Compatible (issue #113)

[Case](../../cases/openai-split.md) · [Checklist index](../../README.md) · [Tester workflow](../../../../agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'openai-split'`), one
`start()` per script this run (state persists across separate `start()`
calls in the same Zotero process — confirmed live). `04` needs
`params: { ownerTabItemID: <id> }`, the id of whatever reader tab is
already reading when the run starts (found by reading `Zotero.Reader._readers`
in `00`, never hard-coded).

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-legacy-read.js` | Zotero/reader state, error ring, debug store, proof the installed build predates the split (`diagnostics.openaiSplit` `undefined`), and the pre-install legacy `openai.*` prefs (lengths for `apiKey`/`headers`/`baseURL`, values for `enabled`/`server`/`model`/`voices`, which `presetValues` keys are present, `tierVoices` keys and any `openai::` id across `reader.readAloudVoices`/`readAloud.memory`/`readAloud.favoriteVoices`) | Applies the run's own state once captured: `readAloud.volume` → 0, `webdav.autoUploadSettings` → false | — |
| `01-post-install-item1.js` | Run AFTER the tester's own `zotero_plugin_install` + a direct `diagnostics.startup()` check (not a script). Reads `diagnostics.openaiSplit()`, masking every section's `baseURL` to a length itself before it ever leaves the sandbox read (the diagnostic returns it verbatim — MEMORY.md's caution about a pref that may hold an address, applied even though `apiKey`/`headers` are the only fields the diagnostic itself masks) | `report.target`/`enabled`/`clearedKeys`/`rewrittenPrefs` and all nine `legacyNowUndefined` — see the case's item 1 for the numbers this profile produced | `state.baseline`, `state.snapshot` (**`state.snapshot` did not survive to this script this run — see Limits; use a direct file read of `00`'s result instead when a cross-check is needed**) |
| `02-pane-structure-item2.js` | Item 2: opens the pane fresh (driving notes §1), every `groupbox` id in DOM order, the legacy menulist/groupbox gone, the three sections' headings/links/field ids/placeholders/buttons | 19 groupboxes, alphabetical order, no `ztts-openai-server`/`ztts-provider-openai` | — |
| `03-test-connections-item3.js` | Item 3: Test connection for openai-official, mimo, compatible, and compatible with its address emptied then restored — each click wrapped in an `http-on-modify-request` observer that reports a masked host tag + path + method + `Authorization`/`CF-Access-Client-Id` presence, never the address itself. Reuses `02`'s open pane | See the case's item 3 correction below — the case's literal failure-message text was wrong twice, confirmed live | — |
| `04-guard-check-item4.js` | Item 4's blocked precondition: ONE Enable click on Xiaomi MiMo to confirm the reading guard refuses while `params.ownerTabItemID` is reading, reads the `#ztts-notice` dialog's button labels and text, then `dialog.close()` (never a button click — button 0 is "Stop reading and continue", the one that must never be pressed on the owner's session) | Dialog names the owner's tab; switch and the owner's session both unchanged after | `ownerTabItemID` |
| `05-cleanup-restore.js` | Restores `readAloud.volume` (`clearUserPref`, since it had no user value) and `webdav.autoUploadSettings` (→ true, last write), closes the settings window, reports `Zotero.Debug.storing` and the error ring. Never touches `reader.readAloudVoices`/`readAloud.memory`: neither was written by this run (confirmed in `00`/`01`) | Both prefs restored; owner's tab still `active`/`paused` unchanged | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` (the
  `OpenAI section split` step) + `diagnostics.openaiSplit()` (`undefined` on
  a pre-split build) — done directly, per the tester workflow, not a script.
- No standing fixture: this case never opened one this run (items 4/5 were
  blocked before reaching playback — see Limits). A future run that gets
  past the guard needs `fixture-b.pdf`, imported fresh and erased at the
  end (baseline.md's general fixture procedure), with `readAloud.memory` set
  to the target voice (`{ speed: 1, voice: { id, lang } }`, the
  `voice-switch` kit's `kokoro-02-open-fixture.js` pattern) immediately
  before `Zotero.Reader.open` — this is what actually determines a fresh
  reader's first voice (`memory-sync.ts`'s `_syncPersistedVoicesToManager`
  shadow writes the remembered choice into the manager's language lane
  before Zotero's own restore reads it, regardless of the fixture's
  detected language), never a raw `selectVoice()` call: that goes through
  the #108 preview/handoff (`read-aloud/voice-switch.ts` 86-130) once the
  manager is `active`, and only commits on `play()` — needless for a
  one-sentence provider check, since `poll()`'s own `load()` step (started
  120 ms after `selectVoice()` regardless of `play()`) already triggers a
  real synthesis call for the debug-log/header evidence.
- State touched, restored by `05`: `readAloud.volume`,
  `webdav.autoUploadSettings`. `mimo.enabled`/`compatible.enabled` were
  never changed (confirmed unchanged by `04`). `reader.readAloudVoices` and
  `readAloud.memory` are never restored by this kit — the migration's
  rewrite of the former is the profile's settings now (case: "do not
  attempt to restore the old openai.* prefs"), and the latter was never
  written by anything this run did.
- **A player open anywhere blocks items 4/5's substantive checks by
  design** (reading-guard.ts): confirm with `Zotero.Reader._readers[i]
  ._internalReader._readAloudManager.active` (paused counts) before
  attempting an Enable/Disable click, and pass that tab's itemID to `04`.
  Never close it, never press "Stop reading and continue" on it — only
  `dialog.close()`.

## Limits

- **CRITICAL — the migration is not idempotent and destroys the just-split
  `mimo.*`/`compatible.*` settings on every subsequent in-place
  reinstall/reload, confirmed live 2026-09-16 (see the issue #113
  verification reply for the full evidence and root cause).** A SECOND
  `zotero_plugin_install` of the same xpi (no Zotero restart in between)
  re-ran `migrateOpenAISplit` and overwrote the correctly-migrated
  `mimo.apiKey` (51 chars → 0), `compatible.baseURL`/`headers`/`model`
  (36/151/`"tts-1"` → 0/0/`""`) with blanks, and flipped
  `openai-official.enabled` to `true` with no key — root cause: Gecko's
  default-branch registrations are additive and never unregistered
  within a process, so the OLD (pre-split) `addon/prefs.js`'s
  `pref('…openai.enabled', true)` (and similar for `baseURL`/`model`/
  `voice`) lingers in the running process's preference service after
  upgrading past the version that removed those declarations;
  `Zotero.Prefs.clear()` (`Services.prefs.clearUserPref`) only removes
  the USER value, so every cleared legacy field falls back to that
  stale non-empty default (confirmed via `Services.prefs.getDefaultBranch('').getBoolPref(...)`
  reading `true` for `openai.enabled` with `prefHasUserValue: false`,
  `getPrefType` still `128`/`32`, never `0`/PREF_INVALID) — `enabled`'s
  stale `true` alone permanently defeats `migrateOpenAISplit`'s "nothing
  left to migrate" gate (`LEGACY_OPENAI_FIELDS.some(field => raw(field)
  !== undefined && raw(field) !== '')`), so it re-runs on literally
  every future in-place update applied without a full Zotero restart —
  this plugin's own selling point for how updates apply. Two DIRECT,
  reportable consequences beyond the wiped settings: the plugin then
  makes live unauthenticated requests to `api.openai.com/v1/audio/voices`
  in the background (401, logged twice at 02:06:21 and 02:14:09 this
  run, and will recur on every future voice listing while
  `openai-official` stays wrongly enabled), and the reading guard blocks
  the user from even switching `openai-official` back off while any
  player is open — exactly the state this run left the profile in. **Do
  not run `01` a second time in the same process without first confirming
  with the main session that the bug is fixed** — it will reproduce the
  wipe on the user's live settings again.
- **`Zotero.ZoteroTTSRun.state.snapshot` (a whole large object) did not
  survive from `00`'s `start()` call to `01`'s separate `start()` call
  this run, while `state.baseline` (a small nested object set the line
  before it) did** — not explained; `state` already held keys from other
  kits' earlier runs in this same long-lived Zotero process (`fixture`,
  `item4VoiceID`, …), so cross-kit accumulation is not the cause. Worked
  around by reading `00`'s full result straight from
  `.tmp/zotero-dev/<runId>/results/00-baseline-legacy-read.js.json`
  instead. Re-test with a smaller `state.snapshot` before trusting
  cross-script state for a large object again.
- **Two of the case's item 3 failure messages are wrong, confirmed live**:
  OpenAI with no key reads exactly `No API key set for this provider.`
  (`ztts-no-key`, no placeholder, no provider name, no `Connection
  failed:` prefix — the case says `Connection failed: … OpenAI API key is
  not set`), and OpenAI Compatible with no address reads exactly `Cannot
  connect: OpenAI Compatible: no server address` (`ztts-cannot-connect`,
  a `network`-kind error — the case says `Connection failed: …`). Traced
  to `ui/prefs-pane.ts` `testConnection`'s catch: `kind === 'no-key'` →
  `t('ztts-no-key')` (the detail is discarded), `kind === 'network'` →
  `t('ztts-cannot-connect', { detail })`; `ztts-connection-failed` /
  `Connection failed: …` is only the generic `default` branch, reached by
  neither case. The case needs correcting to these two exact strings.
- **Xiaomi MiMo's and OpenAI Compatible's own "Connected…" success paths
  were NOT TESTABLE this run**, downstream of the critical bug above: both
  sections' working configuration was wiped before item 3 ran, so both
  showed the same "no key" / "no address" text as OpenAI's intentionally
  unconfigured section, and no HTTP request was observed for any of the
  three (`requests: []`, consistent with the code never calling `fetch`
  on the `no-key`/no-address paths). Re-test once the bug is fixed and the
  owner has re-entered their MiMo key and Chatterbox address —
  `webdav.autoUploadSettings` was off for this whole run, so nothing
  wiped went up to WebDAV; a sync/backup from before this run may still
  hold the original values.
- **`03`'s poll used to break on "text differs from before the click"**,
  which never fires when two consecutive clicks land on the identical
  final message (found live: `compatible`'s own no-address click, then
  `compatibleEmptyAddress`'s click straight after — both show `Cannot
  connect: … no server address`) — ran the full 20 s window for nothing
  even though the real result was ready within ~155 ms. Fixed to break on
  "was Testing…, now settled" instead; not yet re-run after the fix.
- **Items 4/5's substantive checks (both switches on, labels, voice
  browser columns, playback + header separation, disable/restore) were
  NOT TESTABLE this run**: the owner's own reader tab ("paper") was
  `active`/`paused` the whole time, and the reading guard correctly
  refuses an Enable/Disable click while any player is open, confirmed by
  `04` (dialog named the tab, `dialog.close()` left the switch and the
  owner's session both unchanged). Re-test once the owner has closed
  their player — never close it for them.
- Never rerun `01` (the install) merely to re-confirm the bug once it is
  fixed elsewhere; a fresh run's `00`/`01` naturally re-proves the fix or
  finds it still open.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 | 1.12.12-beta, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #113 verification) | 0 baseline PASS, 1 first install PASS / second install FAIL (critical, see Limits), 2 PASS, 3 PASS for the mechanism and message wording (2 case corrections), NOT TESTABLE for mimo/compatible's success path (bug), 4 NOT TESTABLE (owner's player open) with the guard itself confirmed refusing cleanly, 5 NOT TESTABLE (depends on 4) | First run of this case's kit. All five scripts ran successfully and are kept; `03`'s poll condition fixed after the run (not re-executed with the fix) |
