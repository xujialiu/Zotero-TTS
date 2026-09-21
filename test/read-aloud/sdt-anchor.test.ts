import { describe, expect, it } from 'vitest';
import {
  blockAtRef,
  captureShared,
  elementLocator,
  offsetInBlock,
  resolveSharedItem,
  sdtPositionAt,
  snapshotBlocks,
  walkSnapshot,
  type BlockSnapshot,
} from '../../src/read-aloud/sdt-anchor';

/**
 * The two crossings over an SDT structure shaped as Zotero's worker writes
 * one (reader.js 59961-60010, 62560-62615): top-level blocks, containers with
 * block children, leaves whose `content` is text nodes only, every block with
 * `anchor.selectorMap`.
 */

const text = (t: string) => ({ text: t, anchor: { selectorMap: '/1' } });
const leaf = (map: string, ...nodes: { text: string }[]) => ({ anchor: { selectorMap: map }, content: nodes });
const structure = {
  content: [
    leaf('/6/4!/4/2', text('仙逆')),
    {
      anchor: { selectorMap: '/6/10!/4/2' },
      content: [
        leaf('/6/10!/4/2/2[intro]', text('第1章 '), text('离乡')),
        leaf('/6/10!/4/2/4', text('铁柱坐在村内的小路边，'), text('望着远处的群山。他叹了口气。')),
        leaf('/6/10!/4/2/6', text('He said nothing. '), text('And then he left.')),
        leaf('/6/10!/4/2/8/1', text('Bare text in a container.')),
      ],
    },
    leaf('/6/12!/4/2', text('He said nothing. ')),
  ],
};

describe('walkSnapshot', () => {
  it('lists every leaf block with its stripped path, text and node starts, in walk order', () => {
    const blocks = snapshotBlocks(structure);
    expect(blocks.map((b) => b.path)).toEqual(['/6/4!/4/2', '/6/10!/4/2/2', '/6/10!/4/2/4', '/6/10!/4/2/6', '/6/10!/4/2/8/1', '/6/12!/4/2']);
    expect(blocks[2]).toEqual({ ref: [1, 1], path: '/6/10!/4/2/4', text: '铁柱坐在村内的小路边，望着远处的群山。他叹了口气。', starts: [0, 11] });
  });

  it('narrows to the blocks related to a path: the same, under it, or holding it', () => {
    expect(snapshotBlocks(structure, '/6/10!/4/2/4').map((b) => b.path)).toEqual(['/6/10!/4/2/4']);
    expect(snapshotBlocks(structure, '/6/10!/4/2').map((b) => b.path)).toEqual(['/6/10!/4/2/2', '/6/10!/4/2/4', '/6/10!/4/2/6', '/6/10!/4/2/8/1']);
    expect(snapshotBlocks(structure, '/6/10!/4/2/8').map((b) => b.path)).toEqual(['/6/10!/4/2/8/1']);
    expect(snapshotBlocks(structure, '/6/10!/4/2/40').map((b) => b.path)).toEqual([]);
  });

  it('is self-contained, so its source runs as a function of its own in another window', () => {
    const source = walkSnapshot.toString();
    const rebuilt = new Function('structure', 'wantPath', `return (${source})(structure, wantPath)`) as typeof walkSnapshot;
    expect(rebuilt(structure, null)).toBe(walkSnapshot(structure, null));
    expect(rebuilt(null, null)).toBe('[]');
  });
});

describe('blockAtRef', () => {
  it('reads one block by its ref without walking the rest', () => {
    expect(blockAtRef(structure, [1, 1])).toEqual(snapshotBlocks(structure)[2]);
    expect(blockAtRef(structure, [1])).toBeNull();
    expect(blockAtRef(structure, [9])).toBeNull();
  });
});

describe('elementLocator', () => {
  it('keeps an element path and drops a trailing text step', () => {
    expect(elementLocator('/6/10!/4/2/4')).toBe('epubcfi(/6/10!/4/2/4)');
    expect(elementLocator('/6/10!/4/2/8/1')).toBe('epubcfi(/6/10!/4/2/8)');
    expect(elementLocator('/6/10!/4/2/8[id]/1')).toBe('epubcfi(/6/10!/4/2/8)');
    expect(elementLocator('/6/10!/1')).toBeNull();
    expect(elementLocator('/6/10/4/2')).toBeNull();
  });
});

describe('captureShared', () => {
  const block = blockAtRef(structure, [1, 1])!;

  it('quotes the segment and takes the context from the same block', () => {
    const capture = captureShared(block, { text: '望着远处的群山。', start: [1, 1, 1, 0], end: [1, 1, 1, 8] });
    expect(capture).toEqual({
      locator: 'epubcfi(/6/10!/4/2/4)',
      anchor: { exact: '望着远处的群山。', prefix: '铁柱坐在村内的小路边，', suffix: '他叹了口气。' },
    });
  });

  it('refuses a segment that starts in another block or at a node the block does not have', () => {
    expect(captureShared(block, { text: 'x', start: [1, 2, 0, 0], end: [1, 2, 0, 1] })).toBeNull();
    expect(captureShared(block, { text: 'x', start: [1, 1, 5, 0], end: [1, 1, 5, 1] })).toBeNull();
    expect(captureShared(block, { text: '', start: [1, 1, 0, 0], end: [1, 1, 0, 1] })).toBeNull();
  });

  it('takes the locator from the parent element when the block is anchored at a text node', () => {
    const bare = blockAtRef(structure, [1, 3])!;
    expect(captureShared(bare, { text: 'Bare text in a container.', start: [1, 3, 0, 0], end: [1, 3, 0, 25] })?.locator).toBe('epubcfi(/6/10!/4/2/8)');
  });
});

describe('offsetInBlock and sdtPositionAt', () => {
  const block = blockAtRef(structure, [1, 1])!;

  it('move between block offsets and SDT points, both ways', () => {
    expect(offsetInBlock(block, [1, 1, 0, 3])).toBe(3);
    expect(offsetInBlock(block, [1, 1, 1, 8])).toBe(19);
    expect(offsetInBlock(block, [1, 1, 5, 0])).toBeNull();
    expect(sdtPositionAt(block, 11, 19)).toEqual({ start: [1, 1, 1, 0], end: [1, 1, 1, 8] });
    expect(sdtPositionAt(block, 0, 11)).toEqual({ start: [1, 1, 0, 0], end: [1, 1, 0, 11] });
  });
});

describe('resolveSharedItem', () => {
  const blocks: BlockSnapshot[] = snapshotBlocks(structure);
  const anchor = { exact: '望着远处的群山。', prefix: '铁柱坐在村内的小路边，', suffix: '他叹了口气。' };

  it('finds the sentence in the block the locator names', () => {
    const r = resolveSharedItem(anchor, 'epubcfi(/6/10!/4/2/4)', blocks);
    expect(r).toMatchObject({ outcome: 'resolved', start: 11, end: 19, agreement: 'exact', moved: null });
  });

  it('finds it under a container locator and inside a text-anchored block', () => {
    expect(resolveSharedItem(anchor, 'epubcfi(/6/10!/4/2)', blocks)).toMatchObject({ outcome: 'resolved', moved: null, block: { path: '/6/10!/4/2/4' } });
    const bare = { exact: 'Bare text in a container.', prefix: '', suffix: '' };
    expect(resolveSharedItem(bare, 'epubcfi(/6/10!/4/2/8)', blocks)).toMatchObject({ outcome: 'resolved', moved: null, block: { path: '/6/10!/4/2/8/1' } });
  });

  it('recovers the sentence elsewhere when the locator names another block, and says why', () => {
    expect(resolveSharedItem(anchor, 'epubcfi(/6/10!/4/2/6)', blocks)).toMatchObject({ outcome: 'resolved', moved: 'text-disagreed', block: { path: '/6/10!/4/2/4' } });
    expect(resolveSharedItem(anchor, 'epubcfi(/6/99!/4/2)', blocks)).toMatchObject({ outcome: 'resolved', moved: 'locator-did-not-resolve' });
  });

  it('refuses a tie rather than picking the first, and says when nothing matches', () => {
    const repeated = { exact: 'He said nothing.', prefix: '', suffix: '' };
    expect(resolveSharedItem(repeated, 'epubcfi(/6/99!/4/2)', blocks)).toMatchObject({ outcome: 'unresolved', search: 'ambiguous' });
    // The context settles it: only one of the two has 'And then he left.' after it
    expect(resolveSharedItem({ ...repeated, suffix: ' And then he left.' }, 'epubcfi(/6/99!/4/2)', blocks)).toMatchObject({ outcome: 'resolved', block: { path: '/6/10!/4/2/6' } });
    expect(resolveSharedItem({ exact: 'Nowhere in this book.', prefix: '', suffix: '' }, 'epubcfi(/6/10!/4/2/4)', blocks)).toMatchObject({ outcome: 'unresolved', because: 'text-disagreed', search: 'not-found' });
    expect(resolveSharedItem({ exact: '* * *', prefix: '', suffix: '' }, 'epubcfi(/6/10!/4/2/4)', blocks)).toMatchObject({ outcome: 'unresolved', search: 'anchor-not-matchable' });
  });
});
