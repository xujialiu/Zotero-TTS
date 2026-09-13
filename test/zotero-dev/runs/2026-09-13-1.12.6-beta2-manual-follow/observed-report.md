# Issue #100 live verification report

| Behavior | Observed | Expected | Status |
| --- | --- | --- | --- |
| Build identity and startup | Zotero-TTS 1.12.6-beta2; startup returned 23 ok steps and failed: [] | The requested beta2 bundle is loaded and startup is complete | PASS |
| Baseline and restoration snapshot | Zotero 10.0.2-beta.9+c77df79af, Windows / Firefox 140; one pre-existing reader was active and paused at position 6; settings window was closed; temporary transport state was muted and disabled after snapshot | Preserve the user's reader, player, preferences, bookmarks and transport state | PASS |
| Keep-following preference and UI | Effective unset preference was true; checkbox ztts-keep-following-visible was bound to the preference; click trace was true -> false -> true; help covered complete disappearance, visible fragments, waiting during input and off behavior | Default on, correct binding, both states work, and help describes the behavior | PASS |
| Audio clock | Trusted fixture playback through the configured Fish voice had a running AudioContext and clock movement | Audio-driven checks use a real moving clock | PASS |
| PDF, sentence mode, automatic movement only | Direct positioning to scrollTop:700 left following:true; no trusted input occurred | Automatic movement alone does not disengage following | PASS |
| PDF, sentence mode, partial sentence | Trusted wheel was observed with isTrusted:true; the wheel itself did not move pixels in this bridge, so controlled follow-up positioning moved scrollTop:0 -> 200. The sentence fragment was [212.94,184.14,624.28,217.10]; viewport top was 200, leaving a positive 17 px intersection. following:true and interacting:true held during movement, and following:true remained after quiet; a follow target was issued only after the retained-fragment check | Any visible fragment keeps following; target requests are separate from physical animation | PASS |
| PDF, sentence mode, complete disappearance | Controlled positioning moved scrollTop:0 -> 800; the same fragment had no intersection. After the held interval diagnostics reported following:false, reason:wheel; explicit position locking restored following:true | Complete disappearance disengages; explicit return/skip restores following | PASS |
| PDF, outside mode, partial and complete | The same trusted-input/controlled-movement matrix passed: partial retained following:true; complete reported following:false, reason:wheel; explicit lock restored it | The fragment rule is independent of placement mode | PASS |
| EPUB, scrolled flow, multiline sentence | The active sentence had three displayed fragments at document y ranges 113.08-133.08, 143.62-163.62, and 174.15-194.15. At scrollY:180 only the final fragment remained visible (visibleFragments:1) and following stayed true; at scrollY:800 no fragment remained and following became false with reason:wheel | Any displayed fragment retains following; gaps between fragments do not count as visibility | PASS |
| EPUB, paginated flow, semantic navigation | At flow offset 10799 all three sentence fragments were visible. navigateToNextPage moved to offset 21598, held interacting:true, then settled at following:false, reason:navigation; explicit lock restored following. The same result held in outside mode | Async/native page navigation is held through movement and disengages only after the sentence disappears | PASS |
| Off and persistence | With keepFollowingWhileVisible:false, a trusted wheel immediately produced following:false, reason:wheel while the sentence was still visible. Direct manager resume, native resume, scrolling back, a later sentence, and changing sentence/outside mode all retained false. Explicit lock restored true | Off preserves the legacy immediate and persistent disengagement behavior | PASS |
| Playback advancement | Real Fish playback advanced positions 0 -> 1 -> 2; the clock moved from 85.7787 to 89.1893 seconds and following stayed true | Playback advancement is tested by the real clock, not word timers | PASS |
| Held keyboard input | A trusted PageDown keydown entered interacting:true in one route, but the native route did not produce a reliable controlled movement/hold trace; ArrowDown was consumed by the shortcut layer before the PDF gate saw it | Holding input suppresses follow until release | NOT TESTABLE |
| Trusted PageDown native movement in paginated EPUB | The corrected outer-window KeyboardEvent constructor returned [2,true], but no inner listener observed the event and the page offset did not change | Preserve the native page movement and judge the gate after movement | NOT TESTABLE |
| Pointer, touch, scrollbar and hand panning | No reliable bridge input path produced a complete trusted drag/pan trace within this run | Held pointer/touch/scrollbar/hand gestures suppress follow until release | NOT TESTABLE |
| PDF next-page/cross-column and oversized/unknown geometry | The available disposable fixture did not yield a verified next-page/cross-column or oversized sentence trace before cleanup | Each actual fragment, including page/column tails and unknown geometry, is measured separately | PENDING |
| Disposal and cleanup | Both fixture readers were closed and items erased; position store returned to rows:66, loaded:66, queued:0, lastError:null; user reader state, preference values/user flags, memory and native voice map matched baseline. The cleanup generated two can't access dead object errors with plugin-bundle stacks at 14:42:00 | Disposal leaves no dead-object errors, timers or listeners | FAIL |

## Identity

- XPI: C:\Users\xujia\orca\workspaces\zotero_plugin_tts\scroll\build\zotero-tts.xpi
- XPI SHA-256: 7712ceeec81144f5f5ae220edde61190f02a6e868ff1e83037265a6b71a36051
- Bundle SHA-256: 139ad6d6799228faf268bfb3ed89fdc73d84d1eda949090810822bfce040f58b
- Scratch staging: C:\Users\xujia\AppData\Local\Temp\ztts-issue100-2026-09-13-1.12.6-beta2-304905417f2b403d962dd659683f65fe

The live wheel checks distinguish the trusted wheel provenance from the subsequent controlled scrollTo positioning. The bridge did not provide natural wheel pixels or smooth-scroll animation evidence.

## First product failure

After the feature checks passed, 57-cleanup-close-fixtures-min2.js closed the disposable PDF and EPUB readers using the permitted popup-close then reader-close path. The error console contained two can't access dead object entries at 14:42:00, each with a zotero-tts@xujialiu.top.xpi/content/zotero-tts.js stack. This is the first product failure recorded in the run and blocks a clean lifecycle PASS. The run stopped after bounded cleanup; no code or artifact was changed. Exact raw console fields and the retracted un-attributable offset mapping are in evidence.json.

## Cleanup

Fixture readers and items are gone, the settings window is closed as found, the original selected tab is restored, readAloud.volume is back to its original value/user flag, WebDAV switches are restored after fixture deletion, and the debug-store state remains as found. The user reader remains active and paused at its baseline position. Known Zotero locale/autoplay/sync noise and harness-only eval errors are excluded from the product failure; the two plugin-stack dead-object errors are retained as the failure evidence.

## Checklist additions

The successful behavior rows above should be transferred to test/zotero-dev/cases/manual-follow.md under the current 3i section, with reusable scripts linked from test/zotero-dev/scripts/manual-follow/ and this sanitized run linked from test/zotero-dev/runs/2026-09-13-1.12.6-beta2-manual-follow/. The held-input, native PageDown, pointer/touch, cross-column/oversized and natural-pixel gaps remain pending until a rebuilt candidate is available.
