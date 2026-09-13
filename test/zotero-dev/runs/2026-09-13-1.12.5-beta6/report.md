# Issue #95 beta6 real Kokoro verification

Build: 1.12.5-beta6 (build/zotero-tts.xpi SHA256 629610EC32F3C274E5CB0F396C0783C3EA1542905AA3A092ECAC96114410B74A; installed bundle SHA256 7DFDAADF70E3F0B98938B03558E9C948A74690A7F88396669F29E5E2C28AF399). Zotero was 10.0.2-beta.9+c77df79af on Windows. The configured local provider was the user's Kokoro server; headers were never printed.

| Check | Observed | Expected | Result |
| --- | --- | --- | --- |
| Install and startup | Plugin list showed 1.12.5-beta6; diagnostics.startup() returned 23 steps ok, failed: [] | Exact beta6 build installed and startup clean | PASS |
| Real Kokoro list | 30 filtered local:: voices; old local::af_jadzia, next local::af_jessica; sentence granularity | Two real voices from the current filtered list | PASS |
| Physical old clock | Trusted Shift+Space started fixture audio with running native context and source at segment 7 | Old audio is playing before the handoff request | PASS |
| Forward word handoff | Target controller/request at 124 ms; audioReady at 313 ms while old segment 7 still played (playingIndex:7, progress 0.6528, 24/24); decision shared-word-boundary; old source stop 0.5391666666666666; target native play on segment 7 at offset 1.000375, charStart 20 (by) | Old audio continues during preparation, then target starts at the next safe shared word boundary | PASS |
| Reverse word handoff | Target controller/request at 130 ms; audioReady at 148 ms while old segment 7 still played (playingIndex:7, progress 0.432, 24/24); decision shared-word-boundary; old source stop 0.37198611111111113; target native play on segment 7 at offset 0.6205, charStart 14 (skips) | Previous voice follows the same prepared native handoff path | PASS |
| Native adoption and request discipline | Both directions: pending:null, stage:committed, prepared:[7], last.kind:word, same segment and sourcePosition, shared segment array, one target segment request, no sample; patchErrors:[] | Prepared controller is adopted without duplicate/skipped segment or sample work | PASS |
| Cleanup | Fixture reader/item 0; user tab tab-B6Gfh9ig; user reader active/paused at position 530 on local::af_jadzia; rows 66, queue 0; all snapshotted preference values and user flags restored | No fixture, pending request, temporary pref, or user state change remains | PASS |
| End errors | No plugin errors; only three locale resource warnings and one fixture-close InvalidStateError: Navigated away from page | No new plugin error | PASS (known Zotero noise only) |

The controlled sentence was fixture A segment 7 (132 characters): A reader that skips by paragraph should land here, at the beginning of the second paragraph, and then at the beginning of the third. The complete beta6 old/new timestamp arrays and decoded durations (6.696 seconds for local::af_jadzia, 6.432 seconds for local::af_jessica) are in evidence.json.

The forward response arrived while the old voice was reading `skips`, so the matcher chose its end at 0.9704999999999999 and the target's `by` onset at 1.000375, charStart 20. The forward `oldWordEnd` summary is derived from the retained `skips` timestamp; it also agrees with the source stop time 0.5391666666666666 at speed 1.8. The reverse response arrived earlier and chose old word end 0.650375 to target offset 0.6205, charStart 14 (skips). The old source remained alive at both readiness observations, and the target contexts were running.

This beta6 run directly confirms that the beta5 failure was caused by rejecting the negative leading start. The beta6 arrays still contain the provider's small negative first start (-0.004500000000000004 for af_jadzia), while later starts are ordered; both directions nevertheless produce a word handoff. No numeric request was repeated; the real numeric/phrase response is retained in the beta5 evidence.

The copied scripts that actually ran are under scripts/voice-switch-kokoro-beta6/README.md. They use the real provider and the clean cache polling instrumentation; no reader-realm promise was wrapped. No production source was changed during this verification.
