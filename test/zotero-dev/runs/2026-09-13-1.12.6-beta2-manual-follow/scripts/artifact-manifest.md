# Issue #100 beta2 live-test artifacts

Staging directory: C:\Users\xujia\AppData\Local\Temp\ztts-issue100-2026-09-13-1.12.6-beta2-304905417f2b403d962dd659683f65fe

## Build identity

- XPI: C:\Users\xujia\orca\workspaces\zotero_plugin_tts\scroll\build\zotero-tts.xpi
- XPI SHA-256: 7712ceeec81144f5f5ae220edde61190f02a6e868ff1e83037265a6b71a36051
- Bundle SHA-256: 139ad6d6799228faf268bfb3ed89fdc73d84d1eda949090810822bfce040f58b
- Zotero: 10.0.2-beta.9+c77df79af
- Platform: Windows / Firefox 140

## Executed scripts

These files contain the scripts that were executed through zotero_execute_js; some were retried after a bridge parser timeout or line-ending quirk, and the final returned result is the recorded one.

- 01-baseline-snapshot.js
- 02-startup.js
- 03-prepare-transport-mute.js
- 04-import-fixtures.js
- 05-open-pdf.js
- 06-open-pdf-player-pause.js
- 07-audio-clock-probe-pdf.js
- 08-open-epub-player-pause.js
- 09-close-epub-reader.js
- 10-reopen-epub-foreground.js
- 11-ui-default-binding.js
- 12-close-preferences.js
- 13-reader-state-probe.js
- 14-pdf-visibility-sentence.js
- 15-pdf-visibility-sentence-rev2.js
- 16-pdf-visibility-sentence-controlled-movement.js
- 17-pdf-explicit-skip-recovery.js
- 18-pdf-direct-skip-lock.js
- 19-pdf-visibility-outside-controlled.js
- 21-epub-scrolled-setup-rev2.js
- 22-epub-scrolled-visibility-sentence.js
- 23-epub-paginated-setup.js
- 24-epub-paginated-navigation-sentence.js
- 25-epub-paginated-pagedown-rev2.js
- 26-epub-paginated-pagedown-rev3-outer-constructor.js
- 27-epub-paginated-navigation-outside.js
- 28-restore-auto-mode-user-flag.js
- 29-off-pdf-persistence.js (timed out; finally cleanup ran, no result)
- 34-parser-probe.js
- 35-off-pdf-wheel-only-oneline.js
- 37-off-pdf-setup-oneline.js
- 38-off-pdf-setup-lock-oneline.js
- 39-off-pdf-wheel-min.js
- 41-off-pdf-resume-min.js
- 42-off-pdf-persistence-min.js
- 43-off-pdf-explicit-restore.js
- 44-restore-off-preferences.js
- 48-pdf-held-keyboard-rev2-outer-constructor.js
- 49-pdf-held-pagedown.js
- 51-pdf-playback-advancement-min.js
- 57-cleanup-close-fixtures-min2.js
- 58-erase-fixture-items.js
- 60-restore-prefs-min.js
- 63-final-state-concise.js
- 64-position-final-stats.js
- 65-console-dead-object-inspection.js

## Prepared or superseded scripts

These remain for reproducibility but were not counted as successful checks: 20-epub-scrolled-setup.js, 30-off-pdf-setup.js, 30-off-pdf-setup-rev2.js, 31-off-pdf-wheel-resume.js, 32-off-pdf-wheel-resume-rev2.js, 33-off-pdf-wheel-only.js, 40-off-pdf-resume-persistence-min.js, 45-pdf-held-keyboard.js, 46-pdf-held-keyboard-min.js, 47-pdf-held-keyboard-min2.js, 50-pdf-playback-advancement.js, 52-pdf-multiline-fragment-probe.js, 53-pdf-multiline-source-probe-min.js, 54-pdf-multiline-source-probe-min2.js, 55-cleanup-close-fixtures.js, 56-cleanup-close-fixtures-min.js, 59-restore-prefs-after-fixtures.js, 61-final-state-check.js, and 62-final-state-min.js. Their bridge SyntaxError/timeout attempts are excluded from PASS rows.

## Reports

- observed-report.md: sanitized table-first report and first product failure
- evidence.json: sanitized successful outputs, geometry/provenance, restoration and exact dead-object stacks
- evidence.txt: readable sanitized excerpts and exact two error-console stacks
- 65-console-dead-object-inspection-output.json: exact filtered nsIConsoleService result from the single bounded read-only call
- STAGE_PATH.txt: staging path marker
- README.txt: staging purpose marker
