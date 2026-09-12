# Issue #93 focused live verification

Environment: Zotero 10.0.2-beta.9+c77df79af, Windows / Firefox 140. The
installed XPI was `1.12.3-beta2`, SHA256
`71ff56127ccab80e470f8be54b901913e039ee47e030f61f6105ed5a481173db`; the
loaded bundle SHA256 was
`75629f16395afae2600320f0c0e2f67ad070dffcd5c5016299267726c15907c4`.
`diagnostics.startup()` reported 21/21 `ok` steps and an empty `failed` list.

| Behavior | Observed | Expected | Status |
| --- | --- | --- | --- |
| Highlight auto-scroll radio group | `Center each sentence` = `sentence`; `Scroll when outside the view` = `outside`; group value `outside`; preference binding present; default selected | Both localized choices are visible and the default is outside | PASS |
| UI preference propagation | Clicking sentence then outside changed the preference and diagnostics mode; the same manager/controller and paused state remained | Choice updates the preference/readers without replacing transport | PASS |
| Audio device probe | Trusted Shift+Space created `AudioContext.state=running`; clock advanced `0.112` to `1.72` while real Fish audio was active | Audio-driven checks use a moving real clock | PASS |
| PDF outside mode at old quarter-screen edge | Whole sentence height `39 px`, viewport height `997 px`; fully visible at `scrollTop=2914`; three state/word updates kept `scrollTop=2914`, delta `0`; last decisions were `reason:none`, `issued:false` | No movement while a fitting sentence is visible, including the old trigger zone | PASS |
| PDF outside mode when clipped | Whole-range decision was `reason:cut`, target `top=2634.104`, `issued:true`; actual `scrollTop` stayed `3130` after 1.6 s | Whole sentence target is centered/clamped; report target and actual movement separately | PASS (request); NOT TESTABLE (animated movement on this bridge) |
| Sentence mode with real audio | Fish audio clock advanced; controller positions were `51 -> 52 -> 53` over 6.5 s; all three sentence boxes fit; repeated ticks in a fitting sentence produced no new target (`reason:none`, `issued:false`) | New sentences request centering; repeated word ticks do not | PASS (mechanism and clock); NOT TESTABLE (animated pixels) |
| Trusted wheel manual intent | Wheel log `pdf follow: manual wheel`; diagnostics changed `following:true` to `following:false`, `reason:"wheel"`; `skipAhead('sentence')` and mode changes retained `following:false` | Manual navigation suspends follow and later sentences/mode changes do not reactivate it | PASS for later sentence/mode changes |
| Trusted PageDown on the PDF document | TIP bound to `view._iframeWindow` with the reader iframe's `KeyboardEvent` constructor; PDF window/document capture and bubble all saw `target=body`, `key=PageDown`, `isTrusted:true`, `defaultPrevented:false`; plugin log count increased by 1 and diagnostics became `following:false, reason:"keyboard"` | Manual PageDown suspends follow | PASS |
| PageDown native movement | Event left `scrollTop=6783`, `viewPage=2`, `currentPage=4`, `scale=2.2` unchanged; follow intent is proven, native page-turn pixels are not | Preserve intent while the native key may navigate | PASS (intent); NOT TESTABLE (native page-turn through this TIP route) |
| Resume after manual wheel | After the same trusted wheel, `m.play()` changed diagnostics from `following:false, reason:"wheel"` to `following:true, reason:"resume"` without a new user return command | Manual intent remains disengaged until Go to reading position/explicit return | FAIL |
| Cross-page/column and EPUB cases | Stopped at the manual-resume failure per workflow | Continue only after fix | PENDING |

Cleanup: own reader closed; original PDF bookmark at segment 51 and view state
pageIndex 2 / scale 220 / top 76 / left 90 restored; auto-scroll preference is
`outside` with no user value; memory speed/voice and voice list were unchanged;
position store reports 65 rows, no readers, queued 0 and `lastError:null`;
the settings window was left open as it was at baseline. The installed beta
remains in Zotero.

The final error ring contained two Zotero teardown `InvalidStateError:
Navigated away from page` entries, one Xray warning caused by the temporary
cross-compartment bookmark assignment during restoration, and one bridge
`c is null` probe error. No `[zotero-tts]` error entry was present in the debug
store. These are harness/teardown artifacts, not a plugin error finding.

The initial reader-UI PageDown probe was discarded: it bound TIP to
`reader._iframeWindow`, which is the reader UI parent rather than the PDF
document. Its body/key route did not reach the PDF follow listener. The
retained `pagedown-routing.js` probe binds TIP to `view._iframeWindow` and
constructs events with the reader iframe's `KeyboardEvent` constructor; that
probe is the PageDown evidence above.
