[Checklist index](../README.md)

## 3i. Manual navigation while the sentence remains visible (issue #100)

Run baseline section 0 and cleanup section 7. Use disposable PDF and EPUB
fixtures, both auto-scroll modes and both EPUB flows. Save original
preferences (including user-value flags), transport/bookmark/view state
before changing them. No WebDAV upload or full-checklist pass is required.

Historical evidence: [beta2 report](../runs/2026-09-13-1.12.6-beta2-manual-follow/observed-report.md)
and [reusable scripts](../scripts/manual-follow/README.md). The beta2
teardown failure is retained; earlier PASS rows are not a fresh pass.

The [beta3 combined-build pass](../runs/2026-09-13-1.12.6-beta3-manual-follow/observed-report.md)
rechecked the core behavior and closed the fixture readers without new
dead-object errors. Natural input/animation and the explicitly listed
bridge/fixture gaps remain distinct from that mechanism verification.
The later owner follow-up adds automatic resumption on reentry. Beta2/3
record the earlier persistent disengagement behavior and do not verify
this follow-up.

The [beta4 reentry pass](../runs/2026-09-13-1.12.6-beta4-manual-follow/report.md)
verified automatic viewport reentry and controlled sentence-state reentry;
natural audio progression was unavailable and is not a live PASS.

The [merged 1.12.7-beta check](../runs/2026-09-13-1.12.7-beta-manual-follow/report.md)
establishes final installation identity, both settings features, one PDF
and one scrolled EPUB reentry cycle, and clean restoration. The broader
beta4 mode matrix applies to its unchanged follow code.

1. **Default and UI.** Highlight contains Keep auto-scroll while the
   sentence is visible, bound to `readAloud.keepFollowingWhileVisible`.
   An unset preference is true. The adjacent help describes complete
   disappearance, partial visibility, waiting during input and the off
   behavior. Click both states and restore the original value. Existing
   follow state, voice and playback are unaffected by the setting itself.
2. **Partial and complete disappearance.** For PDF and scrolled EPUB,
   trusted wheel input arms `interacting: true`, with `following: true`.
   Move the actual viewport so a real sentence fragment remains visible:
   following stays true. Move every fragment out: following becomes false.
   Leave it outside across later state updates: no follow target or
   automatic movement. Move any part of the current sentence back in:
   following automatically becomes true after the gesture ends, without
   explicit locking. `visibilityPaused` distinguishes that wait from
   legacy disengagement and clears on resumption. Repeat departure/reentry.
   Record input provenance, exact viewport/fragment coordinates and
   diagnostic state. Repeat in both auto-scroll modes and while paused.
3. **Whole sentence.** Include a PDF next-page or next-column fragment and
   a multiline EPUB sentence. Any visible fragment retains following;
   whitespace between invisible fragments does not. Word highlight mode
   uses the sentence, including when the current word is already off screen.
   A sentence larger than the viewport uses the same fragment rule.
4. **Gesture priority.** During continuous wheel input, scrollbar or
   selection-edge dragging and permitted touch/hand panning, stop the
   previous automatic animation and issue no new follow target. Holding
   the pointer still must not resume following until release. On release,
   a retained follower resumes the selected mode. Record actual movement
   separately from target requests; subjective comfort is human-only.
5. **Navigation and pagination.** PageDown, page/history/find navigation
   is judged after movement, including asynchronous EPUB navigation and
   paginated spreads. Preserve native return values and page layout. A
   sentence transition during the gesture still yields page control;
   visibility checks use the current sentence. While visibility-paused,
   speech reaching a sentence already in view restores following. A new
   sentence outside the viewport in ordinary uninterrupted playback still
   follows normally. Long/failed asynchronous
   navigation and precise Promise identity also have unit coverage.
6. **Off and persistent disengagement.** With the switch off, trusted
   wheel/keyboard input immediately disengages even while the sentence
   remains visible. Later sentences, scrolling back, changing either
   setting and both native/direct playback resume keep it disengaged.
   Explicit Go to reading position/skip restores the selected mode.
7. **Automatic movement and lifecycle.** Automatic scrolling, native
   delayed scroll notifications, zoom, backgrounding and restoration
   without a manual gesture do not disengage. Unknown/hidden geometry
   is not proof of disappearance. Returning after an unfinished gesture
   retries current-sentence visibility before following. With the switch
   on, visible reentry after restoration resumes following; with it off,
   manual disengagement persists. Verify independent split views
   and dispose/reload with pending gesture work: no retained timers,
   listeners or dead-object errors. Unit coverage is recorded separately
   where a deterministic live fixture is unavailable.

Retain scripts actually run and sanitized results under the usual
`scripts/` and `runs/` directories; link them here after the pass. Do not
label synthetic events as trusted input or target calculations as visible
animation. File backup/restore and sync schema round-trips are automated.
