import { describe, expect, it } from 'vitest';
import { INVISIBLE_RECT_SHARE, invisibleRectShare, isInvisibleSegment } from '../../src/read-aloud/invisible-text';

/**
 * Rectangles shaped like the reader's: `[x1, y1, x2, y2]` in PDF units. The
 * numbers are the ones measured on Nagpal et al. 2021 (2026-08-29), where a
 * LaTeX toolchain embedded every equation's source into the text layer.
 */
const point = (x: number, y: number) => [x, y, x, y];
const line = (x: number, y: number, w = 250, h = 9) => [x, y, x + w, y + h];

/** A segment as the reader hands it over: the text, and the geometry it was drawn at. */
const segment = (text: string, rects: number[][] | undefined, pageIndex = 2) => ({
  text,
  granularity: 'sentence',
  sourcePosition: rects ? { pageIndex, rects } : undefined,
});

describe('invisibleRectShare', () => {
  it('is 1 when every rectangle is a point — text drawn at size zero', () => {
    expect(invisibleRectShare([point(496.5, 367), point(497, 367), point(498, 367)])).toBe(1);
  });

  it('is 0 for ordinary lines of text', () => {
    expect(invisibleRectShare([line(391.3, 628, 170, 8.7), line(312, 616, 251, 9)])).toBe(0);
  });

  it('measures the real segments: the base64 blobs sit at 0.997+, every visible one at 0', () => {
    // Segment 100: 4951 rects, 4942 of them points, plus the visible "K " in front
    const junk = [line(496, 363, 14, 16.7), ...Array.from({ length: 4942 }, () => point(496.5, 367)), ...Array.from({ length: 8 }, () => line(500, 363, 6, 12))];
    const share = invisibleRectShare(junk)!;
    expect(share).toBeGreaterThan(0.997);
    expect(share).toBeLessThan(1);
    // Segment 60: five ordinary lines
    expect(invisibleRectShare([line(391, 628), line(312, 616), line(312, 604), line(312, 592), line(312, 580)])).toBe(0);
  });

  it('answers null when there is nothing to judge by, so a non-PDF view is never refused', () => {
    expect(invisibleRectShare(undefined)).toBeNull();
    expect(invisibleRectShare(null)).toBeNull();
    expect(invisibleRectShare([])).toBeNull();
    expect(invisibleRectShare('not rects')).toBeNull();
    expect(invisibleRectShare({ length: 'two' })).toBeNull();
  });

  it('ignores malformed rectangles rather than counting them either way', () => {
    expect(invisibleRectShare([line(0, 0), [1, 2], null, 'x', [NaN, 0, 1, 1]] as never)).toBe(0);
    // Nothing well-formed at all is the same as nothing to judge by
    expect(invisibleRectShare([[1, 2], null] as never)).toBeNull();
  });

  it('reads a rectangle whichever way round its corners are given', () => {
    expect(invisibleRectShare([[100, 50, 90, 40]])).toBe(0);
  });

  it('walks an array-like by index, the way a reader-side array has to be read', () => {
    const arrayLike = { length: 2, 0: point(1, 1), 1: point(2, 2) };
    expect(invisibleRectShare(arrayLike)).toBe(1);
  });
});

describe('isInvisibleSegment', () => {
  const blob = Array.from({ length: 100 }, () => point(496.5, 367));

  it('refuses a segment whose text has no extent on the page', () => {
    expect(isInvisibleSegment(segment('<latexit sha1_base64="qQ…">AAAB6Hic…', blob))).toBe(true);
  });

  it('leaves visible text alone, however long the sentence', () => {
    const long = 'A legitimately enormous sentence. '.repeat(200);
    expect(isInvisibleSegment(segment(long, [line(49, 528), line(49, 516), line(49, 504)]))).toBe(false);
  });

  it('holds the measured split at every threshold between 0.5 and 0.99', () => {
    const junk = segment('base64', [...Array.from({ length: 997 }, () => point(1, 1)), line(0, 0), line(0, 12), line(0, 24)]);
    const real = segment('prose', [line(0, 0), line(0, 12)]);
    for (const threshold of [0.5, 0.9, 0.95, 0.99]) {
      expect(isInvisibleSegment(junk, threshold), `junk at ${threshold}`).toBe(true);
      expect(isInvisibleSegment(real, threshold), `real at ${threshold}`).toBe(false);
    }
  });

  it('never refuses what it cannot judge', () => {
    expect(isInvisibleSegment(segment('no geometry', undefined))).toBe(false);
    expect(isInvisibleSegment({ text: 'bare' })).toBe(false);
    expect(isInvisibleSegment('sample')).toBe(false);
    expect(isInvisibleSegment(null)).toBe(false);
    expect(isInvisibleSegment(undefined)).toBe(false);
  });

  it('survives a segment whose properties throw, as a dead reader object would', () => {
    const hostile = { text: 'x' };
    Object.defineProperty(hostile, 'sourcePosition', {
      get() {
        throw new Error('Permission denied to access property "sourcePosition"');
      },
    });
    expect(isInvisibleSegment(hostile)).toBe(false);
  });

  it('uses a threshold no measured segment sits near', () => {
    expect(INVISIBLE_RECT_SHARE).toBe(0.9);
  });
});
