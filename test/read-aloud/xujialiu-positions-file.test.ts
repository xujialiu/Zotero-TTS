import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  entryOf,
  locatorOfPath,
  locatorPath,
  mergeSharedPositions,
  parseSharedPositions,
  serializeSharedPositions,
  SHARED_POSITIONS_FORMAT,
  SHARED_POSITIONS_VERSION,
  SharedPositionsFileError,
  stripAssertions,
  usableItem,
  type SharedItem,
} from '../../src/read-aloud/xujialiu-positions-file';

/**
 * The Positions File against docs/spec/SYNC-FORMAT.md section 6, and against
 * the fixture OpenReader's suite reads byte for byte: what one side writes the
 * other must parse and re-serialise unchanged.
 */

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'xujialiu-positions.v1.json'), 'utf8');
const ID_A = `sha256:${'a'.repeat(64)}`;
const ID_B = `sha256:${'b'.repeat(64)}`;
const ID_C = `sha256:${'c'.repeat(64)}`;

const item = (over: Partial<SharedItem> = {}): SharedItem => ({
  id: ID_B,
  format: 'epub',
  publicationId: null,
  locator: 'epubcfi(/6/34!/4/2/4/2/4)',
  anchor: { exact: '铁柱坐在村内的小路边，望着远处的群山。', prefix: '', suffix: '' },
  stamp: { at: 1758470000000, device: 'iPhone-3f9a2c1b' },
  ...over,
});

describe('the shared fixture', () => {
  it('round-trips byte for byte, the pdf item carried through unchanged', () => {
    const parsed = parseSharedPositions(FIXTURE);
    expect(parsed.dropped).toBe(0);
    expect(parsed.entries.map((e) => e.id)).toEqual([ID_A, ID_B]);
    expect(parsed.entries[0].usable).toBeNull();
    expect(parsed.entries[1].usable).toEqual(item());
    expect(serializeSharedPositions(parsed.entries)).toBe(FIXTURE);
  });

  it('has no trailing newline and no whitespace, the canonical form', () => {
    expect(FIXTURE.endsWith('}')).toBe(true);
    expect(FIXTURE).not.toMatch(/\n| {2}/);
  });
});

describe('parseSharedPositions', () => {
  it('refuses what is not the format as malformed', () => {
    expect(() => parseSharedPositions('not json')).toThrow(SharedPositionsFileError);
    expect(() => parseSharedPositions('{"format":"zotero-tts-positions","version":1,"items":[]}')).toThrow(/not a xujialiu-positions file/);
    expect(() => parseSharedPositions('{"format":"xujialiu-positions","version":1}')).toThrow(/no readable entries/);
    for (const text of ['[]', '{"format":"xujialiu-positions","version":"1","items":[]}']) {
      try {
        parseSharedPositions(text);
        expect.unreachable();
      } catch (e) {
        expect((e as SharedPositionsFileError).kind).toBe('malformed');
      }
    }
  });

  it('leaves a newer version alone, and says which', () => {
    try {
      parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: SHARED_POSITIONS_VERSION + 1, items: [] }));
      expect.unreachable();
    } catch (e) {
      expect((e as SharedPositionsFileError).kind).toBe('newer');
      expect((e as Error).message).toMatch(/version 2/);
    }
  });

  it('drops only an item with no id, and counts it', () => {
    const parsed = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [{ format: 'epub' }, null, 7, item()] }));
    expect(parsed.dropped).toBe(3);
    expect(parsed.entries).toHaveLength(1);
  });

  it('carries a malformed item through, unusable, at the oldest stamp', () => {
    const raw = { id: ID_C, format: 'epub', publicationId: null, locator: 'epubcfi(/6/2!/4/2)', anchor: { exact: '' }, stamp: { at: 'soon', device: 'x' } };
    const parsed = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [raw] }));
    expect(parsed.entries[0].usable).toBeNull();
    expect(parsed.entries[0].at).toBe(Number.NEGATIVE_INFINITY);
    expect(JSON.parse(serializeSharedPositions(parsed.entries)).items[0]).toEqual({
      id: ID_C,
      format: 'epub',
      publicationId: null,
      locator: 'epubcfi(/6/2!/4/2)',
      anchor: { exact: '', prefix: null, suffix: null },
      stamp: { at: 'soon', device: 'x' },
    });
  });

  it('keeps the newer of two items that share an id', () => {
    const parsed = parseSharedPositions(
      JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [item({ stamp: { at: 5, device: 'a' } }), item({ stamp: { at: 9, device: 'b' } })] }),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].at).toBe(9);
  });
});

describe('usableItem', () => {
  const fields = (over: Partial<SharedItem> = {}) => {
    const { id: _id, ...rest } = item(over);
    return rest;
  };

  it('accepts the spec shape and refuses each field wrong', () => {
    expect(usableItem(ID_B, fields())).toEqual(item());
    expect(usableItem('sha256:short', fields())).toBeNull();
    expect(usableItem(ID_B, fields({ format: 'pdf' }))).toBeNull();
    expect(usableItem(ID_B, fields({ publicationId: 7 as never }))).toBeNull();
    expect(usableItem(ID_B, fields({ locator: '' }))).toBeNull();
    expect(usableItem(ID_B, fields({ anchor: { exact: '', prefix: '', suffix: '' } }))).toBeNull();
    expect(usableItem(ID_B, fields({ stamp: { at: 1.5, device: 'x' } }))).toBeNull();
    expect(usableItem(ID_B, fields({ stamp: { at: 1, device: '' } }))).toBeNull();
  });

  it('holds an EPUB locator to the spec grammar: element steps only, no assertion, no text step, no offset, no range', () => {
    for (const locator of ['epubcfi(/6/34!/4/2/4/2/4)', 'epubcfi(/6/2!/4)', 'epubcfi(/4/6!/4/2)']) {
      expect(usableItem(ID_B, fields({ locator }))).not.toBeNull();
    }
    for (const locator of [
      'epubcfi(/6/34!/4/2/4/2/4/1)',
      'epubcfi(/6/34!/4/2/4/2/4/1,:0,:94)',
      'epubcfi(/6/34[chap]!/4/2)',
      'epubcfi(/6/34!/4/2:3)',
      'epubcfi(/6/34!)',
      'epubcfi(/6/34/4/2)',
      '/6/34!/4/2',
    ]) {
      expect(usableItem(ID_B, fields({ locator }))).toBeNull();
    }
  });
});

describe('serializeSharedPositions', () => {
  it('is canonical: compact, fixed key order, sorted by id, so equal content is equal text', () => {
    const later = entryOf(item({ id: ID_C }));
    const earlier = entryOf(item({ id: ID_A }));
    const text = serializeSharedPositions([later, earlier]);
    expect(text).toBe(serializeSharedPositions([earlier, later]));
    expect(JSON.parse(text).items.map((i: SharedItem) => i.id)).toEqual([ID_A, ID_C]);
    expect(Object.keys(JSON.parse(text))).toEqual(['format', 'version', 'items']);
    expect(Object.keys(JSON.parse(text).items[0])).toEqual(['id', 'format', 'publicationId', 'locator', 'anchor', 'stamp']);
    expect(text).not.toMatch(/\s/);
  });
});

describe('mergeSharedPositions', () => {
  it('is the union by id, the newer stamp winning, a tie keeping the local item', () => {
    const local = [entryOf(item({ id: ID_A, stamp: { at: 10, device: 'desk' } })), entryOf(item({ id: ID_B, stamp: { at: 10, device: 'desk' } }))];
    const remote = [entryOf(item({ id: ID_B, stamp: { at: 11, device: 'phone' } })), entryOf(item({ id: ID_C, stamp: { at: 1, device: 'phone' } }))];
    const merged = mergeSharedPositions(local, remote);
    expect(merged.map((e) => [e.id, e.at, e.usable?.stamp.device])).toEqual([
      [ID_A, 10, 'desk'],
      [ID_B, 11, 'phone'],
      [ID_C, 1, 'phone'],
    ]);
    const tie = mergeSharedPositions([entryOf(item({ stamp: { at: 5, device: 'desk' } }))], [entryOf(item({ stamp: { at: 5, device: 'phone' } }))]);
    expect(tie[0].usable?.stamp.device).toBe('desk');
  });

  it('never removes anything, and merging a file into itself changes nothing', () => {
    const parsed = parseSharedPositions(FIXTURE).entries;
    expect(serializeSharedPositions(mergeSharedPositions(parsed, parsed))).toBe(FIXTURE);
    expect(serializeSharedPositions(mergeSharedPositions([], parsed))).toBe(FIXTURE);
  });
});

describe('locator helpers', () => {
  it('strip assertions and move between a path and a locator', () => {
    expect(stripAssertions('/6/8[cop]!/4/2/4/40[release_identifier_line]')).toBe('/6/8!/4/2/4/40');
    expect(locatorPath('epubcfi(/6/8[cop]!/4/2)')).toBe('/6/8!/4/2');
    expect(locatorPath('/6/8!/4/2')).toBeNull();
    expect(locatorOfPath('/6/8[cop]!/4/2')).toBe('epubcfi(/6/8!/4/2)');
  });
});
