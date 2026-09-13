# Fish cloud language-hint verification scripts

[Case 3h](../../../cases/fish-language-hints.md) ·
[Recorded results](../report.md)

These scripts were run against Zotero 10.0.2-beta.9 on macOS and
Zotero-TTS 1.12.6-beta2. They are retained execution records, not a
one-command test runner. Fixture IDs and file paths are specific to that run.

- **Prerequisites:** read the tester workflow and case 3h. Obtain a fresh
  private baseline, import the disposable angle-brackets fixture, verify
  its reader ID, and supply a valid MP3 for transport stubs. The recorded
  MP3 path points to the owner's earlier local comparison artifact.
- **State:** temporary volume 0, cache/prefetch settings, sync/backup
  switches, fixture sessions and transport hooks. Never drive the user's
  reader. Real requests in script 03 use the configured Fish account;
  other transport checks use stubs.
- **Expected output:** case 3h and the per-script JSON outputs record the
  exact cue bodies, timestamp ranges and cache counts. Scripts 04/05 are
  failed harness evidence, not tests to replay. Their literal backslash-n
  SSE terminators caused no-audio errors; scripts 07/08 use actual LF.
- **Cleanup:** restore hooks in finally; close/erase only fixtures and
  their position records; restore exact original preference values and
  user-value flags, volume before sync/backup, and debug storage. Script
  13 is deliberately archived as `.redacted.js.txt`; its private reading
  memory must come from the original snapshot, never the placeholder.
- **Limits:** Fish Speech Local was not tested (the Local stub is Kokoro).
  Listening, moving highlights, and exact user-popup visibility restoration
  were not established. Native Zotero sync uploaded fixture metadata;
  plugin WebDAV switches do not disable native sync. Fixtures were removed.
