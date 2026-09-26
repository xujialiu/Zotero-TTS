# Scripts: voice switching (issues #95, #108, #149)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issue #149 beta5 verification

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `149-00-baseline-and-isolate.js` | Private baseline and dedicated WebDAV isolation | Destination matches; transports idle; OpenReader Position absent; host minimized | private `Zotero.__ztts149` |
| `149-01-mute-and-import-fixtures.js` | Mute, suspend writes, import PDF/EPUB | Volume 0; two disposable items; sync switches false | `fixturesDir`; private fixtures |
| `149-02-open-fixtures.js` | Open both fixture readers | Managers exist; owner session untouched | private fixture state |
| `149-06-destroy-and-clear-selection.js` | Ended-session precondition at segment 2 | Active manager, null selection, no controller, Engine `ended:true` | seeded PDF player |
| `149-07-open-provider-menu.js` | Actual provider picker | Fish Audio and System rows | seeded PDF player |
| `149-08-system-voice-recovery.js` | Albert recovery and Play | Paused controller at segment 2; zero pre-Play requests; target audio after Play | PDF player |
| `149-09b-finish-live-handoff.js` | Ordinary playing Fish handoff | `carriedOn` increases; same segment; no recovery | playing PDF session |
| `149-10-stale-unpaused-samantha.js` | Direct stale-unpaused mechanism | Samantha rebuilds paused at segment 2 with no pre-Play requests | PDF fixture; diagnostic count not graded |
| `149-11-stale-ui-ava.js` | Stale-unpaused player row | Ava rebuilds paused at segment 2; no pre-Play requests | PDF player |
| `149-12-same-voice-retained-ava.js` | Retained-ID same-voice row | Same Ava pick rebuilds paused at segment 2 | PDF player |
| `149-13-stale-ui-samantha.js` | Stale-unpaused Samantha row | Samantha rebuilds paused at segment 2; no pre-Play requests | PDF player |
| `149-99-cleanup-and-restore.js` | Fixture, records, transports, prefs, host teardown | Fixtures gone; exact named state restored; host minimized | private baseline |

Before installing beta5, run `149-00` and require matching test WebDAV,
suspended switches, settled transports, and no OpenReader Position add-on. Run
the install/list/startup check, then `149-01` and `149-02`. The player seed is a
foreground step: select the PDF, call its `_loadSDT()`, open and pause Read
Aloud, wait for 538 voices/17 segments, choose an English Fish voice, pause,
and restore the exact baseline `readAloud.memory`. This seed remains manual
because the first scripted refresh encountered a stale closed EPUB wrapper; no
untested replacement script is claimed. `149-06` onward assumes that state.

The run used PDF `Z4PND7VY` and EPUB `3Q89U6MX`. It never played or repositioned
the owner reader. A request wrapper did not survive the native interface rebuild
(`installed:false` by identity); Engine session store counts are authoritative.

### Exact field results

| Variant | Actual action | Precondition | After pick | Requests / result |
| --- | --- | --- | --- | --- |
| Albert (`149-08`) | System provider row, Albert row, then Play | `selected:null`, active/paused, controller false, ended true, position 2 | Albert controller true, paused, ended false, position 2 | Engine store 0 before Play; after Play `requests:8`, `clips:8`, `timings:8`; capture later saw position 6. Wrapper calls were empty, so its `requested:false` is not used. |
| Ava stale (`149-11`) | System Ava voice row | `selected:null`, active true, paused false, controller false, ended true, position 2 | Ava controller true, paused, ended false, position 2 | Engine requests 0; wrapper calls 0; PASS |
| Ava retained (`149-12`) | Same Ava row after controller destruction | Ava retained, active/paused, controller false, ended true, position 2 | Same Ava controller true, paused, ended false, position 2 | Engine requests 0; wrapper calls 0; PASS |
| Samantha stale (`149-13`) | System Samantha voice row | `selected:null`, active true, paused false, controller false, ended true, position 2 | Samantha controller true, paused, ended false, position 2 | Engine requests 0; wrapper calls 0; PASS |
| Direct Samantha (`149-10`) | Chrome `manager.selectVoice`, no player row | Same stale-unpaused shape | Engine rebuilt and paused at position 2, zero requests | Mechanical PASS, but recovery counter did not advance; excluded from the four UI recoveries. |

The stable `voiceSwitch()` report after the UI variants was
`notice:"selected"`, `recoveries:4`: Albert, stale Ava, retained Ava, and
stale Samantha. Its retained `last` trace belonged to the earlier ordinary
Fish handoff. That control changed Fish `en/9fa4…` to Abel `en/8634…` while
`playing:true` at position/currentIndex 2; after commit it remained at position
2, with `carriedOn` `1→2`, target store `requests:4`, `clips:4`, `inflight:0`,
and no recovery.

The inline per-script `switchOf()` helpers filtered diagnostic rows by
`itemID`, although `voiceSwitch()` identifies rows by array index; their
`switch:null` fields are therefore not evidence. The aggregate direct query
above is authoritative. Likewise, `documentVoices().records` are JSON strings;
the helper's normalized per-script record fields were null, so the direct
record values stated below are the evidence.

The first stable `documentVoices()` comparison showed global default
`local::af_bella`, PDF fixture Albert `manual:true`, and EPUB
`local::af_bella` `manual:false`; later manual choices stayed on the PDF
record. Cleanup erased both fixture records and restored the prior records.

Cleanup passed with `fixtureReadersRemaining:0`, `fixtureItemsRemaining:0`,
`pendingClean:true`, volume `100`/user `false`, exact memory (62 chars) and
native voice map (1257 chars), WebDAV destination/switches restored, and host
minimized. The after position-store row count was 85, but the baseline count
was not captured (`null`), so row-count equality is not claimed. Restoring
switches logged settings sync `72 remote, 0 applied/deferred/pushed/skipped`,
shared positions `16 remote, 16 merged, 0 adopted/dropped`, and positions
`100 remote, 100 merged, 0 adopted/dropped`.

One diagnostic-only dead-object error occurred before stale-wrapper pruning:
`TypeError: can't access dead object` at
`.../zotero-tts@xujialiu.top.xpi!/content/zotero-tts.js:18117:5`, stack
`readAloudManager (18117:5) → voiceSwitch/<.readers (19752:19) → voiceSwitch
(19750:27)`. Removing the stale EPUB wrapper made `diagnostics.voiceSwitch()`
return normally; Engine recovery/audio state was unaffected. Zotero's own
reader dead-object, locale, and guidance-panel messages also remained in the
final error ring.

The legacy `native-*`, `108-*`, and `kokoro-*` scripts remain in this folder
as historical checks. The [independent #108 beta2 report](https://github.com/xujialiu/Zotero-TTS/issues/108#issuecomment-5674194936)
records their last verification: six `108-*` scripts, all PASS, with PDF
resume offset .700 and EPUB .830; the provider group proved abort and
ordinary-request isolation. Those checks were not rerun for #149; their
earlier run order and preparation remain in repository history. This README records the current #149 run and its preparation gap.

## Run

[Verification table and limitations](https://github.com/xujialiu/Zotero-TTS/issues/149#issuecomment-5845582557).

2026-09-26 · 1.15.2-beta5 · XPI `218e2bb7…` · bundle `f1101efa…` · startup,
four UI recoveries, ordinary handoff, cleanup PASS. The run does not establish
which upstream action originally ended the session, and subjective voice
quality/handoff gap remain human checks.
