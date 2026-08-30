import { describe, expect, it } from 'vitest';
import type { PrefsBackend } from '../../src/core/settings';
import {
  describePosition,
  normalizePosition,
  READ_ALOUD_POSITIONS_PREF,
  readPositions,
  samePosition,
  resumeTarget,
  type PositionEntry,
} from '../../src/read-aloud/read-aloud-position';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

// Zotero's sourcePosition, one shape per view type. Stored opaquely.
const PDF_POS = { pageIndex: 12, rects: [[10, 20, 30, 40]] };
const EPUB_POS = { value: 'epubcfi(/6/16!/4/4/12/1,:32,:168)' };

const entry = (lib: number, key: string, pos: unknown, ts: number): PositionEntry => ({ lib, key, pos, ts });

// The pref is the store's legacy home: written by 1.9.x, read here once for
// the import into the database (position-store.ts, #16; the read is deleted
// in 2.0, #22).
describe('readPositions', () => {
  it('reads what 1.9.x wrote', () => {
    const entries = [entry(1, 'ABCD1234', PDF_POS, 1000), entry(1, 'EFGH5678', EPUB_POS, 900)];
    const prefs = fakePrefs({ [READ_ALOUD_POSITIONS_PREF]: JSON.stringify({ v: 1, items: entries }) });
    expect(readPositions(prefs)).toEqual(entries);
  });

  it('reads an unset pref as empty', () => {
    expect(readPositions(fakePrefs())).toEqual([]);
  });

  it('reads malformed JSON as empty', () => {
    expect(readPositions(fakePrefs({ [READ_ALOUD_POSITIONS_PREF]: '{not json' }))).toEqual([]);
  });

  it('ignores a wire format from another version', () => {
    const raw = JSON.stringify({ v: 2, items: [entry(1, 'ABCD1234', PDF_POS, 1000)] });
    expect(readPositions(fakePrefs({ [READ_ALOUD_POSITIONS_PREF]: raw }))).toEqual([]);
  });

  it('drops entries that could not be used', () => {
    const raw = JSON.stringify({
      v: 1,
      items: [
        entry(1, 'ABCD1234', PDF_POS, 1000),
        { lib: 1, key: '', pos: PDF_POS, ts: 1 },
        { lib: '1', key: 'IJKL', pos: PDF_POS, ts: 1 },
        { lib: 1, key: 'MNOP', pos: null, ts: 1 },
      ],
    });
    expect(readPositions(fakePrefs({ [READ_ALOUD_POSITIONS_PREF]: raw }))).toEqual([entry(1, 'ABCD1234', PDF_POS, 1000)]);
  });
});

describe('samePosition', () => {
  it('is true for structurally equal positions', () => {
    expect(samePosition({ pageIndex: 12, rects: [[1, 2, 3, 4]] }, { pageIndex: 12, rects: [[1, 2, 3, 4]] })).toBe(true);
  });

  it('is false when a field differs', () => {
    expect(samePosition(PDF_POS, { ...PDF_POS, pageIndex: 13 })).toBe(false);
  });

  it('treats null and undefined alike', () => {
    expect(samePosition(null, undefined)).toBe(true);
  });
});


describe('resumeTarget', () => {
  // Passing a whole-sentence rect position back to startReadAloudAtPosition
  // starts one sentence early on PDFs (Zotero's rect→segment mapping takes
  // the boundary segment; verified 2026-08-27, notes/NOTES.md). The context
  // menu's "Read Aloud from Here" passes a zero-area point rect
  // ({pageIndex, rects: [[x, y, x, y]]}, reader bundle ~79159) and lands
  // exactly — so resume hands Zotero the center of the sentence's first
  // line instead of the full rects.
  it('turns a PDF position into the center point of its first rect', () => {
    expect(resumeTarget({ pageIndex: 1, rects: [[306.7, 605, 526.1, 613]] })).toEqual({
      pageIndex: 1,
      rects: [[416.4, 609, 416.4, 609]],
    });
  });

  it('uses the first rect only — the first line of the sentence', () => {
    const pos = {
      pageIndex: 3,
      rects: [
        [349.9, 682, 553.3, 690],
        [306.7, 671, 347.5, 679],
      ],
    };
    // (349.9 + 553.3) / 2 carries float noise; the target is rounded
    expect(resumeTarget(pos)).toEqual({ pageIndex: 3, rects: [[451.6, 686, 451.6, 686]] });
  });

  it('does not touch the stored object', () => {
    const pos = { pageIndex: 1, rects: [[0, 0, 10, 10]] };
    resumeTarget(pos);
    expect(pos.rects[0]).toEqual([0, 0, 10, 10]);
  });

  it('passes EPUB and snapshot selectors through unchanged', () => {
    const cfi = { type: 'FragmentSelector', conformsTo: 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html', value: 'epubcfi(/6/16!/4/4/54/1:0)' };
    expect(resumeTarget(cfi)).toBe(cfi);
  });

  it('passes malformed PDF shapes through unchanged', () => {
    const noRects = { pageIndex: 1, rects: [] };
    expect(resumeTarget(noRects)).toBe(noRects);
    const badRect = { pageIndex: 1, rects: [[1, 2, 3]] };
    expect(resumeTarget(badRect)).toBe(badRect);
    const nan = { pageIndex: 1, rects: [[1, 2, 3, Number.NaN]] };
    expect(resumeTarget(nan)).toBe(nan);
    expect(resumeTarget(null)).toBe(null);
    expect(resumeTarget('epubcfi(...)')).toBe('epubcfi(...)');
  });
});

describe('normalizePosition', () => {
  // What the store keeps is what resume reads: the center of the first
  // rect, as the same zero-area point rect resume already hands Zotero.
  // The rest of the rect list — one per line, or per character when
  // mergeLineRects finds nothing to merge (#14: 4,912 of them, 106 KB) —
  // is read by nothing and is not stored.
  it('reduces a PDF position to the point resume uses, dropping nextPageRects', () => {
    const pos = {
      pageIndex: 3,
      rects: [
        [349.9, 682, 553.3, 690],
        [306.7, 671, 347.5, 679],
      ],
      nextPageRects: [[1, 2, 3, 4]],
    };
    expect(normalizePosition(pos)).toEqual({ pageIndex: 3, rects: [[451.6, 686, 451.6, 686]] });
  });

  // Measured live (2026-08-30): an unrounded center comes out as
  // 204.20000000000005 — 18 characters of float noise per coordinate, which
  // made a 58-char position *grow* to 77 on normalization. One decimal is
  // 0.05 PDF units of error against character rects 6–12 units tall.
  it('rounds coordinates to one decimal', () => {
    expect(normalizePosition({ pageIndex: 0, rects: [[204.1, 433.5, 204.3, 433.5]] })).toEqual({
      pageIndex: 0,
      rects: [[204.2, 433.5, 204.2, 433.5]],
    });
    expect(normalizePosition({ pageIndex: 4, rects: [[0.1, 0.1, 0.2, 0.2]] })).toEqual({
      pageIndex: 4,
      rects: [[0.2, 0.2, 0.2, 0.2]],
    });
  });

  it('is idempotent — a normalized position is its own normal form', () => {
    const once = normalizePosition({ pageIndex: 12, rects: [[10, 20, 30, 40]] });
    expect(normalizePosition(once)).toEqual(once);
  });

  it('is the shape resume passes through unchanged', () => {
    const once = normalizePosition({ pageIndex: 12, rects: [[10.37, 20.11, 30.62, 40.99]] });
    expect(resumeTarget(once)).toEqual(once);
  });

  it('passes EPUB and snapshot selectors through unchanged', () => {
    const cfi = { type: 'FragmentSelector', conformsTo: 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html', value: 'epubcfi(/6/16!/4/4/54/1:0)' };
    expect(normalizePosition(cfi)).toBe(cfi);
  });

  it('passes malformed PDF shapes through unchanged', () => {
    const noRects = { pageIndex: 1, rects: [] };
    expect(normalizePosition(noRects)).toBe(noRects);
    const nan = { pageIndex: 1, rects: [[1, 2, 3, Number.NaN]] };
    expect(normalizePosition(nan)).toBe(nan);
    expect(normalizePosition(null)).toBe(null);
  });
});

describe('describePosition', () => {
  // What diagnostics.position() reports instead of dumping the store: with
  // one pathological entry the dump itself was 100 KB (#14, item 4)
  it('describes a PDF position by rect count and size', () => {
    const pos = { pageIndex: 3, rects: [[1, 2, 3, 4], [5, 6, 7, 8]], nextPageRects: [[9, 10, 11, 12]] };
    expect(describePosition(pos)).toEqual({ kind: 'pdf', chars: JSON.stringify(pos).length, rects: 2, nextPageRects: 1 });
  });

  it('describes a selector by its type', () => {
    expect(describePosition(EPUB_POS)).toEqual({ kind: 'object', chars: JSON.stringify(EPUB_POS).length });
    const frag = { type: 'FragmentSelector', value: 'epubcfi(/6/16!)' };
    expect(describePosition(frag)).toEqual({ kind: 'FragmentSelector', chars: JSON.stringify(frag).length });
  });

  it('never throws, whatever it is handed', () => {
    expect(describePosition('epubcfi(...)')).toEqual({ kind: 'string', chars: JSON.stringify('epubcfi(...)').length });
    expect(describePosition(null)).toEqual({ kind: 'null', chars: 4 });
    const dead = {
      get value(): string {
        throw new TypeError("can't access dead object");
      },
    };
    expect(describePosition(dead)).toEqual({ kind: 'unserializable', chars: -1 });
  });
});
