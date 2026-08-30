import { describe, expect, it } from 'vitest';
import type { PrefsBackend } from '../../src/core/settings';
import {
  describePosition,
  lookupPosition,
  MAX_POSITIONS,
  MAX_POSITIONS_BYTES,
  normalizePosition,
  putPosition,
  READ_ALOUD_POSITIONS_PREF,
  readPositions,
  samePosition,
  writePositions,
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

describe('readPositions / writePositions', () => {
  it('round-trips through the plugin pref', () => {
    const prefs = fakePrefs();
    const entries = [entry(1, 'ABCD1234', PDF_POS, 1000), entry(1, 'EFGH5678', EPUB_POS, 900)];
    writePositions(prefs, entries);
    expect(typeof prefs.store[READ_ALOUD_POSITIONS_PREF]).toBe('string');
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

  it('never writes more than MAX_POSITIONS entries', () => {
    const prefs = fakePrefs();
    const many = Array.from({ length: MAX_POSITIONS + 10 }, (_, i) => entry(1, `KEY${i}`, PDF_POS, 1000 - i));
    writePositions(prefs, many);
    expect(readPositions(prefs)).toHaveLength(MAX_POSITIONS);
    expect(readPositions(prefs)[0].key).toBe('KEY0');
  });
});

describe('putPosition', () => {
  it('adds a new entry at the front', () => {
    const before = [entry(1, 'OLD', EPUB_POS, 900)];
    expect(putPosition(before, 1, 'NEW', PDF_POS, 1000)).toEqual([entry(1, 'NEW', PDF_POS, 1000), entry(1, 'OLD', EPUB_POS, 900)]);
  });

  it('replaces the entry for the same attachment and moves it to the front', () => {
    const before = [entry(1, 'A', PDF_POS, 800), entry(1, 'B', EPUB_POS, 900)];
    const after = putPosition(before, 1, 'A', EPUB_POS, 1000);
    expect(after).toEqual([entry(1, 'A', EPUB_POS, 1000), entry(1, 'B', EPUB_POS, 900)]);
  });

  it('keeps the same key in another library', () => {
    const before = [entry(2, 'A', PDF_POS, 900)];
    const after = putPosition(before, 1, 'A', EPUB_POS, 1000);
    expect(after).toEqual([entry(1, 'A', EPUB_POS, 1000), entry(2, 'A', PDF_POS, 900)]);
  });

  it('drops the oldest entry past MAX_POSITIONS', () => {
    const before = Array.from({ length: MAX_POSITIONS }, (_, i) => entry(1, `KEY${i}`, PDF_POS, 1000 - i));
    const after = putPosition(before, 1, 'FRESH', EPUB_POS, 2000);
    expect(after).toHaveLength(MAX_POSITIONS);
    expect(after[0].key).toBe('FRESH');
    expect(after.some((e) => e.key === `KEY${MAX_POSITIONS - 1}`)).toBe(false);
  });

  it('does not mutate the array it is given', () => {
    const before = [entry(1, 'A', PDF_POS, 900)];
    putPosition(before, 1, 'A', EPUB_POS, 1000);
    expect(before).toEqual([entry(1, 'A', PDF_POS, 900)]);
  });
});

describe('lookupPosition', () => {
  const entries = [entry(1, 'A', PDF_POS, 1000), entry(2, 'B', EPUB_POS, 900)];

  it('finds by library and key', () => {
    expect(lookupPosition(entries, 2, 'B')).toEqual(EPUB_POS);
  });

  it('misses when the key matches but the library does not', () => {
    expect(lookupPosition(entries, 3, 'A')).toBeNull();
  });

  it('returns null for an unknown attachment', () => {
    expect(lookupPosition(entries, 1, 'NOPE')).toBeNull();
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

describe('writePositions size cap', () => {
  const utf8 = new TextEncoder();
  const stored = (prefs: { store: Record<string, unknown> }): string => prefs.store[READ_ALOUD_POSITIONS_PREF] as string;

  // Gecko warns above 4 KiB (MAX_ADVISABLE_PREF_LENGTH, libpref) and throws
  // above 1 MiB; the count cap alone lets 50 entries reach either. Interim
  // guard while the store lives in a pref — #16 moves it to SQLite and
  // deletes both caps.
  it('drops oldest entries until the serialized store fits the byte budget', () => {
    const prefs = fakePrefs();
    const many = Array.from({ length: MAX_POSITIONS }, (_, i) => entry(1, `KEY${i}`, { value: 'x'.repeat(150) }, 1000 - i));
    writePositions(prefs, many);
    const kept = readPositions(prefs);
    expect(utf8.encode(stored(prefs)).length).toBeLessThanOrEqual(MAX_POSITIONS_BYTES);
    expect(kept.length).toBeLessThan(MAX_POSITIONS);
    expect(kept.length).toBeGreaterThan(0);
    // Newest first, oldest dropped: what survives is a prefix
    expect(kept.map((e) => e.key)).toEqual(many.slice(0, kept.length).map((e) => e.key));
  });

  it('still writes the newest entry even when it alone exceeds the budget', () => {
    // Losing the freshest bookmark is worse than one oversized write
    const prefs = fakePrefs();
    const fat = entry(1, 'FAT', { value: 'y'.repeat(5000) }, 1000);
    writePositions(prefs, [fat, entry(1, 'OLD', EPUB_POS, 900)]);
    expect(readPositions(prefs)).toEqual([fat]);
  });

  it('measures the budget in UTF-8 bytes, not string length', () => {
    // 60 CJK characters are 60 UTF-16 units but 180 UTF-8 bytes — the pref
    // warning counts bytes
    const prefs = fakePrefs();
    const many = Array.from({ length: 30 }, (_, i) => entry(1, `KEY${i}`, { value: '汉'.repeat(60) }, 1000 - i));
    writePositions(prefs, many);
    expect(stored(prefs).length).toBeLessThan(MAX_POSITIONS_BYTES);
    expect(utf8.encode(stored(prefs)).length).toBeLessThanOrEqual(MAX_POSITIONS_BYTES);
    expect(readPositions(prefs).length).toBeLessThan(30);
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
