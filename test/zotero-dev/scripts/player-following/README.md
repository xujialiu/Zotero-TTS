# Player following verification kit (issue #117)

[Case](../../cases/player-following.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | What it checks | What it expects | Params read |
|---|---|---|---|
| `107-00-baseline.js` | Named prefs/user flags, owner readers, selected tab and error baseline | Exact values and flags are saved; secrets are represented by presence/length only | none |
| `107-01-close-preferences.js` | Closes an open Preferences window before install/fixtures | No Preferences window remains | none |
| `107-02-startup.js` | Candidate startup diagnostic | `1.12.12-beta`, every step `ok`, `failed: []` | none |
| `107-04-prepare-and-helpers.js` | Mute and isolate WebDAV; installs fixture/diagnostic helpers | Volume `0`; three WebDAV switches `false`; configured plugin voice available | none |
| `107-03-settings-ui.js` | Mode/keep-following controls and help text | `sentence`/`outside`, keep on, settings values restored | none |
| `107-05-import-fixtures.js` | Disposable PDF, scrolled EPUB and paginated EPUB imports | Three timestamped fixture ids/keys | `fixturesDir` |
| `107-06-open-readers.js` | Reader and view readiness | PDF plus scrolled/paginated EPUB readers and managers exist | fixture state |
| `107-07-open-players-paused.js` | Fixture player sessions | All three players active and paused with plugin voice and segments | fixture state |
| `107-08-audio-clock.js` | Audio-device gate | Two clock samples per reader; frozen/suspended clocks are reported | fixture state |
| `107-09-current-and-later.js` | Trusted gesture protection, same-sentence reentry and later visibility recovery | Both modes; PDF/EPUB diagnostics correlate protected/suspended/recovered states | fixture state/helpers |
| `107-10-paused-stillness.js` | Paused manual movement and mode changes | No automatic target or resume while paused; state remains paused | fixture state/helpers |
| `107-11-resume-matrix.js` | Native resume from visible/partial/outside positions | Playing resume restores following and target; pause half stays still; both modes/flows | fixture state/helpers |
| `107-12-explicit-and-clipping.js` | Paused/playing return and skips, keep-off persistence and clipping | Explicit paths restore A; keep-off persists until explicit recovery; clipping target recorded | fixture state/helpers |
| `107-13-interior-resume.js` | Interior PDF/scrolled EPUB geometry | Native center target within 1 px and pause-half movement `0`; both modes | fixture state/helpers |
| `117-player-ui-and-isolation.js` | A/M DOM snapshot, all layouts, pause, explicit mode, stale pref, two-reader isolation, close/reopen | UI text/tooltip/ARIA agree with `pluginPlayer().readers[].state.automatic`; A/M is reader-local; old pref ignored | fixture state/helpers |
| `117-trusted-shortcuts.js` | Trusted Shift+Enter and sentence/paragraph shortcuts | `keydown() === 1`; paused fixture remains paused, moves as requested, and returns to A/following | fixture state/helpers |
| `117-return-path-compare.js` | Direct lock versus trusted return and real play-button resume | Direct and trusted paths both restore A; playback resume restores A | fixture state/helpers |
| `117-boundary-diagnostic.js` | Selected/visible PDF preconditions, fixed helper vs readiness-gated boundary resume/reentry | Records window/view/iframe visibility, pending and visibility events for 2.6 s | fixture state/helpers |
| `117-boundary-assert.js` | Asserts the readiness-gated boundary expectations | Throws on missing visible preconditions or failure to recover/target | diagnostic state |
| `107-90-cleanup.js` | Closes/erases fixtures and restores user state | No fixture readers/items; exact prefs/flags, memory, volume, sync switches, tab and owner state restored; no new relevant errors | baseline/state |

Before you start:

- Verify the XPI and embedded bundle SHA-256, run `zotero_ping` and
  `zotero_plugin_list`, install the exact XPI, then run `107-02-startup.js`
  before opening a reader.
- Use only `fixture-a.pdf` and `return-key/return-key.epub` from
  `params.fixturesDir`. The three fixture slots use separate disposable items;
  the owner reader is never pressed or repositioned.
- Run with `stopOnError: true`. Start with `107-00`, `107-01`, `107-02`,
  `107-04`; finish with `107-90`, including after any failed focused script.
- The kit mutes `readAloud.volume`, turns off the three WebDAV switches and
  restores values and user flags in cleanup. `readAloud.memory` and native
  `reader.readAloudVoices` are restored after all fixture players close.

Limits:

- `diagnostics.autoScroll()`/`pluginPlayer()` prove controlled state and
  viewport changes. Trusted key/button execution is recorded separately.
  All fixture AudioContexts were `suspended` with `currentTime:0`; natural
  listening progression and perceived animation remain NOT TESTABLE.
- The original fixed-wait rows in `107-09`/`107-11` could sample a PDF while
  its selected iframe was still `hidden`. The focused boundary diagnostic now
  requires selected/nonminimized/visible state and records a bounded timeline;
  both disputed rows recovered under that precondition.
- Static DOM labels are checked for equality with their own tooltip and the
  diagnostic A/M state; translated wording is recorded verbatim.

Runs:

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-16 / 1.12.12-beta | Full manual-follow baseline through cleanup; all scripts ran, with the single PDF/outside later-visible finding above | `2026-09-16-1.12.12-beta-player-following-full` |
| 2026-09-16 / 1.12.12-beta | Three fixture kinds, A/top/B layouts, pause retention, explicit M/A, stale old pref, two-reader isolation and close/reopen; all checks PASS | `2026-09-16-1.12.12-beta-player-following-ui4` |
| 2026-09-16 / 1.12.12-beta | Trusted Shift+Enter, previous/next sentence and previous/next paragraph in PDF, scrolled EPUB and paginated EPUB; all expectations PASS | `2026-09-16-1.12.12-beta-player-following-shortcuts2` |
| 2026-09-16 / 1.12.12-beta | Direct-versus-trusted return comparison and real play-button resume; all expectations PASS | `2026-09-16-1.12.12-beta-player-following-return-compare2` |
| 2026-09-17 / 1.12.12-beta | Narrow PDF boundary diagnostic with selected/visible preconditions and assertion; fixed and gated resume plus later-visible reentry PASS | `2026-09-17-1.12.12-beta-player-following-boundary2` |
