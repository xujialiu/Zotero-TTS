# Scripts: 3j. A sentence across Zotero's paragraph break, read as one (issue #104, 1.12.8)

[Case](../../cases/paragraph-parts.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Runner](../_shared/README.md)

| Script | Checks | Expects (measured 2026-09-14, 1.12.8-beta2) | Params it reads |
| --- | --- | --- | --- |
| `01-startup-and-identity.js` | Item 1a: the build, `diagnostics.startup()`, and that the bundle is the new one | version `1.12.8-beta2`, 23 steps all `ok`, `failed: []`, `skipped lines` ok, `joinEnabledKeyPresent: true` (1.12.7 has no such key) | — |
| `02-baseline-and-mute.js` | Snapshots the four prefs with their user-value state, the selected tab and `Debug.storing`; sets `readAloud.volume` 0; refuses to go on unless `readAloud.memory` names a voice with `::` | `memoryVoiceIsPlugin: true`, `volumeNow: 0`, snapshot in `state.snapshot` | — |
| `03-open-fresh-copy.js` | Erases the run's previous copy, imports a fresh standalone copy of `attachmentKey`, opens it in a new tab, opens the player muted and pauses it in the same script | reader in ~0.6–0.8 s, `after: { active: true, paused: true, voice: fish::… }`, one `pauses` entry, segments and blocks non-zero | `attachmentKey`, `titlePrefix`, `keepCopies` |
| `04-skipped-lines.js` | Item 1b and the joins of item 2: `diagnostics.skippedLines()` for that reader | `patched/enabled/joinEnabled/loaded` all true; `2YW7BJTZ` 18 joins incl. `{103,105,11}`, `{108,109,12}`, `{109,110,12}`, `RW6PYBBQ` 22, `X7VC7KZS` 2; `restored: []` on all three | — |
| `05-sentence-segments.js` | Item 2: the reported sentence in `_readAloudSegments.segments`, with two neighbors either side | on: one hit (seg 200 of 541), 179 chars, `anchor: null`, page 12, **3** rects (y≈249.3, 225.5, 202); off: hits `[210, 211]`, 67 + 111 chars, 211 `paragraphStart` | `needles[]` |
| `06-cuts-and-part-links.js` | Item 3: block types, part links, `paragraphStart` count, and every segment ending mid-sentence before a lowercase one | join on — `2YW7BJTZ` 145 blocks / 18 links / 541 segs / 177 pStart / 1 cut; `RW6PYBBQ` 147 / 22 / 538 / 175 / 1; `X7VC7KZS` 28 / 3 / 120 / 34 / 0 (off in "Baseline" below) | — |
| `07-debug-lines.js` | Item 2: the plugin's own debug lines in Zotero's store | one `[zotero-tts] paragraph parts joined on page N: "…A" + "B…" (blocks a and b)` per join — the **last 18** are the current `2YW7BJTZ` copy's, its `N` 1-based against `joined.page` | — |
| `08-pane-row.js` | Item 5: the row in Settings → Zotero-TTS, and its `?` | `ztts-split-sentences` under `ztts-skipped-lines` in the *Reading* group, checked, bound to the pref; the `?` opens `#ztts-help-tip` with `ztts-help-split-sentences` verbatim (`tipState` `open` → `closed`); window closed | `expectedLabel`, `expectedHelp` |
| `09-set-join-pref.js` | Item 4: flips `readAloud.joinSplitSentences` (read when a structure loads — always a fresh copy after it) | `before`/`after` values and user-value state | `joinSplitSentences` |
| `10-cleanup.js` | Closes and erases every copy, restores the four prefs to value *and* user-value state (memory last), reselects the owner's tab, puts `Debug.storing` back | `allErased: true`, `stillThere: []`, every pref `restored: true` | — |
| `11-remaining-cuts.js` | Item 3: for each cut left, which of the sieve's tests it failed — the segments matched back to blocks, the tests re-run on the live structure | `2YW7BJTZ` seg 88 / `RW6PYBBQ` seg 89, both `Image analysis` \| `was performed …`: `1: A is not a plain leaf paragraph (heading/none)` **and** `1: 2 block(s) that are not excluded between them`. `X7VC7KZS` none | — |
| `12-open-tabs-scan.js` | The same scan as 06 over readers already open, read-only | answers only for the keys whose tabs are **loaded**; on 2026-09-14 the owner's three were unloaded and it returned `readers: [], count: 0` | `scanKeys[]` |

## Before you start

- **Build and bridge.** `zotero_ping`, `zotero_plugin_install` with the xpi,
  `zotero_plugin_list` for the `-betaN`; prove the build by the SHA-256 of
  `content/zotero-tts.js` inside the profile's
  `extensions/zotero-tts@xujialiu.top.xpi`, never by the version string.
- **Fixture.** The owner's manuscript, attachment `2YW7BJTZ` (`RW6PYBBQ` a
  second copy, `X7VC7KZS` the publisher's typeset version). No file from
  `test/fixtures/`: the bug needs a real document the worker cut mid-sentence.
- **Always a fresh copy.** The switch and the join are read when a structure
  loads and Zotero caches it per reader, so the owner's own tabs answer for the
  build that loaded them whatever is installed now. Every phase runs `03` again;
  `04`–`07` and `11` read the copy `03` left in `state.current`.
- **Order.** `01`, `02`, then per phase `[09] 03 04 05 06 11 07`; `12` while the
  owner's tabs are still loaded; `08` any time; `10` last, then `reset()`.
  `stopOnError` on. One `start` per phase, each with its own `runId` suffix
  (`…-paragraph-parts-p2`, `-p3`, …) so repeated scripts do not overwrite each
  other's `.tmp` results.
- **Baseline (the switch off), measured the same way** — `09` false, then `03`
  `06` per key: `2YW7BJTZ` 145 blocks / 0 links / 559 segs / 195 pStart / 19
  cuts; `RW6PYBBQ` 147 / 0 / 560 / 197 / 23; `X7VC7KZS` 28 / 1 / 122 / 36 / 2
  (that one link is Zotero's own, blocks 16→17). Segments and `paragraphStart`
  each drop by exactly `joined.length` when the switch is on.
- **State it touches.** The prefs `readAloud.volume`, `.joinSplitSentences`,
  `.restoreSkippedLines`, `.memory` (snapshotted in `02`, restored in `10`);
  `Debug.storing`; the imported copies and their tabs; the settings window in
  `08`. Not the owner's tabs, players, positions or provider settings.
- **Cleanup.** `10`, then `Zotero.ZoteroTTSRun.api.reset()`, then confirm: no
  item titled `ztts 3j …`, the prefs back with their user-value state, the
  owner's tab selected.

## Limits

- **Zotero unloads the owner's tabs when a run piles up copies.**
  `Zotero_Tabs.unloadUnusedTabs` keeps `MAX_LOADED_TABS = 5` reader tabs loaded
  and unloads the rest by `timeUnselected`. On 2026-09-14 five copies open at
  once left the owner's three paused Read Aloud players unloaded — the tabs and
  their positions survive, the open players do not, and reopening one would
  start playback on the owner's document. `03` erases the run's previous copy
  before importing the next, so a run adds one loaded reader tab at most.
- **`12` is opportunistic, and was empty on the second run**: the owner's
  manuscript tabs never reloaded after the first run unloaded them. Take the
  before-state from the switch-off baseline above instead — measured both ways
  for `RW6PYBBQ`, it is the same 560 / 197 / 23.
- **A copy's structure equals the original's.** Measured for all three keys
  (145 / 147 / 28 blocks, and 559 segments with the switch off against the
  owner's 559), so the copy is a faithful stand-in; it is not an assumption
  the kit can skip re-checking on another document.
- **`07` reads the whole debug store, which is cumulative** across phases,
  runs and builds (126k lines, 138 join lines by the end of the second run):
  read the last `joined.length` lines, or the delta, never the total.
- **Closing and erasing a copy logs Zotero's own errors** — `getOutline2 … is
  null` (reader.js) and `attachmentBox.js:436` — neither from the plugin.
- **`skippedLines()` names no reader**: it answers for every entry of
  `Zotero.Reader._readers` in order, so `04` picks the index out itself.
- **Item 6 is a human's** (the sentence heard without a pause, the highlight
  over both lines); nothing here records audio or motion.

## Runs

| Run | Build | Items | Observed |
| --- | --- | --- | --- |
| 2026-09-14, issue #104 verification comment | Zotero-TTS 1.12.8-beta (bundle `351c2aa4…`), Zotero 10.0.2-beta.9 | 1, 2, 3, 4, 5 PASS; 6 NOT TESTABLE (human) | The first pass, with the sieve before its bracket-group rule: 17 / 21 / 2 joins and 2 / 2 / 0 cuts left. Two of the case's stated values were wrong and are corrected there: the joined sentence has **3** rects, not 2, and the case's cut pages are 1-based where `sourcePosition.pageIndex` is 0-based. |
| 2026-09-14, beta2 re-run (this table's values) | Zotero-TTS 1.12.8-beta2 (xpi `ae30991006b182c4…`, bundle `fbca560e9803911f…`), Zotero 10.0.2-beta.9 | 1, 2, 3, 4, 5 PASS; 6 NOT TESTABLE (human) | Every script above ran, none revised. The bracket-group rule takes the `(Table 4)` split (blocks 103 → 105): 18 / 22 / 2 joins, 1 / 1 / 0 cuts left, each remaining cut the run-in `OCTA Image Analysis` heading before the figure — sieve test 1, twice. Segments 559 → 541, 560 → 538, 122 → 120 and `paragraphStart` 195 → 177, 197 → 175, 36 → 34, each drop exactly `joined.length`. |
