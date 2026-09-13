# Issue #100 beta3 live verification artifacts

Staging directory: C:\Users\xujia\AppData\Local\Temp\ztts100-beta3-20260913

## Build identity

- XPI: C:\Users\xujia\orca\workspaces\zotero_plugin_tts\scroll\build\zotero-tts.xpi
- XPI SHA-256: 9d77e0d0b0b344f340bffbff5b75ed67778befe6993dec99f5cca4652eeb7d87
- Bundle SHA-256: 4555be8b670c264d2d6b7635ee417c75123d1276c4d5a167b4ecade05ebe5b40
- Zotero: 10.0.2-beta.9+c77df79af
- Platform: Windows / Firefox 140

## Executed scripts

Copied beta2 scripts under `scripts/` were reused verbatim. Executed bridge scripts: 01-baseline-snapshot.js; direct startup call matching 02-startup.js; 03-prepare-transport-mute.js; 04-import-fixtures.js; 05-open-pdf.js; 06-open-pdf-player-pause.js; 07-audio-clock-probe-pdf.js; 08-open-epub-player-pause.js; 09-close-epub-reader.js; 10-reopen-epub-foreground.js; 11-ui-default-binding.js; 12-close-preferences.js; 13-reader-state-probe.js; 16-pdf-visibility-sentence-controlled-movement.js; 18-pdf-direct-skip-lock.js; 19-pdf-visibility-outside-controlled.js; 21-epub-scrolled-setup-rev2.js; 22-epub-scrolled-visibility-sentence.js (first setup attempt and successful rerun); 23-epub-paginated-setup.js; 24-epub-paginated-navigation-sentence.js; 26-epub-paginated-pagedown-rev3-outer-constructor.js; 27-epub-paginated-navigation-outside.js; 28-restore-auto-mode-user-flag.js; 35-off-pdf-wheel-only-oneline.js; 37-off-pdf-setup-oneline.js; 38-off-pdf-setup-lock-oneline.js; 39-off-pdf-wheel-min.js; 41-off-pdf-resume-min.js; 42-off-pdf-persistence-min.js; 43-off-pdf-explicit-restore.js; 44-restore-off-preferences.js; 51-pdf-playback-advancement-min.js; 57-cleanup-close-fixtures-min2.js; 60-restore-prefs-min.js; 63-final-state-concise.js; 64-position-final-stats.js; 65-console-dead-object-inspection.js.

Custom scripts actually executed and retained in this directory: 10b-import-fresh-epub.js; 12b-open-epub-scrolled-before-popup.js; 13b-open-pause-scrolled.js; 14b-epub-scrolled-outside.js; 20b-close-previous-epub.js; 21b-erase-all-fixtures.js. Direct one-line marker, temporary logError hook, hook removal, and transient-global cleanup scripts were also executed; their sanitized outputs are in the numbered output files.

## Notes on bounded setup paths

The first EPUB reader was opened before its flow was ready and later reopened with `segments:0`; that route was abandoned after bounded checks. A fresh disposable EPUB was imported, flow set to `scrolled` before popup open, and the player then produced 241 segments with `diagnostic.kind=epub, patched=true`; the old and fresh fixtures were both closed and erased.

## Cleanup

The temporary plugin volume was 0 during playback-capable checks and restored to value 100 with user flag false. WebDAV switches, keep-following, auto-scroll mode, memory and native voice map matched the fresh baseline. Settings window was closed; selected user tab, active/paused state and position 6 were preserved. Fixtures 25480, 25481 and 25482 were erased. Final position store was rows=66, loaded=66, queued=0, lastError=null. No dead-object console messages occurred. Final error console contained two native `InvalidStateError: Navigated away from page` entries without plugin stacks; see 26-final-error-console.txt. Beta3 remains installed for the user's trial.

## Raw outputs added from the executed transcript

- `30-pdf-sentence-partial-automatic-raw.txt`: verbatim returned JSON fields for PDF automatic-only and partial checks.
- `31-ui-click-help-raw.txt`: verbatim returned UI click/help result.
- `32-epub-scrolled-outside-raw.txt`: verbatim returned outside-mode scrolled EPUB fields.
- `33-epub-paginated-outside-raw.txt`: verbatim returned outside-mode paginated EPUB fields.
- `34-logerror-hook-scripts.txt`: exact one-line temporary hook, record check, and removal code plus their returned outputs.
- `observed-report.md`: includes the explicit Shift+Enter routing NOT TESTABLE row. The native `this.flow is undefined` setup error remains a separate retained setup-noise row and is not counted as the fixture-close/dead-object result.

The bridge payloads for these checks were not written to disk at execution time. The new raw files preserve the requested fields copied verbatim from this session's transcript and are labeled as excerpts; no fields or values unavailable in the transcript were reconstructed. The complete executed script files remain under `scripts/` where they were available.
