# Scripts: independent document voices (issue #146)

[Case](../../cases/document-voices.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-fixtures.js` | Private baseline, muted run, settings UI picks A, disposable PDF/EPUB imports | Test WebDAV already isolated; A selected by the settings voice browser; two fresh attachments | `fixturesDir`; `state.baseline`, `state.voices`, `state.fixtures` |
| `01-initial-copy.js` | Opens both attachments without opening a player | Distinct document keys; both saved A with `manual:false`; no active sessions | `state.fixtures/voices` |
| `02-default-independence.js` | Settings UI picks B, then opens a new attachment | Existing records remain A; new record B; pane highlight B; retired shared voice switch absent | `state.fixtures/voices`; adds `state.fixtureC` |
| `03-document-pick.js` | Real player dropdown and voice shortcut on fixture A | B becomes manual for A, other document/default unchanged; same-value pick remains manual; preview-only pick leaves record unchanged until commit | `state.fixtures.A/B`, `state.voices`; `state.documentPick` |
| `04-close-reopen.js` | Close and reopen fixture A before the reinstall | `user/<key>` and manual B survive with a new tab | `state.fixtures.A`, `state.documentPick`; `state.persistence` |
| `04b-reinstall-and-reader-window.js` | Post-install reader recovery and separate reader window | Beta2 startup passes; same key/manual B in both readers | `state.persistence`, `state.fixtures.A`; updates `state.persistence.postInstall` |
| `05-unavailable-voice.js` | Missing saved voice through player Play and controller path | No synthesis/substitute, prompt shown, saved record retained; available manual choice works | `state.fixtures.A`, `state.voices`; `state.unavailable` |
| `06-no-default.js` | Clears default and opens a recordless fixture | No fallback activation/controller; settings default restores Play and initializes record | `state.fixtures`; writes `state.noDefault` |
| `07-sync-deferral.js` | Isolated settings sync while fixture session plays and pauses | Newer remote voice updates saved record only; active/paused session stays unchanged until deactivate/activate | `state.fixtures.A`, `state.voices`; `state.sync` |
| `08-merge.js` | Remote inherited/manual records and uploaded shared file | Local manual wins inherited; independent newer manual adopted for other fixture; both keys uploaded | `state.fixtures`, `state.voices`; `state.merge` |
| `09-backup-pane-ready.js`, `09-backup-verify-export.js` | Real settings Backup button export and exported file contents | UI exposes Backup/Restore; exported JSON carries default and all fixture records | `params.backupPath`, `state.fixtures`; `state.backup` |
| `09-backup-mutate-before-restore.js`, `09-backup-isolated-prepare.js`, `09-backup-verify-restored.js` | Real settings Restore with WebDAV switches isolated | Isolated export restores exact docs/default | `params.backupPath`, `state.backup`; `state.backup.restored` |
| `09-old-backup-prepare.js`, `09-old-backup-verify.js` | Real settings Restore of a backup without dynamic records | Existing records/default remain unchanged | `params.backupPath`, `state.backup`; `state.backup.oldRestore` |
| `10-regressions-and-cleanup.js` | Global speed, handoffs, errors, fixture erase and complete restore | Speed switch remains on; fixture sessions hand off; no new plugin errors; all private snapshots restored | session snapshot; final cleanup |

Before you start:

- Run `zotero_ping`, list the installed add-ons, hash the exact XPI/bundle, and run startup before opening a reader.
- The caller must snapshot named settings and all `documentVoices.*`, suspend backup/sync, set the dedicated test WebDAV destination from `~/.secrets/Zotero-TTS/test_webdav.txt`, and verify it without printing credentials.
- Use only `fixture-a.pdf` and `return-key/return-key.epub`; scripts import timestamped copies and erase them in `10`.
- Supply `params.backupPath` as the writable `.tmp` path for `document-voices-export.json`; the old and isolated backup scripts derive sibling filenames from it, and cleanup removes those paths. The live baseline uses standalone PDF/EPUB attachments; it does not claim same-parent coverage.
- Keep the host minimized for bridge-only work and restore it only for settings/player/reader UI; close any owner player only through its reader popup toggle and record it.
- Volume is forced to zero for the run and restored before backup/sync are restored. Private preference snapshots remain in Zotero; exported test backups are removed during cleanup.

Limits:

- The profile has no OpenReader Position add-on; the shared WebDAV destination can be verified only for Zotero-TTS, with the absence recorded.
- Remote merge rows use the isolated shared settings file and are never sent to the owner's folder. Subjective voice quality is human-only; silent mechanism checks are reported as such.
- A failed script stops the group. Its line and result are retained here only as a failure note; only successful scripts are kept in the kit.
- First player attempt was backgrounded and hit the documented autoplay/audio-output block; the focused rerun passed. A paused shortcut left a pending handoff until the revised playing check; the final trusted shortcut passed.
- The unavailable voice path first tried a stale active session; the fresh-session rerun passed with the available Aarav choice. Backup restore was rerun with sync switches isolated so remote records could not overwrite the restored snapshot.
- If remote cleanup or fixture/artifact cleanup fails, `10` leaves all three automatic WebDAV switches off and reports `ownerTogglesRestored:false`; it restores those switches only after cleanup succeeds.

The final portability and cleanup-failure guards were reviewed and syntax-checked after the live run; they have not received another live pass.

Runs:

| Run | Build | Result |
| --- | --- | --- |
| 2026-09-26 | 1.15.2-beta2 (`30d5770`), XPI `065f7cd8…`, bundle `2c7d6758…` | PASS. Baseline + items 1–10 completed; real WebDAV isolated and restored (HTTP 204), 3 fixture items erased, startup failed `[]`, final host minimized. [Field-by-field verification table](https://github.com/xujialiu/Zotero-TTS/issues/146#issuecomment-5843709158). |
