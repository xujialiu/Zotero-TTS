# Scripts: playback preparation notice (issue #120)

[Case](../../cases/playback-notice.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
|---|---|---|---|
| `playback-00-startup-diagnostic.js` | Installed bundle startup | `1.12.12-beta5`, every step `ok`, `failed: []` | none |
| `playback-01-baseline-and-transport.js` | Named prefs/flags, mute/sync isolation, fresh native PDF/EPUB transport | Two disposable fixtures; both managers attached and paused on `native119-a` | `fixturesDir`; `state.baseline/fixtures/transport` |
| `playback-02-audio-clock.js` | Muted native output probe | Running context and advancing clock in PDF/EPUB | `state.transport`; `state.audioClock` |
| `playback-03-initial-fast-resume-navigation.js` | 3l.1–3l.2 initial source start, fast start, pause/resume, navigation | Slow wait shows localized Preparing… after 300 ms, survives response, clears at running source start; fast start has no flash; pause cancels; navigation starts a fresh wait | `state.transport`; `state.playbackResults` |
| `playback-04-delay-prefetch.js` | 3l.3 sentence delay and prefetch | No notice during configured gap; delayed next sentence shows only after gap + 300 ms; background prefetch stays hidden | `state.transport`; `state.delayResults` |
| `playback-05-failure-cancellation-priority.js` | 3l.4 failure, cancellation and teardown | Localized failure replaces preparing; retry works; pending stop/close has no late source | `state.transport`; `state.failureResults` |
| `playback-06-voice-priority.js` | 3l.5 ordinary/voice overlay priority and handoff | Voice notice wins an ordinary wait; an old source is running/advancing while it stays visible; target/safe readiness clears; ordinary wait works after handoff; tab switch leaves original completion intact | `state.transport`; `state.voicePriorityResults` |
| `playback-07-suspended-and-tab-switch.js` | 3l.4 suspended output and ordinary completion after tab switch | Source start in suspended context leaves Preparing visible; resume statechange clears it; delayed original document clears after selecting the other fixture tab | `state.transport`; `state.suspendedTabResults` |
| `playback-99-cleanup-and-restore.js` | Fixture and transport teardown | No fixture readers/items/notices; exact prefs/user flags, owner state and hooks restored; minimize attempt recorded separately | `state.baseline/fixtures/transport` |

## Before you start

- Pass the absolute repository path as `root` and its `test/fixtures` directory as `fixturesDir`.

- Verify and install XPI `3aae0429284005e704e2fcf2c4a5b4436048ebba059b81f95e514f9966d150d2`; verify bundle `78c56ed9f5d7de403f3d175ba8526d11ba8b7b0cfdb8b2c6f7e4e3f4cd3e8eab`; run startup before opening fixtures.
- Use `test/fixtures/fixture-a.pdf` and `test/fixtures/return-key/return-key.epub`; the native stub returns controlled muted WAV audio and timestamps, so no provider request is needed.
- Snapshot owner readers, named prefs and user flags; disable sync and set plugin volume to `0` during playback. Cleanup restores these values and clears the fixture items/readers and temporary hooks.
- Keep Zotero minimized for bridge-only work; restore/focus briefly for actual player controls and trusted input, then minimize again. Do not drive the owner reader.

## Limits

- Evidence covers native controller, source and DOM timing in muted fixtures. It cannot assess perceived sound, pronunciation, visual smoothness or actual speaker output.
- Running clocks make timing rows testable; a suspended/frozen native context makes audio-driven rows `NOT TESTABLE` while state and notice logic remain observable.
- The bootstrap delegates fixture/transport setup to the executed #119 kit methods; its macOS path handling is retained in the #119 script revision run with this verification.
- Harness-only attempts (`failure-r1`–`failure-r7`, early core/delay/priority and suspended passes, plus one post-reset cleanup call) were superseded by script evidence revisions; their failures were setup/evidence issues and are not retained as reusable rows.

## Runs

[Accepted beta5 result table](https://github.com/xujialiu/Zotero-TTS/issues/120#issuecomment-5710577358).

| Date/build | Coverage and result | Run/evidence |
|---|---|---|
| 2026-09-17 / 1.12.12-beta5 | Startup, baseline/transport and native clock PASS in PDF/EPUB; hashes and startup identity matched | `2026-09-17-1.12.12-beta5-playback-notice-bootstrap-r1` |
| 2026-09-17 / 1.12.12-beta5 | 3l.1–3l.2 initial slow source, fast start, pause/resume and sentence navigation PASS in PDF/EPUB; source hooks and `playbackNotice()` transitions captured | `2026-09-17-1.12.12-beta5-playback-notice-core-r2` |
| 2026-09-17 / 1.12.12-beta5 | 3l.3 configured sentence gap and delayed next audio PASS in PDF/EPUB; first post-gap `_speak` and threshold timing recorded (PDF 2210→2615 ms, EPUB 2461→2804 ms); prefetch calls observed without notice | `2026-09-17-1.12.12-beta5-playback-notice-delay-r6` |
| 2026-09-17 / 1.12.12-beta5 | 3l.4 delayed no-text failure, localized replacement, retry and pending cancellation/close PASS in PDF/EPUB | `2026-09-17-1.12.12-beta5-playback-notice-failure-r8` |
| 2026-09-17 / 1.12.12-beta5 | 3l.5 voice-priority overlap and post-handoff ordinary playback PASS in PDF/EPUB; indexed handoff, before/after hooks, and old running clocks (PDF 0.501→1.008; EPUB 0.565→1.061) captured with voice opacity `1` | `2026-09-17-1.12.12-beta5-playback-notice-priority-r7` |
| 2026-09-17 / 1.12.12-beta5 | 3l.4 suspended output and ordinary completion after tab switch PASS in PDF/EPUB; source start suspended retained `Preparing…`, resume cleared it, and original PDF cleared with EPUB selected | `2026-09-17-1.12.12-beta5-playback-notice-suspended-r2` |
| 2026-09-17 / 1.12.12-beta5 | Cleanup PASS: fixtures/readers erased, hooks/restored transport and owner stable, named prefs/user flags equal; bridge minimize attempt remained `windowState: 3`, visible (NOT TESTABLE for required taskbar state) | `2026-09-17-1.12.12-beta5-playback-notice-suspended-r2-cleanup`; post-cleanup bridge probe |
