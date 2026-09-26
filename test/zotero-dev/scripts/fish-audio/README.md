# Scripts: Fish Audio cloud voices (issue #147)

[Case](../../cases/fish-audio.md) · [Checklist](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params/state |
| --- | --- | --- | --- |
| `00-baseline-and-isolate.js` | Preinstall-safe private baseline, dedicated WebDAV switch, OpenReader Position presence check and host minimization | Test destination matches; sync/backup switches are suspended; add-on presence and named prefs/document records, including actual `extensions.zotero.reader.readAloudVoices`, are retained privately without plugin diagnostics or secrets; fails closed if OpenReader Position is present or loaded transports are pending | none; writes private `Zotero.__fishVerify` |
| `00b-baseline-diagnostics.js` | Post-install position/bookmark diagnostics and pending-transport audit | Position store and both WebDAV transports are idle with no errors; baseline database/shared counts are retained; destination remains isolated; OpenReader Position is absent | private `Zotero.__fishVerify` |
| `01-source-combinations.js` | `diagnostics.fishVoices(true)` for all eight Official/Your/Manual source combinations and the cached own-off/own-on sequence | `sources` mirrors the switches; `mul/default` appears exactly when `own` is true; all-off is `count: 0`, `ids: []`; own-only retains Default | none |
| `02-empty-sources-ui.js` | Fish settings with all sources off: Test connection, real Enable→Disable probe, voice browser and source locks | `Testing…` is observed; Test and Enable both return `Connected. 0 voices available. Synthesis works.`; Enable is available; enabling locks all source boxes but keeps 0 voices/no Default; Disable restores the off state | none |
| `03-document-default.js` | Saves `fish::mul/default` on a disposable PDF, then reopens with Own off and on | Official-only has no Default; saved record stays `manual:true`; unavailable prompt appears with no controller or new Fish synthesis; cached Own re-enables Default and selects it on reopen | `fixturesDir`; `state.fixture` |
| `99-cleanup.js` | Closes/erases the disposable fixture, drains bookmark/position and settings queues, then restores settings, document records, WebDAV and window state | Fixture/readers gone; position DB/store/shared counts match the `00` baseline; all pending transports idle without errors; named prefs and WebDAV switches match; settings closed; host minimized; no secrets in output | private `Zotero.__fishVerify`, `state.fixture` |

Before you start:

- Build and install the exact XPI under test, list the installed add-on, and run `diagnostics.startup()` before opening a reader.
- Before installing the XPI, run `00-baseline-and-isolate.js` through the bridge. It reads `~/.secrets/Zotero-TTS/test_webdav.txt`, confirms the effective destination matches without printing it, snapshots named prefs/document records and suspends `webdav.syncPositions`, `webdav.autoUploadSettings`, and `webdav.syncSettings`. Install/list the build, run startup, then run `00b-baseline-diagnostics.js` before any other kit check; it records bookmark/position diagnostics and waits for all transports to settle. Do not substitute the owner's normal WebDAV.
- Use a configured Fish key and free model. The scripts report key/password fields only as lengths and perform no other provider network calls.
- `00` snapshots Fish switches/IDs, volume, memory, the actual native voice pref (`extensions.zotero.reader.readAloudVoices`), dynamic document records, debug-store state, WebDAV connection fields and the selected tab. It fails closed when OpenReader Position is present or pre-isolation transports are pending. `00b` then records position/bookmark diagnostics. The fixture is `test/fixtures/fixture-a.pdf`; leave the owner's pre-existing `Ebook` reader untouched.
- Keep the host minimized for diagnostics and settings checks; restore/focus it only for reader/player checks, then minimize it during cleanup. Test volume is zero.

Limits:

- The first UI attempt stopped before the test because settings navigation was not initialized; the script was revised to poll navigation and the rerun passed.
- The first document attempt stopped while the reader manager was still initializing; `03` now waits for `_readAloudManager` and the rerun passed.
- `99` was audited again after switching host cleanup to the window's `minimize()` method; the final audit passed with `hostMinimized:true`. Position DB rows, store entries/deletions and shared document/item counts matched the baseline; local store writing/queue, both position transports, settings sync and settings upload were all idle with no errors before switches were restored. OpenReader Position was absent.
- The first manual verification pass read the native voice pref under the plugin namespace, so it cannot prove that pass restored the owner's native value. The retained kit now snapshots the actual `extensions.zotero.reader.readAloudVoices`; the isolated roundtrip audit matched its type, user-value flag and 1,257-byte value exactly.
- Subjective voice quality and audible playback are outside this case. Fish synthesis is exercised only by the settings probe and the no-reference Default path; the configured free model is used.

Runs:

| Run | Build and artifact | Result |
| --- | --- | --- |
| 2026-09-26 | `1.15.2-beta3`, commit `73617b6`; XPI `b950a9348276…`; bundle `4facde74bc13…`; `includeOwn` bundle gate count `1` | PASS. `00` isolation, startup `failed: []`, `00b` transport audit, 8 source combinations, empty-source Test/Enable/Disable, fixture unavailable/restore flow and `99` cleanup all passed; WebDAV destination matched and restored; position/bookmark counts and pending-write guards passed; OpenReader Position absent; final host minimized. See the [verification report](https://github.com/xujialiu/Zotero-TTS/issues/147#issuecomment-5844088104), including the initial native-preference snapshot limitation. |
