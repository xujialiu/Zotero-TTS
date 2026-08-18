import { describe, expect, it } from 'vitest';
import { alignWordsToText } from '../../src/core/align';

describe('alignWordsToText', () => {
  it('maps each word onto its character span in the source text', () => {
    const out = alignWordsToText(
      [
        { text: 'The', start: 0, end: 0.2 },
        { text: 'quick', start: 0.2, end: 0.5 },
        { text: 'fox', start: 0.5, end: 0.8 },
      ],
      'The quick fox',
    );
    expect(out).toEqual([
      { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
      { start: 0.2, end: 0.5, charStart: 4, charEnd: 9 },
      { start: 0.5, end: 0.8, charStart: 10, charEnd: 13 },
    ]);
  });

  it('advances the cursor so a repeated word matches its own occurrence', () => {
    const out = alignWordsToText(
      [
        { text: 'the', start: 0, end: 0.1 },
        { text: 'cat', start: 0.1, end: 0.3 },
        { text: 'the', start: 0.3, end: 0.4 },
        { text: 'dog', start: 0.4, end: 0.6 },
      ],
      'the cat the dog',
    );
    expect(out.map((t) => t.charStart)).toEqual([0, 4, 8, 12]);
  });

  it('is case-insensitive, because engines normalise capitalisation', () => {
    const out = alignWordsToText([{ text: 'the', start: 0, end: 0.1 }], 'The quick');
    expect(out[0]).toMatchObject({ charStart: 0, charEnd: 3 });
  });

  it('skips a word that does not occur in the source rather than guessing', () => {
    const out = alignWordsToText(
      [
        { text: 'Hello', start: 0, end: 0.3 },
        { text: 'three', start: 0.3, end: 0.6 },
        { text: 'world', start: 0.6, end: 0.9 },
      ],
      'Hello 3 world',
    );
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.charStart)).toEqual([0, 8]);
  });

  it('handles Chinese, where words are adjacent with no separators', () => {
    const out = alignWordsToText(
      [
        { text: '今天', start: 0, end: 0.4 },
        { text: '天气', start: 0.4, end: 0.8 },
      ],
      '今天天气很好',
    );
    expect(out).toEqual([
      { start: 0, end: 0.4, charStart: 0, charEnd: 2 },
      { start: 0.4, end: 0.8, charStart: 2, charEnd: 4 },
    ]);
  });

  it('returns an empty array when there are no words', () => {
    expect(alignWordsToText([], 'anything')).toEqual([]);
  });

  it('handles Turkish, exercising length-changing fold (İ → i̇)', () => {
    const sourceText = 'İstanbul is great';
    const out = alignWordsToText(
      [
        { text: 'İstanbul', start: 0, end: 0.5 },
        { text: 'is', start: 0.5, end: 0.7 },
        { text: 'great', start: 0.7, end: 1.2 },
      ],
      sourceText,
    );
    expect(out).toHaveLength(3);
    expect(out.map((t) => t.charStart)).toEqual([0, 9, 12]);
    expect(out.map((t) => t.charEnd)).toEqual([8, 11, 17]);
    // Verify that slicing the source gives us the correct words
    expect(sourceText.slice(out[0].charStart, out[0].charEnd)).toBe('İstanbul');
    expect(sourceText.slice(out[1].charStart, out[1].charEnd)).toBe('is');
    expect(sourceText.slice(out[2].charStart, out[2].charEnd)).toBe('great');
  });

  it('handles Greek final sigma, guarding per-code-point folding', () => {
    const sourceText = 'ΟΔΟΣ ΑΣ';
    const out = alignWordsToText(
      [
        { text: 'ΟΔΟΣ', start: 0, end: 0.5 },
        { text: 'ΑΣ', start: 0.5, end: 1.0 },
      ],
      sourceText,
    );
    expect(out).toHaveLength(2);
    expect(out.map((t) => t.charStart)).toEqual([0, 5]);
    expect(out.map((t) => t.charEnd)).toEqual([4, 7]);
  });
});
