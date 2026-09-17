# Scripts: The reading guard (issues #11, #71, #80, #121)

[Case](../../cases/reading-guard.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params read |
| --- | --- | --- | --- |
| `00-baseline.js` | Candidate identity, startup, owner/player state, named preference baseline, mute/sync preparation | beta6 startup has no failed steps; exact named values are retained; any owner player is closed only when required | none |
| `01-fixtures-kokoro.js` | Configured Kokoro enable through the settings pane; fresh PDF/EPUB fixtures; local voice selection and paused players | Kokoro connection/listing succeeds; two fixture players use listed `local::` voices and are paused; no native prompt | `fixturesDir` |
| `02-impact-and-ui-guards.js` | Unused and used provider UI changes; background/paused impact; favorites-only settings browser and player guard | Unused Fish edit applies with local session intact; local edit and affected favorite edits refuse with OK-only notice; unrelated edit applies | state from prior scripts |
| `03-continuity-handoff-discovery.js` | Live list continuity, prepared handoff, failed discovery with bounded transport stub | Controller/voice/catalog identity and running clock survive allowed refresh; handoff protects both voices; omitted voices are retained without fallback | state from prior scripts |
| `04-sync-restore.js` | Controlled background sync and restore boundary | Unaffected sync fields apply while local is deferred; close applies deferred state; native file restore remains unit-only | state from prior scripts |
| `05-closed-player.js` | Closed-player stale-list invalidation and reopen | Disabling Kokoro clears the closed manager's cached list; re-enable and reopen discover fresh choices and resolve the remembered local voice | state from prior scripts |
| `06-request-counts.js` | Focused Kokoro request-count supplement and pending impact diagnostic | Exact `(voice,text,index)` count does not rise across refresh or omitted discovery; `readingImpact` captures both pending IDs; configured URL stub is restored | state from prior scripts |
| `90-teardown.js` | Fixture/player cleanup, exact pref/user-value restoration, logs and minimized host | No fixture readers/players or new plugin/dead-object errors; original values and user presence restored; host minimized | state from prior scripts |

Before you start:

- Install and identify the XPI with `zotero_plugin_list`; run startup before any reader action.
- The runner derives `fixturesDir` from `params.root`; fixture items are timestamped and disposable.
- The run snapshots named prefs, sets plugin volume to `0`, and disables position sync, settings upload, and settings sync before edits. Restore those switches last.
- The configured Kokoro endpoint is used for fixture A; Fish is toggled while unused, then used by background fixture B for affected-session checks.
- Any owner player closed for a required provider/list check is recorded and never reopened. Leave Zotero minimized after cleanup.

Limits:

- File/WebDAV restore and native confirmation dialogs are unit-only; live scripts do not trigger a blocking native prompt.
- A failure stops the group after the failing script; that script restores its local changes and `90-teardown.js` is run separately if needed. Early harness revisions r1-r3, r5, r8-r15, r22-r23, r25, r28, r31, r34, r36, r38, r40, and r42 failed only on setup/timing/evidence assumptions and were cleaned; r4, r6-r7, r16-r19, r21, r24, r33, r43, and r44 are PASS. r20/r27/r30/r32/r35/r37/r39/r41 are teardown-only cleanup reruns; r20 exposed the bridge minimize no-op and was rerun after OS minimize.
- The audio clock is reported as NOT TESTABLE when the output device is suspended; transport/list identity checks still run.

Runs (all evidence in the [issue verification table](https://github.com/xujialiu/Zotero-TTS/issues/121#issuecomment-5713289694)):

| Date / build | What ran | Runner run |
| --- | --- | --- |
| 2026-09-17 / 1.12.12-beta6 | Unused/used provider guards, background/paused impact, settings-browser and plugin-player favorites PASS (`r7`) | `2026-09-17-1.12.12-beta6-reading-guard-r7` |
| 2026-09-17 / 1.12.12-beta6 | Closed-player stale list/fresh reopen and restore unit-only boundary PASS (`r19`) | `2026-09-17-1.12.12-beta6-reading-guard-r19` |
| 2026-09-17 / 1.12.12-beta6 | Revised script-03 direct-refresh fallback PASS; prepared handoff/retained discovery evidence updated; teardown PASS (`r33`) | `2026-09-17-1.12.12-beta6-reading-guard-r33` |
| 2026-09-17 / 1.12.12-beta6 | Tightened controlled sync PASS: final player-close sync `running:false`, `deferred:0`, `lastApplied:[local.voice]`; teardown PASS (`r43`) | `2026-09-17-1.12.12-beta6-reading-guard-r43` |
| 2026-09-17 / 1.12.12-beta6 | Retargeted request-count supplement PASS: omission uses A's actual current sentence index/text; exact count `1→1`, applied `1→2`, pending impact captured both IDs; teardown PASS (`r44`) | `2026-09-17-1.12.12-beta6-reading-guard-r44` |
