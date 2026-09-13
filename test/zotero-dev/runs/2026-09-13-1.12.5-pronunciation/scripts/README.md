# Fish short-stat pronunciation research scripts (before issue #98)

[Report](../report.md): research on
Zotero-TTS 1.12.5 and Zotero 10.0.2-beta.9 on macOS, driven by the main session
at the owner's request. These are retained bridge snippets, not a check to
replay: they read the owner's own paused EPUB (`Zotero.Reader._readers[0]`,
item 24246) at fixed segment indices, and no fixture was imported. Inspect the
title, segment text, voice and paused state before adapting any of them, and
never run them on a reader that is playing.

- `capture.js`: the outgoing Fish request for segments 6653, 6654 and 6656.
  It turns off settings sync and auto-upload, the provider cache and prefetch,
  intercepts the sandbox `fetch` and throws before the network, then restores
  `fetch` and the preferences (values and user-value flags) in `finally`. Its
  three network errors are the probe's own. Output: `evidence.json`.
- `compare-pcm.js`: read-only; compares decoded buffer 6648 with 6650 and 6654
  sample by sample.
- `extract-original-audio.js`: writes the cached PCM of the original segments
  as mono PCM16 WAV files under `/tmp` for listening; nothing in Zotero
  changes. Delete the files afterwards.
- `synthesize-locale-hints.js`: four Fish free-model requests, 60 s each, with
  and without the English cue, into `.tmp/fish-locale-test`; never plays audio.
  Poll `Zotero.__zttsFishLocaleProbe.status`, keep `results.json`, then delete
  the property. Output: `locale-hint-results.json`.
- `list-local-references.js`, then `synthesize-local-comparison.js`: the Fish
  Speech server's references through the saved URL and headers, then four
  sequential requests, 60 s each, with the `bella` reference into
  `.tmp/fish-local-test`. Poll `Zotero.__zttsFishLocalProbe`, then delete it.
  Output: `local-comparison-results.json`.

No playback, volume, voice, speed, document or installed build was changed.
Whether the audio sounds right is the owner's listening, recorded in the
report; `audio-input-attempt.json` records that the assistant could not listen.
