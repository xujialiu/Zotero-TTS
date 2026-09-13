# Voice-switch live scripts (issue #95)

These scripts were executed through the `zotero-dev` bridge against Zotero
`10.0.2-beta.9+c77df79af` on Windows with plugin `1.12.5-beta3`. They belong
to case [4a](../../cases/voice-switch.md), and must be used with the baseline
and cleanup instructions in [baseline.md](../../baseline.md) and
[cleanup.md](../../cleanup.md).

The run uses fresh standalone `fixture-a.pdf` and `fixture-b.pdf` attachments.
The native `_getReadAloudRemoteInterface` is held only for those fixture
readers, and its transport returns deterministic silent 8 kHz WAV data plus
timestamps derived from the fixture text. No real speech request or paid
provider was used. The timestamps are test data for the controlled transport;
they must not be reused as evidence for a real provider.

Run `00-startup.js` immediately after the exact XPI install and plugin-list
check. It is the synchronous startup diagnostic. Run `01-baseline-snapshot.js`
next; it stores the exact values and user-value
flags of every preference this case may change in the privileged
`Zotero.__ztts95Baseline` object, while the returned summary redacts user
voice state. Run `02-disable-sync-and-mute.js` before importing or playing a
fixture; it sets volume and the three sync/upload switches to zero/off. The
fixture import and reader readiness scripts are `03` and `04`. `05` installs
the controlled native transport and leaves its prototype patch held until
cleanup; `06` loads the fixture's voice list and pauses; `07` starts a fresh
fixture session with a trusted `Shift+Space` and records the audio clock.

The behavior scripts are:

- `08-word-handoff-native.js` — delayed prepared word handoff, native source
  stop, controller adoption and new-voice offset.
- `08b-source-position-probe.js` — the follow-up probe used during the same
  fixture session to confirm the adopted segment retained its source position.
- `09-list-and-trusted-keys.js` — menu order, trusted previous/next keys,
  wrapping, paused silence, repeat suppression, editable-field routing,
  rebinding and clearing.
- `10-sentence-fallback-native.js` — no-word-timing sentence fallback.
- `11-rapid-and-return-cancel.js` — latest pending target and return-to-current
  cancellation.
- `12-pause-and-failure.js` — pause cancellation and rejected preparation.
- `13-armed-stop-cancel.js` — scheduled old-source stop and cancellation after
  the stop was armed.
- `14-regional-menu-probe.js` — controlled regional menu lists; the
  favorites-only branch is explicitly not testable through the native stub.
- `15` and `16` import and open the second fixture.
- `17`, `18` and `19` are exploratory two-reader shared-voice attempts. Their
  setup could not keep both native fixture readers playing concurrently, so
  their shared-voice observations are not accepted as live PASS evidence.
- `22-preparation-overtaken.js` — short old buffers with a voice-specific
  delayed response, proving preparation advances ahead of the reading
  position.

Always run `99-cleanup-and-restore.js` last while the baseline object and
fixture identities still exist. It closes both fixture readers, erases only
the item IDs stored by scripts `03` and `15`, restores the native transport
slots and every snapshotted preference, writes `readAloud.memory` without
printing it, and removes the temporary privileged globals. Its output must
show zero fixture readers/items, the baseline preference values and user-value
flags, the baseline position row count and an empty queue.

All scripts return JSON strings so a bare `undefined` from the bridge still
means the evaluator timed out. The scripts use ≤8-second polling windows in
the bridge-facing calls; if a run is interrupted, do not start a second run
until the original cleanup has completed or the user has restarted Zotero.
