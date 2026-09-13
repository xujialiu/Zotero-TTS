# Real Kokoro voice-switch scripts (issue #95, beta6)

This directory preserves the scripts used for the focused beta6 verification. The script bodies are copied from the clean beta5 setup after removing the reader-realm _getAudioData promise wrapper that caused test-only console noise. The run used the user's configured Kokoro provider, an isolated fixture-a.pdf reader, plugin volume zero, and temporary WebDAV/shared-voice switches.

1. 00-baseline-snapshot.js records the user reader, selected tab, position rows, exact touched preference values and user flags, native voice map, and redacted Kokoro configuration.
2. 01-disable-sync-and-mute.js disables WebDAV position/settings transport, disables shared voice propagation for the fixture, mutes playback, and keeps debug storage enabled.
3. 02-fixture-a-open.js imports/opens the disposable fixture, opens its player, pauses it, and records the real filtered Kokoro voice list and sentence granularity.
4. 04-real-kokoro-word-handoff.js runs the trusted Shift+. forward handoff and records both real decoded timing arrays, durations, request/readiness/commit observations, numeric old-source stop, target first play offset, and source-position identity.
5. 05-real-kokoro-warmed-reverse.js runs the one permitted trusted Shift+, reverse handoff with the same evidence fields.
6. 99-cleanup-and-restore.js closes/erases only fixture state, restores all snapshotted values/user flags with memory/native voice state before WebDAV switches, restores the original selected tab, and reports final rows/queue.

The sanitized outputs are in runs/2026-09-13-1.12.5-beta6/evidence.json and runs/2026-09-13-1.12.5-beta6/report.md. The beta5 numeric/phrase alignment evidence remains under the separate beta5 run directory.
