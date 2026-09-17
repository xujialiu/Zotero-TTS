# Scripts: voice-switch notice lifetime (issue #119)

[Case](../../cases/voice-notice.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md) · [Verification](https://github.com/xujialiu/Zotero-TTS/issues/119#issuecomment-5708112768)

| Script | What it checks | What it expects | Params/state |
|---|---|---|---|
| `notice-00-startup-diagnostic.js` | Build startup | `1.12.12-beta4`, every step `ok`, `failed: []` | none |
| `notice-01-baseline-and-fixtures.js` | Named prefs/flags, mute and sync isolation, fresh PDF/EPUB | Two disposable items; volume 0; owner state and user flags captured | `fixturesDir`; `state.baseline/fixtures` |
| `notice-02-open-native-transport.js` | Native sentence transport and attached controls | Both fixture managers active/paused on `native119-a`; `controlsAttached: true` | `state.fixtures`; `state.transport` |
| `notice-03-audio-clock.js` | Muted native output probe | Running context and advancing clock in both formats, or machine `NOT TESTABLE` | `state.transport`; `state.audioClock` |
| `notice-04-playing-slow-source.js` | 4c.1; plugin-player picker and trusted voice shortcut | `preparing` and opaque notice at 5.1 s; old controller remains; notice clears only after target source starts | `state.transport`; `state.playingResults` |
| `notice-05-paused-early-fallback.js` | 4c.2–4c.3; paused readiness, early resume, missing/grouped timing | Paused preparation is silent; `ready` resumes target at a word boundary; early play keeps the old voice first; fallback starts the next sentence at 0 | `state.transport`; `state.pausedResults` |
| `notice-06-replacement-failure-overlay.js` | 4c.4–4c.5; replacement, cancellation, failure, toast expiry, tab switch, disposal | Latest C survives late B; re-pick/stop/close clear; localized failure retains A; short toast expires independently; original document clears | `state.transport/baseline`; `state.raceResults` |
| `notice-99-cleanup-and-restore.js` | Fixture and transport teardown | No fixture readers/items/notices; exact prefs/user flags, owner tab/state and prototype restored; no new dead-object error | `state.baseline/fixtures/transport` |

## Before you start

- Verify XPI SHA-256 `E6D1C56FFEF5913788D84AE1727026A71B212C0D8702969D72DB161C3FDED701` and bundle SHA-256 `A48BC7A740C4A78D2551C041F16ED74624AD9621A6B15D1F03AAEEC6E7983D12`; install the exact XPI and run startup before opening fixtures.
- Run with `zotero_ping`, `zotero_plugin_list`, and `stopOnError: true`; use `test/fixtures/fixture-a.pdf` and `test/fixtures/return-key/return-key.epub` from `params.fixturesDir`.
- The native stub returns controlled WAV bytes and sentence/word timing only for fixture readers. The plugin volume is muted; no provider synthesis or paid request is needed.
- The baseline snapshots named preferences and user-value flags, owner readers, selected tab and debug storage. Cleanup closes fixture players, restores the injected method and memory last, erases the items, and leaves the host taskbar-minimized (`windowState: 2`) while preserving the selected tab. The baseline does not snapshot outer bounds or the initial maximized/normal state, so geometry restoration is not claimed; the final minimized bounds are recorded as observation only.
- Foreground is used only for the plugin-player picker and trusted key input, then Zotero is minimized immediately. Do not drive the owner reader.

## Limits

- The run proves controller/source/DOM timing and native state. It does not grade perceived sound continuity, pronunciation or visual smoothness.
- The muted native clock ran in both formats in this environment. A suspended/frozen clock makes audio-driven continuity `NOT TESTABLE` while state and preparation checks remain useful.
- A first 8-second fixture calibration let the old sentence advance before a 6.2-second response; the executed kit uses a 20-second buffer for the slow-source row. The failed calibration is not retained as a script.
- The legacy `108-03` mixed script still targets the pre-plugin-player notice path and stopped in both formats; the issue #119 race script covers the same latest-target/cancellation/failure behavior against the current player.

## Runs

| Date/build | Coverage and result | Run/evidence |
|---|---|---|
| 2026-09-17 / 1.12.12-beta4 | `notice-00`–`notice-02` fresh final bootstrap PASS; PDF 17 segments and EPUB 241 segments; both native managers paused on `native119-a` | `2026-09-17-1.12.12-beta4-voice-notice-final-bootstrap-r1` |
| 2026-09-17 / 1.12.12-beta4 | `notice-03` clock PASS in PDF/EPUB; `notice-04` slow preparation/source-start PASS in PDF/EPUB; 5.1 s notice opacity `1`, target adoption still opacity `1`, terminal selected opacity `0` | runner `one` executions `2026-09-17T02:55:41Z` and `2026-09-17T03:27:01Z`; final bootstrap `...-final-slow-bootstrap-r2` |
| 2026-09-17 / 1.12.12-beta4 | `notice-05` paused readiness, early resume, missing timing and grouped timing PASS for both formats; fallback now requires exactly `oldIndex + 1` | `2026-09-17-1.12.12-beta4-voice-notice-evidence-tighten-r1` |
| 2026-09-17 / 1.12.12-beta4 | `notice-06` replacement, cancellation, failure, overlay, tab-switch and disposal PASS for both formats; late B responses were observed while C remained pending, pending-stop was exercised, and post-close delayed responses produced zero target source starts | `2026-09-17-1.12.12-beta4-voice-notice-evidence-tighten-r2` |
| 2026-09-17 / 1.12.12-beta4 | Final cleanup PASS: fixtures/readers/notices absent, transport restored, owner stable, all snapshotted prefs/flags equal, selected tab restored, `windowState: 2`; no geometry restore claim because bounds/state were not baselined | `2026-09-17-1.12.12-beta4-voice-notice-evidence-tighten-cleanup-r1`; tester table supplied for issue #119 |
| 2026-09-17 / 1.12.12-beta4 | Legacy focused boundary regressions (`voice-switch` 3/4/6/10) through `108-02` and `108-07`: native word/sentence/paused/cancellation evidence PASS; legacy `108-03` stale UI path FAIL, superseded by `notice-06` | `2026-09-17-1.12.12-beta4-voice-switch-focused-r1`; `...-voice-switch-boundaries-r1`; legacy cleanup PASS |
| 2026-09-17 / 1.12.12-beta4 | Minimized bridge smoke: ping/list/startup PASS; runner startup 1 ms; 250 ms timer 255 ms; `windowState: 2`, `document.hidden: true`, `visibilityState: hidden`, selected owner tab retained; final minimized bounds observed as `237×39` at `(-32000,-32000)` | post-cleanup bridge calls; exact probe/output in `.tmp/zotero-dev/minimized-window/` |
