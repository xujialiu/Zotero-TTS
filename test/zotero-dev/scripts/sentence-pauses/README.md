# Scripts: The pauses between sentences and paragraphs (issues #44, #142)

[Case](../../cases/sentence-pauses.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `142-00-startup-diagnostic.js` | Build identity | `version` the installed beta, `failed` empty, `the Engine` step `ok`, `engine.feature` `engine-v1`, `pauses` the four current settings | none |
| `142-01-baseline-mute-fixture.js` | Named prefs snapshot (the four pause prefs, volume, globalSpeed, memory), mute, fixture-a.pdf imported (the ONE fixture/tab this kit uses) | Volume 0 after; `readAloud.memory` a plugin voice, recorded not changed; one fresh item; `posBeforeRows` recorded | `fixturesDir`; writes `baseline`, `fixtures.A`, `posBeforeRows`, `readAloudMemoryFullValue` |
| `142-02-open-and-play.js` | Opens fixture A, starts a session on the memory's plugin voice | `segCount` 17, `paragraphStarts` exactly `[0,5,9,12,15]`; session reaches `playing`/`audio.state running` | state `fixtures.A`; writes `fixtures.A.tabID` |
| `133-04-item3-gaps.js` (engine kit, REVISED for #142) | Item 3 of `engine.md`: defaults, custom 1000/400@2x, both off at 1x/2x/3x, a pause inside the gap | `gaps.last` matches the NEW `computeGap` (paragraph alone; a switch off gives 0, no fallback); `gaps.count` steady through a pause and the immediate resume | state `fixtures.A`; restores the four pause prefs -- see [engine's own README](../engine/README.md) |
| `142-03-additional-combos.js` | Item 3.10's own combos `133-04` does not cover: defaults@1x across all four paragraph markers (5/9/12/15) and four plain sentence boundaries; sentence 500/paragraph 200@1x; sentence off/paragraph 400@1x; paragraph off/sentence 1000@2x | Every sample's `gaps.last` matches `computeGap`; `gaps.count` up exactly one per sample | state `fixtures.A`; restores the four pause prefs |
| `142-04-item7-item8-pane.js` | Item 7 (a pane-driven pref change while a session is active) and item 8 (the pane: labels, both `?` tooltips) | Row labels "Pause between sentences"/"Pause between paragraphs" (the UI language's own strings); both tooltips `state:"open"` with the brief's exact wording; checkbox/number-input writes reach the prefs; `_allVoices.length` and `active` unchanged, no `#ztts-notice` | state `fixtures.A` |
| `142-05-restore-and-teardown.js` | Cleanup: the four pause prefs and volume restored byte-exact; `readAloud.memory` confirmed untouched; the fixture's player/tab closed and the item erased | `allPrefsMatch` true; `memoryUntouched` true; `readersLeftOpen` 0; `rowsBackToBaseline` true | state `baseline`, `fixtures`, `posBeforeRows`, `readAloudMemoryFullValue` |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list` for the installed version, install the xpi, `zotero_plugin_list` again, then `142-00`. Build identity beyond the version string: grep the profile's installed `.xpi` (not the source tree's) for `computeGap` present, `nativeSentence`/`ZOTERO_PARAGRAPH_MS` absent, and the en-US ftl's `ztts-paragraph-pause .label` ("Pause between paragraphs", no "Extra") -- this run's evidence is in the issue-#142 report, not repeated here.
- WebDAV isolation (workflow "Test WebDAV first") runs once per zotero-dev session, outside this kit, before installing.
- Fixtures: `fixture-a.pdf` only (17 segments, paragraph starts 0/5/9/12/15) -- this case's own brief allows one reader tab. `142-01` imports it; `142-05` erases it.
- `133-04-item3-gaps.js` lives in the `engine` kit (issue #133's own item 3) but reads/writes the same `state.fixtures.A` this kit's `142-01`/`142-02` produce, so a run of both cases together needs only one fixture, one tab, one session -- run it between `142-02` and `142-03`.
- `readAloud.memory` is recorded, never changed, by this kit: every run so far already found a plugin (`::`) voice there.
- Cleanup order: `142-05` (prefs, player, fixture) before the WebDAV restore (workflow, outside this kit).

## Limits

- Item 8's "By ear only: the pacing at 1× and 2×" is a human judgment, not run by this agent -- reported NOT TESTABLE (bridge) each time, for the owner's own ordinary-reading pass.
- Premium Voice 1-3 (issue #142's own catalog-300-ignored case) is NOT RUN by brief instruction every time (billed audio; the unit tests cover it) -- do not add a live check for it without the owner's explicit go-ahead for the spend.
- `142-03`'s `defaultsAt1x` samples 4 of the 17 segments' 16 boundaries per side (4 paragraph markers, 4 plain ones), plus the structural `paragraphStarts` check in `142-02` covering all 17 anchors -- not a full 16-boundary real-time walk (each boundary needs its segment's own real audio to finish); this combination is what "true exactly into 5/9/12/15" rests on, not an exhaustive live sweep.
- 2026-09-25's first attempt at both `133-04`'s revision and `142-03` shadowed `session.gaps` (the `{count,last}` wrapper) as the loop variable meant to hold `session.gaps.last`, so every script's own `matches`/`defaultsAllMatch` self-check read `undefined` fields and reported `false` against entirely correct raw data (every `gaps.last.{ms,paragraph,speed}` checked by hand against `computeGap`, and `gaps.count` against "up one per boundary", matched exactly). `133-04` was fixed and re-run clean the same session; `142-03`'s fix was applied after manually confirming its own already-captured raw data, without a second (billed) re-run -- the version on disk now is the fixed one, unexercised by a fresh run of its own `matches` field. The next run that touches `142-03` should confirm `defaultsAllMatch` reads `true` before relying on it.

## Runs

- **2026-09-25, 1.14.4-beta9, issue #142** (xpi SHA-256 `478f556b1e8584cce54dc6f1e9543e49c6bd4bc199beeda8855fd26059d7c6cd`, byte-identical installed; installed bundle grep: `computeGap` present, `nativeSentence`/`ZOTERO_PARAGRAPH_MS` absent, ftl "Pause between paragraphs"): `142-00`/`142-01`/`142-02` (`2026-09-25-1.14.4-beta9-sentence-pauses-01`), `133-04` revised (`2026-09-25-1.14.4-beta9-engine-item3-fixed`, after one self-check-only-broken attempt), `142-03` (`2026-09-25-1.14.4-beta9-sentence-pauses-02`, self-check fixed post-hoc per the Limits note above), `142-04` and `142-05` (via `one()`) all PASS on the raw data. Item 3.10's every numbered case (1-7) confirmed; item 8's labels/tooltips/writes-through PASS, its "by ear" half NOT TESTABLE (human); Premium Voice 1-3 NOT RUN by brief. Full PASS/FAIL table in the issue-#142 verification report.
