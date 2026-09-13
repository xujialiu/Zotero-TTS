# Voice-switch follow-up live scripts (issue #95)

These scripts are a focused follow-up for the high-risk checks left open by the
beta3 run. They were executed through the `zotero-dev` bridge against Zotero
`10.0.2-beta.9+c77df79af` on Windows with Zotero-TTS `1.12.5-beta3`.

The verified XPI SHA-256 is `1A3458649503A75D8706E743D23F840E36FE257D76DDEF121DF0D107D98C4BE5` and the installed bundle SHA-256 is `CD9A1F786FCCC6A24891F9705B177006765669FA1A138F8F3284AD023FF13721`. No install, rebuild, production edit or paid synthesis is part of this run.

Run the files in this order in one Zotero session:

1. `00-setup-and-helpers.js` refreshes the exact preference baseline, disables WebDAV sync and automatic upload, mutes Read Aloud, seeds a temporary fixture voice, and defines all helper state in `Zotero.__ztts95Followup`.
2. `01-open-fixture-a.js` and `02-open-fixture-b.js` import the existing `test/fixtures/fixture-a.pdf` and `fixture-b.pdf`. A short wrapper around the current `_readers.push` installs a guard only on the new reader instance; each guard builds a separate native remote and clones every response into that reader's iframe window.
3. `03-open-popups-and-prepare.js` opens both players, loads four valid `standard` voices with `segmentGranularity: 'sentence'`, and leaves both sessions paused at segment zero.
4. `05-enable-independent-playing.js` replaces only each fixture's `onSetReadAloudStatus` callback so Zotero's single-playing-tab policy cannot pause the other fixture. It activates both managers with `activate`/`repositionTo`/`play` and records their native controller and audio clocks.
5. `03-word-handoff-and-pdf-highlight.js` invokes `diagnostics.voiceSwitch(1, fixtureIndex)` and records the delayed target request, native source stop calls, the handoff diagnostic, active word timestamp, and the rendered PDF display-list rectangle mapped from the source word position.
6. `04-shared-voice.js` invokes the same diagnostic path with `sameForAllDocuments` on, off, and on with a paused recipient. The setup requires both managers to be active and unpaused for the playing-recipient case.
7. `06-armed-stop-return-cancel.js` waits for the `word` arm and then invokes `diagnostics.voiceSwitch(-1, fixtureIndex)` to return from the pending target to the currently selected voice. It records both numeric `stop(when)` calls.
8. `07-cancellation-actions.js` checks pending cancellation for speed, sentence skip, manual voice selection, and deactivation. These actions are independent of the audio sink and are PASS when the pending target is cleared and the delayed target never plays.
9. `08-cleanup-and-restore.js` pauses and closes both players, waits for delayed responses, restores fixture-only slots and callbacks, erases only the two imported items, restores temporary memory and the native voice map before re-enabling transport, and verifies the user's reader, preferences, position store, and debug storage.
10. `09-autoplay-setup.js`, `10-autoplay-context-probe.js`, and `11-autoplay-cleanup.js` run the bounded autoplay diagnostic in a separate new fixture reader. The probe creates one disposable context synchronously inside a trusted `F24` key handler and another after 120 ms in the same visible reader, records user activation and clock state, then the cleanup closes both contexts and restores the tab, fixture item, and transport preferences.

The test machine created active native controllers, but both fresh fixture
`AudioContext` instances stayed `suspended` at `currentTime: 0`, including after
trusted `Shift+Space`, `notifyUserGestureActivation`, and bounded `resume()`
attempts. Therefore word-boundary commitment, shared playing-recipient adoption,
and armed-stop rescheduling remain `NOT TESTABLE` in this run. The cancellation
actions do not require a moving clock and were observed as PASS.

The autoplay diagnostic's synchronous key handler observed
`event.isTrusted: true`, `navigator.userActivation.isActive: true`,
`document.hasFocus(): true`, and `visibilityState: visible`. Both the synchronous
and delayed contexts still had unresolved `resume()` calls and a frozen clock.
This rules out loss of the only user gesture as the sole explanation for the
voice-switch context failure, but does not identify the remaining browser audio
backend or device cause.

All temporary state is fixture-scoped. Do not run a second setup until the
cleanup script has completed or Zotero has been restarted.
