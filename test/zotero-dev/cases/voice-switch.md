# 4a. Previous and next voice (issue #95)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.
Use an isolated fixture, recording and restoring every changed preference
with its user-value status. Preserve the user's transport, selection and
open tabs. Never use paid synthesis merely to check handoff mechanics.

Executed scripts: [initial beta3 run](../scripts/voice-switch/README.md).
Evidence: [beta3 report](../runs/2026-09-13-1.12.5-beta3/report.md).
The initial transport used `segmentGranularity: word`; its audio handoff
observations establish native source/controller behavior, but not the
production `sentence` granularity's visible word highlighting. Its shared
voice and several lifecycle attempts were inconclusive, as the report says.

The [follow-up report](../runs/2026-09-13-1.12.5-beta3-followup/report.md)
and [scripts](../scripts/voice-switch-followup/README.md) add valid sentence
granularity, PDF word-to-display rectangle matching, and live speed, skip,
manual voice and deactivate cancellation. New audio contexts stayed
suspended even inside a trusted key handler, so this follow-up did not
verify a second word handoff, shared playing-reader adoption or the armed
stop's later reschedule. Zotero normally pauses other readers when one
starts; the dual-playing setup required a fixture-only status guard.
Do not count that guarded scenario as an ordinary supported Zotero state.

1. **Identity and bindings.** `diagnostics.voiceSwitch()` reports
   `mechanism: prepared-native-voice-v1`, previous `Shift+,`, next `Shift+.`.
   Startup includes `prepared voice switching` with no failed step.
2. **List and keys.** Compare the actual player's voice menu with the
   neighbors selected by trusted Shift+, / Shift+. Include regional voices,
   favorites-only filtering, first/last wrap, one voice, rebinding, clearing,
   repeat suppression and an editable field. A paused selection stays
   paused and does not request a sample.
3. **Word handoff.** Use a native RemoteReadAloudController with controlled
   fixture audio and explicit fixture timestamps; retain the transport stub
   and restore it. Delay the new audio. The old controller and selected
   voice stay unchanged until preparation finishes. Its audio source stops
   at the scheduled old-word end. The adopted native controller uses the
   next word's *new-voice* audio offset and correct text highlight. The
   diagnostic's `last` reports `kind: word`, source/target IDs, segment,
   `charStart` and `offset`. Verify no target sample or duplicate fetch.
4. **Sentence fallback.** Repeat without word timings, and with invalid
   or incompatible word ranges. Old audio completes its sentence; the next
   prepared sentence starts at offset 0. `last.kind` is `sentence`. Preserve
   the configured sentence and paragraph delay; no sentence repeats/skips.
5. **Preparation overtaken.** Delay the response beyond one sentence.
   Reading continues, the switch prepares farther ahead, and the adopted
   segment is never behind the current reading position.
6. **Cancellation and failure.** Rapid keys retain only the latest target;
   returning to the current voice cancels. Pause, skip, speed, manual voice
   selection, stop, tab close and shutdown remove pending work. A stale
   result never plays. A rejected request leaves old audio playing, reports
   `failed`, and shows a failure notice. Repeat after a word stop is armed
   to prove cancellation removes the scheduled early stop.
7. **Shared voice.** With one voice everywhere enabled, a second playing
   fixture prepares independently and changes at its own boundary. With it
   off, the other tab retains its voice. Paused tabs remain silent.
8. **Cleanup.** No pending request, retained preparatory controller,
   injected method, fixture or changed preference remains. Preserve the
   exact verified XPI hash. Record errors and distinguish unrelated errors.

Unit tests cover artificial timer delays, timeout exhaustion, cross-realm
array callback traps and malformed timestamp combinations. Real bridge
verification must prove controller adoption and scheduled source stops;
a diagnostic alone does not prove the sound was heard. Human judgment is
required for natural pronunciation, the perceptual gap at the handoff and
whether highlighting feels synchronized. Save executed scripts and results
under the corresponding scripts/runs directories and link them here.
