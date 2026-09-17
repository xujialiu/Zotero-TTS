# Player position shortcut verification kit (issue #122)

[Case](../../cases/player-position-key.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `01-cycle-and-guards.js` | Trusted Shift+P from reader and player focus, all three layouts, open-player guard, repeat/editable/extra-modifier fallthrough, manager state and frame/settings agreement | `top → A → B → top`; one transition per press; no action when closed/disabled/no reader/editable/extra modifier; active paused state, voice, speed and position retained | fixture state from player-controls setup |
| `02-recorder-persistence.js` | Shortcut row labels/help, remap, clear, restore defaults, manual starting layout, saved layout across reopen and reinstall | Player position row/help visible; remap works immediately; default Shift+P is restored; saved layout/user flag survives reopen and reinstall | fixture state; named preference snapshots |
| `03-reinstall-persistence.js` | In-place reinstall reader recovery and saved B layout across reattach/reopen | Both reader internals return; preference/user flag, diagnostic layout and both frame layouts remain B; reopened players are open and paused | fixture state; persistence state |
| `90-cleanup.js` | Disposable fixture teardown and exact preference/host/owner restoration | No fixture readers/items; named values and user flags restored; debug store, mute and sync guard restored | baseline and fixture state |

Before you start:

- Verify XPI SHA-256 `0b8f64998783a4ae4634513c4829beeb16a8b0d277de9f4afdad4c204271130c` and bundle SHA-256 `1d95a8918b5619d2d14f1d8407d544f1ac1018877b771be9b4e0ad2f13f26f3d`; run `zotero_ping`, list plugins, baseline before installing, install, list again, then synchronous startup diagnostics.
- Reuse `player-controls/02-fixtures.js` for disposable `fixture-a.pdf` and `return-key/return-key.epub`; the setup leaves the owner's paused player untouched and leaves both fixtures ready.
- Keep output muted and WebDAV writes disabled. Snapshot named layout, player-enabled, shortcut and memory values/user flags; restore values after fixture players close, with memory written last.
- Restore the host bounds and leave Zotero minimized. Do not quit or restart Zotero.

Limits:

- Earlier attempts corrected probe setup/timing, foreground focus, modifier synthesis, stale DOM references and diagnostic assumptions; the final revisions listed below ran successfully.

- Natural audio quality and perceived movement are human observations. A suspended AudioContext only limits natural progression evidence; key/state/layout checks still run.
- Trusted input is injected through `nsITextInputProcessor`; a consumed keydown proves the listener took the event, while layout/frame/pref values prove the action.
- The run accumulated four candidate bundle errors (`list is undefined` at bundle line 0, column 73; one after initial install and three after reinstall) during voice-list refresh; no shortcut row failed and no dead-object error was observed.

Final results: [issue #122 completion table](https://github.com/xujialiu/Zotero-TTS/issues/122#issuecomment-5717278769).

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-17 / 1.12.12-beta7 | Baseline PASS; owner EPUB was paused at position 12907 and host was minimized | `2026-09-17-1.12.12-beta7-player-position-key-baseline` |
| 2026-09-17 / 1.12.12-beta7 | Disposable PDF/EPUB setup PASS; owner paused player remained untouched | `2026-09-17-1.12.12-beta7-player-position-key-fixtures`; `...-fixtures2` |
| 2026-09-17 / 1.12.12-beta7 | Cycle/guard pass: top→A→B→top, playing/paused retention, manual start, closed/disabled/no-reader/editable/extra-modifier/already-consumed/held-key guards PASS | `2026-09-17-1.12.12-beta7-player-position-key-cycle15` |
| 2026-09-17 / 1.12.12-beta7 | Settings row/help, manual layout agreement, remap/clear/defaults/conflict, and close/reopen persistence PASS | `2026-09-17-1.12.12-beta7-player-position-key-recorder2` |
| 2026-09-17 / 1.12.12-beta7 | In-place reinstall persistence PASS; startup and reader internals recovered; B/user flag and both reopened frames agreed | `2026-09-17-1.12.12-beta7-player-position-key-reinstall1` |
| 2026-09-17 / 1.12.12-beta7 | Cleanup PASS: fixtures erased, exact named values/user flags restored, owner state restored, host minimized | `one-90-cleanup.js` (after both fixture passes) |
