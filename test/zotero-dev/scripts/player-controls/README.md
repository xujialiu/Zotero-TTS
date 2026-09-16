# Player controls verification kit (issue #118)

[Case](../../cases/player-controls.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `00-baseline.js` | Named preferences/flags, owner readers, selected tab, host state, mute and sync guard | Exact values/user flags and host bounds/state saved; volume 0 and WebDAV writes off | none |
| `01-startup.js` | Candidate startup diagnostic | Every step `ok`; `failed: []` | none |
| `02-fixtures.js` | Disposable PDF/EPUB imports, selected visible iframe readiness, helper setup | Both readers expose manager; selected, nonminimized, unsuspended and visible iframe | `fixturesDir` |
| `03-defaults-options.js` | Missing/saved layouts, Settings-facing choices, B expansion, Options/Shift+O, bars, native icons | Missing user layout resolves top; explicit A/B/top persist; B is 202/108; bars have no Options/skips; native paths/order and header bounds match | fixture state |
| `04-menus-search.js` | RequestAnimationFrame first-visible menu placement, host resize/inset stability, sticky search/scroll in B/A/top and edges | 18-frame screen bounds stay within 1px; fixed search and changing list scroll survive snapshot refresh; below/above/constrained placement and 8px dock gaps pass | fixture state |
| `05-navigation-speed.js` | Real PDF/EPUB skip buttons, per-action paused M→A return, speed slider/shortcuts, visible Options playing operations | Four real commands change source position at matching granularity, each starts in M, retains pause/voice and returns A; 0.5 steps and 0.5x–3x bounds | fixture state |
| `06-settings.js` | Settings layout menu/caption and speed slider | Player/Settings choice agrees; Layout has no colon; slider is 0.5–3 by 0.5 and applies a half step | fixture state |
| `07-voice-scroll.js` | Long voice catalog sticky-search/scroll-refresh in B/A/top | Positive `maxScroll`; before/down/up search rectangles stay fixed while the option list moves and survives a real `zttsUpdate`; dummy entries receive no provider/voice command | `fixturesDir` |
| `90-cleanup.js` | Fixture teardown, exact restoration, owner state and new errors | No fixture readers/items; values/flags, memory, volume, sync and owner restored | baseline/state |
| `91-restore-host-window.js` | Post-run host window state restoration | Restore the evidenced maximized state and report bounds; original position is reported as unavailable when not captured | none |

Before you start:

- Verify `build/zotero-tts.xpi` SHA-256 `197373869fa736b350d4c4a320fb368cbc823cb56fcb207447098b39d9b03938` and embedded/disk `content/zotero-tts.js` SHA-256 `dc85bd2c72d4ddb515e3d372622c0644217c8df1a75d65a04279e6912f861b5a`.
- Run `zotero_ping`, list plugins, baseline before installing, then install this exact XPI and run startup before opening fixtures. Use `fixture-a.pdf` and `return-key/return-key.epub` from `params.fixturesDir`.
- Run the group with `stopOnError: true`; collect full results from `.tmp/zotero-dev/<runId>/results/`. If a focused row stops the group, run `90-cleanup.js` separately.
- The owner reader is never selected for a command, pressed, repositioned or reopened. Output is muted; named prefs and user flags are restored after fixture players close, with memory written last.

Limits:

- Natural audio progression and perceived listening quality are reported from the fixture AudioContext separately; a suspended clock at `0` is NOT TESTABLE for natural listening.
- The first-frame traces are rectangle evidence sampled immediately and across resize settling; smooth motion itself is not claimed. A host resize ignored by Zotero is recorded as NOT TESTABLE.
- Fixture setup uses a direct segment seed only to choose a middle starting point; every navigation assertion clicks the real floating button and records the resulting source position.
- The bridge could not move the grip with synthesized pointer events, so edge movement uses the production exported drag adapter; actual menu rectangles remain measured. The real reader viewport reached `511px`; the long locale request was `290px`, both sides were `224.5px`, and the visible menu was constrained to `224.5px` on the roomier side.
- The available real provider pools did not expose more than 30 voices, so `07-voice-scroll.js` uses a disposable child UI snapshot with 60 synthetic options for this rendering-only check. It does not issue provider or voice selection commands on those entries; each layout reached a positive scroll range and passed the fixed-header/list-refresh assertions.
- The final run recorded Zotero `AutoCompleteChild` `InvalidStateError` close-popup noise, two manifest-version warnings, and bounded machine audio-output-blocked messages; no dead-object error was observed.
- Fixture opening normalized the host from the baseline maximized state (`windowState:1`) to normal (`3`); `91-restore-host-window.js` restores the baseline host snapshot after cleanup. Settings was closed at baseline and remained intentionally closed.

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-17 / 1.12.12-beta3 | `00` baseline, `01` startup, `02` fixture readiness, `03` defaults/options, `04` menus/search, `05` real PDF/EPUB navigation and speed, `06` Settings, and `90` cleanup PASS; natural AudioContext remained suspended at `currentTime:0` | `2026-09-17-1.12.12-beta3-player-controls-baseline`; `2026-09-17-1.12.12-beta3-player-controls-startup`; `2026-09-17-1.12.12-beta3-player-controls-focused-menu-final4`; `2026-09-17-1.12.12-beta3-player-controls-navigation-speed-final`; `2026-09-17-1.12.12-beta3-player-controls-settings`; `2026-09-17-1.12.12-beta3-player-controls-final-cleanup` |
| 2026-09-17 / 1.12.12-beta3 | Menu edge movement used the production exported drag adapter because bridge pointer synthesis did not move the panel; actual menu rectangles and constrained geometry adapter evidence are separate; final cleanup restored owner and prefs | same runs; no public issue comment |
| 2026-09-17 / 1.12.12-beta3 | Supplemental final: `02`–`06` PASS with all-layout sticky-search, rAF bounds, per-action M reset, visible Options reopen and real constrained geometry; cleanup and host restore PASS to baseline `windowState:1`, `1936×1168` outer, `1920×1152` inner, `(-8,-8)` | `2026-09-17-1.12.12-beta3-player-controls-supplement-baseline3`; `...-supplement-final7`; `...-supplement-menu-final8`; `...-supplement-cleanup-last-retry`; `...-supplement-host-restore-last-retry` |
| 2026-09-17 / 1.12.12-beta3 | Narrow voice follow-up PASS: disposable child UI snapshot with 60 options; B/A/top fixed search and moving list survived refreshed snapshots; fixture cleanup and exact host restore PASS | `2026-09-17-1.12.12-beta3-player-controls-voice-scroll`; `...-voice-scroll-cleanup`; `...-voice-scroll-host-restore` |
