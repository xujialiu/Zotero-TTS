import { describe, expect, it } from 'vitest';
import { stretchAudioBuffer } from '../../../src/core/engine/time-stretch';
import { loadZoteroReference, sameBits, speechLike, testBuffers, TestBuffer } from './zotero-reference';

const zotero = loadZoteroReference();

/** Every speed the player offers: 0.5× to 3.0× in the keys' 0.05 steps, as the keys compute them. */
const PLAYER_SPEEDS = Array.from({ length: 51 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);

function expectIdentical(input: TestBuffer, rate: number): void {
  const ours = stretchAudioBuffer(input, rate, testBuffers);
  const theirs = zotero.stretchAudioBuffer(input, rate, testBuffers);
  expect(ours.length, `length at ${rate}×`).toBe(theirs.length);
  expect(ours.numberOfChannels).toBe(theirs.numberOfChannels);
  expect(ours.sampleRate).toBe(theirs.sampleRate);
  for (let ch = 0; ch < ours.numberOfChannels; ch++) {
    expect(sameBits(ours.getChannelData(ch), theirs.getChannelData(ch)), `channel ${ch} at ${rate}×, ${input.sampleRate} Hz`).toBe(true);
  }
}

describe('stretchAudioBuffer, copied from Zotero 10.0.3', () => {
  it('is bit-identical to the bundle at every player speed, at 24 kHz (OpenAI, Kokoro, Azure)', () => {
    const input = speechLike(24_000, 1, 1);
    for (const rate of PLAYER_SPEEDS) expectIdentical(input, rate);
  });

  it('is bit-identical at the other sample rates providers send, and in stereo', () => {
    const speeds = [0.5, 0.75, 0.95, 1.05, 1.25, 1.4, 1.5, 2, 2.35, 3];
    for (const [rate, seconds, channels] of [
      [16_000, 1, 1],
      [22_050, 1, 1],
      [44_100, 0.6, 1],
      [48_000, 0.6, 1],
      [44_100, 0.4, 2],
    ] as const) {
      const input = speechLike(rate, seconds, rate + channels, channels);
      for (const speed of speeds) expectIdentical(input, speed);
    }
  });

  it('is bit-identical on speeds that are not a key step, as a slider leaves them', () => {
    const input = speechLike(24_000, 0.8, 7);
    for (const rate of [0.5123, 1.0011, 1.3999999999999999, 1.4000000000000001, 2.9876, 1 / 0.7]) expectIdentical(input, rate);
  });

  it('hands the very buffer back within 0.001 of 1×, where the bundle does', () => {
    const input = speechLike(24_000, 0.3, 3);
    for (const rate of [1, 0.9995, 1.0005, 1.001, 0.999]) {
      const ours = stretchAudioBuffer(input, rate, testBuffers);
      const theirs = zotero.stretchAudioBuffer(input, rate, testBuffers);
      expect(ours === input, `${rate}×`).toBe(theirs === input);
    }
    expect(stretchAudioBuffer(input, 1, testBuffers)).toBe(input);
  });

  it('is bit-identical on a clip shorter than one window, and on silence', () => {
    for (const input of [speechLike(24_000, 0.01, 5), new TestBuffer(1, 24_000, 24_000)]) {
      for (const rate of [0.5, 1.4, 3]) expectIdentical(input, rate);
    }
  });

  it('shortens or lengthens the clip by the rate, rounded, as the bundle does', () => {
    const input = speechLike(24_000, 1, 9);
    expect(stretchAudioBuffer(input, 2, testBuffers).length).toBe(12_000);
    expect(stretchAudioBuffer(input, 0.5, testBuffers).length).toBe(48_000);
    expect(stretchAudioBuffer(input, 1.4, testBuffers).length).toBe(Math.round(24_000 / 1.4));
  });
});
