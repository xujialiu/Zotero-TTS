[Checklist index](../README.md) · [Scripts](../scripts/playback-notice/README.md)

# 3l. Playback preparation notice (issue #120)

Run the [baseline](../baseline.md) first and [cleanup](../cleanup.md) last.
Use disposable PDF and EPUB fixtures with controlled, muted native audio.
Keep owner readers intact; restore named prefs and their user-value flags.
No provider charge is needed. Retain executed scripts under
`test/zotero-dev/scripts/playback-notice/` and the result table on #120.

### 3l.1. Initial playback and source start

Start through the actual player control. Delay audio beyond 300 ms. Observe
`#ztts-playback-notice`: it shows the localized preparing message after the
threshold, stays visible through download/decoding completion, and disappears
immediately after the native source starts with running output. Sample around
`_playAudioBuffer` as well as the DOM; a BufferingChange(false) or segment
change alone does not prove playback. Repeat in PDF and EPUB.

`diagnostics.playbackNotice()` has feature `playback-preparation-notice` and
one entry per reader: attached true, phase waiting while preparation is
pending, preparingRequested true after the threshold, phase playing and
preparingRequested false after source start. sourceStarts must increase.
preparingRequested is intent, not proof of DOM visibility under voice priority.

### 3l.2. Fast start, resume and navigation

With cached/prepared audio starting within 300 ms, no preparation overlay
flashes. Pause and resume, and use the actual sentence-navigation control
with delayed audio: preparation appears after the threshold and ends at
source start. A pause during the wait clears it immediately; a response or
failure arriving afterward must not bring it back. A new Play gets a new
wait and can complete normally.

### 3l.3. Intentional sentence pause and prefetch

Configure a clearly observable sentence delay. During that gap the ordinary
notice stays absent. If the next sentence still awaits audio, it appears
only after the gap plus 300 ms, then disappears on source start. Also observe
background prefetch while the current source plays: it must not show a
preparation notice. Record actual scheduled gap, source times and DOM samples.

### 3l.4. Output failure, cancellation and teardown

Fail current audio preparation: the localized failure message replaces the
ordinary preparation message, including a failure with no native error text.
Retry and verify successful playback. Stop or close the player during a
pending response, keep the fixture alive until the response arrives, and
verify no ordinary notice or target playback returns. Close the fixture
reader and verify no plugin dead-object errors. Suspended output must not
clear a notice merely because source.start was scheduled; it clears once
output runs, or the pending play is cancelled.

### 3l.5. Voice-switch priority and regression

Exercise the [voice notice](voice-notice.md) baseline: slow target preparation,
paused readiness, early resume, and cancellation/failure. When ordinary
playback is also waiting, only `#ztts-voice-notice` is visible. Starting the
old voice does not clear it; new-voice source start or safe paused readiness
does. After switching finishes, an ordinary wait on a later sentence must
still work, proving the observer survived the temporary handoff hooks.
An unrelated short toast must not hide either pending notice. Switching
tabs does not prevent completion from clearing the original document.

Exact 299/300 ms boundaries, synchronous source-start throws and stale
callback races have automated coverage. Live timing allows normal scheduler
jitter but must establish order. Muted fixtures prove native source/DOM
behavior, not pronunciation, perceived animation or physical speaker output.
