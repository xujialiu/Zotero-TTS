[Checklist index](../../README.md)

# Plugin player verification kit

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `00-baseline.js` | Startup, named pref/user-state snapshot, owner readers, position rows, mute/sync guard | beta30 startup has no failed steps; the baseline is retained; volume becomes 0 | none |
| `01-fixtures.js` | Imports disposable PDF and EPUB and opens the PDF | both attachments import; PDF reader reaches `_internalReader` and manager; fixture ids are stored | `root`, `fixturesDir`, `runId` |
| `02-entry-layouts.js` | Player nodes, icon open/close, real manager activation, layouts and geometry | one frame/style/icon; no prototype nodes; real state survives A/top/B switches and close | fixture ids in state |
| `03-controls.js` | Provider/locale/voice rows, speed/gain, pause/resume, bounded real synthesis, invalid choice | rows match the manager; selected ids and shared memory move; speed and gain apply; invalid choices show an error | fixture ids in state |
| `04-settings-favorites.js` | Settings pane picker, favorites both directions, favorites-only guard, focus/search | settings mirrors player prefs; hearts update shared state/browser; guarded edit is visible; search focus does not start reading | fixture ids in state |
| `(moved)` | Player A/M following, manual recovery and shortcut following | Run the dedicated [`player-following`](../player-following/README.md) kit for issue #117; the former global-pref assertion was retired | fixture ids in state |
| `06-errors-lifecycle.js` | Retry/error path, disabled-player fallback, reinstall lifecycle and cleanup | invalid/stale actions are visible; disabled mode restores native controls without playback mutation; no duplicate nodes | fixture ids in state |
| `07-cleanup.js` | Reader close, fixture erase, exact pref/user-state restore, logs/errors and position rows | fixtures gone; player closed; original values/user flags restored with memory last; new errors identified by timestamp | fixture ids in state |
| `08-voice-switch-followup.js` | Trusted Fish playback followed by one explicit second-voice handoff | running clock, target selected, memory/controller moved, committed voice-switch diagnostics; fixture-only cleanup | `root`, `fixturesDir`, `runId` |
| `09-compact-ui.js` | Beta31 compact player/Settings geometry, all dropdown second clicks, overflow and chevrons | 24 px options, 4 px menu padding, 192 px floating body, 8 px chevrons, unchanged widths, closed second clicks | `root`, `fixturesDir`, `runId` |
| `10-lifecycle.js` | Beta33 null/dead/closed document cleanup after a no-playback fixture presentation | native popup closed, manager inactive/no controller, unique compact stylesheet, 192 px B bounds, no new post-close `defaultView` error | `root`, `fixturesDir`, `runId` |

Before you start:

- Install the XPI and run `diagnostics.startup()` before the kit. Use disposable
  `fixture-a.pdf` and `return-key/return-key.epub`; do not drive an owner tab.
- The baseline snapshots named prefs and flags, mutes plugin output, and turns
  WebDAV position/settings writes off for the run. The current Fish `freeOnly`
  and source settings are inspected before use; only the configured Fish voice
  path is used for bounded authorized requests, with no metered fallback.
- The kit stores only ids and sanitized values in `Zotero.ZoteroTTSRun.state`.
  It restores volume, sync flags, layout/player switches, favorites, following,
  voice memory, and reader voice memory in cleanup; `readAloud.memory` is last.

Limits:

- The former `05-following.js` used the retired global
  `readAloud.autoScrollEnabled` oracle and has been moved out. Issue #117
  following results and shortcuts live in the dedicated kit above.

- AudioContext state/clock and synthesis are recorded separately. A suspended
  clock or missing sink makes natural listening progression NOT TESTABLE, while
  manager/controller/highlight state checks remain valid. In beta30, a trusted
  Return key produced a running clock and advancing position with volume 0;
  perceived listening quality remains a human check.
- Settings labels, smooth motion, and perceived audio quality are not claimed
  from static DOM or muted transport evidence.
- Beta29 stopped at the raw Fish voice-label failure; beta30 reran from the
  baseline after `voice.label` was used. The first beta30 Settings attempt was
  a kit sequencing failure after disabling/re-enabling the panel; the executed
  `fix2` run reopened it before favorites and focus checks.
- A prior lifecycle boundary was followed by an owner-reader absence; the
  position trace does not prove its cause. Later runs observed the owner active
  and paused and did not close or reopen it. The beta31 reload changed its
  selected manager voice and later left it inactive/paused; no owner playback
  or direct voice action was performed.
- The final cleanup briefly held automatic settings upload off while restoring
  the original layout/user flag, then restored upload; the final A layout and
  all original flags remained stable after the delayed observer window.
- `reader.readAloudVoices` is snapshotted and restored byte-for-byte with its
  user flag. The follow-up uses no speed rewrite or hardcoded native voice.
- The beta32 `/tts/speak` HTTP 500 was Zotero's native Read Aloud endpoint,
  not Fish's `/v1/tts/stream/with-timestamp`; it is classified UNATTRIBUTED to
  the fixture/owner controller, and this kit makes no claim that native requests
  did not occur.
- Beta31's live child resource stayed stale after install/reload; beta32's
  per-instance resource URI loaded the compact stylesheet in a fresh fixture.
- In the beta32 run, the owner item 25424 was uninitialized at 10:31:34.792
  after the fixture tab was added and before fixture cleanup; no causal claim
  is made, and the owner was never targeted or reopened.

Runs:

| Run | Coverage | Result |
|---|---|---|
| 2026-09-16 / 1.12.11-beta29 | Entry, layouts, controls; stopped at raw Fish labels | Superseded by beta30 |
| 2026-09-16 / 1.12.11-beta30 | Baseline, entry/layouts, controls, Settings/favorites (`fix2`), PDF/EPUB following (`fix1`), errors/lifecycle, reinstall persistence, cleanup | PASS; audio/listening limits above |
| 2026-09-16 / 1.12.11-beta30 follow-up | Trusted Fish start, one `Abel -> Beau` player handoff, `diagnostics.voiceSwitch()` commit, exact native-pref restoration | PASS; fixture 25451 erased; owner unchanged |
| 2026-09-16 / 1.12.11-beta31 | Settings compact menu/chevron checks passed; live player content retained beta30 option/panel metrics after reload while XPI contains compact CSS | FAIL: runtime resource stale; fixture 25453 erased; prefs restored |
| 2026-09-16 / 1.12.11-beta32 | Fresh per-instance player resource, compact A/top/B panels, 24 px rows, 4 px menus, footer bounds, dropdown second clicks, chevrons, Settings menu | PASS; fixture 25454 erased; prefs restored; unattributed Zotero native HTTP 500 and post-close defaultView error recorded |
| 2026-09-16 / 1.12.11-beta33 | In-place install, no-playback fixture, awaited unique resource/CSS, B frame/root/footer bounds, null/dead/closed cleanup and post-close console scan | PASS; fixture 25455 erased; no new defaultView error |
| 2026-09-16 / 1.12.11-beta33 lifecycle fix1 | Awaited resource metadata and repeat no-playback teardown | PASS; resource and stylesheet share `instance-241pd3l9`; fixture 25456 erased; no new lifecycle error |
