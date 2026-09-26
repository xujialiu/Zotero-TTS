[Checklist index](../README.md) · [Scripts](../scripts/voice-switch/README.md)

# 4a. Voice switching (issues #95, #108)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.

Since issue #133 the switch runs in the Engine (`core/engine/handoff.ts`):
the new voice's audio is a second clip store of the tab's session, not a
second controller of Read Aloud's, and taking over is the session swapping
voices before the manager's own `selectVoice` rebuilds its controller,
which carries on (`diagnostics.engine()` `stats.carriedOn` up one per
switch, `stats.started` unchanged). `diagnostics.voiceSwitch()` keeps its
report per reader. The runs below measured the native mechanism of 1.12.5;
their scripts read that controller's fields and are rewritten against the
Engine's diagnostics at the next run.

Real-provider follow-up: use real Kokoro audio and capture
`wordDecision` plus `audioReady` from `diagnostics.voiceSwitch()`. Prove
that target audio became ready while the same old sentence was still
playing, then observe the first shared word boundary and adopted offset.
Use the existing alignment pipeline, including number/phrase bridges and
zero-duration tokens, rather than exclusively idealized fixture timings.
Any fallback must be explained by the recorded timing availability or by
playback having already passed the prepared segment. Coordinate access
with the owner before launching zotero-tester when another agent is using Zotero.

The beta5 real Kokoro run (2026-09-13, 1.12.5-beta5)
reproduced sentence fallback caused by a negative leading timestamp. The
beta6 run (2026-09-13, 1.12.5-beta6) verified the correction
in both directions using real Jadzia/Jessica audio: target ready at 313/148 ms,
old and new still on segment 7, word handoff at char 20/14, native positive
seek offsets, one target request, no sample, and original source positions.
Use its executed scripts (2026-09-13, 1.12.5-beta6)
for future real-provider checks. The captured negative-start arrays are also
pinned by `test/fixtures/voice-switch/kokoro-negative-start.json` and the
matcher regression tests. These observations do not grade subjective sound
quality or assert word-level timing accuracy for every provider.
Use an isolated fixture, recording and restoring every changed preference
with its user-value status. Preserve the user's transport, selection and
open tabs. Never use paid synthesis merely to check handoff mechanics.

Executed scripts: initial beta3 run (2026-09-13, 1.12.5-beta3).
Evidence: beta3 report (2026-09-13, 1.12.5-beta3).
The initial transport used `segmentGranularity: word`; its audio handoff
observations establish native source/controller behavior, but not the
production `sentence` granularity's visible word highlighting. Its shared
voice and several lifecycle attempts were inconclusive, as the report says.

The follow-up report (2026-09-13, 1.12.5-beta3 followup)
and scripts (2026-09-13, 1.12.5-beta3 followup) add valid sentence
granularity, PDF word-to-display rectangle matching, and live speed, skip,
manual voice and deactivate cancellation. New audio contexts stayed
suspended even inside a trusted key handler, so this follow-up did not
verify a second word handoff, shared playing-reader adoption or the armed
stop's later reschedule. Zotero normally pauses other readers when one
starts; the dual-playing setup required a fixture-only status guard.
Do not count that guarded scenario as an ordinary supported Zotero state.

1. **Identity and bindings.** `diagnostics.voiceSwitch()` reports
   `mechanism: engine-handoff-v1`, previous `Shift+,`, next `Shift+.`.
   Each attached reader reports `handoff.controlsAttached: true`.
   Startup includes `the Engine` and `voice switching` with no failed
   step.
2. **List and keys.** Compare the actual player's voice menu with the
   neighbors selected by trusted Shift+, / Shift+. For a regional selection,
   compare only voices in that exact normalized region: native menus and
   keyboard cycling use the same filtered list (#106).
   Include generic English and wildcard neighbors beside two US voices;
   both directions must wrap within US, and a singleton US voice is a no-op.
   Include regional voices,
   favorites-only filtering, first/last wrap, one voice, rebinding, clearing,
   repeat suppression and an editable field. A paused selection stays
   paused, prepares the new voice's sentence audio, and requests no sample.
   Reuse the regional fallback scripts (2026-09-13, 1.12.6-beta);
   the 1.12.6-beta report (2026-09-13, 1.12.6-beta)
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
   returning to the current voice cancels. Skip, speed, stop, tab close and
   shutdown remove pending work. Pause keeps preparation silent and disarms
   a scheduled stop; a manual pick replaces the pending target. A stale
   result never plays. A rejected request leaves old audio playing, reports
   `failed`, and shows a failure notice. Repeat after a word stop is armed
   to prove cancellation removes the scheduled early stop.
7. **Shared voice.** With one voice everywhere enabled, a second playing
   fixture prepares independently and changes at its own boundary. With it
   off, the other tab retains its voice. Paused tabs remain silent.
8. **Cleanup.** No pending request, retained preparatory controller,
   injected method, fixture or changed preference remains. Preserve the
   exact verified XPI hash. Record errors and distinguish unrelated errors.
   Close a fixture while its persistent voice notice is visible. No notice
   or dead-object console error may remain (see case 4c, issue #119).
9. **Popup, locale and mode parity (#108).** In both PDF and EPUB fixtures,
   drive native `selectVoice`, `setLanguage` with `persist: true`, and
   `selectTier` through the plugin's attached methods. Include an actual
   popup selection to prove the UI reaches those methods. Until handoff,
   the original controller, voice and persisted preferences remain intact.
   After handoff, the selected voice/locale/tier match native resolution,
   including a remembered locale voice. No preview updates shared memory
   or another tab. A re-pick of the original voice cancels without restart.
10. **Paused preparation and resume (#108).** Pause inside a known word;
    change voice through a popup control and a shortcut. Observe target
    audio prepared with no source playing. If ready on Play, the first
    target playback starts at the next word's new-voice offset, with the
    same sentence/source position and no original-voice playback first.
    If not ready, Play resumes the original voice and switches once ready.
    With missing or grouped timing that cannot identify the exact paused
    word, finish the current sentence in the original voice before switching.
    Preparation remains usable after a pause longer than two minutes
    (timer exhaustion is covered by unit tests). A suspended target output
    stays suspended during preparation and is resumed on Play.
11. **Mixed selections and failures (#108).** Replace pending requests
    across popup voice, locale, mode and shortcut controls. Only the latest
    target can commit. Failure retains the original voice, locale and
    controller and shows the failure notice; a paused reader stays paused.
    Pause during preparation keeps it pending silently. Pause/stop/seek
    while a target output is resuming must not cause a later unwanted play.
12. **Provider cancellation (#108).** Observe a real plugin-provider
    synthesis signal during a bounded delayed fixture request, then replace
    the target: the signal is aborted and no obsolete audio, cache write or
    prefetch occurs. A normal playback request of the same text/voice is
    unaffected (also covered by unit tests). Zotero's official remote API
    exposes no abort operation: verify that its obsolete result is discarded
    and never plays, and explicitly record that transport limitation.


13. **Recovery after the session ended (#149).** Pending live verification.
    On an isolated PDF or EPUB fixture, retain the current segment at a
    nonzero index, destroy its controller, and allow the Engine's cleanup
    microtask to finish. Prove the precondition with
    `diagnostics.engine()`: no controller, session `ended: true`, manager
    active, segments still present. Clear the selected ID to reproduce the
    original state, then select a listed System voice through the player's
    voice control. Expect the selected ID to match, a new Engine controller,
    session `ended: false`, and manager/session paused. The current segment
    and restart index must remain unchanged; the next Play starts at that
    sentence's opening. `diagnostics.voiceSwitch()` must report
    `handoff.recoveries` increased by one and `handoff.notice: selected`,
    with no unavailable notice. Count audio-source requests across the pick
    and a bounded wait: zero new requests before Play; Play requests the
    target voice. Repeat with the stranded manager marked unpaused, and
    with its old selected ID retained and that same voice picked again.
    Both recoveries must end paused. Use at least Albert, Samantha and Ava
    when listed on macOS, and include a second provider as a control.
    Check `diagnostics.documentVoices()`: only the fixture's record changes
    to the explicit manual choice; the global default and a second fixture
    record remain unchanged. Run one ordinary live-session voice change
    afterward: it still uses a Handoff, not recovery. Unit tests alone
    cover successful reattachment of a missing Engine, failed attachment,
    missing segments, absent targets and a native-controller fallback.
    Only successful rebuilding reports recovery. Never strand the owner's reader for
    this check. Restore the request counter/wrapper, erase fixture records,
    and complete WebDAV cleanup before restoring automatic sync.

Unit tests cover artificial timer delays, timeout exhaustion, cross-realm
array callback traps and malformed timestamp combinations. Real bridge
verification must prove controller adoption and scheduled source stops;
a diagnostic alone does not prove the sound was heard. Human judgment is
required for natural pronunciation, the perceptual gap at the handoff and
whether highlighting feels synchronized. Keep the scripts that worked in
`scripts/voice-switch/` and list the run in the kit's README; its table is
on the issue.

Real provider checks can reuse the all-provider scripts (2026-09-13, 1.12.6-beta all-providers).
The 1.12.6-beta provider report (2026-09-13, 1.12.6-beta all-providers)
records eight within-source cases and seven cross-source pairs in both
directions. Cross-source runs use cached real audio; they do not establish
cold-request latency or exhaust all provider combinations. The linked official
follow-up verifies Standard and Premium same-tier word handoffs; cross-tier
manual changes were outside #95's shortcut pool; #108 now covers those
controls through items 9-12 above.
