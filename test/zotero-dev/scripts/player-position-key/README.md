# Player position shortcut verification kit (issues #122, #124)

[Case](../../cases/player-position-key.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `01-cycle-and-guards.js` | Trusted Shift+P from reader and player focus, all three layouts, open-player guard, repeat/editable/extra-modifier fallthrough, manager state and frame/settings agreement | `top → A → B → top`; one transition per press; no action when closed/disabled/no reader/editable/extra modifier; active paused state, voice, speed and position retained | fixture state from player-controls setup |
| `02-recorder-persistence.js` | Shortcut row labels/help, remap, clear, restore defaults, manual starting layout, saved layout across reopen and reinstall | Player position row/help visible; remap works immediately; default Shift+P is restored; saved layout/user flag survives reopen and reinstall | fixture state; named preference snapshots |
| `03-reinstall-persistence.js` | In-place reinstall reader recovery and saved B layout across reattach/reopen | Both reader internals return; preference/user flag, diagnostic layout and both frame layouts remain B; reopened players are open and paused | fixture state; persistence state |
| `04-renderer-height.js` | Isolated installed `player-controls.js` renderer across expanded A/top → B and collapsed A → B | Every expanded callback describes the new floating DOM at 202px; unchanged expanded snapshot remains 202px; collapsed frame/content are 108px; no stale 34px callback | `root`; fixture state; `fixturesDir` via runner params |
| `05-shortcut-geometry.js` | Focused trusted Shift+P cycles on disposable PDF/EPUB readers, expanded and collapsed rectangles, paused and playing state | Three expanded cycles per reader: 34 → 202 → 34; collapsed: 34 → 108 → 34; all controls fit; manager/controller, voice, speed, position, active segment and paused state retained | fixture state; named preference snapshot |
| `06-menu-regressions.js` | Voice/layout menu open/close, trusted switching with menus open, manual A/B choices, Options both ways | Menus usable and dismissed on switching; voice open frame may reach 425px, close restores 202px; manual A/B restores 34/202px; Options restores 108/202px; `menuInset=0`, no clipping | fixture state |
| `90-cleanup.js` | Disposable fixture teardown and exact preference/host/owner restoration | No fixture readers/items; named values and user flags restored; debug store, mute and sync guard restored | baseline and fixture state |

Before you start:

- Verify XPI SHA-256 `6121f1878c71a19ab547a35fc7595cbd2356f8e3618071838dd3d9839a990e45`, installed bundle SHA-256 `d5276b6c3070c900a4c96348ccf51438f059102c10fc6809f740258d2b6b11f0`, and installed child `content/player-controls.js` SHA-256 `99ee3d4c39c2ef5bad4607d06e1a3b452c03848a43010043505b2f55b44a0bfd`; run `zotero_ping`, list plugins, baseline before installing, install, list again, then synchronous startup diagnostics.
- Reuse `player-controls/02-fixtures.js` for disposable `fixture-a.pdf` and `return-key/return-key.epub`; the setup leaves the owner's paused player untouched and leaves both fixtures ready.
- Keep output muted and WebDAV writes disabled. Snapshot named layout, player-enabled, shortcut and memory values/user flags; restore values after fixture players close, with memory written last.
- Restore the host bounds and leave Zotero minimized. Do not quit or restart Zotero.
- Restore/focus the host only for page initialization, trusted input, menus and geometry; minimize it again during cleanup.

Limits:

- The beta8 isolated regression was deterministic: three expanded A → B transitions reported frame 34/content 202 and did not recover after waiting or an unchanged snapshot. The beta9 renderer probe exercises that path against the installed child and also checks top → B.
- One intermediate beta9 durable attempt stopped before cleanup because the menu harness focused the voice search input and correctly triggered the editable-target guard; the script now focuses a noneditable control before the menu-open shortcut, and the final rerun passed.
- The first isolated probe assertion treated Gecko's trailing space in `player layout-B ` as stale DOM; the script assertion was corrected to compare the normalized class, and the rerun passed with the same 202px geometry.
- The final cleanup audit was reconciled against the earliest pre-mute baseline: volume restored to `100` with `user=false`; all three WebDAV guards remained `false` with `user=false`; owner and host restoration still passed.

- Natural audio quality and perceived movement are human observations. A suspended AudioContext only limits natural progression evidence; key/state/layout checks still run.
- Trusted input is injected through `nsITextInputProcessor`; a consumed keydown proves the listener took the event, while layout/frame/pref values prove the action.
- The beta9 run accumulated one candidate bundle error (`list is undefined` at bundle line 0, column 73, 00:29:09 local) during the post-install voice-list refresh; no shortcut/menu row failed and no dead-object error was observed. Zotero's `InvalidStateError: Navigated away from page` cleanup entries are expected fixture-close noise.

Results: [issue #122 completion table](https://github.com/xujialiu/Zotero-TTS/issues/122#issuecomment-5717278769), [issue #124 geometry verification](https://github.com/xujialiu/Zotero-TTS/issues/124#issuecomment-5718120881).

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-17 / 1.12.12-beta7 | Baseline PASS; owner EPUB was paused at position 12907 and host was minimized | `2026-09-17-1.12.12-beta7-player-position-key-baseline` |
| 2026-09-17 / 1.12.12-beta7 | Disposable PDF/EPUB setup PASS; owner paused player remained untouched | `2026-09-17-1.12.12-beta7-player-position-key-fixtures`; `...-fixtures2` |
| 2026-09-17 / 1.12.12-beta7 | Cycle/guard pass: top→A→B→top, playing/paused retention, manual start, closed/disabled/no-reader/editable/extra-modifier/already-consumed/held-key guards PASS | `2026-09-17-1.12.12-beta7-player-position-key-cycle15` |
| 2026-09-17 / 1.12.12-beta7 | Settings row/help, manual layout agreement, remap/clear/defaults/conflict, and close/reopen persistence PASS | `2026-09-17-1.12.12-beta7-player-position-key-recorder2` |
| 2026-09-17 / 1.12.12-beta7 | In-place reinstall persistence PASS; startup and reader internals recovered; B/user flag and both reopened frames agreed | `2026-09-17-1.12.12-beta7-player-position-key-reinstall1` |
| 2026-09-17 / 1.12.12-beta7 | Cleanup PASS: fixtures erased, exact named values/user flags restored, owner state restored, host minimized | `one-90-cleanup.js` (after both fixture passes) |
| 2026-09-18 / 1.12.12-beta9 | [Issue #124](https://github.com/xujialiu/Zotero-TTS/issues/124#issuecomment-5718120881): renderer probe, expanded/collapsed trusted cycles, menu regressions and cleanup PASS; one known bundle error above | `2026-09-18-1.12.12-beta9-player-position-key-issue124-final2` |
| 2026-09-18 / 1.12.12-beta9 | Baseline reconciliation cleanup PASS: original volume `100/user=false` restored; sync guards `false/user=false`; owner and host unchanged | `one-90-cleanup.js` (baseline-reconciliation) |
