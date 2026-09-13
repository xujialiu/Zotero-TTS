# Issue #96 multiple-angle-bracket probes

These are sanitized `zotero_execute_js` probes retained from the focused live
passes on 2026-09-13. They contain no API keys, headers, raw preference
snapshots, or Read Aloud memory. The scripts under `01`–`05` were executed in
the second pass with fixture item `25445`; `06`–`12` were executed in the first
pass with fixture item `25444`. Fixture ids are historical and must be replaced
when these probes are reused.

Before reuse, snapshot the current named preferences and user-value flags,
reader state, position-store state and debug setting. Keep reading-memory
snapshots private. Replace the fixture ids with a newly imported test item
and adapt the hard-coded restoration values in `05` to that new baseline;
never restore the historical values into a different session. Disable
automatic settings and position uploads before temporary changes, mute only
for the test, restore temporary patches and controller fields, close and
erase only the test fixture, restore preferences with reading memory last,
then compare the complete baseline. Scripts `10` and `12` intentionally
change the session setting and rely on this final cleanup. Do not run these
probes while another agent uses Zotero or while a user reader is playing.

The bridge evaluated the saved source through
`new Function("return " + script)()` because direct evaluation of some saved
multiline files returned a Firefox debugger `SyntaxError: Invalid or unexpected
token`; this wrapper does not change the script body. All temporary fetch
wrappers and native prototype patches restore themselves in `finally`.

| Script | Method | Pass | Scope |
| --- | --- | --- | --- |
| `01-baseline-sanitized.js` | baseline diagnostic | second | named prefs, readers, position rows; no memory value |
| `02-setup-import.js` | fixture import and mute | second | temporary item and sync/volume switches |
| `03-native-multi-group-stub.js` | native transport stub | second | exact six-word source, metadata and original offsets |
| `04-empty-multi-group.js` | plugin direct interface | second | `<> <   >`, silent WAV and no fetch |
| `05-cleanup-restore.js` | fixture/pref restoration | second | erase fixture, restore named prefs and position state |
| `06-provider-multiple-capture.js` | exact provider request | first | six-word source plus nested, punctuation, unmatched and comparison cases |
| `07-cache-repeat.js` | plugin cache | first | repeated exact source and unchanged timestamps |
| `08-prefetch-synthetic.js` | synthetic segment list | first | prepared anchor and prepared next segment; restores controller |
| `09-empty-single.js` | plugin direct interface | first | single empty pair and no fetch |
| `10-opt-out-effective.js` | session setting diagnostic | first | configured/effective while active |
| `11-opt-out-original.js` | direct provider request | first | full original text after reopening with opt-out |
| `12-opt-in-cache.js` | reopened session/cache | first | stripping restored and cached offsets |
| `14-native-stub-stale-attempt.md` | discarded evidence | first | explains the reused-reader failure and corrected order |

The seven-segment source-position probe remains at
`../../2026-09-13-1.12.4-beta2/scripts/14-exact-source-position-equality-probe.js` and was executed
with fixture id `25444`. The original reusable setup and cleanup probes remain
in `../../2026-09-13-1.12.4-beta2/scripts/` as the historical case 3g record.
