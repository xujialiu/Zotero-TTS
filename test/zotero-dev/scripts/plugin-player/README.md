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
| `11-item1-no-switch.js` | Issue #134 item 1: no `ztts-player-enabled` checkbox anywhere in the pane; `pluginPlayer()` has no `enabled` key; writes `readAloud.usePluginPlayer` `false` for 12/14 to open/reinstall under | `checkboxPresent`/`anyPlayerEnabledNode`/`pluginPlayerHasEnabledKey` all false; pref written, baseline stashed in `state.usePluginPlayerBaseline` | none |
| `12-item2-pdf-tab-entries.js` | Item 2 on the PDF fixture in a tab: toolbar button, trusted Cmd/Ctrl+Shift+R, trusted Shift+Space, and `startReadAloudAtPosition` (Read Aloud from Here) each open the Player, `.read-aloud-popup`/`#read-aloud` sampled every 50ms | every entry `zoteroNeverShown: true`; `playerOpen` follows within ~250ms of `active` for the three native-path entries (see Limits) | `root`, `fixturesDir`, `runId` |
| `13-item3-resource-taken-away.js` | Item 3: `setSubstitution(host, null)`, a fresh third fixture tab, its Player never connects | `failed:"frame"` eventually (see Limits on timing), `"player did not finish loading"` logged once, the button's toast matches `ztts-player-failed` verbatim, `active` stays false, Zotero's popup stays `none`/`ABSENT` throughout | `root`, `fixturesDir`, `runId` |
| `13b-item2-epub-tab-and-windows.js` | Item 2's remaining matrix cells: EPUB in a tab, PDF in its own reader window (`openInWindow: true`) | both `zoteroNeverShown: true`; the window reader is a genuine `ReaderWindow` (`_window !== win`) | none (reads `state.fixtures`) |
| `14-item4-reinstall-mid-reading.js` | Item 4: a muted PDF reading playing, then an in-place reinstall (triggered by the tester as a separate concurrent call — see Limits), `.read-aloud-popup` sampled every 50ms across it | every sample `none`/`ABSENT`; `pluginPlayer().resource` changes (fresh instance token); Player closed after; `diagnostics.engine().stats.adopted` +1; button resumes the same segment; `usePluginPlayer` restored from `state.usePluginPlayerBaseline` | none (reads `state.fixtures.pdf`, `state.usePluginPlayerBaseline`) |
| `15-item5-disable-enable.js` | Item 5: samples the PDF+EPUB readers' `#ztts-player-style`/`-toggle`/`-frame` and `#read-aloud`'s computed display every 150ms while the tester calls `zotero_plugin_reload` concurrently | disabled: all three ids gone, native button `flex`; re-enabled: all three back, native button `none` | none |
| `16-item7-shift-o-fallthrough.js` | Item 7: reinstalls mid-reading to reach "reading open, Player closed" (ADR 0007), then `diagnostics.playerOptions(true)` closed and, after opening the Floating panel, open | closed: `player:false, button:false`; open (layout B): `expanded` flips both ways; no lasting change to any OTHER reader's Options state | none (reads `state.fixtures.pdf`) |
| `17-item8-wording.js` | Item 8, en-US: the Zotero section's note and the favorites switch's rendered text | note mentions `zotero.org`; switch reads "Offer only favorite voices in the player" verbatim | none |

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
- Scripts 11-16 (issue #134, `plugin-player.md` section 5) run individually
  through `run.start()`/`one()`, not as one group: 14/15/16 each need the
  tester to make a SEPARATE, concurrent `zotero_plugin_install` or
  `zotero_plugin_reload` call while the script is mid-run (poll
  `state.item4ReadyAt`/`item5ReadyAt`/`item7ReadyAt` first). 11 must run
  before 12 (it writes the pref 12/14 open under); 13 before 14 (14's
  reinstall re-registers the resource 13 broke); 16 assumes 14 already ran.

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
- **Close a reader WINDOW with `reader.close()`, never `reader._window.close()`
  — found live 2026-09-24 (beta6, #134 run).** The latter skips `uninit()`
  and `_onClose()` (`xpcom/reader.js` `ReaderWindow.close()`), leaving a dead
  entry in `Zotero.Reader._readers` that throws `can't access dead object`
  on any read through its `_internalReader` or `_iframeWindow` — those two
  are themselves dead wrappers — while the entry's own properties, like
  `itemID`, read fine (one it lacks, like `tabID` on a reader window, is
  looked up on the dead internal reader by `ReaderInstance`'s Proxy and
  throws too). Zotero's OWN `Reader.open()`
  touches `.itemID` on every entry via `.find()` too, so the dead entry
  then poisons EVERY later `open()` for that same itemID, `openInWindow` or
  not — **this is still true in 1.14.4-beta7 and unfixed, so the advice
  above still stands.** Before 1.14.4-beta7, several startup steps
  (`sentence in view`, `live voice choices`, `voice switching`, `Read Aloud
  shortcuts`, `Read Aloud memory`, `highlight colors`) looped
  `Zotero.Reader._readers` with NO per-reader try/catch (unlike `plugin
  player`'s own `attach()`), so ONE dead entry failed the WHOLE step at the
  next reinstall/reload — reproduced on beta6, then disproved by removing
  the entry (`Zotero.Reader._readers.splice(index, 1)`, found by
  `_window.closed === true`) and reinstalling clean. **Since 1.14.4-beta7
  (issue #143, `read-aloud/reader-access.ts`'s `forEachReader`) every
  startup walk visits each reader on its own and silently skips a gone
  one, so no startup step fails on it any more** — verified live
  2026-09-25 by reinstalling over a live dead entry and reading
  `startup()` all `ok`, `failed: []`
  (`plugin-lifecycle` kit, item 5.9). Not a #134 regression: `plugin
  player` itself was `ok` throughout; unrelated to the Player's own code. A
  tab closed via `Zotero_Tabs.close(tabID)` instead leaves a harmless
  `_isTabClosed: true` entry that reads fine — expected Zotero bookkeeping,
  not this bug.
- **A reader's `popupOpen` is `reader._internalReader._state.readAloudState
  .popupOpen`, not `manager.popupOpen`** (`player-controller.ts`'s own
  `popupOpen()` helper) — the manager itself has no such field.
- **Item 3's exact "after 5s"/"within 250ms" timings were not cleanly
  reproducible under this run's concurrent bridge load**: the connect()
  retry and the Player's 250ms `tick()` both eventually fired correctly
  (confirmed: `failed:"frame"`, the load error, the exact `ztts-player-failed`
  toast on both the button and the native-path refusal), but a background/
  minimized window plus concurrent Fish network calls pushed the observed
  latency well past 5s/250ms in two of three attempts. A third, isolated,
  foregrounded attempt (fresh fixture, no other concurrent work) still saw
  the native path fail to even start playback via a trusted Shift+Space on
  a reader given no settle time — reopen and let the document settle
  before the key, next time.
- `diagnostics.playerOptions(true)` presses every reader's Options button;
  confirmed harmless on a Player that is closed elsewhere (nothing to press),
  but re-check `otherReadersAfterPress`-style state if another reader's
  Player might be open when this runs.

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
| 2026-09-24 / 1.14.4-beta6 (issue #134, section 5) | Items 1-8: no switch/no `enabled` key (1); all 4 entry points + PDF/EPUB × tab/window (2); resource taken away, failed:"frame", toast, popup never shown (3); reinstall mid-reading, popup never shown, adopted+resumed (4); disable/enable (5); backup restore (6); Shift+O fallthrough + Floating fold (7); en-US wording live, zh-CN from source (8) | PASS except item 6 NOT TESTABLE (native file picker); a self-inflicted dead `Zotero.Reader._readers` entry from a wrong reader-window close briefly failed 6 unrelated startup steps on one reinstall, root-caused and resolved (see Limits), not a #134 regression |
