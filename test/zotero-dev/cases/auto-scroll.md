[Checklist index](../README.md)

## 3f. Auto-scroll modes (issue #93)

Run baseline section 0 and cleanup section 7. Use one PDF with a real
cross-page or cross-column sentence and one EPUB; record title, viewport,
flow, scale, chosen voice, real word timing, build hash and Zotero version.
Use `diagnostics.autoScroll()` for both formats and
`diagnostics.sentenceInView()` for PDF geometry. This is a focused pass,
not permission to run the entire checklist.

Recorded runs: [beta2 failure and routing correction](../runs/2026-09-12-1.12.3-beta2/report.md),
[beta3 verification](../runs/2026-09-12-1.12.3-beta3/issue-93.md),
[per-option help verification](../runs/2026-09-12-1.12.3-beta4/help.md).
Reusable scripts: [beta2 probes](../scripts/auto-scroll/README.md),
[beta3 probes](../scripts/auto-scroll-beta3/README.md),
[help probes](../scripts/auto-scroll-help/README.md).
These records distinguish observed behavior from untested cases; their
historical values are not fresh PASS results on another build.

1. **Setting and persistence.** Highlight offers two radio options,
   Center each sentence and Scroll when outside the view. The former is
   the default. Each option has its own adjacent help icon; hovering
   them displays different explanations for that option. Changing the
   choice updates the preference
   `readAloud.autoScrollMode` to `sentence` or `outside`, is reflected in
   open readers, and does not change the audio controller or playback
   clock. File backup includes it; restore and sync use the existing
   settings path. Do not upload to the user's WebDAV during this pass;
   backup and sync schema coverage is automated.
2. **Outside mode, PDF and scrolled EPUB.** Place a fitting active
   sentence fully inside each viewport edge, including inside the old
   quarter-screen trigger. State/word updates cause no automatic motion.
   Clip its top or bottom, or a continuation on another PDF page/column:
   the whole extent is centered, clamped to document limits. Record the
   expected target from the whole range and the actual final position.
3. **Sentence mode, PDF and scrolled EPUB.** Natural audio advances to
   at least three distinct fitting sentences: each new sentence produces
   its centered target, including a sentence already visible near an
   edge. Repeated word updates within the same sentence do not produce
   new centering requests. Prove audio advancement, not only word timers.
4. **Manual intent and explicit return.** Trusted wheel or PageDown
   suspends following in both formats. Later real sentences and mode
   changes do not reactivate it. Neither direct playback resume nor the
   native play/pause toggle reactivates it. Test PageDown independently
   from wheel input and record its exact target/event path.
   Go to reading position returns to the
   current sentence even while paused, and resumes the selected mode.
   Explicit previous/next sentence behaves the same. Delayed automatic
   scroll events alone do not disengage. Ordinary clicks and zoom retain
   following; observe animation interruption separately when possible.
5. **Oversized sentences.** On entry, locate the first reading-order
   rect, including a column-crossing sentence whose whole box begins
   above its first line. Thereafter follow a real word only when clipped.
   A wordless voice locates the beginning once and does not repeatedly
   drag the view back. Never infer word progress from a whole-segment
   timestamp. Deterministic oversized geometry has unit coverage if a
   suitable real sentence is unavailable; label that live case untested.
6. **Paginated EPUB.** Retain pagination. A wholly visible sentence in
   outside mode does not turn a page; a new sentence outside the spread
   brings in its starting page. A spread-crossing sentence begins at its
   head and follows a real word onto the next page when available, without
   alternating between its head and tail. Section changes mount the next
   section before highlighting. Check both modes and return while paused.
7. **Visibility and lifecycle.** Hidden playback defers movement. On
   return, following views locate the latest sentence; manually disengaged
   views remain disengaged. Secondary views keep independent intent.
   Dispose/reload restores native methods and helper properties without
   errors. Preserve current PDF section 3d ownership/input regressions.
8. **Toggle shortcut.** Trusted Shift+A in PDF and EPUB switches
   `outside` to `sentence` and back, with a localized toast naming the
   new mode and the settings radio group following the change. Works
   while playing, paused and before playback; does not alter audio,
   position lock or manual disengagement. Holding the key produces one
   switch. Typing in editable controls is unaffected. The shortcut row
   defaults to Shift+A, accepts a custom chord and supports clearing;
   restore its original binding after checking.

Retain scripts that actually ran in `test/zotero-dev/scripts/` with
prerequisites, expected results and restoration. Save sanitized evidence
under `runs/<date>-<build>/`. Restore only state touched by the pass:
preferences, voice/speed, flow, zoom, player, position and temporary items.
Preserve the original transport/bookmark snapshot throughout retries.

Human judgment: comfort of per-sentence movement, smoothness, interruption
while an animation is visibly moving, and whether highlights feel stable.
Synthetic errors, invalid preference values and exact boundary arithmetic
are unit checks; do not relabel them as live results.
