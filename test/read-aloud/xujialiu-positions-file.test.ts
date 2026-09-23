import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  entryOf,
  EPUB_LOCATOR_PATTERN,
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
 * the fixtures OpenReader's suite reads byte for byte: what one side writes the
 * other must parse and re-serialise unchanged, and a file a third writer left
 * both write back alike.
 */

const fixture = (name: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', name), 'utf8');
const FIXTURE = fixture('xujialiu-positions.v1.json');
const CARRIED = fixture('xujialiu-positions.v1.carried.json');
const CARRIED_CANONICAL = fixture('xujialiu-positions.v1.carried.canonical.json');
const ID_9 = `sha256:${'9'.repeat(64)}`;
const ID_A = `sha256:${'a'.repeat(64)}`;
const ID_B = `sha256:${'b'.repeat(64)}`;
const ID_C = `sha256:${'c'.repeat(64)}`;
const ID_D = `sha256:${'d'.repeat(64)}`;
const ID_E = `sha256:${'e'.repeat(64)}`;
const ID_F = `sha256:${'f'.repeat(64)}`;

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

describe('the carried fixture, a file as a third writer left it (spec 2.3, 2.5; issue #139)', () => {
  it('is written back in the one form every item takes, usable or carried', () => {
    const parsed = parseSharedPositions(CARRIED);
    expect(parsed.dropped).toBe(2);
    expect(parsed.entries.map((e) => e.id)).toEqual(['', ID_9, ID_A, ID_B, ID_C, ID_D, ID_E, ID_F]);
    expect(parsed.entries.filter((e) => e.usable).map((e) => e.id)).toEqual([ID_A, ID_B]);
    expect(serializeSharedPositions(mergeSharedPositions([], parsed.entries))).toBe(CARRIED_CANONICAL);
  });

  it('and what it is written back as comes back unchanged', () => {
    const parsed = parseSharedPositions(CARRIED_CANONICAL);
    expect(parsed.dropped).toBe(0);
    expect(serializeSharedPositions(mergeSharedPositions([], parsed.entries))).toBe(CARRIED_CANONICAL);
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

  it('drops only an item whose id is not a string, and counts it: an empty id is a string, and its item is carried (issue #139)', () => {
    const parsed = parseSharedPositions(
      JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [{ format: 'epub' }, null, 7, { id: 5 }, item({ id: '' }), item()] }),
    );
    expect(parsed.dropped).toBe(4);
    expect(parsed.entries.map((e) => e.id)).toEqual(['', ID_B]);
    expect(parsed.entries[0].usable).toBeNull();
  });

  it('carries a malformed item through, unusable, at the oldest stamp, with nothing filled in', () => {
    const raw = { id: ID_C, format: 'epub', publicationId: null, locator: 'epubcfi(/6/2!/4/2)', anchor: { exact: '' }, stamp: { at: 'soon', device: 'x' } };
    const parsed = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [raw] }));
    expect(parsed.entries[0].usable).toBeNull();
    expect(parsed.entries[0].at).toBe(Number.NEGATIVE_INFINITY);
    expect(JSON.parse(serializeSharedPositions(parsed.entries)).items[0]).toEqual(raw);
  });

  it('gives an item whose stamp does not validate the oldest stamp, an empty device as much as an at that is not an integer (spec 6.7, issue #139)', () => {
    const items = [item({ id: ID_A, stamp: { at: 9, device: '' } }), item({ id: ID_B, stamp: { at: 9.5, device: 'x' } }), item({ id: ID_C, stamp: { at: 9, device: 7 as never } })];
    const parsed = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items }));
    expect(parsed.entries.map((e) => e.at)).toEqual([Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);
    expect(parsed.entries.every((e) => e.usable === null)).toBe(true);
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
    const { publicationId: _absent, ...noPublicationId } = fields();
    expect(usableItem(ID_B, noPublicationId as never)).toBeNull();
    expect(usableItem(ID_B, fields({ locator: '' }))).toBeNull();
    expect(usableItem(ID_B, fields({ anchor: { exact: '', prefix: '', suffix: '' } }))).toBeNull();
    expect(usableItem(ID_B, fields({ stamp: { at: 1.5, device: 'x' } }))).toBeNull();
    expect(usableItem(ID_B, fields({ stamp: { at: 1, device: '' } }))).toBeNull();
  });

  it('takes any non-empty locator: the grammar of spec 6.4 is the writer\'s, and a reader verifies a locator by its anchor (issue #139)', () => {
    for (const locator of ['epubcfi(/6/34!/4/2/4/2/4/1)', 'epubcfi(/6/34!/4/2/4/2/4/1,:0,:94)', 'epubcfi(/6/34[chap]!/4/2)', 'epubcfi(/6/34!/4/2:3)', '/6/34!/4/2']) {
      expect(usableItem(ID_B, fields({ locator }))?.locator).toBe(locator);
    }
  });
});

describe('EPUB_LOCATOR_PATTERN, the grammar a writer holds its locators to (spec 6.4)', () => {
  it('takes element steps only: no assertion, no text step, no offset, no range', () => {
    for (const locator of ['epubcfi(/6/34!/4/2/4/2/4)', 'epubcfi(/6/2!/4)', 'epubcfi(/4/6!/4/2)']) {
      expect(EPUB_LOCATOR_PATTERN.test(locator)).toBe(true);
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
      expect(EPUB_LOCATOR_PATTERN.test(locator)).toBe(false);
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

  it('leaves out a field or key the item lacks, never as null, and drops a key the spec does not list at every level (spec 2.3, issue #139)', () => {
    const raw = { note: 'n', stamp: { tz: 'UTC', device: 'Desktop', at: 3 }, anchor: { suffix: '', exact: 'x', note: 'n' }, locator: 'page=3', format: 'pdf', id: ID_C };
    const parsed = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [raw] }));
    expect(serializeSharedPositions(parsed.entries)).toBe(
      `{"format":"xujialiu-positions","version":1,"items":[{"id":"${ID_C}","format":"pdf","locator":"page=3","anchor":{"exact":"x","suffix":""},"stamp":{"at":3,"device":"Desktop"}}]}`,
    );
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

  it('keeps this machine\'s item against a later one whose stamp does not validate (spec 6.7, issue #139)', () => {
    const file = parseSharedPositions(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 1, items: [item({ stamp: { at: 9, device: '' } })] })).entries;
    const merged = mergeSharedPositions([entryOf(item({ stamp: { at: 5, device: 'desk' } }))], file);
    expect(merged.map((e) => e.usable?.stamp)).toEqual([{ at: 5, device: 'desk' }]);
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
