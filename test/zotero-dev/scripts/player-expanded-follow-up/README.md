# Issue #81 follow-up scripts

Actual inline bridge scripts from the 1.12.3-beta follow-up, with
[observed outputs](../../runs/2026-09-12-1.12.3-beta/follow-up-evidence.md).
These files were archived after the run, not executed from disk.

Before reuse, capture the effective value and user-value presence of every
preference that will change. Suspend transports before importing disposable
fixtures. Replace the fixed attachment ID 25430 and reader instance IDs
with newly verified owned fixtures; never select a user reader. Preserve
both reader instance identity and window type when an attachment is open
in two places. No new check should run without explicit cleanup in scope.

| Script | Allowed changes and expected result |
| --- | --- |
| window-first-visible.js | Open/close owned window player; first sampled visible state expanded and ready |
| missing-button.js | Insert disposable popup without Options; ready/visible after controller reports failure |
| throwing-access-confounded.js | Inject throwing getter and temporarily detach stylesheet; proves error handling clears stylesheet text, but does not independently prove visible recovery |
| noncommit-timeout.js | Insert no-op-button popup; pending/hidden before timeout, ready/visible afterward |
| post-reload.js | Read-only state after plugin reload; existing popup unchanged, outcome existing |
| cleanup.js | Close only matching owned reader instances, erase owned attachment, clear this run's default-off preference |
| restore-original-transports.js | Restore this run's verified original true switches only after cleanup; not a generic restore script |

The throwing-access script deliberately removes the stylesheet before its
final visibility observation. Do not treat that observation as proof the
production exception handler alone revealed the player. It does establish
that the handler ran and emptied the stylesheet. The unit test independently
covers the document-wide gate release. A better future live check should
leave the stylesheet connected and avoid relying on a transient diagnostic.

The sampler uses a timer, not a screen recording. The nominal 1,000 ms
timeout was observed released by the 1,180 ms sample; that does not measure
the exact callback firing time. Paused/active state comparisons are not
an audio-quality or subjective flash assessment.

Restore injected properties and remove fake DOM nodes even after failures.
Close/erase only owned fixtures, verify position rows against the baseline,
restore non-transport preferences first, and original transport values last.
The restore script's hard-coded true values belong only to this run's
confirmed original snapshot. Never apply them to another user's settings.
