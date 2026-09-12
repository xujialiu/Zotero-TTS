# Issue #81 live verification — 1.12.3-beta

Status: core live checks and focused follow-up completed. No feature failure
was found in the completed checks. Reported by `zotero-tester`; this file
distinguishes measurements from remaining work and cleanup incidents.

## Identity

- XPI: `build/zotero-tts.xpi`, version `1.12.3-beta`.
- SHA-256: `8b5f2eb5cb9b2a3ba53f4866d9f296e247aeaae954ce27cf92d531ad5ff430c8`.
- Zotero: `10.0.2-beta.9+c77df79af`; Firefox 140; Windows.
- Startup: all 21 steps `ok`, `failed: []`.
- Scope: baseline and section 3e; not the whole plugin checklist.

## First pass

| Check | Observed | Status |
| --- | --- | --- |
| Default off | Toolbar and trusted Shift+Space opened collapsed; clicked/expanded/pending false | PASS |
| PDF opening | Gate preceded popup; first visible sample at 24 ms was expanded and ready; pending false | PASS |
| EPUB opening | Trusted shortcut delivered; first visible sample at 49 ms was expanded and ready | PASS |
| Separate window | Correct reader window finally expanded, ready, clicked; pending false | PASS for final state |
| Manual Options and Shift+O folding | Expanded became false; ready stayed true; no repeated automatic click | PASS |
| Reopening after manual fold | PDF expanded again, sampled at 26 ms | PASS |
| Disable with existing expanded popup | Stayed expanded; active/paused unchanged; stylesheet emptied | PASS |
| Next opening while disabled | Collapsed, clicked false, outcome unchanged | PASS |
| Enable with existing collapsed popup | Stayed collapsed; no click | PASS |
| Disable during initialization | With a nonresponding click, pending/hidden at 22 ms became visible/ready/not pending on disable | PASS |
| First visible samples, PDF/EPUB | No collected visible sample preceded expanded/ready | PASS for sampled states only |
| Separate-window first visible samples | Harness matched duplicate itemID to the tab instead of the window | PENDING corrected sampling |
| New readers and close cleanup | Temporary readers attached, then disappeared on close | PASS |
| Installation/reload with an existing popup | Not exercised in this pass | PENDING |
| Playback state | Voice and speed retained; normal synthesis/prefetch logged; no subjective listening | PASS for observed state only |
| Native quota reminder | Not triggered | NOT TESTABLE in this pass |
| Missing/throwing button and timeout failures | Automated coverage only in this pass | PENDING live recovery checks |

## Follow-up results

Actual [scripts and outputs](follow-up-evidence.md) and
[reuse instructions](../../scripts/player-expanded-follow-up/README.md)
are preserved separately. The same XPI was tested; no code changed.

| Check | Observed | Status |
| --- | --- | --- |
| Separate-window first visible sample | Unique ReaderWindow instance; 41.9 ms sample already visible/expanded/ready | PASS for sampled state |
| Duplicate-attachment tab | Distinct ReaderTab instance; 342.7 ms first visible sample already expanded/ready | PASS for sampled state |
| Missing Options button | Synthetic popup in live fixture document changed hidden to visible/ready; failure reported | PASS |
| Throwing Options property access | Handler ran, disabled gate and changed stylesheet text length 84 to 0 | PASS for mechanism only |
| Exception-path visible recovery | Harness itself detached stylesheet before final visibility read | NOT independently established live; unit coverage retained |
| Noncommitting Options click | Hidden/pending before timeout, visible/ready/not pending by 1,180 ms sample | PASS |
| Existing popup across plugin reload | Expanded/visible/ready retained; outcome existing, clicked false; manager active/paused/voice/speed unchanged | PASS |
| Startup after reload | 21 steps passed | PASS |
| Fixture cleanup | No owned readers or attachment left; position rows 65 | PASS |
| Original transport restoration | autoUploadSettings and syncPositions true with user values; syncSettings false without user value | PASS |

Open-expanded ended false without a user value. Restoring original
transports triggered one normal upload, which settled with pending false,
uploads 1 and no error. Plugins Manager disappeared during reload and was
not reopened; the user's reader/main view also changed during the run, and
the tester did not force an old tab snapshot back. Final reader count was 0.

The follow-up did not snapshot or compare the raw `reader.readAloudVoices`
and `readAloud.memory` preferences. Its scripts did not directly write them;
the reload comparison covered manager state only. Full preference equality
after the follow-up is therefore not verified, even though the first pass
reported equality when restoring its snapshot.

Native quota reminders, direct document-access fault injection, subjective
audio quality, and perceptible flash/delay were not tested live. A separate
install-with-existing-popup path was not repeated; the reload path above
was exercised. Expected injected errors appeared, alongside autoplay/audio
environment and locale noise; no unexpected plugin failure was reported.

Final-state diagnostics and sampled frames do not establish the absence
of a perceptible flash or acceptable delay; those remain human judgments.

## Cleanup and side effects

- Two temporary attachments and their readers were removed. Position
  database count was 65 before and after cleanup.
- Open-expanded ended false without a user value. Native voice preferences
  and plugin memory were restored from the tester's snapshot.
- The first cleanup left three WebDAV switches false without user values.
  This was not the original baseline; see the restoration correction below.
  Debug storage was restored to on. Main window and the preexisting Plugins
  Manager remained.
- The user reader changed identity during the pass. The tester reports
  not closing or reopening it; its original tab was not claimed restored.
- **Restoration correction:** the original snapshot was created once, before
  any preference writes, and was never overwritten. It held
  `autoUploadSettings=true` and `syncPositions=true`, both user values;
  `syncSettings=false` had no user value. A failure to await the position
  diagnostic prevented the snapshot summary from printing, but did not
  invalidate the already-captured values. The tester mistakenly treated a
  later read of the temporarily disabled switches as the original baseline.
  Its first restoration correctly wrote both original true values back;
  its subsequent manual clear incorrectly removed them. Follow-up cleanup
  must restore those two true user values after all test state is gone.
- A log entry confirmed one upload of 73 settings when auto-upload was
  restored to its original enabled state. Open-expanded was already false
  without a user value at upload time. This was expected behavior on
  restoring that switch, not evidence that it was originally disabled.
  The log does not establish the entire uploaded payload.
- Final error buffer held 62 entries, with no `[zotero-tts]` error or
  `zotero-tts.js` stack reported. Harness/environment errors included an
  invalid pause-method call, fixture navigation during close, missing locale
  resources, and an InstallTrigger deprecation. No dead-object burst reported.

The first pass used inline scripts. The actual source for five successful
checks/cleanup operations is archived with
[reuse precautions](../../scripts/player-expanded-first-pass/README.md).
The failed snapshot report and erroneous cleanup sequence are retained as
non-executable evidence in `harness-evidence/`; neither is a reusable method.
