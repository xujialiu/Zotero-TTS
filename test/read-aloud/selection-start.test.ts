import { describe, expect, it, vi } from 'vitest';
import { createSelectionStart } from '../../src/read-aloud/selection-start';

const at = (offset: number) => [108, 7, offset];
const segments = [
  { position: { start: at(2), end: at(133) } },
  { position: { start: at(133), end: at(200) } },
  { position: { start: at(200), end: at(240) } },
];
function setup(nativeIndex: number | null = 0) {
  const native = vi.fn(() => nativeIndex);
  const proto = { _findReadAloudStartIndex: native };
  const mapper = { sourceToSDTPosition: vi.fn(() => ({ start: at(133), end: at(142) })) };
  const ir = Object.assign(Object.create(proto), { _sdt: { mapper } });
  const reader = { _internalReader: ir };
  const error = vi.fn();
  const patch = createSelectionStart({ error });
  patch.attach(reader);
  return { native, proto, mapper, ir, reader, error, patch };
}

describe('selection start at a shared sentence boundary (#105)', () => {
  it.each([134, 142, 210])('starts the selected sentence, including a selection ending at %s', (end) => {
    const { ir, patch, reader, mapper } = setup();
    const p = { start: at(133), end: at(end) };
    expect(ir._findReadAloudStartIndex(segments, p)).toBe(1);
    expect(mapper.sourceToSDTPosition).not.toHaveBeenCalled();
    expect(p.start).toEqual(at(133));
    expect(patch.inspect(reader)).toMatchObject({ patched: true, corrected: 1, last: { native: 0, corrected: 1 } });
  });

  it('uses the real mapper result for a PDF rectangle without moving its coordinates', () => {
    const { ir, mapper } = setup();
    const p = { pageIndex: 12, rects: [[203.6, 249.3, 241.9, 258.4]] };
    expect(ir._findReadAloudStartIndex(segments, p)).toBe(1);
    expect(mapper.sourceToSDTPosition).toHaveBeenCalledWith(p);
    expect(p.rects[0]).toEqual([203.6, 249.3, 241.9, 258.4]);
  });

  it('also maps a DOM selector through the native mapper', () => {
    const { ir, mapper } = setup();
    const p = { type: 'FragmentSelector', value: 'epubcfi(/6/2)' };
    expect(ir._findReadAloudStartIndex(segments, p)).toBe(1);
    expect(mapper.sourceToSDTPosition).toHaveBeenCalledWith(p);
  });

  it.each([2, 100, 132])('keeps native starts away from the shared boundary: %s', (start) => {
    const { ir } = setup();
    expect(ir._findReadAloudStartIndex(segments, { start: at(start), end: at(230) })).toBe(0);
  });

  it('does not skip a sentence when Zotero already chooses the next one', () => {
    const { ir, patch, reader } = setup(1);
    expect(ir._findReadAloudStartIndex(segments, { start: at(133), end: at(142) })).toBe(1);
    expect(patch.inspect(reader)?.corrected).toBe(0);
  });

  it('keeps null, terminal and gap fallbacks', () => {
    const missing = setup(null);
    expect(missing.ir._findReadAloudStartIndex(segments, {})).toBeNull();
    const terminal = setup(2);
    expect(terminal.ir._findReadAloudStartIndex(segments, { start: at(240), end: at(240) })).toBe(2);
    const gap = setup();
    const gapped = [segments[0], { position: { start: at(134), end: at(200) } }];
    expect(gap.ir._findReadAloudStartIndex(gapped, { start: at(133), end: at(134) })).toBe(0);
  });

  it('leaves an unmapped position and malformed references to Zotero', () => {
    const { ir, mapper } = setup();
    mapper.sourceToSDTPosition.mockReturnValue(null as any);
    expect(ir._findReadAloudStartIndex(segments, {})).toBe(0);
    expect(ir._findReadAloudStartIndex(segments, { start: [108, 7, NaN], end: at(142) })).toBe(0);
  });

  it('logs a failed supplemental mapping and preserves the native result', () => {
    const { ir, mapper, error } = setup();
    mapper.sourceToSDTPosition.mockImplementation(() => { throw new Error('mapper'); });
    expect(ir._findReadAloudStartIndex(segments, {})).toBe(0);
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not require reader-array callbacks and restores the patch once', () => {
    const { ir, patch, reader, proto, native } = setup();
    const list = Object.assign([...segments], { find: () => undefined, some: () => false });
    patch.attach(reader);
    expect(ir._findReadAloudStartIndex(list, { start: at(133), end: at(142) })).toBe(1);
    expect(native).toHaveBeenCalledOnce();
    patch.dispose();
    expect(proto._findReadAloudStartIndex).toBe(native);
  });
});
