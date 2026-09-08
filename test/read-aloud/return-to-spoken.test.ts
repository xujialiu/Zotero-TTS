import { describe, expect, it, vi } from 'vitest';
import { forgetViewReadAloudState, readAloudViewKind } from '../../src/read-aloud/return-to-spoken';

/**
 * The corner of a reader the key looks at: `_internalReader._lastView`,
 * the view `_lockPositionToReadAloud()` locks. A DOM view (EPUB, snapshot,
 * Reading Mode) carries Zotero's ReadAloud helper with the last state it
 * was handed; the PDF view keeps its own flags and state (issue #76).
 */
function domReader(state: unknown = { active: true, activeSegment: { text: 'the sentence' } }) {
  const helper = { state, positionLocked: false, scrolling: false };
  return { reader: { _internalReader: { _lastView: { _readAloud: helper } } }, helper };
}

function pdfReader() {
  const view = { _readAloudPositionLocked: false, _readAloudScrolling: false, _readAloudState: { active: true } };
  return { reader: { _internalReader: { _lastView: view } }, view };
}

describe('readAloudViewKind', () => {
  it('tells a DOM view by its ReadAloud helper and the PDF view by its lock flag', () => {
    expect(readAloudViewKind(domReader().reader._internalReader._lastView)).toBe('dom');
    expect(readAloudViewKind(pdfReader().view)).toBe('pdf');
  });

  it('answers none for no view, a view of neither kind, and a view that throws', () => {
    expect(readAloudViewKind(null)).toBe('none');
    expect(readAloudViewKind(undefined)).toBe('none');
    expect(readAloudViewKind({})).toBe('none');
    expect(readAloudViewKind({ _readAloud: null })).toBe('none');
    const dead = {};
    Object.defineProperty(dead, '_readAloud', {
      get() {
        throw new Error("can't access dead object");
      },
    });
    expect(readAloudViewKind(dead)).toBe('none');
  });
});

describe('forgetViewReadAloudState', () => {
  // The next push is then the session's first: Zotero re-locks and navigates
  it("forgets a DOM view's last state and leaves its lock flag alone", () => {
    const { reader, helper } = domReader();
    expect(forgetViewReadAloudState(reader)).toBe('dom');
    expect(helper.state).toBeNull();
    expect(helper.positionLocked).toBe(false);
    expect(helper.scrolling).toBe(false);
  });

  // The PDF view navigates on any push while locked; nothing to forget
  it('leaves the PDF view alone', () => {
    const { reader, view } = pdfReader();
    expect(forgetViewReadAloudState(reader)).toBe('pdf');
    expect(view._readAloudState).toEqual({ active: true });
    expect(view._readAloudPositionLocked).toBe(false);
  });

  it('answers none without a reader, an internal reader, or a view', () => {
    expect(forgetViewReadAloudState(null)).toBe('none');
    expect(forgetViewReadAloudState(undefined)).toBe('none');
    expect(forgetViewReadAloudState({})).toBe('none');
    expect(forgetViewReadAloudState({ _internalReader: null })).toBe('none');
    expect(forgetViewReadAloudState({ _internalReader: {} })).toBe('none');
    expect(forgetViewReadAloudState({ _internalReader: { _lastView: null } })).toBe('none');
    expect(forgetViewReadAloudState({ _internalReader: { _lastView: {} } })).toBe('none');
  });

  it('answers none for a reader that throws on the way (a dead tab)', () => {
    const reader = {};
    Object.defineProperty(reader, '_internalReader', {
      get() {
        throw new Error("can't access dead object");
      },
    });
    expect(forgetViewReadAloudState(reader)).toBe('none');
  });

  // An assignment on a reader object has landed on an Xray wrapper before
  // (index.ts waived()); the write goes through the waiver it is given
  it('writes through the waiver it is given', () => {
    const { reader, helper } = domReader();
    const target: { state?: unknown } = { state: { active: true } };
    const waive = vi.fn((value: { state?: unknown }) => (value === helper ? target : value));
    expect(forgetViewReadAloudState(reader, waive)).toBe('dom');
    expect(waive).toHaveBeenCalledWith(helper);
    expect(target.state).toBeNull();
    expect(helper.state).not.toBeNull();
  });

  // A swallowed write would be the silent no-op this exists to avoid
  it('lets a write that throws reach the caller', () => {
    const helper: { state?: unknown; positionLocked: boolean } = { positionLocked: true };
    Object.defineProperty(helper, 'state', {
      get: () => ({ active: true }),
      set() {
        throw new Error('Permission denied to access property "state"');
      },
    });
    const reader = { _internalReader: { _lastView: { _readAloud: helper } } };
    expect(() => forgetViewReadAloudState(reader)).toThrow(/Permission denied/);
  });
});
