# Issue #93 focused live verification

Environment: Zotero 10.0.2-beta.9+c77df79af, Windows / Firefox 140. The
installed XPI was `1.12.3-beta3`, SHA256
`363716bcb613738b99eb23de93b6af2218af63b17e68a0c1cbbaa2188f67d37e`; the
loaded bundle SHA256 was
`3b602fa4c47e586fc07d21175b1cbf3a26cad332917c58523db793e71b4c76d5`.
The XPI was installed in place after the bridge ping and plugin list. Startup
reported 21/21 `ok` steps and an empty `failed` list.

Fixtures used during this focused pass:

- PDF attachment 25417, `Getting the scale right: ocular magnification, machine learning and optical coherence tomography angiography in high myopia` (`PDF`).
- EPUB attachment 25387, `ZTTS Return-Key EPUB`, the retained 60-paragraph fixture.

| Behavior | Observed | Expected | Status |
| --- | --- | --- | --- |
| Build identity and startup | Plugin list showed `1.12.3-beta3`; XPI and bundle hashes matched above; startup returned 21 `ok` steps and `failed: []` | The candidate is loaded and startup is complete | PASS |
| Baseline | No readers open; settings window open; position store `rows: 65`, `queued: 0`, `lastError: null`; mode `outside` with no user value; toggle `Shift+A` with no user value | Start from the recorded user state | PASS |
| Highlight mode radio binding | Labels `Center each sentence` / `Scroll when outside the view`; values `sentence` / `outside`; default selected `outside`; clicks wrote `sentence` then `outside` | Both choices are visible, bound, and outside is the default | PASS |
| Shortcut row | Row existed, was enabled, and displayed `Shift+A`; recorder accepted `Ctrl+Shift+F9`, clear wrote an empty value, and restoration returned the pref to default `Shift+A` with no user value | The default is customizable and clearable, then restorable | PASS |
| PDF audio device probe | Trusted Shift+Space selected the existing Fish voice; the controller clock was `running`, position reached `51`, and `currentTime` advanced from `0` to `1.250666...` during the probe | Audio-driven checks use a moving real clock | PASS |
| PDF outside mode, fitting sentence near old edge | At `scrollTop: 6900`, `scrollLeft: 282`, whole sentence `[282,7780.6,1548.9067,7874.4667]` fit a `997 px` viewport and was not cut; three state pushes stayed at top `6900`, left `282`; last decisions were `reason:none`, `issued:false` | A fitting sentence does not move, including in the old quarter-screen area | PASS |
| PDF outside mode, clipped sentence | At `scrollTop: 6799`, whole sentence fit vertically but was cut by the viewport; the target was `top: 7328.0333`, `reason:cut`, `issued:true`; the target stayed requested while `following:true` | The whole sentence is centered/clamped when clipped | PASS for target request; NOT TESTABLE for physical smooth movement on this bridge |
| PDF sentence mode with real audio | Fish playback clock advanced `380.192` to `384.6107`; controller positions were `56 -> 57 -> 58`; new entries produced sentence targets. With the current sentence placed exactly at its target, repeated samples at position `58` kept `reason:none`, `issued:false` and no target | New sentences request centering; repeated word updates do not create a new target when already centered | PASS for mechanism and clock |
| PDF trusted wheel | Wheel changed `following:true, reason:session` to `following:false, reason:wheel` | Trusted wheel disengages following | PASS |
| PDF direct manager resume | After the wheel, `manager.play()` resumed the Fish clock while `following:false, reason:wheel` remained unchanged | Direct playback resume does not reengage following | PASS |
| PDF native play/pause resume | After a paused wheel-disengaged session, `reader.toggleReadAloudPaused(false)` advanced the clock and retained `following:false, reason:wheel` | Native play/pause resume does not reengage following | PASS |
| PDF trusted PageDown | TIP targeted the PDF document view; window/document capture and bubble saw a trusted `PageDown` whose target was a PDF page; plugin manual-keyboard log count increased by `1`; diagnostics became `following:false, reason:keyboard` | PageDown independently disengages following | PASS |
| PDF native PageDown movement | `scrollTop: 6783`, `scrollLeft: 282`, view page `2`, current page `4`, and scale `2.2` were unchanged in the TIP route | Preserve intent while native page movement may occur | PASS for intent; NOT TESTABLE for native page-turn pixels through this route |
| PDF explicit return | Trusted paused Shift+Enter changed `following:false, reason:wheel` to `following:true, reason:explicit` without starting playback | Explicit return resumes following while paused | PASS |
| PDF Shift+A | Trusted Shift+A produced toasts `Auto-scroll: center each sentence` and `Auto-scroll: when outside the view`; mode toggled in both directions. Manual `following:false`, paused state, position, clock, and lock stayed unchanged; a repeat keydown produced only one switch | Shortcut toggles the shared mode without audio/lock/manual-intent changes | PASS |
| EPUB before playback Shift+A | On the idle paginated EPUB, trusted Shift+A toggled `outside -> sentence -> outside`, showed both localized English toasts, and left manager inactive and helper state unchanged | Shortcut works before playback | PASS |
| EPUB paginated attachment and helper | After trusted Shift+Space, Fish clock was `running` and advanced to `1.912`; flow was `paginated`; diagnostics showed `patched:true`, `following:true`; helper rendered `positionLocked:false`, `scrolling:true` | Paginated EPUB is owned with the deliberate native helper flags | PASS |
| EPUB outside mode, fitting sentence | At paginated offset `0`, a fitting active sentence and three state pushes left offset `0`, `following:true`, and `last:null` | A fitting paginated sentence does not turn a page | PASS |
| EPUB paginated starting page | `manager.repositionTo(50)` brought the starting page to flow offset `10799` and diagnostics recorded `last.reason:page` with the Fish session still active/paused | A new sentence outside the spread brings in its starting page | PASS for navigation mechanism |
| EPUB scrolled outside mode, fitting sentence | In `scrolled` flow at `scrollY:949.3333`, three state pushes left the scroll unchanged (`delta:0`) and following true | A fitting scrolled sentence does not move | PASS |
| EPUB scrolled outside mode, clipped sentence | At `scrollY:1950`, the clipped target was `top:1437.65`, `reason:cut`, with `following:true`; actual `scrollY` stayed `1950` | A clipped sentence requests a target in scrolled flow | PASS for target request; NOT TESTABLE for physical smooth movement on this bridge |
| EPUB scrolled sentence mode with natural audio | With `flow:"scrolled"` and mode `sentence`, Fish `currentTime` advanced `119.712 -> 126.9307` while positions naturally advanced `59 -> 60 -> 61 -> 62`. All four full ranges fit the `947 px` viewport. Issued target vs full-range center: position 59 `1653.44995` vs `1653.45004`; 60 `1668.71671` vs `1668.71671`; 61 `1716.58331` vs `1716.58331`; 62 `1747.11667` vs `1747.11667`. Repeated samples had one `last.at`/target per stable sentence (position 59: 11 samples, 60: 9, 62: 4); the position-61 change mounted its range once before issuing its sentence target | Natural sentence transitions center the complete range; repeated word updates do not issue another centering target | PASS for mechanism and clock; physical pixels remain NOT TESTABLE |
| EPUB trusted wheel | Wheel delivered through the reader iframe to the EPUB view and changed `following:true` to `following:false, reason:wheel`; the native flow offset changed from `10799` to `21598` as a manual page movement | Trusted wheel disengages following in EPUB | PASS |
| EPUB direct/native resume | Direct `manager.play()` and `reader.toggleReadAloudPaused(false)` advanced the running clock while `following:false, reason:wheel` remained | Resume paths do not reengage following in EPUB | PASS |
| EPUB trusted PageDown | TIP targeted the inner EPUB document; window and document capture saw trusted `PageDown`, and the after state was `following:false, reason:keyboard`; the corrected TIP route returned `[1,true]` | PageDown independently disengages following in EPUB | PASS |
| EPUB explicit return | Trusted paused Shift+Enter changed `following:false` to `true, reason:explicit` | Return resumes following | PASS |
| EPUB trusted ArrowRight sentence skip | With no modifier, trusted `ArrowRight` returned `[1,true]` and changed position `62 -> 63` while paused; diagnostics remained `following:true, reason:explicit` | The default unmodified ArrowRight action skips one sentence and resumes following | PASS |
| Restoration | Both fixture readers closed; settings window open; mode `outside`/no user value; toggle `Shift+A`/no user value; PDF bookmark restored and `lastPage:2`; EPUB CFI bookmark restored; position store `rows:65`, no readers, `queued:0`, `lastError:null`; memory SHA256 `d6eb38b379496269631c12577a3ddfb174ba4fcdfaa4e8a132d4d184d0fd2faa` and length `84`; voice list SHA256 `c28dec187f2a5cd728825e5e4821d2ad16f418565156f2da306126be2e42ddea` and length `889` | Leave Zotero as found and keep beta3 installed | PASS |

The bounded follow-up began from a fresh baseline with no readers, the settings
window open, mode `outside` and toggle `Shift+A` both without user values,
position rows `65`, and the same PDF/EPUB bookmarks. It used the same installed
beta3 hashes above and ended with the EPUB reader closed, paginated flow
restored at offset `0`, the original CFI bookmark restored, no open readers,
rows `65`, `queued:0`, and `lastError:null`. The cleanup script returned no
errors. The final debug-store scan had no suspicious `[zotero-tts]` line or
dead-object burst; the error ring contained only the previously recorded
player-expansion/manifest warnings.

The PDF and scrolled EPUB smooth-scroll calls returned their computed targets,
but this Windows bridge did not move the physical scroll offset during the
observation windows. The target traces were:

```text
PDF clipped: t=0 top=6799; t=400 top=6799 last={reason:"cut", from:6799, top:7328.0333, issued:true}; t=800 top=6799; t=1600 top=6799.
EPUB scrolled clipped: before scrollY=1950; after last={top:1437.64999, reason:"cut"}, scrollY=1950.
EPUB scrolled sentence mode: positions 59/60/61/62 issued tops 1653.44995/1668.71671/1716.58331/1747.11667; the script used direct `scrollTo(0, target)` after each request to settle the bridge-visible viewport before checking repeated word ticks. This does not claim native smooth animation.
```

These are target-request results, not a visual animation pass. Human checks
remain the comfort of sentence movement, animation interruption, highlight
stability, and audio/visual feel. Native PDF PageDown page turning was also
unchanged through the trusted TIP route, so only the manual-intent part is
claimed.

The focused run did not claim a real oversized/wordless voice, a suitable
cross-column PDF sentence, a spread-crossing EPUB sentence following a real
word, or hidden-reader recovery. Those remain unit-covered or human/fixture
checks and were not manufactured in this pass.

Reusable scripts are in
`../../scripts/auto-scroll-beta3/`. The unchanged identity, audio, PDF geometry,
and corrected PDF PageDown scripts used in the run remain in
`../../scripts/auto-scroll/` and were not modified.

Cleanup errors read at the end were two Zotero `InvalidStateError: Navigated
away from page` teardown entries, one known Xray warning from the temporary
cross-compartment bookmark restoration, and one harness `c is null` probe
error. The debug store had no suspicious `[zotero-tts]` error line and no
dead-object burst. Zotero's missing-locale resources, `uncaught exception:
undefined`, and manifest beta-version warnings were background/install noise.
