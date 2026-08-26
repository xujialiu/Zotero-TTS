import { describe, expect, it } from 'vitest';
import type { PrefsBackend } from '../../src/core/settings';
import {
  lookupPosition,
  MAX_POSITIONS,
  putPosition,
  READ_ALOUD_POSITIONS_PREF,
  readPositions,
  samePosition,
  writePositions,
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
