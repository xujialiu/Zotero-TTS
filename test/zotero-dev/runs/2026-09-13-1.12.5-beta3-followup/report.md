# Issue #95 follow-up live verification — 2026-09-13

## Result table

| Check | Observed | Expected | Status |
| --- | --- | --- | --- |
| Build identity | Zotero `10.0.2-beta.9+c77df79af`, Firefox 140, Windows; Zotero-TTS `1.12.5-beta3`; XPI SHA-256 `1A3458649503A75D8706E743D23F840E36FE257D76DDEF121DF0D107D98C4BE5`; bundle SHA-256 `CD9A1F786FCCC6A24891F9705B177006765669FA1A138F8F3284AD023FF13721` | Run against the exact installed beta3 build | PASS |
| Fixture setup and realm isolation | Fresh fixture A/B readers used fixture-only instance guards. Their iframe windows were distinct; each native remote cloned its own responses into its own window. Both exposed four valid `standard` voices, `en-US`, and `segmentGranularity: sentence`. A fixture-only status callback guard kept both managers `active:true, paused:false` after activation. | Two independent native fixture controllers are active and independently scoped | PASS (setup) |
| Native word handoff and PDF word highlight | A stayed on `followup95-a` during preparation; target `followup95-b` was requested once. The fresh target context remained `suspended`, so no word arm, numeric old-source stop, controller adoption, or target play occurred. Before the attempt, active word timestamps and PDF state were real: A's source word `Zotero` and later `A` had `primaryIdentity:true`; the transformed source rectangle matched the PDF page display-list rectangle colored `#3478f6b3`. | Old audio reaches the scheduled word end, then the prepared native controller starts at the next word's target offset and highlights that word | NOT TESTABLE — both fresh fixture `AudioContext` objects stayed `suspended` at `currentTime: 0` |
| Shared voice, `sameForAllDocuments=true`, two playing fixtures | After the fixture-only guard, A and B were both `active:true, paused:false`, each with its own controller and source. A's diagnostic request left A at `followup95-a`, `pending:followup95-b, stage:preparing`; B stayed at `followup95-a` with no target request because A never reached a boundary. | A commits at its boundary; B prepares independently and adopts the target at its own boundary | NOT TESTABLE — clocks did not advance, so no commit could occur |
| Shared voice, `sameForAllDocuments=false`, two playing fixtures | A and B were both `active:true, paused:false`. A remained on `followup95-a` with the delayed target pending; B remained on `followup95-a` with no target request. | A may switch locally; B retains its voice | NOT TESTABLE — clocks did not advance, so the local commit path was not reached |
| Shared voice, `sameForAllDocuments=true`, paused recipient | A was `active:true, paused:false`; B was `active:true, paused:true`. A remained on `followup95-a` with the delayed target pending; B remained on `followup95-a`, with no target request or immediate resync observed before A could commit. | A prepares while playing; a paused recipient stays silent and receives no sample; adoption is checked only after the source selection commits | NOT TESTABLE — clocks did not advance; no ordinary immediate-resync result was counted as a pass |
| Armed-stop cancellation by return-to-current | A remained `active:true, paused:false` with target preparation pending. The normal `diagnostics.voiceSwitch(-1, fixtureIndex)` returned to `followup95-a`, changed the handoff to `stage:cancelled, pending:null`, and left `stopCalls: []`; no word arm existed, so no later numeric reschedule could be compared | After `stage:word`, return-to-current clears pending work and records a later numeric `stop(when)` beyond the first one | NOT TESTABLE — no word arm was possible |
| Pending cancellation: speed | After a delayed `followup95-b` request, `manager.setSpeed(1, false)` synchronously changed the diagnostic to `stage:cancelled, pending:null`; target request count stayed at 1 and the old controller remained alive | Speed action cancels pending preparation and stale target audio never plays | PASS |
| Pending cancellation: sentence skip | `manager.skipAhead('sentence', false)` synchronously cancelled pending work. Position moved to 1; target request count stayed at 1 and the old controller remained alive | Skip action cancels pending preparation and stale target audio never plays | PASS |
| Pending cancellation: manual voice pick | `manager.selectVoice('followup95-c')` synchronously cancelled pending `followup95-b`; selected voice became `followup95-c`; no stale target played. The old controller was destroyed by the ordinary manual pick | Manual voice selection cancels pending preparation before applying the user's choice | PASS |
| Pending cancellation: deactivate | `manager.deactivate()` followed by fixture popup close produced `active:false, paused:true, popupOpen:false, stage:cancelled, pending:null`; delayed target count stayed at 1 | Deactivation removes pending work and stale results never play | PASS |
| Cleanup and restoration | Fixture readers A/B and imported items were absent after cleanup. Fixture instance methods, remote slots and status callbacks restored successfully. Position store returned to `rows:66, queued:0, lastError:null`. The original user reader remained `active:true, paused:true`, Fish voice, position 517. All snapshotted values and user-value flags matched; `volume=100/user:false`, `sameForAllDocuments=true/user:false`, `globalSpeed=true/user:false`, `syncPositions=true/user:true`, `autoUploadSettings=true/user:true`, and `syncSettings=false/user:false`. | No fixture, pending controller, injected method, temporary preference, or upload state remains | PASS |
| Error review | The final error ring contained two expected plugin errors, `Zotero-TTS: the new voice audio output is blocked`, from the bounded suspended-context attempts. It also contained one plugin `can't access dead object` at 03:04:17 from a late fixture toast timer, and one discarded harness `ReferenceError: mainWindow is not defined` at 03:10:33; neither repeated in the autoplay setup/probe/cleanup replay. Other entries were older background sync/HTTP 502, fixture page teardown, and Zotero UI cleanup noise. | Report plugin errors separately from known harness/Zotero noise | PASS with recorded harness noise |

## Autoplay cause diagnostic

The separate bounded probe used a new visible fixture reader. Its `F24`
keydown handler observed `isTrusted:true`, `navigator.userActivation.isActive:true`,
`document.hasFocus():true`, and `visibilityState:'visible'` while it synchronously
constructed and called `resume()` on its first disposable context. A second
context was constructed after 120 ms in the same reader; `userActivation` was
still active when it was created. Both contexts stayed `suspended` at
`currentTime:0`; both resume promises remained unsettled through 1.5 s. The
autoplay prefs were `media.autoplay.default=1/user:false`,
`media.autoplay.blocking_policy=0/user:false`,
`media.autoplay.allow-extension-background-pages=true/user:false`, and
`media.autoplay.block-event.enabled=false/user:false`; the other checked
`media.autoplay.*` names were unregistered.

This rules out losing the only input activation when production voice switching
creates its target controller from a timer as the sole explanation: the
synchronous context was created by a trusted handler while activation was
active, and the delayed context still reported activation active. It does not
identify whether the remaining block is an audio backend/device condition or
another browser policy; the probe therefore remains NOT TESTABLE for
clock-dependent handoff behavior.
The exact setup/probe/cleanup scripts are [09](scripts/09-autoplay-setup.js), [10](scripts/10-autoplay-context-probe.js), and [11](scripts/11-autoplay-cleanup.js).

## Reproducible scripts

The scripts that ran are under [test/zotero-dev/runs/2026-09-13-1.12.5-beta3-followup/scripts](scripts/README.md):

- `00-setup-and-helpers.js` — refreshed the baseline, disabled transport, muted playback, and defined the per-fixture native remotes.
- `01-open-fixture-a.js`, `02-open-fixture-b.js`, and `03-open-popups-and-prepare.js` — imported the two existing PDFs, opened their readers, loaded the controlled catalog, and prepared paused sessions.
- `05-enable-independent-playing.js` — installed the fixture-only status guards and proved both managers could remain active and unpaused simultaneously.
- `03-word-handoff-and-pdf-highlight.js` — invoked the normal `diagnostics.voiceSwitch(1, fixtureIndex)` path and captured native/PDF evidence.
- `04-shared-voice.js` — exercised the normal diagnostic path with shared voice on, off, and a paused recipient.
- `06-armed-stop-return-cancel.js` — attempted return-to-current cancellation after the word arm.
- `07-cancellation-actions.js` — checked speed, skip, manual voice, and deactivate cancellation.
- `08-cleanup-and-restore.js` — restored methods, callbacks, preferences, transport and the user's reader state, then erased only the two imported items.

The exact executed bridge code is in those files. The test remotes generated deterministic silent 8 kHz WAV data and timestamps from the fixture text; no real speech request or paid synthesis was used. The fixture status guard is test setup only: Zotero's own `chrome/content/zotero/xpcom/reader.js:2164-2189` pauses every other reader when one reports unpaused playback, so the guard was required to exercise the plugin's deferred cross-reader path. It was removed and restored before close.

The valid catalog uses the same sentence-level catalog prerequisite as
`src/read-aloud/voice-catalog.ts:156-163`; the installed reader's
`resource/reader/reader.js:39933-39944` creates one `AudioContext` per native
controller, and `:40019-40049` maps the running context clock to source playback
and word timers. The target controller could be constructed, but its new context
never became `running`, so the plugin's `voice-switch.ts:121-166` word arm and
scheduled stop could not be reached.

## Restoration and remaining work

The machine's fresh fixture contexts were `suspended/0` in every probe. Direct
`AudioContext.resume()` with a bounded timeout, `document.notifyUserGestureActivation()`,
trusted `Shift+Space`, and a temporary silent-volume probe all failed to move
either context. The user's pre-existing reader retained a separate running
context, but it was not borrowed or modified. Re-run only the NOT TESTABLE rows
on a Zotero session where fresh audio contexts advance; a device failure has
not been established. The setup and PASS cancellation
scripts are reusable as written.

The run ended with the exact installed beta3 build, the temporary `readAloud.volume`
restored from 0 to 100 with its original user flag, all three WebDAV switches
restored last, and the debug store left `true` as found. No production source,
XPI, or installed plugin state was changed.
