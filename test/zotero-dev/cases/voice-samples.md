[Checklist index](../README.md) · [Scripts](../scripts/voice-samples/README.md)

## Voice samples in the browser (issues #48, #61)

Item 2.6 of the checklist, under its original number.

### 2.6

6. **Samples.** ▶ on a Kokoro voice, on a System voice (on a profile
   that keeps the provider off, enable it through the pane's switch for
   the item and disable it after — the switch's own check and the Local
   tier's 787 ↔ 796 relisting prove it came and went, 2026-09-06) and on
   a Zotero voice: glyph `▶` → `…` → `■` → `▶` within ~10 s, and the
   status line
   says how it ended (issue #48): with audio, no `Sample failed:` — the
   default line stays; on a machine with no audio sink the element
   errors ~7 ms after `playing` (`MediaError.code` 3,
   `OnMediaSinkAudioError`) and the line reads `Sample failed: the audio
   arrived, but playback stopped: decoding or output failed
   (OnMediaSinkAudioError)`. A `■` that comes back with the default line
   intact and nothing heard is the swallowed error, the bug itself. A
   failure before playback starts (synthesis, a blob the element refuses)
   still reads `Sample failed: <reason>`, without the "audio arrived"
   clause. `diagnostics.sampleSpeed()` → `startingSpeed` the memory's
   speed, `playing.playbackRate` 1.5, `preservesPitch` true,
   `afterSetRate` 2, and `outcome`: `ended` with audio, `error: decoding
   or output failed (OnMediaSinkAudioError)` without a sink; `neither
   ended nor failed within 3 s` is a stall to report.
   **Switching** (issue #61, 1.11.1): the clicks and a 25 ms poll of
   every row's glyph in ONE script, with the window's
   `HTMLMediaElement.prototype.play`/`pause` timed (waive the Xrays,
   number the elements through a WeakMap, restore in `finally`). With a
   sample playing, ▶ on another voice: in the click's own task the
   playing row is `▶` and the new one `…`, and the playing element's
   `pause()` is stamped 0–2 ms after the click at a `currentTime` below
   its duration; the pair (old `■`, new `…`) is never seen; the new row's
   `■` and its element's `play()` come with its fetch (0.3–1 s for a
   Zotero sample), or at the first poll when the sample is cached
   (`pause` at 1 ms, `play` at 4 ms). ▶ on a third voice while one
   loads: the loading row `▶` and the third `…` in that click's task, no
   `play()` when the superseded fetch lands, and a later ▶ on it is `■`
   in its own task — the arrival was cached. ▶ on the loading row itself:
   `▶` at once, nothing when its fetch lands. ▶ on a cached voice while
   another loads: the loading row `▶` and this one `■` in the same task,
   on a new element. Two cached rows clicked in one task: exactly one
   `play()`, on the second's element, and the first's element has no
   `src`; 5 ms apart, the first's `play` is followed by its `pause` and
   only the second's element is unpaused at its `■`. At every snapshot
   at most one row is `…` or `■`, and the status line never reads
   `Sample failed:`. A sample arriving after the window closed is not
   observable here (the prototype wrapper dies with the window); the
   unit test covers it. That the old voice falls silent at the click is
   the user's to hear.
