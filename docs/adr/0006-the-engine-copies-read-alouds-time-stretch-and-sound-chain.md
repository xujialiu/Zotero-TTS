---
status: accepted
date: 2026-09-23
issue: 133
---

# The Engine copies Read Aloud's time-stretch and sound chain

*The product argument — what this is for and what it gives up — is
[design 0006](../design/0006-speed-and-sound-stay-exactly-as-they-are.md).*

The Engine plays through a copy of two pieces of Read Aloud's engine, taken
unchanged from Zotero 10.0.3: the WSOLA time-stretch, and the audio chain
every clip plays into. Both sides are AGPL-3.0 — `zotero/reader`, copyright
Corporation for Digital Scholarship, and this plugin (`AGPL-3.0-only`) — so
the copy is allowed, and it keeps Zotero's copyright notice and names the
release it came from. The output is then identical to today's at every
speed, and the parity ADR 0005 requires of the sound needs no ear test.

## What is copied

**The time-stretch.** `stretchAudioBuffer(buffer, rate, context)`, from
`src/common/read-aloud/remote/lib/time-stretch.ts` in `zotero/reader`
(bundle 39747-39820):

- the buffer itself comes back when `|rate − 1| < 0.001`; otherwise a new
  buffer of `round(length / rate)` samples;
- the window is `2^round(log2(sampleRate × 0.025))` samples — 1,024 at
  44.1 kHz (23 ms), 512 at 24 kHz (21 ms) — weighted by a Hann window;
- the synthesis hop is half a window and the analysis hop
  `round(synthesisHop × rate)`; each frame after the first is placed by
  searching a quarter window either side of its natural position for the
  best cross-correlation with the output tail, over `min(synthesisHop,
  window)` samples taken every fourth sample; frames are overlap-added.

With it comes the way it is played (`RemoteReadAloudControllerBase`,
`_playAudioBuffer` at 40019): the stretched buffer always plays at 1×,
because an `AudioBufferSourceNode`'s `playbackRate` shifts pitch like a
turntable; progress is mapped back to the unstretched buffer as
`offset + (currentTime − start) × rate` (`_currentPlaybackTime`), which is
what keeps a provider's word timestamps valid at any speed; and a speed
change mid-segment re-stretches the current buffer from that offset
(`_onSpeedChange`).

**The audio chain.** `_initAudioContext` (39942-39963) builds, in order:

- a `BiquadFilterNode`, type `highpass`, 80 Hz, Q 0.7 — "cut rumble and
  low-frequency noise below 80Hz";
- a `BiquadFilterNode`, type `peaking`, 3,000 Hz, gain +3 dB, Q 1 — "gently
  peak around 3kHz to make speech clearer";
- a `DynamicsCompressorNode` with no parameter set, so at the Web Audio
  defaults: threshold −24 dB, knee 30 dB, ratio 12:1, attack 3 ms, release
  250 ms — "normalize volume across voices";
- the context's destination.

Every source connects to the highpass (`_filterChainInput`). The volume is
a `GainNode` ahead of it, where `volume.ts` inserts one into Read Aloud's
chain today (#62).

## Why not Firefox's own time-stretch

Zotero 10 runs on Firefox 140 ESR, whose media elements keep the pitch at
any `playbackRate` by default (`HTMLMediaElement.preservesPitch`). Playing
each clip through an audio element would drop the copied stretch
altogether. It was turned down because that stretch is not WSOLA with these
parameters: at every speed other than 1.0× the voices would sound
different. With no switch back to Read Aloud's engine (ADR 0005), the only
reference would be the owner's memory, during the same beta that has to
catch every other regression. A different sound can still be chosen later,
as a decision of its own.

## Why copy, when OpenReader rewrote

OpenReader's ADR 0006 reached the opposite answer about the same code: it
studies Read Aloud's engine and writes its own, because copying AGPL code
would bind that app's license and its owner wants the choice kept open. This
plugin is AGPL-3.0 already, so copying costs it nothing, and here being
identical to today's sound is the point.

## Consequences

- **The compressor stays, and so does the volume ceiling.** A boost above
  100% enters the compressor and comes out about halved — +6 dB in, +3 dB
  out on an ordinary voice — and a 400% render already clips. That is why
  the volume stops at 100 (#66; #70, closed as not planned), and copying the
  chain keeps it.
- **The copy is pinned to 10.0.3.** A later change to Zotero's time-stretch
  or chain reaches the plugin only when someone copies it again on purpose;
  the copied file says which release it came from, and `notes/NOTES.md`
  records it with the Engine's hooks.
