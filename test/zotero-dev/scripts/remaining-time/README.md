# Scripts: estimated remaining reading time (issue #148)

[Case](../../cases/remaining-time.md) · [Checklist](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Preinstall baseline, dedicated WebDAV destination and host minimization | Test destination matches; plugin sync/backup switches suspended; OpenReader Position absent; affected prefs, native voice memory, owner readers and transport state retained privately | none; writes `state.baseline`, `state.isolation` |
| `01-identity-settings.js` | beta identity, startup, default-on setting pane and EN/ZH locale source keys | startup `failed: []`; requested XPI source and SHA-256; checkbox checked with no user value; all message keys present in both locales | `root`, `xpiPath`, `xpiSHA256`, `expectedVersion` |
| `02-epub-scope-and-fallback.js` | Deterministic EPUB section boundaries and outline-free PDF fallback | 180 EPUB segments; Part 1/Part 2 boundary at 90; nested chapters remain Part 1; section ≤ document; PDF has document scope only | `deterministicBaseURL`; writes `state.fixtures`, `state.scopeResults` |
| `03-ui-setting-layout.js` | Checkbox toggle during paused reading, all layouts, float expansion/drag, long title, normal/narrow widths | active/paused unchanged; bars 34 px; floating 144/238 px collapsed/expanded; title tooltip 129 chars; no clipping at 300 px | `state.fixtures.epub`; writes `state.uiResults` |
| `04-clocks-requests-performance.js` | Audio clock, pause/gap/speed/skip/completion, no display synthesis and snapshot performance | paused delta 0; audio clock moving; exact 2× ratio; gap drops; finish `0`; fresh Play estimate; 500 snapshots below the 2,500 ms limit with no requests | `deterministicBaseURL`; writes `state.clockResults` |
| `05-voice-recalibration-production-smoke.js` | Actual Player provider/language/voice picks, paused voice preparation, resumed handoff and configured Fish smoke | Bella clip 3 s; paused Heart pick commits after Play with Heart clip 1.5 s and `voiceSwitch` committed; listed Fish Dax clip decodes and plays with audio `running` | `deterministicBaseURL`; writes `state.voiceResults`, `state.fixtures.voice/production` |
| `06-selection-buffering-longdoc.js` | Actual selected-text Shift+Space behavior, bounded `manager.setSegments` control, delayed-audio freeze, long scrolling EPUB performance | UI selected text starts document scope at position 0; fresh `clearSegments` + `setSegments(...,0,1)` gives selection scope, finishes at zero, then Play returns document scope; delayed estimate freezes; 801 segments / 35.2 viewports / 500 snapshots pass | `deterministicBaseURL`; writes `state.supplementResults`, `state.fixtures.selection/buffering/longdoc` |
| `99-cleanup-restore.js` | Fixture/position teardown, pref/native/dynamic-record restoration, WebDAV and host restoration | all run-owned fixtures erased; position count restored to baseline; transports idle; all named prefs/native memory byte-identical; host minimized | `state.baseline`, `state.fixtures`, `state.isolation` |

Before you start:

- Use the exact XPI named by the brief. Run this script before installation, then list/install/list and run `diagnostics.startup()` before opening a reader.
- The script reads `~/.secrets/Zotero-TTS/test_webdav.txt` inside Zotero and returns only match/length evidence. It suspends the three Zotero-TTS WebDAV switches and restores them after fixture and position cleanup.
- The remaining-time run uses one temporary EPUB, one outline-free PDF, and a local deterministic Kokoro-compatible server. Production configured audio is exercised in a separate bounded smoke step.
- Start the reusable server from this folder with `node remaining-time-deterministic-server.mjs`; it listens on `127.0.0.1:8769`, serves Bella (3 s) and Heart (1.5 s), and `/delay` holds captioned audio for 10 s. Stop it after cleanup.
- `readAloud.volume` is muted for playback and restored with its original value and user-value flag. The native `extensions.zotero.reader.readAloudVoices` pref is restored byte-for-byte last after readers close.

Limits:

- Beta6's real Player path is retained in `05`; direct chrome `selectVoice()` was not used as evidence. The paused Heart pick remained Bella until Play, then committed with a documented handoff and distinct clip duration.
- Selected-text Shift+Space is documented behavior on Zotero 10: the target is accepted, playback starts at position 0, and remaining time is document-scoped through the end. The controlled contract clears the active controller first, then binds `manager.setSegments(segments,0,1)` and verifies selection scope, early completion, and document scope after Play.
- Delayed audio kept the remaining seconds unchanged while the delayed request was outstanding; the exposed `buffering` flag was not always true at the sampling instant and is recorded with the result.
- Subjective listening quality is outside this kit. The retained deterministic server is stopped after cleanup.

Runs:

| Run | Build and artifact | Result |
| --- | --- | --- |
| 2026-09-26 | `1.15.2-beta6`, XPI SHA-256 `fe8045caa0d2f2f6c11eadd9dcdb741c7486120c9e6ab7f6148ea07769d53bd5` | `00`/`01`/`02`/`03`/`04` PASS; `05` actual Player voice/Fish PASS; `06` selected-start + controlled bounded range PASS, delayed freeze + longdoc PASS; `99` PASS. Final audit: no run-owned IDs remain, rows 85, transports idle, native/memory restored, original WebDAV restored, host minimized. |

[Field-by-field verification table](https://github.com/xujialiu/Zotero-TTS/issues/148#issuecomment-5845140879).
