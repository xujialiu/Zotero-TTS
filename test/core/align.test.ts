import { describe, expect, it } from 'vitest';
import { alignWords, alignWordsToText, type TimedWord } from '../../src/core/align';

/** The words of `text` in order, as the timestamps slice them. */
const slices = (text: string, out: { charStart: number; charEnd: number }[]) => out.map((t) => text.slice(t.charStart, t.charEnd));

/** Server words with running times, a tenth of a second each, from `from`. */
const spoken = (words: string[], from = 0): TimedWord[] => words.map((text, i) => ({ text, start: from + i / 10, end: from + (i + 1) / 10 }));

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

  it('pairs a repeated word with its own occurrence', () => {
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

  it('is case-insensitive, because engines normalize capitalization', () => {
    const out = alignWordsToText([{ text: 'the', start: 0, end: 0.1 }], 'The quick');
    expect(out[0]).toMatchObject({ charStart: 0, charEnd: 3 });
  });

  it('bridges a word the source spells differently onto the text between its neighbors', () => {
    const out = alignWordsToText(
      [
        { text: 'Hello', start: 0, end: 0.3 },
        { text: 'three', start: 0.3, end: 0.6 },
        { text: 'world', start: 0.6, end: 0.9 },
      ],
      'Hello 3 world',
    );
    expect(out).toEqual([
      { start: 0, end: 0.3, charStart: 0, charEnd: 5 },
      { start: 0.3, end: 0.6, charStart: 6, charEnd: 7 },
      { start: 0.6, end: 0.9, charStart: 8, charEnd: 13 },
    ]);
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

describe('alignWords on a server that rewrites the text before speaking it (issue #86)', () => {
  // Zotero's segment 20 of the manuscript: two sentences, the apostrophe
  // U+2019, the × U+00D7 with no space after it, exactly as measured live
  const segment =
    'In the authors’ 29.83 mm example eye, a scan labelled 3 ×3 mm covers 3.7 ×3.7 mm. Vessels in that eye therefore appear narrower, vessel length and branchpoints denser, and the foveal avascular zone smaller than they are.';
  // Kokoro-FastAPI 0.8.1's reply for the first sentence, word for word
  // and time for time (2026-09-10): the apostrophe straightened, every
  // number spelled out, the comma and the period words of their own
  const firstSentence: TimedWord[] = [
    ['In', 0.012, 0.074],
    ['the', 0.074, 0.224],
    ["authors'", 0.224, 0.674],
    ['twenty-nine', 0.674, 1.162],
    ['point', 1.162, 1.424],
    ['eight', 1.424, 1.624],
    ['three', 1.624, 1.849],
    ['mm', 1.849, 1.899],
    ['example', 1.899, 2.399],
    ['eye', 2.399, 2.887],
    [',', 2.887, 3.037],
    ['a', 3.037, 3.149],
    ['scan', 3.149, 3.537],
    ['labelled', 3.537, 3.924],
    ['three', 3.924, 4.162],
    ['×', 4.162, 4.499],
    ['three', 4.499, 4.999],
    ['mm', 4.999, 5.087],
    ['covers', 5.087, 5.424],
    ['three', 5.424, 5.662],
    ['point', 5.662, 5.974],
    ['seven', 5.974, 6.337],
    ['×', 6.337, 6.749],
    ['three', 6.749, 6.987],
    ['point', 6.987, 7.299],
    ['seven', 7.299, 7.699],
    ['mm', 7.699, 8.237],
    ['.', 8.237, 8.437],
  ].map(([text, start, end]) => ({ text: String(text), start: Number(start), end: Number(end) }));
  const secondSentence = spoken(
    ['Vessels', 'in', 'that', 'eye', 'therefore', 'appear', 'narrower', ',', 'vessel', 'length', 'and', 'branchpoints', 'denser', ',', 'and', 'the', 'foveal', 'avascular', 'zone', 'smaller', 'than', 'they', 'are', '.'],
    8.5,
  );
  const words = [...firstSentence, ...secondSentence];

  it('gives every word of the segment its span, in order, and the rewritten ones the text between their neighbors', () => {
    const { timestamps, paired, bridged, dropped } = alignWords(words, segment);
    expect(slices(segment, timestamps)).toEqual([
      'In', 'the', 'authors’', '29.83', 'mm', 'example', 'eye', 'a', 'scan', 'labelled', '3', '×', '3', 'mm', 'covers', '3.7', '×', '3.7', 'mm',
      'Vessels', 'in', 'that', 'eye', 'therefore', 'appear', 'narrower', 'vessel', 'length', 'and', 'branchpoints', 'denser', 'and', 'the', 'foveal', 'avascular', 'zone', 'smaller', 'than', 'they', 'are',
    ]);
    expect({ paired, bridged, dropped }).toEqual({ paired: 35, bridged: 5, dropped: 0 });
  });

  it('times a bridged number from the first spoken word of it to the last', () => {
    const { timestamps } = alignWords(words, segment);
    const at = (word: string, nth = 0) => timestamps.filter((t) => segment.slice(t.charStart, t.charEnd) === word)[nth];
    expect(at('29.83')).toMatchObject({ start: 0.674, end: 1.849 });
    expect(at('3', 0)).toMatchObject({ start: 3.924, end: 4.162 });
    expect(at('3', 1)).toMatchObject({ start: 4.499, end: 4.999 });
    expect(at('3.7', 0)).toMatchObject({ start: 5.424, end: 6.337 });
    expect(at('3.7', 1)).toMatchObject({ start: 6.749, end: 7.699 });
  });

  it('never puts a span inside a word, and keeps the spans in reading order', () => {
    const { timestamps } = alignWords(words, segment);
    const isBoundary = (i: number) => i <= 0 || i >= segment.length || !/[\p{L}\p{N}]/u.test(segment[i - 1]) || !/[\p{L}\p{N}]/u.test(segment[i]);
    for (const t of timestamps) {
      expect(isBoundary(t.charStart), `start of "${segment.slice(t.charStart, t.charEnd)}"`).toBe(true);
      expect(isBoundary(t.charEnd), `end of "${segment.slice(t.charStart, t.charEnd)}"`).toBe(true);
    }
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i].charStart).toBeGreaterThanOrEqual(timestamps[i - 1].charEnd);
      expect(timestamps[i].start).toBeGreaterThanOrEqual(timestamps[i - 1].start);
    }
  });

  it('lets a comma or a period extend the word before it instead of highlighting the punctuation', () => {
    const { timestamps } = alignWords(words, segment);
    const eye = timestamps.find((t) => segment.slice(t.charStart, t.charEnd) === 'eye');
    expect(eye).toMatchObject({ start: 2.399, end: 3.037 });
    const lastMm = timestamps.filter((t) => segment.slice(t.charStart, t.charEnd) === 'mm').at(-1);
    expect(lastMm).toMatchObject({ start: 7.699, end: 8.437 });
    expect(slices(segment, timestamps)).not.toContain(',');
    expect(slices(segment, timestamps)).not.toContain('.');
  });

  it('never lets punctuation stretch a word past the start of the next one', () => {
    // Kokoro timed the `]` of `[1]` over the `A` after it (measured 2026-09-10)
    const text = 'images [1]. A study';
    const out = alignWordsToText(
      [
        { text: 'images', start: 9.385, end: 9.822 },
        { text: '[one', start: 9.822, end: 10.51 },
        { text: ']', start: 10.51, end: 10.785 },
        { text: 'A', start: 10.51, end: 10.585 },
        { text: 'study', start: 10.585, end: 11 },
      ],
      text,
    );
    expect(slices(text, out)).toEqual(['images', '1', 'A', 'study']);
    expect(out[1]).toMatchObject({ start: 9.822, end: 10.51 });
    expect(out[2]).toMatchObject({ start: 10.51, end: 10.585 });
  });

  it('pairs a straightened apostrophe with the typographic one', () => {
    const text = 'the authors’ eye';
    const out = alignWordsToText(spoken(['the', "authors'", 'eye']), text);
    expect(slices(text, out)).toEqual(['the', 'authors’', 'eye']);
  });

  it('does not pair the point of a decimal with the inside of a later word', () => {
    const text = 'In the 29.83 of the branchpoints and';
    const out = alignWordsToText(spoken(['In', 'the', 'twenty-nine', 'point', 'eight', 'three', 'of', 'the', 'branchpoints', 'and']), text);
    expect(slices(text, out)).toEqual(['In', 'the', '29.83', 'of', 'the', 'branchpoints', 'and']);
  });

  it('bridges a run before the first pair and after the last', () => {
    const text = '29.83 mm covers 3.7';
    const out = alignWordsToText(spoken(['twenty-nine', 'point', 'eight', 'three', 'mm', 'covers', 'three', 'point', 'seven']), text);
    expect(slices(text, out)).toEqual(['29.83', 'mm', 'covers', '3.7']);
    expect(out[0]).toMatchObject({ start: 0, end: 0.4 });
    expect(out[3]).toMatchObject({ start: 0.6, end: 0.9 });
  });

  it('drops a run with no source text between its anchors, and counts it', () => {
    const text = 'Hello world';
    const { timestamps, paired, bridged, dropped } = alignWords(spoken(['Hello', 'extra', 'world']), text);
    expect(slices(text, timestamps)).toEqual(['Hello', 'world']);
    expect({ paired, bridged, dropped }).toEqual({ paired: 2, bridged: 0, dropped: 1 });
  });

  it('returns nothing when not one word pairs, so the whole-segment stand-in applies', () => {
    expect(alignWordsToText(spoken(['twenty', 'nine']), '29')).toEqual([]);
    expect(alignWords(spoken(['twenty', 'nine']), '29')).toMatchObject({ paired: 0, bridged: 0, dropped: 2 });
  });

  it('spans a hyphenated word whether the server keeps it whole or splits it', () => {
    const text = 'a pre-trained model';
    expect(slices(text, alignWordsToText(spoken(['a', 'pre-trained', 'model']), text))).toEqual(['a', 'pre-trained', 'model']);
    expect(slices(text, alignWordsToText(spoken(['a', 'pre', 'trained', 'model']), text))).toEqual(['a', 'pre', 'trained', 'model']);
  });

  it('keeps a number with a thousands separator or a decimal point as one word', () => {
    const text = 'about 1,000 eyes and 0.99 more';
    const out = alignWordsToText(spoken(['about', 'one', 'thousand', 'eyes', 'and', 'zero', 'point', 'nine', 'nine', 'more']), text);
    expect(slices(text, out)).toEqual(['about', '1,000', 'eyes', 'and', '0.99', 'more']);
  });

  it('treats a symbol as a word of its own, so the server can pair or bridge it', () => {
    const text = 'a 3 ×3 mm scan';
    expect(slices(text, alignWordsToText(spoken(['a', 'three', '×', 'three', 'mm', 'scan']), text))).toEqual(['a', '3', '×', '3', 'mm', 'scan']);
    // A server that says "times" for × bridges it together with the 3s
    expect(slices(text, alignWordsToText(spoken(['a', 'three', 'times', 'three', 'mm', 'scan']), text))).toEqual(['a', '3 ×3', 'mm', 'scan']);
  });

  it('folds typographic quotes so a straightened token still pairs, and a dash extends the word before it', () => {
    const text = '“quoted” – and ‘single’';
    const out = alignWordsToText(spoken(['"quoted"', '-', 'and', "'single'"]), text);
    // The closing single quote rides with its word, the way a possessive apostrophe does
    expect(slices(text, out)).toEqual(['quoted', 'and', 'single’']);
    expect(out[0]).toMatchObject({ start: 0, end: 0.2 });
  });
});
