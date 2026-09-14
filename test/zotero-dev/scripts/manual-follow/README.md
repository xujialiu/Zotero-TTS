# Scripts: 3i.8 manual sentence placement and resume (issue #107)

[Case](../../cases/manual-follow.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

These are bounded runner scripts. They use three disposable fixtures (one PDF,
one scrolled EPUB and one paginated EPUB), keep the owner’s readers untouched,
and return structured observations. Controlled viewport/state changes and real
trusted input or playback are labelled separately in every result.

## Run order

| Script | What it checks | Expects | Params read |
| --- | --- | --- | --- |
| `107-00-baseline.js` | Named prefs/user flags, readers, tab, settings window, errors | Snapshot saved; secret values represented only by presence/length | none |
| `107-01-close-preferences.js` | Close the old pane before install | `closed: true` or no pane was open | none |
| `107-02-startup.js` | Startup diagnostic after the exact XPI install | Candidate version; every startup step `ok`; `failed: []` | none |
| `107-04-prepare-and-helpers.js` | Mute and isolate WebDAV; installs reusable runner helpers | Volume `0`; three WebDAV switches `false`; plugin voice available or player checks skipped | none |
| `107-03-settings-ui.js` | Mode radios, keep-following switch, labels/help, persistence (run after isolation) | `sentence`/`outside`; keep default on; help describes current/later/paused/resume behavior; original values restored | none |
| `107-05-import-fixtures.js` | Fresh PDF and EPUB attachments | Three item IDs/keys; paths come from runner `fixturesDir` | `fixturesDir` |
| `107-06-open-readers.js` | Open PDF, scrolled EPUB and paginated EPUB before players | Reader/manager/view ready; requested EPUB flow and page mapping | state fixtures |
| `107-07-open-players-paused.js` | Fixture players only, opened then paused | Active, paused sessions with segment/controller data; diagnostics available | state fixtures/helpers |
| `107-08-audio-clock.js` | Machine audio gate | Two samples per fixture; `moving` identifies real clock availability | state fixtures/helpers |
| `107-09-current-and-later.js` | Current sentence protection, out/reentry and later visible recovery in both modes/flows | Trusted wheel evidence; protected same sentence never retargets on pushes/out/reentry; later fully outside waits; later visible clears protection and resumes | state fixtures/helpers |
| `107-10-paused-stillness.js` | Paused clipping/departure/reentry, focus/resize, state pushes and mode changes | `paused: true`; no new `last` target and no `reason: resume` while paused | state fixtures/helpers |
| `107-11-resume-matrix.js` | Pause-to-play visible/partial/outside, both modes, keep on/off, native toggle plus bounded direct path | Playing snapshot `following: true`, `reason: resume`, protection cleared, forced target; pause half has no resume target | state fixtures/helpers |
| `107-12-explicit-and-clipping.js` | Paused return/sentence/paragraph skips, playing skip, keep-off persistence, ordinary clipping | Explicit operations work while paused/playing; keep-off survives scroll/mode until explicit return; clipping target recorded separately from natural audio | state fixtures/helpers |
| `107-13-interior-resume.js` | Interior fitting sentence: off-center/partial/outside native resume and native pause half in PDF/scrolled EPUB | Calculated center target and actual scroll agree within 1 px; pause half stays put; both modes; assertions stop on mismatch | state fixtures/helpers |
| `107-90-cleanup.js` | Close/erase fixtures, restore prefs/user flags/tab/settings/debug store, audit errors/patches | No fixture readers/items; exact original values/flags and owner state; no new relevant plugin/dead-object errors | baseline/state |

## Before you start

- Run `zotero_ping` and `zotero_plugin_list`; never drive the owner’s paused PDF.
- Run `107-00`, `107-01`; install the exact XPI; run `107-02` before opening a
  reader. Prove the installed artifact by its supplied SHA-256, not its label.
- Run `107-04` immediately after startup, before `107-03` or any mode/keep
  mutation; it mutes playback and disables the three WebDAV switches first.
- Start the runner with `stopOnError: true` and collect full results from
  `.tmp/zotero-dev/<runId>/results/`; the bridge response is capped at 2,000
  characters per script. If a script errors, stop the focused interpretation,
  collect evidence, and run `107-90` separately if the group skipped cleanup.
- The scripts import `fixture-a.pdf` and `return-key/return-key.epub` through
  `params.fixturesDir`. Only timestamped fixture items are created and erased.
- `readAloud.volume`, WebDAV switches, mode and keep-following are restored
  from the baseline. The original voice map and memory are restored after all
  fixture players close; debug storing is restored last.

## Limits

- `107-09` and `107-10` use controlled `scrollTo`/page navigation after a
  trusted wheel. They prove intent and state transitions, not natural wheel
  distance or smooth animation. Sentence and word pushes are controlled.
- `107-11` uses the native player toggle for 36 rows (32 valid native geometry
  cases plus 4 paginated partial rows with unavailable spread geometry) and
  one direct `manager.play()` representative per fixture. Provider requests
  are muted and bounded; a suspended AudioContext makes natural progress
  NOT TESTABLE, while the state transition remains reported.
- `107-13` is a narrow supplemental pass over fresh PDF/scrolled-EPUB fixtures;
  it requires a fitting interior sentence with a center target strictly
  inside document limits and throws on any concrete geometry/toggle mismatch.
  It also verifies that per-script `{value,user}` snapshots restore correctly
  when no explicit pref type is present.
- A paginated partial case is only PASS when the fixture supplies a
  spread-crossing sentence; otherwise the result names the missing geometry.
- Human comfort, highlight pacing, and animation interruption need a human
  observation. Native player calls are made only on disposable fixtures.

## Runs

| Date/build | Results | Evidence |
| --- | --- | --- |
| 2026-09-14 / 1.12.9-beta2 / setup recovery | Initial setup attempt stopped at a stale reader wrapper; helper was hardened and the fixture readers were recovered. One dead-object console entry dates to this attempt. | `2026-09-14-1.12.9-beta2-manual-follow-setup`, `...-recover-readers`, `...-players` |
| 2026-09-14 / 1.12.9-beta2 / final2 | PASS: current/later protection and visible recovery (PDF, scrolled EPUB, paginated EPUB; both modes); paused stillness; 39 resume cases (32 valid native geometry, 4 paginated partial NOT TESTABLE, 3 direct); explicit return/skips, keep-off persistence and clipping; cleanup and owner/tab restoration. Settings recheck PASS; end audit `newRelevant: []`. NOT TESTABLE: natural audio, all fixture AudioContexts stayed suspended at `0`. XPI SHA-256 `4025b820c3049927778c782c26e584ba838ac7f6a3f94800ef2fe2458e75a87c`. | `2026-09-14-1.12.9-beta2-manual-follow-final2`, `...-settings-final`, `...-final-audit`; final table is on issue #107 |
| 2026-09-14 / 1.12.9-beta2 / interior first attempt | Stopped on a harness-only pause-reason assertion; native pause had held the protected sentence and scroll. Cleanup passed; the assertion was changed to compare target/position stability. | `...-interior-resume`, `...-interior-resume-cleanup-failed` |
| 2026-09-14 / 1.12.9-beta2 / interior supplemental | PASS: 12 native rows on fresh PDF/scrolled-EPUB fixtures (visible-offcenter, partial, outside; both modes). PDF candidate segment `7`: expected center `15.2516`, actual `15`; EPUB candidate segment `13`: expected `22.4833`, actual `22`; every delta `<1px`; native pause-half movement `0`; cleanup `ownersPass:true`, `newRelevant:[]`. | `...-supp-setup2`, `...-interior-resume-2`, `...-interior-resume-cleanup`; supplemental table on issue #107 |
