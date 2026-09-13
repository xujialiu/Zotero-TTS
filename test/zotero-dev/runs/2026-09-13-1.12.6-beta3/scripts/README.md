# Issue #101 configurable bracket-pair verification scripts

These are the exact `zotero_execute_js` scripts executed during the focused
case 3g run on 2026-09-13 against Zotero-TTS `1.12.6-beta3`. They are bridge
probes, not standalone Node scripts. The matching sanitized outputs are under
`test/zotero-dev/runs/2026-09-13-1.12.6-beta3/outputs/`.

## Prerequisites and allowed state

- Read `MEMORY/MEMORY.md`, `agents/zotero-tester.md`, and case 3g first.
- Verify the XPI version and hashes, run baseline section 0, and confirm the
  bridge is connected before installing.
- Use only `test/fixtures/angle-brackets/angle-brackets.epub`, imported as a
  new standalone attachment. The run used fixture item `24434`, titled
  `Zotero-TTS issue 101 configurable bracket pairs`.
- Snapshot the named preferences, user-value flags, open readers, settings
  window, position store, and debug-store state. Do not print Read Aloud
  memory or any provider secret. Keep the user's readers idle and unchanged.
- Set Read Aloud volume to `0`, disable settings/position uploads, and restore
  every temporary value and user-value flag in the workflow order, with
  `readAloud.memory` last. Restore the native prototype and sandbox fetch
  wrappers in `finally` blocks.
- Do not switch the live Zotero locale. Standard/Premium checks use the
  temporary restored native transport stub and do not call paid synthesis.

These files preserve the actual run. Before reuse, substitute the newly
imported fixture ID for the recorded item ID and take a fresh baseline;
never reuse the old user-state snapshot or execute cleanup against an
unverified item ID.

## Executed scripts

| Script | Purpose | Status |
| --- | --- | --- |
| `00-baseline-sanitized.js` | Baseline and private in-memory restore snapshot | PASS |
| `01-setup-mute-sync-off.js` | Mute, disable uploads, enable default list, debug store | PASS |
| `02-fixture-import.js` | Import the disposable EPUB | PASS |
| `03-fixture-open.js` | Open the fixture reader | PASS |
| `04-fixture-readiness.js` | Poll reader, manager, and remote interface | PASS |
| `05-audio-motion-probe.js` | Initial audio readiness probe | PASS; frozen clock |
| `06-audio-clock-two-samples.js` | Two samples 500 ms apart, then pause | PASS; machine audio NOT TESTABLE |
| `07-ui-initial.js` | Visible row and control state | PASS |
| `08-ui-validation-dialogs.js` | Empty, invalid, duplicate errors; Cancel and Use defaults | PASS |
| `09-ui-entry-errors.js` | One-character and repeated-character errors | PASS |
| `10-external-refresh.js` | External writes refresh both controls | PASS |
| `11-text-settings-session-snapshot.js` | Initial `textSettings()` fields | PASS |
| `12-active-opt-out-request.js` | Active-session configured/effective and request | PASS |
| `13-stop-reopen-effective.js` | Stop/reopen updates effective setting | PASS |
| `14-reactivate-defaults.js` | Reopen default list | PASS |
| `15-default-provider-request.js` | Default list real provider request and ranges | PASS |
| `16-ui-set-custom-active.js` | Configure `【】 ()` while active | PASS |
| `17-reactivate-custom.js` | Stop/reopen updates effective custom list | PASS |
| `18-custom-provider-request.js` | Custom list real provider request and ranges | PASS |
| `19-custom-cache-repeat.js` | Custom list cache repeat | PASS |
| `20-custom-prefetch.js` | Custom list prefetch and reuse | PASS |
| `21-reactivate-default-for-mixed.js` | Restore default list for mixed/empty checks | PASS |
| `22-mixed-malformed-requests.js` | Mixed nesting and malformed source | PASS; one provider omitted a nested word timestamp |
| `23-empty-default.js` | Empty default pairs, no provider request | PASS |
| `24-native-standard-premium-stub.js` | Restored Standard/Premium transport stub | PASS |
| `25-cleanup-restore.js` | Restore preferences, readers, position store, and window | PASS |

The initial invocation of script 08 found that the preferences window had
closed; no state was changed by that invocation. The same saved script ran
successfully after reopening the preferences window. Every listed successful
script's output is retained in the run directory.

## Expected output and cleanup

- The default list is `<> []`; enabled locks the input and disabling unlocks
  it. Valid custom `【】 ()` follows the same rule.
- Invalid empty, one-character, same-character, and duplicate entries show
  the localized three-message set. Cancel leaves the draft and switch off;
  Use defaults writes `<> []`, enables the switch, and locks the input.
- Active sessions report `configured` changes immediately while `effective`
  remains at activation; stop/reopen updates `effective` and the paired list.
- Real provider requests contain prepared text while returned timestamps map
  to the original source. Cache repeats make one request; prefetch warms the
  next prepared text. Empty pairs return the silent WAV without a request.
- The native stub must receive copied prepared segments with metadata and
  mapped ranges; sample, error, and `noStore` behavior must pass through.
- Close and erase only item `24434`, remove its position row, restore fetch and
  native patches, restore preferences and the debug-store flag, close the
  settings window, and compare the final reader/position state with baseline.
