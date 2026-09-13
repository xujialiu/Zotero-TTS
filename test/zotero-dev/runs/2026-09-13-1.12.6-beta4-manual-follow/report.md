# Sentence reentry verification — beta4

| Check | Observed | Status |
| --- | --- | --- |
| Identity and startup | Zotero-TTS 1.12.6-beta4, all 23 startup steps ok | PASS |
| UI/help | Automatic recovery when any current-sentence fragment reenters is described | PASS |
| PDF, both modes | Trusted wheel plus controlled movement: partial visible fragment retained; fully outside gave following=false, visibilityPaused=true; 500 ms and three state pushes caused no pullback; returning a partial fragment restored following=true, visibilityPaused=false, reason=visible without explicit lock; repeated cycle passed | PASS |
| Scrolled EPUB, both modes | Actual fragment coordinates and the same out/wait/reentry cycle retained in outputs 14/15 | PASS |
| Paginated EPUB, both modes | Semantic navigation moved offset 10799 to 21598, paused while outside, and automatically resumed after returning to the original page | PASS |
| Off | Small wheel input immediately disengaged; scrolling back did not resume; direct explicit return did | PASS |
| Controlled speech reentry | At scrollTop 800, replacing the view's active segment with visible segment 11 restored following without a lock call | PASS, controlled state |
| Uninterrupted following | A controlled next-sentence state without manual interruption still requested following | PASS, controlled state |
| Hidden/paused/closure | Suspending/restoring a view with the sentence still outside retained the visibility pause; closing fixture readers caused no new plugin/dead-object errors | PASS |
| Natural audio progression | Both fixture AudioContexts remained suspended at currentTime 0 | NOT TESTABLE |
| Natural wheel/drag/smoothness | Wheel provenance was trusted; positional scrolling supplied the measured movement. Complete drag traces and subjective smoothness were not established | NOT TESTABLE |
| Restoration | Three disposable fixtures erased; original two user readers, selected tab, open settings, preference values/user flags and voice memory restored; position store 66 rows, 0 queued, lastError null | PASS |

XPI SHA-256: `c70fa7280d9ba1e61ca3397fabee616f93aadaead01718f868adb9494cbfc3bb`.
Bundle SHA-256: `85a9b61444c5effaaab55ece3509ad4c8449ba8dfb45aeb88f36aa3c92c764e3`.
Zotero 10.0.2-beta.9+c77df79af on Windows. The installed beta4 corresponds
to source checkpoint `9d5f0ec`; remote integration `0812b0a` occurred
during this pass and did not replace the artifact or alter follow code.
The combined 1.12.7-beta installation is verified separately.

The speech-reentry probe changes the PDF view state to segment 11 while
the manager remains paused at position 0. It proves reaction to a new
visible sentence, not natural speech advancement. The raw output records
that distinction explicitly. An EPUB page-mapping initialization race was
retried after readiness; scripts 06/06b retain both attempts. One old
dead-object error predated the pass; plugin/dead-object counts did not
increase at fixture closure. The first restoration/audit attempts and
their corrected 26b/28 results are retained rather than overwritten.

Executed scripts: [beta4 scripts](../../scripts/manual-follow/beta4/).
Numbered `.raw.txt` files here preserve the actual sanitized tool returns.
The raw preference backup stays in temporary runtime storage, not this
repository. Final evidence is `28-final-audit-corrected.raw.txt`.
