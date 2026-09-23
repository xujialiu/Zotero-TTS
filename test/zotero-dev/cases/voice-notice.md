[Checklist index](../README.md) · [Scripts](../scripts/voice-notice/README.md)

# 4c. Voice-switch notice lifetime (issue #119)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.
Use disposable PDF and EPUB fixtures with native controllers and controlled,
muted audio. Preserve the owner's readers and all named preferences and
their user-value flags. No paid synthesis is needed for notice timing.

### 4c.1. Slow preparation and playback start

Select another voice through the actual player control and a voice shortcut.
Delay target audio beyond five seconds. The old voice reads on and
`#ztts-voice-notice` stays visible. Once target audio is ready, keep the
old voice until its word boundary. Observe notice visibility around the
new voice's first source start, which since issue #133 is the Engine's own
(`diagnostics.engine()`: `session.voice` becomes the new voice and
`stats.carriedOn` goes up one when the manager rebuilds its controller): the
rebuild alone must not hide it; the source starting with the output running
must hide it without an additional timed confirmation. Capture the
diagnostic `handoff.notice` (`preparing` then `selected`), `session.playing`
and `audio.state`, and DOM opacity. Diagnostics alone are insufficient.

### 4c.2. Paused readiness

Pause within a known word and change voice. No audio plays during preparation.
The notice remains while loading, then disappears when reliable word alignment
allows immediate target resume (`handoff.notice: ready`). Press Play and prove
the first source uses the target voice, at the safe offset, with no old-voice
playback first. Repeat with a suspended target context: preparation stays silent
and Play opens the output. If output cannot start, record that limit rather
than claiming audible playback.

### 4c.3. Early resume and sentence fallback

Press Play before the target is ready: the old voice resumes, with the notice
still visible, until the target actually starts. Repeat with missing/grouped
word timing: decoded audio alone cannot promise an immediate target resume;
the notice stays through the old sentence and disappears at the prepared
next-sentence start. No unread text is skipped.

### 4c.4. Replacement, cancellation and failure

Select B then C while B is pending. The same notice shows C. Resolve or reject
B late and verify it neither plays nor hides C's notice. Re-pick the original
voice, stop reading, close the fixture and detach: no switching notice remains.
Fail the current preparation: the notice becomes the localized failure message,
with the original voice and paused/playing state retained. No new dead-object
errors may come from cleanup. A generic stopped-status toast may still appear.

### 4c.5. Independent overlays and cleanup

While a switch is pending, show an unrelated short status toast and let its
timer expire; the voice notice remains. After changing tabs, completion clears
the document where the notice was created. Verify disposal clears persistent
notices and timers and restore every fixture method and user setting.

Unit tests cover long timer waits, the synchronous adoption-to-playback gap,
stale callbacks in that gap and exact cancellation races. Live checks establish
native source/DOM timing in both formats. Subjective listening continuity and
perceived visual timing remain human-only; suspended or stalled AudioContexts
do not establish actual playback. Retain executed methods in the linked kit
and put the result table on #119.
