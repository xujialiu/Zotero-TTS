# Fish short-stat pronunciation research — 2026-09-13

Research only, driven personally by the main session at the owner's request.
Related cases: 3g (angle brackets), 1a (Fish). No issue opened or code changed.

## Environment

- Zotero 10.0.2-beta.9+c77df79af, Firefox 140, macOS.
- Installed Zotero-TTS 1.12.5; XPI SHA-256:
  ac2243241aaa41fa33247a1976438c54e4f2816d8865251eb127b6a7cdb52000.
- User EPUB: My Vampire System - Chapters 1-250. Paused at segment 6656,
  speed 1.4, Fish Dax, reference 9fa4b7a1b67446b48208f2f5d4bcd8da.
- Manager language en; voice/controller language en-US. No language switch
  occurred in the reader. Startup: 23 steps OK, failed [].

## Findings

| Observation | Expected / question | Result |
| --- | --- | --- |
| Segments 6653, 6654, 6656 are `< 100 exp>`, `< 100 exp >`, `< 2/50 HP >` | Does extraction preserve the reported text? | PASS |
| Configured/effective bracket removal both true | Does the active session strip brackets? | PASS |
| Blocked outgoing requests contain ` 100 exp`, ` 100 exp `, ` 2/50 HP ` | Does preparation change digits or letters? | PASS: only brackets removed |
| All three use Dax and s2.1-pro-free | Was another voice/model selected? | PASS: requested voice preserved |
| Production Fish body has text, format, mp3_bitrate, latency, reference_id; no language | Does en-US reach synthesis as a language constraint? | NO |
| Cached PCM at 6648/6650/6654: 62,694 mono samples at 48 kHz, zero differing samples | Is repeated text replaying identical audio? | PASS |
| Cached durations: 6653 1.097146 s, 6654 1.306125 s, 6656 1.541229 s | Are original outputs still available? | YES |
| Exact spoken language / pronunciation | Requires listening to the original audio | NOT TESTABLE from text/timestamps |

The original report is auditory evidence from the owner, not a transcription
made by the bridge. No fresh Fish synthesis was made. The request probe
intercepted sandbox fetch and deliberately threw before network; its three
network errors are expected probe artifacts, not provider outages. Calling the
remote interface directly did not set the user's controller error.

Fish's current [model documentation](https://docs.fish.audio/developer-guide/models-pricing/models-overview)
states that S2.1 uses automatic language detection. Its
[timestamp endpoint](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech-stream-with-timestamps)
does not document a language selector. Isolated numbers and abbreviations
provide little language context: language drift is a plausible explanation,
not established identification of the language or exclusion of other model
pronunciation/normalization errors. An English voice grouping is not a
synthesis-language lock.

## Mechanism

Installed omni.ja, resource/reader/reader.js:40329-40349 caches decoded audio
by segment index; :40351-40358 passes the individual segment to remote.getAudio.
Repository src/read-aloud/remote-interface.ts:427-430 prepares the text;
:300-301 includes actual speech text in the provider cache key.
src/core/providers/fish.ts:673-682 builds the Fish request without a language
field. :687-697 concatenates the provider audio and aligns word timestamps;
it does not rewrite the spoken audio.

## Reproduction and restoration

Scripts: [request capture](scripts/capture.js) and
[PCM comparison](scripts/compare-pcm.js).
Exact capture results are in evidence.json alongside this report.

Prerequisite: the same paused EPUB and segment indices, populated Dax caches,
the installed version above, and no other bridge driver. Inspect titles,
segment text, voice and paused state before reusing these document-specific
indices. No fixtures were imported. Do not run on an actively playing reader.
The capture temporarily disables settings sync/auto-upload, provider cache
use and prefetch, then restores their exact values and user-value flags in
finally. It restores fetch before enabling sync. No playback method, volume,
voice, speed, document, cursor or installed build is changed. The comparison
only reads existing PCM.

Observed cleanup: prefsRestored true, fetchRestored true; active true,
paused true, position 6656, selected voice unchanged, controller error null.
No audio started, no volume change, no synthesis network request. Final error
read showed only the three intentional probe errors plus older Zotero sync
messages. This is not a full-checklist verification.

Recommendation: first compare original short forms with unambiguous English
readings (one hundred experience points; two out of fifty hit points), using
a few controlled samples. Only consider optional pronunciation substitutions
after listening establishes their effect; do not globally reinterpret exp or
HP in unrelated documents. No language-control fix is validated by this run.


## Owner listening follow-up — issue #98

The owner listened to the six exported/comparison files and confirmed that
both original cached WAVs and both fresh uncued MP3s are incorrect, while
both English-cued MP3s read correctly. See `locale-hint-results.json` for
the per-file verdict and exact requests. The assistant did not listen;
its audio input channel rejected the attempted original WAV. The general
cause, repeatability and behavior in other locales remain unverified.
Issue #98 has been opened at the owner's request; no implementation plan
is approved and no production code has changed.
