# Auto-scroll mode live scripts (issue #93)

These scripts were run against Zotero 10.0.2-beta.9+c77df79af with
Zotero-TTS 1.12.3-beta2. They require the `zotero-dev` bridge, the existing
Fish local voice in the profile, and the existing PDF attachment titled
`PDF` (attachment item 25417 / key CZN9P5B5). They do not change provider
configuration or synthesize a new credential.

The scripts retain the actual successful and failed beta2 probes.
Unnecessary controller dumps are omitted from their output.

Prerequisites and expected results:

1. Install the requested beta2 XPI and confirm the XPI SHA256
   `71ff56127ccab80e470f8be54b901913e039ee47e030f61f6105ed5a481173db` and
   bundle SHA256
   `75629f16395afae2600320f0c0e2f67ad070dffcd5c5016299267726c15907c4`.
2. Run `identity-startup.js` before opening a reader. Expect version
   `1.12.3-beta2`, every startup step `ok`, and `failed: []`.
3. Open the Zotero-TTS settings pane and run `ui-binding.js`. Expect
   both radio labels, `outside` as the default, preference values
   `sentence` then `outside`, and the same paused reader controller.
4. Open attachment item 25417, use the existing Fish voice, and pause the
   player after it starts. Run `pdf-outside-visible.js`. Expect a fitting
   sentence at the old quarter-screen edge to keep its `scrollTop` and emit
   no target. Run `pdf-sentence-audio.js` only after the audio probe has
   shown a moving real clock; expect positions `51 -> 52 -> 53` and a moving
   audio clock. Smooth-scroll pixels are reported separately from target
   requests because this bridge did not animate `behavior:"smooth"`.

Cleanup after each script set: restore the original auto-scroll preference and
its user-value flag; restore the original `readAloud.memory` and
`reader.readAloudVoices` values; restore the own reader's bookmark, PDF page,
scale, scroll offsets, flow/player state; close the player and reader; verify
`diagnostics.position()` has no open reader, `queued: 0`, and
`lastError: null`. The beta2 run began with the settings window open, so it
left that window open after cleanup. Do not run the remaining EPUB or
cross-page checks after a live failure; rebuild and reinstall before the next
candidate.

The scripts use only the own fixture reader. They may change the temporary
reader's reading position, PDF scale/scroll position, player state, and the
`readAloud.autoScrollMode` preference. The preference must be restored to its
previous value and user-value flag. Close the own reader with
`toggleReadAloudPopup(false)` followed by `reader.close()`, and restore the
original PDF view state and reading bookmark before cleanup.

`pdf-outside-visible.js` checks a fitting sentence inside the former
quarter-screen trigger and repeated state/word updates. `pdf-sentence-audio.js`
checks real audio-clock advancement across three fitting sentences in sentence
mode. `pdf-manual-resume-failure.js` reproduces the stopped pass: a trusted
wheel sets `following:false`, then playback resume immediately returns
`following:true` with `reason:"resume"`.

`identity-startup.js`, `ui-binding.js`, `pdf-clipped-target.js`, and
`audio-clock-probe.js` are sanitized retained copies of the successful probes
that actually ran during this pass. `pagedown-routing.js` is the final
successful PageDown routing probe: the TIP transaction targets the PDF
document window and constructs events with the reader iframe's
`KeyboardEvent` constructor. A transaction bound to the reader UI iframe
alone is a different route and must not be used as PageDown evidence.

Smooth-scroll movement is recorded as a target request separately from actual
`scrollTop`; this Windows bridge run did not animate `behavior:"smooth"`.
