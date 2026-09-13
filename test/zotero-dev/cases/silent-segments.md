[Checklist index](../README.md) · [Scripts](../scripts/silent-segments/README.md)

## Invisible text and empty audio (issues #15, #42)

Text with nothing to say becomes a pause.

Items 3.6 and 3.7 of the checklist, under their original numbers.

### 3.6

6. **Invisible text** (issue #15). The fixture's size-zero line never
   reaches Zotero's structured text, so this needs a real latexit PDF
   (an inline span at size zero in a transparent color): expected the
   log `skipping N chars that are not visible on the page; playing a
   400 ms pause instead` and no such segment spoken. Without that
   fixture: NOT TESTABLE, say so.

### 3.7

7. **Empty audio becomes a pause** (issue #42). Azure answers
   asterisk-only text (the `****` scene separators) with zero audio
   frames — a success with nothing in it, which Zotero cannot decode
   and pauses on silently, error state unset, Retry inert. With a
   session open on an Azure voice, call the controller's own path,
   `voice.provider.remote.getAudio({ text: '****' }, voice.impl)`,
   twice: expected each time an `audio/wav` blob of 6444 bytes (the
   400 ms pause) with timestamps `[{start: 0, end: 86400, charStart:
   0, charEnd: 4}]`, the log `azure: empty audio for 4 chars; playing
   a 400 ms pause instead` — the second call with `(cached)`, proving
   a stored empty original heals on the way out. Playback across such
   a separator continues into the next sentence after the pause; a
   stop there with `_error: null` is the regression.
