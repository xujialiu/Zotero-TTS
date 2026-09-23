/**
 * Zotero 10.0.3's own Read Aloud code, run from the verbatim excerpt in
 * test/fixtures/engine/read-aloud-10.0.3.js: the reference the Engine's
 * copies are compared against, bit for bit (ADR 0006). Plus the buffers
 * and signals both are fed.
 */

import { readFileSync } from 'node:fs';
import type { PcmBuffer, PcmBufferFactory } from '../../../src/core/engine/time-stretch';

const SOURCE = readFileSync(new URL('../../fixtures/engine/read-aloud-10.0.3.js', import.meta.url), 'utf8');

export interface ZoteroReference {
  stretchAudioBuffer<B extends PcmBuffer>(buffer: B, rate: number, context: PcmBufferFactory<B>): B;
  findWordOnset(buffer: PcmBuffer, position: number, wordBoundaries?: number): number;
  InitAudioContextHost: new () => { _initAudioContext(): void; _audioContext: unknown; _filterChainInput: unknown };
}

/** The bundle's functions, with `AudioContext` bound to what the test hands in (only `_initAudioContext` constructs one). */
export function loadZoteroReference(AudioContext: unknown = undefined): ZoteroReference {
  return new Function('AudioContext', `${SOURCE}\nreturn { stretchAudioBuffer, findWordOnset, InitAudioContextHost };`)(AudioContext);
}

/** An AudioBuffer's shape over plain Float32Arrays. */
export class TestBuffer implements PcmBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

export const testBuffers: PcmBufferFactory<TestBuffer> = {
  createBuffer: (numberOfChannels, length, sampleRate) => new TestBuffer(numberOfChannels, length, sampleRate),
};

/** mulberry32: a seeded generator, so a signal is the same on every run. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Something shaped like speech: voiced "words" of 120–420 ms — a gliding
 * fundamental with five harmonics under a smooth envelope — separated by
 * gaps of 20–220 ms holding only faint noise, so the word-onset search has
 * real boundaries to find and the stretch real periodicity to align.
 */
export function speechLike(sampleRate: number, seconds: number, seed: number, numberOfChannels = 1): TestBuffer {
  const next = random(seed);
  const buffer = new TestBuffer(numberOfChannels, Math.round(sampleRate * seconds), sampleRate);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.channels[ch];
    let at = Math.round(next() * 0.05 * sampleRate);
    for (let i = 0; i < data.length; i++) data[i] = (next() - 0.5) * 0.002;
    while (at < data.length) {
      const length = Math.round((0.12 + next() * 0.3) * sampleRate);
      const f0 = 100 + next() * 120;
      const glide = (next() - 0.5) * 40;
      let phase = 0;
      for (let i = 0; i < length && at + i < data.length; i++) {
        const t = i / length;
        const f = f0 + glide * t;
        phase += (2 * Math.PI * f) / sampleRate;
        const envelope = Math.sin(Math.PI * t) ** 0.6;
        let sample = 0;
        for (let h = 1; h <= 5; h++) sample += Math.sin(phase * h + ch) / (h * 1.3);
        data[at + i] += 0.35 * envelope * sample;
      }
      at += length + Math.round((0.02 + next() * 0.2) * sampleRate);
    }
  }
  return buffer;
}

/** Whether two Float32Arrays hold the same bits (so -0 and NaN payloads count too). */
export function sameBits(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  return Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}
