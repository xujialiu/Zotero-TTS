# Angle bracket verification scripts

These scripts were retained from the 2026-09-13 case 3g run, through
`zotero_execute_js`. They are recorded probes, not standalone Node scripts.
See [the run](../../runs/2026-09-13-1.12.4-beta2/report.md) for their
expected and observed values, including failures and verification limits.

## Prerequisites and allowed state

- Read the shared tester workflow and case 3g. Install the specified build,
  capture a fresh baseline, disable automatic sync/backup, and mute plugin volume.
- Import `test/fixtures/angle-brackets/angle-brackets.epub` as a new standalone
  attachment. The historical fixture ID in these scripts is `25431`, erased
  after the run. Replace that literal with the newly imported fixture ID and
  confirm the title before reuse. Never target an unrelated attachment.
- The baseline script's output must remain private; record only equality checks
  in committed evidence. It captures no provider keys. The historical restore
  script is a redacted `.js.txt` transcript, not directly executable. Construct
  restoration from the new run's actual baseline, including all user-value flags;
  never write the redaction marker or blindly reuse historical preference values.
- UI probes require an open preferences window; preserve its original pane.
  Provider capture expects Fish's request shape and the fixture's chosen voice.
- The native stub requires the fixture tab closed and an existing user reader
  to locate the native prototype. Do not create other tabs during the probe.
  It restores the prototype in `finally`; close the fixture again to discard
  its captured stub interface before normal testing resumes.
- Cache/prefetch probes temporarily wrap sandbox fetch and restore it in `finally`.
  The failed settings navigation script is retained as evidence, not as the
  recommended restoration route; the subsequent click restored General.

## Recorded scripts

- [Baseline snapshot](01-baseline-snapshot.js)
- [Disable uploads and mute before playback](02-disable-uploads-and-mute-before-playback.js)
- [Fixture import](03-fixture-import.js)
- [Fixture open and manager readiness](04-fixture-open-and-manager-readiness.js)
- [Fixture open and manager readiness](05-fixture-open-and-manager-readiness.js)
- [Audio motion probe (before playback checks)](06-audio-motion-probe-before-playback-checks.js)
- [English UI probe](07-english-ui-probe.js)
- [Real provider request capture](08-real-provider-request-capture.js)
- [Empty pair and prefetch](09-empty-pair-and-prefetch.js)
- [Session setting and cache probes](10-session-setting-and-cache-probes.js)
- [Session setting and cache probes](11-session-setting-and-cache-probes.js)
- [Session setting and cache probes](12-session-setting-and-cache-probes.js)
- [Exact cache-repeat probe](13-exact-cache-repeat-probe.js)
- [Exact source-position equality probe](14-exact-source-position-equality-probe.js)
- [Native stub](15-native-stub.js)
- [Exact fixture cleanup script](16-exact-fixture-cleanup-script.js)
- [Exact preference restore script (memory literal redacted)](17-exact-preference-restore-script-memory-literal-redacted.redacted.js.txt)
- [Settings pane restoration after timeout](18-settings-pane-restoration-after-timeout.js)
- [Settings pane restoration after timeout](19-settings-pane-restoration-after-timeout.js)
- [Settings pane restoration after timeout](20-settings-pane-restoration-after-timeout.js)

## Cleanup

Restore fetch and native prototypes first. Close and erase only the fixture,
then verify position rows return to baseline. Restore temporary preferences and
original volume/user-value state before automatic sync/backup, with reading
memory last. Restore the settings pane and debug-store state, and compare the
user's tabs with the baseline. Failed runs require the same restoration.
