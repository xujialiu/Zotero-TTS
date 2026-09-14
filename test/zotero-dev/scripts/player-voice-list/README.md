# Scripts: the player's voice list (issue #106)

[Case](../../cases/player-voice-list.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | Expected output | Params / state |
| --- | --- | --- | --- |
| `00-baseline-and-mute.js` | Snapshots named prefs and user flags, owner readers, selected tab and debug store; disables sync and mutes | Redacted baseline; volume 0; sync switches false; debug store on | `state.baseline` |
| `01-import-fixtures.js` | Imports one PDF and one EPUB from the parameterized fixture directory | Two item IDs and keys | `params.fixturesDir`; `state.fixtures` |
| `02-open-and-install-transport.js` | Opens both fixtures, injects a silent native catalog, opens and pauses each player | Five catalog voices, two US offered voices, selected `p106-us-a`; diagnostics patched with compatible 4 > offered 2 | `state.fixtures`, `state.transport` |
| `03-open-popups-and-dom.js` | Captures the mounted PDF/EPUB player controls and pauses after opening | Popup mounted; selected `p106-us-a`; 17 PDF segments; actual Options/Language/Voice controls | `state.transport` |
| `04-open-voice-menu.js` | Opens each actual Voice dropdown and records option IDs | `p106-us-a`, `p106-us-b` option IDs | `state.transport` |
| `05-open-language-menu.js` | Opens each actual Language dropdown | `en`, `en-GB`, `en-US` options with US selected | `state.transport` |
| `06-regional-menu-and-keys.js` | Reads actual US/GB menu IDs, manual selection, trusted previous/next keys, generic Adrian and stale-region behavior | PDF and EPUB: US `p106-us-a,p106-us-b`, all `en-US`, Adrian absent, diagnostic 4 > 2; keys wrap both ways; GB singleton; English selects Adrian and remains usable; catalog reads do not rewrite prefs | `state.transport`; updates `state.liveResult` |
| `07-singleton-and-fallback.js` | Removes the sole GB voice, reloads the controlled catalog and checks native fallback | Singleton remains selected with a controller; fallback selects generic `p106-adrian` with a nonempty list/controller; catalog restored | `state.transport`; updates `state.fallbackResult` |
| `08-cleanup-and-restore.js` | Closes/erases fixtures, restores the native method, prefs and flags, debug store and selected tab | No fixture readers/items; owner sessions stable; all prefs and flags equal baseline; 71 rows, queue 0, lastError null | `state.baseline`, `state.transport`, `state.fixtures` |

## Before you start

- Use `zotero_ping`, verify the XPI identity, install it, run `diagnostics.startup()` before opening anything, and confirm `zotero_read_errors` after cleanup.
- Start from the current owner reader baseline. The scripts never play, pause, select or close those readers; only the two imported fixtures are opened and driven.
- The native fixture transport is silent and returns zero credits. Volume is still muted by the baseline script. Manual paused menu picks request one controlled sample; the report counts it separately.
- The runner supplies `root`, `fixturesDir`, `tmpDir` and `runId`; scripts keep identities and raw restoration values only in `Zotero.ZoteroTTSRun.state`.
- Run `00` through `02`, then `03` through `07` as needed, and always finish with `08`. Run one group at a time.

## Limits

- The controlled transport proves menu IDs, list filtering, selection, shortcut wrapping and controller fallback. It does not grade pronunciation, accent quality, highlight comfort or audible playback.
- A first exploratory transport returned `getAudio` synchronously and produced harness errors; the retained transport returns a reader-realm Promise. One first `06` invocation found a language menu toggled closed and was rerun with state-aware menu opening.
- After final3, the generic result field was corrected from the US `manual` selection object to the executed generic `selection` object. This is a report-only kit correction; no live behavior was rerun.
- The final run's four `InvalidStateError: Navigated away from page` entries occur during fixture teardown. Older ring entries include prior exploratory transport/autoplay noise; no new plugin error or dead-object burst was produced by the final run.
- The singleton and fallback catalog mutation is a controlled manager state. Provider catalogs, favorites, saved voice choices and user preferences are restored by cleanup.

## Runs

| Run | Items observed | Evidence |
| --- | --- | --- |
| 2026-09-14 · 1.12.9-beta · final3 | PDF and EPUB: startup, US/GB actual menus, diagnostics, manual sample, trusted keys in both wrap directions, English/Adrian, singleton and generic fallback PASS; cleanup PASS | [Issue #106 verification table](https://github.com/xujialiu/Zotero-TTS/issues/106#issuecomment-5664976874) |
