[Checklist](../README.md)

# Estimated remaining reading time (issue #148)

The owner authorized live verification after the local checks. Follow the
[baseline](../baseline.md) and tester workflow, including test WebDAV
isolation and full restoration. Verified on beta6: the
[retained kit](../scripts/remaining-time/README.md) records the completed
checks and the first pass's corrected test assumptions.

Use `test/fixtures/remaining-time/remaining-time.epub`: two top-level parts,
with two chapters each in a single spine item. Import it as a temporary
attachment. Use a fixture PDF with no usable outline for the fallback.
Retain executed scripts and their results in the linked kit.

### 1. Default, setting and layouts

With no user value for `readAloud.remainingTime`, the Reading checkbox is
on. Top bar, Bottom bar and Floating panel show an estimate without
expanding Options. The floating panel fits both estimate lines when
collapsed and expanded; its menus and dragging account for the added row.
The bars retain their height. Long names shorten with an ellipsis, with
the full name in the tooltip. The duration suffix must remain inside the
visible row bounds; checking only its text content or tooltip is not
evidence that the time is visible. Check both ordinary and narrow widths.
Switching the setting off during reading hides the estimates without stopping or
changing reading. Switching it back on restores them. Verify the English
and Chinese setting and messages without changing Zotero's locale live.

### 2. Scope and boundaries

`diagnostics.engine()` exposes each session's `remainingTime` snapshot.
Ordinary reading has `scope: document`; the EPUB's `sectionTitle` is
`Part 1` until the first segment of Part 2, then `Part 2`. Crossing a
nested chapter does not change that title. Section time is no greater than
document time. Test segment boundaries on both sides, not just page turns.
An absent, unresolved or unordered outline yields document time without
section fields. Selecting text and pressing Shift+Space starts there and
continues to document end; expect document scope for that actual UI path.
Zotero currently provides no selection-only UI action. Separately supply
a bounded run through the manager's `setSegments` contract: expect
`scope: selection`, no section fields, and completion at its forward stop.
After its completion, Play continues with document scope. Report this as a
controlled contract check, not a user-facing selection-only feature.

### 3. Clocks, pace and no extra synthesis

At an early held audio response, text already gives a finite estimate.
Waiting without new audio measurements does not consume it. With all audio
needed for the check ready, pause and sample the numeric estimate twice:
it stays still. At 2×, speech and future configured gaps take half as long
as at 1× for the same position. A known gap counts only its unconsumed part;
a manual pause drops that gap, matching existing reading behavior.

Change voice: the new voice's measured pace replaces the old voice's.
Skipping recomputes from the new position. Verify through finite numeric
snapshots and deterministic audio where timing needs exact comparison;
play ordinary configured audio separately to prove the production path.
Comparing the same controlled run with the setting on and off must not
increase audio requests. Repeated snapshots do not request audio.

### 4. Completion and unavailable states

Before text arrives, the line reads “Estimating…”. A run with no usable
segments shows “Estimate unavailable”. A positive estimate under 60 seconds
shows “less than 1 min”, without seconds digits. At completion, the line
reads “Finished” and the diagnostic is `status: finished, seconds: 0`, even
though the Engine has reset the position. Play starts a fresh estimate.
Provider errors keep the existing error and Retry controls usable.

### 5. Performance and restoration

On a long document, repeated snapshots reuse the text and outline
aggregates; check that opening the display does not leave scrolling or
controls stalled. Restore all user preferences, voices, speed, volume,
layout and paused state as the workflow requires. Remove fixture items and
positions before restoring ordinary WebDAV destinations, finish playback
item 3.26's teardown, and run [cleanup](../cleanup.md). Human judgment of
estimate accuracy across voices is separate from these mechanism checks.
