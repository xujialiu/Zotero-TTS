# Scripts: The Sentence and Word switches (issue #114, 1.12.11)

[Case](../../cases/highlight-levels.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

Run in this order through `_shared/run.js` (`kit: 'highlight-levels'`). `00`
runs on the PREVIOUS build, before `zotero_plugin_install`; the install
itself is the tester's own call, not a script. `params.fixturesDir`,
`params.epubItemID` (the standing EPUB, found by title with
`zotero_db_query` before the run) and `params.ownerItemID` (the owner's
own open reader, if any; optional) come from the runner; no script
hard-codes a path or an item id. Item numbers below are
highlight-levels.md's unless marked `4.10` (word-highlight-key.md) or
`highlight.md`.

| Script | Checks | Expects | Params/state |
| --- | --- | --- | --- |
| `00-pre-install-snapshot.js` | Baseline (every touched pref) + item 3's pre-install writes (Zotero's level to `paragraph`, `sentenceUnderWord` to `false`) on the running 1.12.11-beta2 | Snapshot captured; both writes applied | `state.baseline`, `state.item3` |
| `01-provider-and-voice-prep.js` | Isolates the run: `sameForAllDocuments` off (so a voice pick never spreads to the owner's active reader), Azure temporarily enabled, `reader.readAloudVoices`'s `en` entry repointed at `azure::en-US-ChristopherNeural` | `ownerUnchanged: true` (the owner's active/paused reader never moves; `null` without `params.ownerItemID`) | `params.ownerItemID`; `state.voicePrep` |
| `02-open-fixtures.js` | Imports fixture A and B fresh, opens the standing EPUB, starts+pauses A and the EPUB | All three on `azure::en-US-ChristopherNeural`; B `active: false` (never given a session) | `params.fixturesDir`, `params.epubItemID`; `state.fixtures` |
| `03-audio-probe.js` | A's session was opened via untrusted `toggleReadAloudPopup(true)` (02), which the design leaves permanently `suspended`; closes and restarts it with a trusted Shift+Space | `running` with the clock moving — this machine can play | `state.fixtures` |
| `04-epub-trusted-restart.js` | Same restart attempted on the EPUB | Stayed `suspended` even with a trusted press (see Limits) | `state.fixtures` |
| `05-pane-and-diagnostic.js` | Item 1 (fresh pane, DOM ids, the `?` tip) + item 2 (`highlightLevels()` shape with 4 readers open) | Structure and prefs match the case; `pin.snapped: 0`; startup step `highlight levels` `ok`, before `highlight colors` | `state.fixtures` |
| `06-word-switch.js` | Item 4: Word off/on on playing A (rect, position, controller identity, disabled states, preview) + EPUB's spotlight color via `_getSpotlightColor` (pure, no push needed) | Word rect ↔ segment rects; `sameController: true`; EPUB `#3478f6b3` ↔ `#ffff00b3` | `state.fixtures` |
| `07-word-switch-paused.js` | Item 4's paused repeat | Same flip, `paused: true` and `position` unchanged throughout | `state.fixtures` |
| `08-sentence-switch.js` | Item 5 + `highlight.md` 5.5/3.5: Sentence off/on on playing A (the secondary slot needs the next state push); EPUB paused, using `manager.repositionTo(sameIndex)` as a forced push | `style.sentence` flips at once, `sentenceSlot`/pieces only clear at the next push; EPUB's `repositionTo` does count as a push | `state.fixtures` |
| `09-never-both-off-and-pin.js` | Item 6 (pane open vs. closed, both-off write) + item 7 (foreign writes to Zotero's pref snap back, a same-value write is a no-op) | Matches the case exactly (see Runs) | pane open on Highlight |
| `10-zotero-menulist-greyed.js` | Item 8: a window opened on the plugin's own pane first reads `{found:false}` until General is shown; the menulist's `disabled`/`tooltiptext`; forcing the pick through the binding | `{found:false}` → `{found:true,disabled:true}`; tooltip text matches; forced pick snaps back | none |
| `11-shift-w-fixture-a.js` | Item 9 + 4.10 overlap: trusted Shift+W on playing/paused A — both→sentence→both, toast text and ~950 ms fade, Sentence-off/Word-off starting states | All toasts and flips match; the "hand-edited both false" sub-case is NOT in this file (see `12`) | `state.fixtures` |
| `12-shift-w-hand-edited.js` | The hand-edited-both-false press, correctly this time (settings window closed first) | `{sentence:false,word:false}` raw → press → `{true,true}`, toast "word and sentence" | `state.fixtures` |
| `13-shift-w-picking.js` | 4.10's reader-picking: EPUB via the key, the idle reader B, the library tab (nothing speaking), two tabs (A speaking hidden, B selected) | EPUB spotlight flips; B flips with no player opening; library tab leaves switches untouched; toast lands in the main window's document | `state.fixtures` |
| `14-no-active-segment.js` | 4.10: press after fixture A reaches its end (`_activeSegment === null`) | Switch/pref still flip; last rect unchanged | `state.fixtures`; runs long — use `start()`+background wait |
| `15-mai-voice-no-timing.js` | Item 9's last bullet + 4.10's no-timing voice, on the EPUB switched to `azure::en-US-Ethan:MAI-Voice-2` | `wordTiming:"stand-in"`; long toast opacity `1` at 4.9 s, `0` at 5.2 s; `granularity:"sentence"`, `state.highlightGranularity:"word"` | `state.fixtures` |
| `16-restore-defaults-and-recorder.js` | Item 10 (Restore default colors with Sentence off) + 4.10's recorder row (position, `?` tip, Clear, collision with Player options) | All 6 prefs back to defaults; tip text matches; `Already used by "Word highlight on / off".` | pane open on Highlight |
| `17-cleanup-restore.js` | Closes/erases A and B, closes the EPUB's tab (kept, never erased), restores every pref (memory last), reports the owner's reader | Every `verify.*` byte-identical to baseline; `ownerStillUntouched` equals the run's first read (`null` without `params.ownerItemID`) | `params.ownerItemID`; `state.baseline`, `state.voicePrep`, `state.fixtures` |

## Before you start

- Build: `zotero_plugin_list` for the running version, `diagnostics.startup()`
  clean, and `typeof Zotero.ZoteroTTS.diagnostics.highlightLevels ===
  'function'` — absent on any build before 1.12.11-beta3.
- Fixtures: `test/fixtures/fixture-a.pdf` and `-b.pdf`, imported fresh and
  erased at the end; the standing library item **ZTTS Return-Key EPUB**
  (its itemID found by `zotero_db_query` on the title and handed in as
  `params.epubItemID`), never imported or erased, only its popup/tab
  opened and closed.
- State touched, restored by `17`: the six `zotero-tts.highlight.*` prefs,
  `shortcuts.toggleWordHighlight`, `readAloud.volume`, `azure.enabled`,
  `readAloud.sameForAllDocuments`, `reader.readAloudVoices` and
  `readAloud.memory` (byte-for-byte, memory last), `Zotero.Debug.storing`.
  `reader.readAloud.highlightGranularity` is left pinned at `word` (the
  switches' default) — reported, not restored, since the plugin owns it
  while running.
- `sameForAllDocuments` is turned off for the WHOLE run before any voice is
  touched, and only turned back on in `17`: this profile had it (and
  `globalSpeed`) on, which would otherwise spread this run's Azure pick to
  the owner's own active reader (memory-sync.ts `spreadVoice`/`spread`,
  gated on exactly this setting).
- The owner's own reader, when one is open (handed in as
  `params.ownerItemID`, read off `Zotero.Reader._readers` before the run —
  on 2026-09-16 one active+paused on a Fish voice), is read-only
  throughout; every script's `ownerStillUntouched` / `ownerUnchanged`
  check confirms it. No reading guard applies to the
  switches themselves (highlight-levels.md's own rule), so its tab
  repainting to whatever level the switches say is expected, not a fault.

## Limits

- **`selectVoice()` never took hold on a manager reached from chrome** —
  tried live with a string id and with the actual voice object, both
  paused and playing: `selectedVoiceID` never moved and nothing threw. The
  reliable route (used throughout, including `15`'s MAI-voice switch) is
  Zotero's own per-language persisted-voice restore: close the popup,
  repoint `reader.readAloudVoices`'s language entry (and its `tierVoices`
  slot), reopen — which also means the manager instance is replaced, so it
  must be re-read fresh afterward rather than cached.
- **The EPUB's AudioContext stayed `suspended` even after a trusted
  Shift+Space restart** (`04`), unlike fixture A's identical restart (`03`,
  confirmed `running` with the clock moving) — `zotero_read_errors` showed
  the same "prevented from starting automatically" / `NotAllowedError`
  pair at the EPUB's restart that fixture A's restart did NOT produce.
  Root cause not chased further (environmental, not a plugin question);
  worked around throughout by testing the EPUB's mechanism paused, reading
  `_getSpotlightColor` directly (a pure function of the current switches,
  needs no push at all: `06`) or forcing one push with
  `manager.repositionTo(sameIndex)` (`08`). Only the "the word index still
  advances" / live-clock claims are therefore fixture-A-only in this run;
  every switch/pref/DOM/spotlight claim was confirmed on both.
- **A settings window keeps every pane it has ever shown resident**, not
  only the one currently visible (driving doc §1) — found live in `11`:
  with the window open on Highlight but General also loaded earlier in the
  same window, writing both highlight prefs to `false` was caught by
  `highlight-rows.ts`'s own watcher and corrected back to `{sentence:true}`
  before the "hand-edited" press ever ran, silently duplicating the
  "Sentence on, Word off" case instead. `12` redoes it with the window
  fully closed first, which is the only way to get the two raw prefs to
  actually both read `false` for the press.
- **Three DOM lookups in early drafts used a string that was a
  `data-l10n-id`, not the element's `id`**: the Highlight section's `?`
  icon (`ztts-help-highlight-switches` is the l10n id; select it with
  `[data-l10n-id="…"]`), Zotero's General pane id for `navigateToPane`
  (`zotero-prefpane-general`, not `general` — found via the navigation
  `richlistitem`s' `value` attributes), and the "Restore default
  shortcuts" button (`ztts-key-defaults` is the DOM id; `ztts-restore-shortcuts`
  is only its l10n id, so `getElementById` plus optional chaining silently
  did nothing the first time). All three are fixed in the scripts above.
- **`manager._activeSegment` lives on the manager, not `_controller`**:
  `14`'s first run polled the wrong property for 90 s straight without
  ever recognizing the document had ended (it had, well before the
  ceiling — confirmed by a follow-up read: `paused` had flipped true on
  its own and `_controller._position` was back to `0`). Fixed in the
  script; a future run should see the loop exit well under 90 s.
- One `zotero_execute_js` call for `10` took 181 s to return (documented
  bridge ceilings are far lower) with no error and a clean result;
  `pin.snapped` read 6 instead of the expected 5 afterward, consistent
  with an earlier, seemingly-`undefined` call for the same script having
  kept running server-side and executing its own foreign write again in
  the background (`one()` sets no busy lock — the same class of race the
  `zotero-tiers` kit records for `04b`). Confirmed settled (two reads 2 s
  apart, both `6`) before continuing; no state was left inconsistent.
  Prefer the `start()`/`wait()` group form over `one()` for any script
  that navigates a settings pane.
- Item 4.10's "next segment draws at the new level" sub-claim was not
  independently re-checked after `14`'s press: that script's own cleanup
  already restores Word before returning, so a follow-up resume-and-read
  found both switches already back to `true`. The rest of item 4.10 and
  highlight-levels item 9 establish the same mechanism (a level change is
  visible at the very next push) on both a live press and a checkbox
  click; redoing this one narrow point would cost another full
  play-to-the-end.

## Runs

- **2026-09-16, 1.12.11-beta3, Zotero 10.0.3-beta.1+cfec88e31**: items 1–11
  PASS (highlight-levels.md); 4.10 PASS including the overlap presses,
  idle reader, library tab, two tabs, no-active-segment and the no-timing
  voice; `highlight.md` 5.5 and 3.5's `style` field PASS. Full table and
  script-level detail on this run's reply (issue #114 verification). `09`,
  `11`, `14`, `16` were revised after a live bug (see Limits); the
  corrected data for their affected sub-checks came from an interactive
  follow-up in the same session rather than a rerun of the fixed file —
  a future run exercises the fixed files directly.
