# Scripts: voice switching (issues #95 and #108)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `native-00-startup-diagnostic.js` | Startup | Installed beta version, all steps `ok`, no failed step | none |
| `108-00-baseline-and-fixtures.js` | Named prefs, mute/sync isolation, fresh PDF/EPUB | Two fixture items, volume 0, original user flags retained | `params.fixturesDir`, `state.baseline/fixtures` |
| `108-01-open-and-native-transport.js` | Native sentence-granularity transport and attached controls | Both native managers ready on A; `controlsAttached:true`; fixture-only transport | `state.fixtures/transport` |
| `108-03-mixed-selections-and-failure.js` | Latest popup/locale/tier/shortcut target, pause, original re-pick, failure | Pending B -> GB -> P1 -> B; re-pick cancels without restart; failure retains original paused controller | Run before `108-02`, on the initial A voice |
| `108-02-popup-locale-tier-parity.js` | Actual popup pointer-up, ready paused resume, locale and tier transitions | PDF/EPUB resume at char 7, offsets 0.700/0.830; GB and Premium GB hand off within the same sentence; prefs unchanged during preview | `state.transport`; results also in `state.parityResults` |
| `108-07-resume-boundaries.js` | Play before audio is ready; missing timing; grouped paused word | Original resumes first; late audio uses a word boundary; unsafe alignment switches only at next sentence, offset 0; source position retained | `state.transport`; results also in `state.boundaryResults` |
| `108-99-cleanup-and-restore.js` | Fixture, transport, prefs and notice teardown | No fixture items/readers; owner/tab stable; 28 prefs and user flags restored; no dead-object console error 5.5 s after closing a visible notice | `state.baseline/fixtures/transport` |
| `kokoro-00-baseline-snapshot.js` | Named provider baseline | Original enabled flag, endpoint, headers and user flags retained in process only | `Zotero.__ztts95Kokoro` |
| `kokoro-01-disable-sync-and-mute.js` | Isolate configured Kokoro test | Volume 0; sync/upload off; configured Kokoro temporarily enabled | Kokoro baseline |
| `kokoro-02-open-fixture.js` | Fresh real-provider fixture | Native manager, sentence segments and listed local voices | `params.fixturesDir`, Kokoro baseline |
| `108-04-kokoro-real-probe.js` | Correct native `voice.impl` request | Real audio bytes/timestamps, bounded to 15 s; optional warmer disabled during probe | Kokoro fixture |
| `108-05-provider-signal-cancellation.js` | Real plugin adapter with controlled fetch | Target fetch signal aborts; no obsolete response/play; subsequent same-text request succeeds | Kokoro fixture; all fetch/pref shadows restored |
| `kokoro-05-cleanup-and-restore.js` | Real-provider cleanup | Fixture removed; endpoint, headers, flags, memory, volume, tab and sync restored | Kokoro baseline |

## Run order and precautions

- Load the shared runner, verify the exact XPI/bundle identity and startup,
  then run `108-00`, `108-01`, `108-03`, `108-02`, `108-07`, `108-99`.
  Stop on a failure, inspect the stored result and always run cleanup.
- The provider group runs `kokoro-00`, `kokoro-01`, `kokoro-02`, `108-04`,
  `108-05`, `kokoro-05`. Keep it separate from the silent native group.
- All work uses new fixture items. Never play, pause, close or reposition an
  owner's reader. Native transport interception is restricted to fixture IDs.
- Use document user activation and a bounded `AudioContext.resume()` before
  measuring an old context created by an untrusted popup open. A running
  context with a paused manager is not evidence of a missing audio device.
- The catalog uses `sentence`, matching production. The Premium pool includes
  a GB voice for the GB-to-Premium test; a US-only pool cannot resolve GB.
- The real probe must pass `voice.impl`, as the native controller does.
  Passing a native voice wrapper can hide its getters across compartments.
  Disable optional warming for the probe so its next request cannot be
  mistaken for the signal-test target.
- Sync/upload are disabled before preference changes and restored last. Keep
  original volume and user-value flags; never replace a resumed run's baseline
  with its temporary zero. Only sanitized summaries leave process state.
- A runner exception stops the group, but a script returning `status: FAIL`
  also needs explicit review before continuing. Retain no failed result as PASS.

## Scope and limits

The #108 checks use real native managers/controllers and silent fixture audio,
plus real Kokoro response bytes and the plugin's actual fetch signal. They
prove controller adoption, audio offsets and source positions, not subjective
listening continuity or every provider's alignment accuracy. Native official
services expose no network abort API; their obsolete results cannot play, but
submitted requests and quota cannot be recalled. Timer exhaustion, output-start
cancellation races and shared-voice propagation also have unit coverage.

The older `native-*` scripts are historical #95 transport/key checks; their
`word` catalog granularity does not establish production word highlighting.
Other legacy script families retain their original context and must be adapted
before reuse; they are not part of the #108 final group above.

## Runs

[The final tester result table](https://github.com/xujialiu/Zotero-TTS/issues/108#issuecomment-5674194936)
records the independent beta2 rerun, provider results and notice teardown
correction, including the single-playing-reader limitation for item 7.

- **2026-09-15, 1.12.10-beta2:** `2026-09-15-1.12.10-beta2-voice-switch-final-r3`
  ran all six `108-*` scripts: every row PASS, including both-format word
  resume (`PDF .700`, `EPUB .830`), GB locale, Premium GB tier, six boundary
  scenarios and notice teardown (`deadObjectErrors:[]`).
- **2026-09-15, 1.12.10-beta2:** `2026-09-15-1.12.10-beta2-voice-switch-provider-r3`
  ran the Kokoro group: real probe `48044` bytes/5 timestamps in `170 ms`,
  provider signal abort and ordinary same-text request PASS, cleanup PASS.
- **2026-09-15, 1.12.10-beta2:** `2026-09-15-1.12.10-beta2-voice-switch-native-r3`
  ran `native-00` through `native-16`; all 17 scripts PASS for the existing
  regional/menu/key, word/sentence, cancellation and overtaking regressions.
  XPI SHA-256 `C2366AA8B3ABF1DD6035271BF9B46FD4605EEDC5C090F54299038A2E2EA0A957`;
  bundle `3150FD3B774D20B330EB5D032E3600E080C1C6092B36AC9CFF394B481E6A4939`.
