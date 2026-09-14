[Checklist index](../README.md) · [Scripts](../scripts/manual-follow/README.md)

## 3i. Manual navigation while the sentence remains visible (issue #100)

Run baseline section 0 and cleanup section 7. Use disposable PDF and EPUB
fixtures, both auto-scroll modes and both EPUB flows. Save original
preferences (including user-value flags), transport/bookmark/view state
before changing them. No WebDAV upload or full-checklist pass is required.

Historical evidence: beta2 report (2026-09-13, 1.12.6-beta2 manual-follow)
and [reusable scripts](../scripts/manual-follow/README.md). The beta2
teardown failure is retained; earlier PASS rows are not a fresh pass.

The beta3 combined-build pass (2026-09-13, 1.12.6-beta3 manual-follow)
rechecked the core behavior and closed the fixture readers without new
dead-object errors. Natural input/animation and the explicitly listed
bridge/fixture gaps remain distinct from that mechanism verification.
The later owner follow-up adds automatic resumption on reentry. Beta2/3
record the earlier persistent disengagement behavior and do not verify
this follow-up.

The beta4 reentry pass (2026-09-13, 1.12.6-beta4 manual-follow)
verified automatic viewport reentry and controlled sentence-state reentry;
natural audio progression was unavailable and is not a live PASS.

The historical merged 1.12.7-beta check (2026-09-13, 1.12.7-beta manual-follow)
establishes final installation identity, both settings features, one PDF
and one scrolled EPUB reentry cycle, and clean restoration. The broader
beta4 mode matrix applies to its unchanged follow code.

The following expectations supersede same-sentence reentry and paused
centering from #100. Issue #107 protects manual sentence placement.

### 3i.1. Default and help

The existing keep-following switch remains default on. Help explains manual
sentence placement, later-visible-sentence recovery, paused stillness and
unconditional return on playback resume. Setting changes alone never move a
paused/protected sentence.

### 3i.2. Partial disappearance and reentry

PDF and scrolled/paginated EPUB, both modes: manually clip the current sentence
with trusted input and measured viewport movement. After 180 ms and repeated
same-sentence/word pushes, no automatic target is issued. `sentenceProtected:
true` persists; `interacting: false` marks gesture completion. Fully move it
out, then partly back: still no centering for this sentence. Advance to a
later offscreen sentence: no scroll. A later sentence with a visible fragment
resumes after the gesture ends; protection and `visibilityPaused` clear.

### 3i.3. Whole sentence

Use actual PDF cross-page/column and multiline EPUB fragments, not their union's
whitespace. Sentence geometry governs even with word highlighting. Oversized
sentences and unknown next-page geometry retain the same visibility rules.
Unit geometry coverage is distinct from live fixture coverage.

### 3i.4. Gesture priority

Held keys, pointer/touch, scrollbar/selection-edge/hand dragging and asynchronous
navigation keep priority across sentence changes. Further manual input protects
the sentence current at that input. Releasing a gesture does not recenter that
same sentence. Record trusted input and movement separately; smoothness and
comfort are human-only. Long tasks/Promise identity have unit coverage.

### 3i.5. Navigation and pagination

Preserve native navigation return values and EPUB page layout. A later sentence
outside the view waits after manual navigation; speech reaching visible text
resumes following after the gesture. State-controlled transitions and actual
audio progression are reported separately. Without manual intervention, normal
playback still follows offscreen next sentences and brings clipped text/real
words into view (#83). Explicit return and sentence/paragraph skips locate
while paused or playing; paginated EPUBs locate the sentence's page.

### 3i.6. Off and persistent disengagement

With keep-following off, manual input disengages until explicit return/skip or
playback resume. Later sentences, scrolling back and mode changes alone never
restore following. Resume from pause restores following even with this switch
off; the earlier #100 expectation that it stayed disengaged is superseded.

### 3i.7. Automatic movement and lifecycle

Automatic notifications alone never disengage. Unknown/hidden geometry waits.
Focus/resize never overrides paused/protected placement. Check independent
views and dispose with pending gesture work. Fixture closure must introduce no
dead-object errors. Restore prefs/user flags, volume, sync/backup and user tabs.

### 3i.8. Paused stillness and playback resume

Pause stops pending/in-flight automatic movement. Edge clipping, complete
exit/reentry, state pushes, focus/resize and setting changes while paused issue
no new automatic target (`paused: true`). Resume at fully visible, partially
visible and fully offscreen positions, both modes and keep-switch values:
`following: true`, `reason: resume`, protection cleared, immediate forced
centering (paginated EPUB locates the page; boundaries/oversized sentences may
limit centering). Verify actual player/native toggle and direct playback paths,
not just synthetic state. The pause half of the toggle never forces return.

Keep the scripts that worked in `scripts/manual-follow/` and list the run
in the kit's README; its table is on the issue. Do not label synthetic events as trusted input or target
calculations as visible animation. File backup/restore and sync schema
round-trips are automated.
