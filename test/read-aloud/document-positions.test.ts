import { describe, expect, it } from 'vitest';
import { createDocumentPositions, type DocumentPositionsDeps } from '../../src/read-aloud/document-positions';
import type { DocumentRow } from '../../src/read-aloud/position-store';
import type { SharedItem } from '../../src/read-aloud/xujialiu-positions-file';

const ID = `sha256:${'b'.repeat(64)}`;
const OTHER = `sha256:${'c'.repeat(64)}`;
const capture = (exact = '望着远处的群山。') => ({ locator: 'epubcfi(/6/10!/4/2/4)', anchor: { exact, prefix: '', suffix: '' } });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(over: Partial<DocumentPositionsDeps> = {}) {
  const documents: DocumentRow[] = [];
  const items: SharedItem[] = [];
  const errors: unknown[] = [];
  const asked: string[] = [];
  let clock = 1000;
  /** What identify answers per `lib/key`; a missing entry answers null. */
  const ids = new Map<string, string | Error>([['1/EPUB0001', ID]]);
  const deps: DocumentPositionsDeps = {
    identify: async (lib, key) => {
      asked.push(lib + '/' + key);
      const answer = ids.get(lib + '/' + key);
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
    saveDocument: (row) => void documents.push(row),
    saveSharedPosition: (item) => void items.push(item),
    device: () => 'Desk',
    now: () => clock,
    error: (e) => void errors.push(e),
    ...over,
  };
  const positions = createDocumentPositions(deps);
  return { positions, documents, items, errors, asked, ids, tick: (ms: number) => void (clock += ms) };
}

describe('createDocumentPositions', () => {
  it('names the attachment once, then writes the latest capture stamped by the spec rule', async () => {
    const h = harness();
    h.positions.recorded(1, 'EPUB0001', capture('first'), 1005);
    h.positions.recorded(1, 'EPUB0001', capture('second'), 1006);
    expect(h.positions.stats().identifying).toBe(1);
    await settle();
    expect(h.asked).toEqual(['1/EPUB0001']);
    expect(h.documents).toEqual([{ lib: 1, key: 'EPUB0001', documentId: ID, publicationId: null, identifiedAt: 1000 }]);
    // Only the latest capture, at its own time
    expect(h.items.map((i) => i.anchor.exact)).toEqual(['second']);
    expect(h.items[0]).toMatchObject({ id: ID, format: 'epub', publicationId: null, locator: 'epubcfi(/6/10!/4/2/4)', stamp: { at: 1006, device: 'Desk' } });
    // Known now: the next sentence is written at once, and never below the item it replaces
    h.positions.recorded(1, 'EPUB0001', capture('third'), 1006);
    expect(h.items[1].stamp.at).toBe(1007);
    expect(h.positions.list()).toHaveLength(1);
    expect(h.positions.itemFor(1, 'EPUB0001')?.anchor.exact).toBe('third');
  });

  it('gives up on an attachment it cannot name, once, and reports a failing identify', async () => {
    const h = harness();
    h.ids.set('1/PDF00001', new Error('not a zip'));
    h.positions.recorded(1, 'PDF00001', capture(), 5);
    h.positions.recorded(1, 'NOTEPUB1', capture(), 5);
    await settle();
    h.positions.recorded(1, 'PDF00001', capture(), 6);
    h.positions.recorded(1, 'NOTEPUB1', capture(), 6);
    await settle();
    expect(h.asked).toEqual(['1/PDF00001', '1/NOTEPUB1']);
    expect(h.items).toEqual([]);
    expect(h.errors.map(String)).toEqual(['Error: not a zip']);
    expect(h.positions.stats()).toMatchObject({ unnamed: 2, identifying: 0, documents: 0 });
  });

  it('adopts an item only for a document this machine holds and only when strictly newer', async () => {
    const h = harness();
    h.positions.load({ documents: [{ lib: 1, key: 'EPUB0001', documentId: ID, publicationId: null, identifiedAt: 1 }], positions: [] });
    const phone = (at: number, id = ID): SharedItem => ({ ...capture('phone'), id, format: 'epub', publicationId: null, stamp: { at, device: 'iPhone-1' } });
    expect(h.positions.adopt(phone(50, OTHER))).toBe(false);
    expect(h.positions.adopt(phone(50))).toBe(true);
    expect(h.positions.adopt(phone(50))).toBe(false);
    expect(h.positions.adopt(phone(49))).toBe(false);
    expect(h.positions.adopt(phone(51))).toBe(true);
    expect(h.items.map((i) => i.stamp.at)).toEqual([50, 51]);
    expect(h.positions.itemFor(1, 'EPUB0001')?.stamp).toEqual({ at: 51, device: 'iPhone-1' });
    expect(h.positions.stats().adopted).toBe(2);
    // Reading on here again outranks the adopted item at once
    h.positions.recorded(1, 'EPUB0001', capture('desk'), 30);
    expect(h.positions.itemFor(1, 'EPUB0001')).toMatchObject({ anchor: { exact: 'desk' }, stamp: { at: 52, device: 'Desk' } });
  });

  it('backfills the attachments it is given, skipping the ones already named', async () => {
    const h = harness();
    h.ids.set('1/EPUB0002', OTHER);
    h.positions.load({ documents: [{ lib: 1, key: 'EPUB0001', documentId: ID, publicationId: null, identifiedAt: 1 }], positions: [] });
    const result = await h.positions.backfill([
      { lib: 1, key: 'EPUB0001' },
      { lib: 1, key: 'EPUB0002' },
      { lib: 1, key: 'GONE0001' },
    ]);
    expect(result).toEqual({ identified: 1, unnamed: 1 });
    expect(h.asked).toEqual(['1/EPUB0002', '1/GONE0001']);
    expect(h.positions.documentIdOf(1, 'EPUB0002')).toBe(OTHER);
    expect(h.positions.stats()).toMatchObject({ documents: 2, unnamed: 1 });
  });

  it('lets two attachments of one book share the item, and re-points an attachment whose file changed', () => {
    const h = harness();
    h.positions.load({
      documents: [
        { lib: 1, key: 'COPY0001', documentId: ID, publicationId: null, identifiedAt: 1 },
        { lib: 1, key: 'COPY0002', documentId: ID, publicationId: null, identifiedAt: 1 },
      ],
      positions: [{ ...capture('held'), id: ID, format: 'epub', publicationId: null, stamp: { at: 10, device: 'Desk' } }],
    });
    expect(h.positions.itemFor(1, 'COPY0002')?.anchor.exact).toBe('held');
    h.positions.recorded(1, 'COPY0002', capture('read on the second copy'), 11);
    expect(h.positions.itemFor(1, 'COPY0001')?.anchor.exact).toBe('read on the second copy');
  });
});
