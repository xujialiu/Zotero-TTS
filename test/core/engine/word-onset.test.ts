import { describe, expect, it } from 'vitest';
import { findWordOnset } from '../../../src/core/engine/word-onset';
import { loadZoteroReference, speechLike, TestBuffer } from './zotero-reference';

const zotero = loadZoteroReference();

describe('findWordOnset, copied from Zotero 10.0.3', () => {
  it('answers what the bundle answers at every position, one to three words back', () => {
    for (const [rate, seed] of [[24_000, 11], [44_100, 12], [48_000, 13]] as const) {
      const buffer = speechLike(rate, 4, seed);
      let moved = 0;
      for (let position = 0; position <= buffer.duration + 0.2; position += 0.037) {
        for (const words of [1, 2, 3]) {
          const ours = findWordOnset(buffer, position, words);
          expect(Object.is(ours, zotero.findWordOnset(buffer, position, words)), `${position} s, ${words} back, ${rate} Hz`).toBe(true);
          if (ours !== position) moved++;
        }
      }
      // The signal has real gaps: most answers are a word onset, not the position back
      expect(moved).toBeGreaterThan(100);
    }
  });

  it('defaults to one word back, as the bundle does', () => {
    const buffer = speechLike(24_000, 3, 21);
    for (const position of [0.9, 1.7, 2.5]) {
      expect(findWordOnset(buffer, position)).toBe(zotero.findWordOnset(buffer, position));
      expect(findWordOnset(buffer, position)).toBe(findWordOnset(buffer, position, 1));
    }
  });

  it('hands the position back on silence, near the start and past the end, where the bundle does', () => {
    const silent = new TestBuffer(1, 48_000, 24_000);
    const speech = speechLike(24_000, 1, 31);
    for (const [buffer, position] of [
      [silent, 1.5],
      [speech, 0],
      [speech, 0.01],
      [speech, 3],
    ] as const) {
      expect(Object.is(findWordOnset(buffer, position, 2), zotero.findWordOnset(buffer, position, 2))).toBe(true);
    }
    expect(findWordOnset(silent, 1.5, 2)).toBe(1.5);
    expect(findWordOnset(speech, 0.01)).toBe(0.01);
  });
});
