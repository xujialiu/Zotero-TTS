import { describe, expect, it } from 'vitest';
import {
  mergePositions,
  parsePositions,
  POSITIONS_FILENAME,
  POSITIONS_FORMAT,
  POSITIONS_VERSION,
  PositionsFileError,
  serializePositions,
} from '../../src/read-aloud/position-file';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

const entry = (over: Partial<PositionEntry> = {}): PositionEntry => ({
  lib: 1,
  key: 'ABCD1234',
  pos: { pageIndex: 3, rects: [[20, 30, 20, 30]] },
  ts: 1000,
  ...over,
});

const kindOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'no error';
  } catch (e) {
    return e instanceof PositionsFileError ? e.kind : `not a PositionsFileError: ${String(e)}`;
  }
};

describe('serializePositions / parsePositions', () => {
  it('round-trips entries through the canonical file form', () => {
    const entries = [entry(), entry({ lib: 2, key: 'EFGH5678', pos: { value: 'epubcfi(/6/4!/4/2)' }, ts: 2000 })];
    expect(parsePositions(serializePositions(entries))).toEqual(entries);
  });

  it('serializes equal content to equal text, whatever the order in', () => {
    const a = entry({ lib: 1, key: 'AAAA0001' });
    const b = entry({ lib: 1, key: 'BBBB0002' });
    const c = entry({ lib: 2, key: 'AAAA0001' });
    expect(serializePositions([c, b, a])).toBe(serializePositions([a, b, c]));
  });

  it('names the format and the file it travels as', () => {
    const parsed = JSON.parse(serializePositions([entry()])) as { format: string; version: number };
    expect(parsed.format).toBe(POSITIONS_FORMAT);
    expect(parsed.version).toBe(POSITIONS_VERSION);
    expect(POSITIONS_FILENAME).toBe('zotero-tts-positions.json');
  });

  it('normalizes a PDF rect list to its resume point on the way in', () => {
    const text = JSON.stringify({
      format: POSITIONS_FORMAT,
      version: POSITIONS_VERSION,
      items: [entry({ pos: { pageIndex: 3, rects: [[10, 20, 30, 40]] } })],
    });
    expect(parsePositions(text)[0].pos).toEqual({ pageIndex: 3, rects: [[20, 30, 20, 30]] });
  });

  it('drops malformed entries and keeps the rest', () => {
    const good = entry();
    const text = JSON.stringify({
      format: POSITIONS_FORMAT,
      version: POSITIONS_VERSION,
      items: [good, { lib: 'one', key: 'X', pos: {}, ts: 1 }, { lib: 1, key: '', pos: {}, ts: 1 }, { lib: 1, key: 'Y', ts: 1 }, null],
    });
    expect(parsePositions(text)).toEqual([good]);
  });

  it('accepts an empty items list', () => {
    expect(parsePositions(serializePositions([]))).toEqual([]);
  });

  it('refuses text that is not JSON as malformed', () => {
    expect(kindOf(() => parsePositions('<html>login</html>'))).toBe('malformed');
  });

  it('refuses a file of another format as malformed', () => {
    expect(kindOf(() => parsePositions(JSON.stringify({ format: 'zotero-tts-settings', version: 1, settings: {} })))).toBe('malformed');
  });

  it('refuses a version above its own as newer, never malformed', () => {
    const text = JSON.stringify({ format: POSITIONS_FORMAT, version: POSITIONS_VERSION + 1, items: [] });
    expect(kindOf(() => parsePositions(text))).toBe('newer');
  });
});

describe('mergePositions', () => {
  it('takes the newer side per attachment, in either direction', () => {
    const oldA = entry({ ts: 1000, pos: { pageIndex: 1, rects: [[1, 1, 1, 1]] } });
    const newA = entry({ ts: 2000, pos: { pageIndex: 9, rects: [[9, 9, 9, 9]] } });
    expect(mergePositions([oldA], [newA])).toEqual([newA]);
    expect(mergePositions([newA], [oldA])).toEqual([newA]);
  });

  it('keeps the first argument on an equal timestamp, so a self-merge changes nothing', () => {
    const mine = entry({ pos: { pageIndex: 1, rects: [[1, 1, 1, 1]] } });
    const theirs = entry({ pos: { pageIndex: 2, rects: [[2, 2, 2, 2]] } });
    expect(mergePositions([mine], [theirs])).toEqual([mine]);
    expect(mergePositions([mine], [mine])).toEqual([mine]);
  });

  it('unions attachments only one side knows', () => {
    const mine = entry({ key: 'MINE0001' });
    const theirs = entry({ key: 'THEIRS02', lib: 2 });
    expect(mergePositions([mine], [theirs])).toEqual([mine, theirs]);
    expect(mergePositions([], [theirs])).toEqual([theirs]);
    expect(mergePositions([mine], [])).toEqual([mine]);
  });

  it('returns canonical order, whatever the order in', () => {
    const first = entry({ lib: 1, key: 'AAAA0001' });
    const second = entry({ lib: 1, key: 'ZZZZ0009' });
    const third = entry({ lib: 3, key: 'AAAA0001' });
    expect(mergePositions([third, second], [first])).toEqual([first, second, third]);
  });
});
