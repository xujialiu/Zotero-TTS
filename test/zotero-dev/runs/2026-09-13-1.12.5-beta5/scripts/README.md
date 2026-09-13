# Real Kokoro voice-switch scripts (issue #95, beta5)

These scripts were used with `1.12.5-beta5` and the user's configured Kokoro provider. They use a disposable imported `fixture-a.pdf` reader, never the user's reading position, and keep the plugin volume at zero while playback is driven. The baseline stores exact preference values inside the Zotero process and prints only redacted summaries; provider headers are never printed.

1. `00-baseline-snapshot.js` records the user reader, selected tab, position rows, the exact preferences touched by the run, the native voice map, and the configured Kokoro address/voice. Secret header values are retained only in process memory for cleanup.
2. `01-disable-sync-and-mute.js` disables WebDAV position/settings transport, disables shared voice propagation for the fixture, mutes plugin playback, and keeps debug storage enabled.
3. `02-fixture-a-open.js` imports and opens `fixture-a.pdf` in the background, opens the fixture player, pauses it, and records the real filtered Kokoro voice list and sentence granularity.
4. `03-trusted-clock-probe.js` sends a trusted `Shift+Space` only to the fixture and records whether its native audio clock moves.
5. `04-real-kokoro-word-handoff.js` uses trusted `Shift+.` with adjacent real Kokoro voices. It records the old and target decoded durations, complete timestamp arrays, audio-ready elapsed times, old source state, target controller/play observations, the diagnostic word decision, and the final boundary.
6. `05-real-kokoro-warmed-reverse.js` was an exploratory reverse-direction fast-return probe. Its first version wrapped a reader-realm promise and produced test-only cross-realm console errors; its result is retained as exploratory evidence and excluded from the clean result.
7. `06-real-kokoro-numeric-alignment.js` sends the existing numeric/phrase text through the real fixture remote interface and records both real Kokoro timestamp arrays and source slices without playing it.
8. `99-cleanup-and-restore.js` closes/erases only fixture state, restores all snapshotted values and user-value flags with memory/native voice state before WebDAV switches, restores the original selected tab, and reports final rows/queue.

Expected cleanup is zero fixture readers/items, the original tab and user reader unchanged, the original memory/native voice map and headers equal to baseline, and position rows/queue unchanged. The sanitized outputs from this run are [the beta5 evidence](../evidence.json) and [the beta5 report](../report.md).
