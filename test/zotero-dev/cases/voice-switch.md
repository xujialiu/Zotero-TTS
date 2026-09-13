[Checklist index](../README.md) · [Scripts](../scripts/voice-switch/README.md)

# 4a. Previous and next voice (issue #95)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.

Real-provider follow-up: use real Kokoro audio and capture
`wordDecision` plus `audioReady` from `diagnostics.voiceSwitch()`. Prove
that target audio became ready while the same old sentence was still
playing, then observe the first shared word boundary and adopted offset.
Use the existing alignment pipeline, including number/phrase bridges and
zero-duration tokens, rather than exclusively idealized fixture timings.
Any fallback must be explained by the recorded timing availability or by
playback having already passed the prepared segment. Coordinate access
with the owner before launching zotero-tester when another agent is using Zotero.

The [beta5 real Kokoro run](../runs/2026-09-13-1.12.5-beta5/report.md)
reproduced sentence fallback caused by a negative leading timestamp. The
[beta6 run](../runs/2026-09-13-1.12.5-beta6/report.md) verified the correction
in both directions using real Jadzia/Jessica audio: target ready at 313/148 ms,
old and new still on segment 7, word handoff at char 20/14, native positive
seek offsets, one target request, no sample, and original source positions.
Use its [executed scripts](../runs/2026-09-13-1.12.5-beta6/scripts/README.md)
for future real-provider checks. The captured negative-start arrays are also
pinned by `test/fixtures/voice-switch/kokoro-negative-start.json` and the
matcher regression tests. These observations do not grade subjective sound
quality or assert word-level timing accuracy for every provider.
Use an isolated fixture, recording and restoring every changed preference
with its user-value status. Preserve the user's transport, selection and
open tabs. Never use paid synthesis merely to check handoff mechanics.

Executed scripts: [initial beta3 run](../runs/2026-09-13-1.12.5-beta3/scripts/README.md).
Evidence: [beta3 report](../runs/2026-09-13-1.12.5-beta3/report.md).
The initial transport used `segmentGranularity: word`; its audio handoff
observations establish native source/controller behavior, but not the
production `sentence` granularity's visible word highlighting. Its shared
voice and several lifecycle attempts were inconclusive, as the report says.

The [follow-up report](../runs/2026-09-13-1.12.5-beta3-followup/report.md)
and [scripts](../runs/2026-09-13-1.12.5-beta3-followup/scripts/README.md) add valid sentence
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
   neighbors selected by trusted Shift+, / Shift+. For a regional selection,
   compare only voices in that exact normalized region: native menus also
   include generic/wildcard fallbacks that keyboard cycling skips (#97).
   Include generic English and wildcard neighbors beside two US voices;
   both directions must wrap within US, and a singleton US voice is a no-op.
   Include regional voices,
   favorites-only filtering, first/last wrap, one voice, rebinding, clearing,
   repeat suppression and an editable field. A paused selection stays
   paused and does not request a sample.
   Reuse the [regional fallback scripts](../runs/2026-09-13-1.12.6-beta/scripts/README.md);
   [the 1.12.6-beta report](../runs/2026-09-13-1.12.6-beta/report.md)
   records this paused native-manager check, with no provider synthesis.
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
whether highlighting feels synchronized. Keep the scripts that worked in
`scripts/voice-switch/`, and what ran with the results under `runs/<run>/`;
list the run in the kit's README.

Real provider checks can reuse the [all-provider scripts](../runs/2026-09-13-1.12.6-beta-all-providers/scripts/README.md).
The [1.12.6-beta provider report](../runs/2026-09-13-1.12.6-beta-all-providers/report.md)
records eight within-source cases and seven cross-source pairs in both
directions. Cross-source runs use cached real audio; they do not establish
cold-request latency or exhaust all provider combinations. The linked official
follow-up verifies Standard and Premium same-tier word handoffs; cross-tier
manual changes rebuild the native controller and are outside #95's shortcut pool.
