# Issue #97 regional voice switching

These bridge scripts verify the 1.12.6-beta fix for previous/next voice
shortcuts when the native language pool contains regional voices together with
generic and wildcard fallbacks. They were run against Zotero 10.0.2-beta.9 on
Windows with the installed XPI recorded in
`runs/2026-09-13-1.12.6-beta/report.md`.

The scripts use a fresh imported `test/fixtures/fixture-a.pdf` attachment and
a controlled native Read Aloud transport. The transport returns deterministic
silent WAV data and never contacts a provider. Its catalog contains two
`en-US` voices (`regional97-a`, `regional97-c`), one generic `en` voice
(`regional97-b`), one wildcard voice (`regional97-wild`) and one `en-GB`
voice. The PDF reader is opened, the player is paused, and trusted
`Shift+,` / `Shift+.` events are sent to the fixture only.

Run order:

1. `00-baseline-snapshot.js` — stores exact preference values and user-value
   flags, the selected tab, debug-store state, open readers and position-store
   status in `Zotero.__ztts97Baseline`. Secret-bearing preferences are only
   summarized in the returned value.
2. `01-disable-sync-and-mute.js` — sets volume to zero and disables temporary
   WebDAV/automatic-upload switches. Cleanup restores the previous values and
   user-value flags.
3. `02-fixture-import.js` — imports the owned PDF and stores its identity in
   `Zotero.__ztts97Fixture`.
4. `03-open-and-readiness.js` — opens the fixture reader and waits for its
   native manager.
5. `04-native-transport-regional.js` — installs the controlled native
   transport, loads the five-voice catalog and stores patch state in
   `Zotero.__ztts97NativeState`.
6. `05-seed-and-pause.js` — selects the regional A voice through temporary
   read-aloud memory, opens the player, waits for the native segments, pauses
   the fixture, and records setup requests.
7. `06-regional-keys-paused.js` — checks regional next/previous wrapping,
   singleton behavior, generic selection with a stale requested region,
   paused state, speed preservation and request counts.
8. `07-diagnostic.js` — records the production mechanism and shortcut
   bindings from `diagnostics.voiceSwitch()`.
9. `99-cleanup-and-restore.js` — closes and erases only the owned fixture,
   restores the native interface patch, every snapshotted preference and
   debug-store state, returns to the original tab, and reports remaining rows
   and queue state.

The setup scripts may issue four silent segment requests while opening and
prefetching the fixture. The regional shortcut check starts its request count
after setup; it must add zero sample and zero segment requests. Do not run the
scripts concurrently with another Zotero bridge session. If a run stops,
finish cleanup or restart Zotero before starting another run.
