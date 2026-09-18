# Scroll performance verification kit (issue #125)

[Case](../../cases/scroll-performance.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params it reads |
|---|---|---|---|
| `00-baseline.js` | Named prefs (`readAloud.volume` + user flag), host window state, tabs, every owner reader's flow mode / scrollY / player state; then mutes | Baseline stored in `state.baseline`; volume 0 | none |
| `01-startup.js` | Startup diagnostic of the installed candidate | Every step `ok`, `failed: []`; version `1.13.1-beta` | none |
| `02-fixture.js` | Imports and opens `scroll-performance.epub`, waits for the manager, switches the view to scrolled, waits for height | `flowMode` `scrolled`, ≥ 5 viewports (measured 29,286 px / 871 px = 33.6); throws otherwise | `fixturesDir` |
| `03-scroll-frames.js` | The measurement: 60-frame driven scroll with the player closed, then open+paused — frame gaps, `Zotero.Prefs.get` count, 0 ms timer delay | Closed 121.8 fps / open 119.8 fps, longest frame 9.3 / 9.4 ms, 0% over 50 ms; pref reads 194 closed, 11,423 open with 1,819 voices; ping median 6.4 / 7.5 ms. Throws if the open pass loses >20% of the closed fps or has any frame over 50 ms | `state.fixtureID` |
| `04-diagnostics.js` | `providerTiers()` and `liveVoiceList()` after the walks | All three patches true on every reader; `tiers` `['premium','standard','fish']`; `retagged` `{fish: 339}`; fixture `options` `fish=Fish Audio, premium=Zotero Premium, standard=Zotero Standard`; `liveVoiceList` `applied: 1` | none |
| `90-cleanup.js` | Closes the fixture player and tab, erases the item, restores volume exactly, asserts every owner reader's scrollY is unchanged | No fixture item or tab; volume 100 with no user value; owners byte-identical to the baseline; throws if an owner was scrolled | `state.baseline`, `state.fixtureID` |

Before you start:

- Install the candidate and prove it by version **and** a hash — another worktree exists on this machine. The 2026-09-18 run verified `build/zotero-tts.xpi` SHA-256 `7347e7c476dda34f05c0134255a90b1cc1945821c32052083265e378d14c1c2b`, installed version `1.13.1-beta`.
- `zotero_ping`, `zotero_plugin_list`, `00-baseline.js`, then install, then `01-startup.js` before any fixture opens.
- **Items 2-4 need a restored, non-minimized window.** `requestAnimationFrame` in the reader stops while Zotero is minimized and a minimized pass returns no frames with no error; `03-scroll-frames.js` restores the window itself. Minimize again after the run.
- The fixture opens **paginated**; `02-fixture.js` switches it to scrolled. Flow mode is per attachment, so no other tab is affected. Do not run the measurement on a PDF or a paginated view — the fault is on the scrolled DOM view and either may pass vacuously.
- The owner's own reader is never opened, pressed, scrolled or reopened. `90-cleanup.js` fails the run if an owner's scrollY moved.
- Output is muted by `00-baseline.js` before anything can start playback; `90-cleanup.js` restores the exact prior value and user-value state.

Limits:

- **Item 5 of the case is NOT TESTABLE on a profile without local voices** and has no script here. On 2026-09-18 `zotero-tts.local.enabled` was false and the 1,819 voices were 1,452 Zotero premium, 28 standard and 339 Fish Audio, so changing the local engine moved no observable value. The contract is covered by the unit test `test/read-aloud/provider-tiers.test.ts` ("re-reads the engine's name on every resolve"). Add a script here only on a profile where Kokoro is on and listing voices.
- The pref counter works because the plugin's backend is `(key) => Zotero.Prefs.get(key, true)`, looked up on `Zotero.Prefs` at call time. If that indirection is ever replaced by a captured reference, `03-scroll-frames.js` would silently count 0 — check the count is non-zero before trusting a low number.
- Drive the scroll one step per frame. A single `behavior: 'smooth'` call does not reposition the popup every frame and under-reports the fault.
- The 2026-09-18 run executed these scripts' logic as direct `zotero_execute_js` calls, not through `_shared/run.js`; the runner packaging here is a transcription of what ran and has not itself been executed. The next run of this case should run the group and correct this line.

Runs:

| Date | Build | Report | Items |
|---|---|---|---|
| 2026-09-18 | `1.13.1-beta` | [#125 closing comment](https://github.com/xujialiu/Zotero-TTS/issues/125) | 1, 2, 3, 4, 6 PASS; 5 NOT TESTABLE (no local voices in the profile) |
