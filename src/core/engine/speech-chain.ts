/**
 * The audio chain every clip the Engine plays goes through: the volume,
 * then Read Aloud's own filter chain, copied from Zotero 10.0.3 (ADR 0006).
 *
 * Zotero's part — an 80 Hz highpass, a +3 dB peak at 3 kHz and a compressor
 * at the Web Audio defaults, into the destination — is the body of
 * `RemoteReadAloudControllerBase._initAudioContext` (zotero/reader,
 * `src/common/read-aloud/remote/controller.ts`; bundle
 * `resource/reader/reader.js` 39942-39963), Copyright © Corporation for
 * Digital Scholarship, Vienna, Virginia, USA (https://www.zotero.org),
 * licensed under the GNU Affero General Public License version 3 — the
 * license of this plugin too. The method became a function: its context is
 * a parameter instead of `this._audioContext`, which the caller creates in
 * the reader window, and the chain's input is returned instead of stored.
 * test/core/engine/speech-chain.test.ts proves the graph identical to the
 * one the bundle's method builds.
 *
 * The volume is a gain ahead of the highpass, where read-aloud/volume.ts
 * inserted one into Read Aloud's chain (issue #62): ahead of the
 * compressor, which soft-limits it, so the level stops at 100
 * (core/read-aloud-volume.ts, issue #66).
 */

import { gainOf } from '../read-aloud-volume';

interface AudioParamLike {
  value: number;
}

/** A node of the chain: what the Engine connects and sets. */
export interface ChainNode {
  connect<T>(destination: T): T;
  disconnect?(): void;
}

export interface GainNodeLike extends ChainNode {
  readonly gain: AudioParamLike;
}

export interface BiquadNodeLike extends ChainNode {
  type: string;
  readonly frequency: AudioParamLike;
  readonly gain: AudioParamLike;
  readonly Q: AudioParamLike;
}

/** The calls the chain makes on an AudioContext. */
export interface ChainContext {
  readonly destination: unknown;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadNodeLike;
  createDynamicsCompressor(): ChainNode;
}

export interface SpeechChain {
  /** Where every source connects. */
  input: ChainNode;
  /** The volume, a gain of level ÷ 100 (core/read-aloud-volume.ts gainOf). */
  volume: GainNodeLike;
}

/** Zotero's filter chain into the context's destination; answers its input, the highpass. */
function connectReadAloudChain(context: ChainContext): BiquadNodeLike {
  // ---- Copied from Zotero 10.0.3, reader.js 39943-39962 --------------------
  // Build audio processing chain for speech clarity

  // Cut rumble and low-frequency noise below 80Hz
  let highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;

  // Gently peak around 3kHz to make speech clearer
  let presence = context.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.gain.value = 3;
  presence.Q.value = 1;

  // Normalize volume across voices
  let compressor = context.createDynamicsCompressor();
  highpass.connect(presence).connect(compressor).connect(context.destination);
  return highpass;
}

/** The whole chain on `context`, the volume at `level` percent. */
export function buildSpeechChain(context: ChainContext, level: unknown): SpeechChain {
  const filterInput = connectReadAloudChain(context);
  const volume = context.createGain();
  volume.gain.value = gainOf(level);
  volume.connect(filterInput);
  return { input: volume, volume };
}
