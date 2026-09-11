import { describe, expect, it, vi } from 'vitest';
import {
  boxOfRects,
  createSentenceInView,
  extentOf,
  followMargin,
  followTarget,
  isFollowCall,
  pageBoxInContainer,
  type Box,
  type FollowInput,
  type SentenceInViewDeps,
  type Viewport,
} from '../../src/read-aloud/sentence-in-view';

/**
 * The two sentences measured live on 2026-09-10 (issue #83), in container
 * coordinates at page-width zoom on a 994 px viewport. A: sentence 82 of
 * the IOVS paper crosses a page — two lines at the foot of the right
 * column, five more at the head of the next page's left column. B:
 * sentence 101 crosses a column on one page — its box spans the page.
 */
const A_HEAD: Box = [609, 2859, 1056, 2894];
const A_TAIL: Box = [128, 3645, 575, 3738];
const A_WHOLE: Box = [128, 2859, 1056, 3738];
const B_BOX: Box = [498, 3645, 1055, 4384];

const VIEWPORT: Viewport = { scrollTop: 0, scrollLeft: 0, clientWidth: 1184, clientHeight: 994, scrollWidth: 1184, scrollHeight: 14926 };
const FOLLOW_OPTIONS = { ifNeeded: true, visibilityMargin: -248.5, block: 'center', inline: 'nearest', behavior: 'smooth' };

const at = (scrollTop: number, more: Partial<Viewport> = {}): Viewport => ({ ...VIEWPORT, scrollTop, ...more });
const decide = (input: Omit<FollowInput, 'margin'> & { margin?: number }) => followTarget({ margin: 24, ...input });

describe('isFollowCall', () => {
  it("recognizes the follow's options and nothing else", () => {
    expect(isFollowCall(FOLLOW_OPTIONS)).toBe(true);
    // The selection's navigate (reader.js:76721)
    expect(isFollowCall({ block: 'nearest' })).toBe(false);
    // ifNeeded without the follow's negative margin
    expect(isFollowCall({ ifNeeded: true, inline: 'nearest', visibilityMargin: 0 })).toBe(false);
    expect(isFollowCall({ ifNeeded: true, inline: 'nearest' })).toBe(false);
    expect(isFollowCall({ ifNeeded: true, visibilityMargin: -10 })).toBe(false);
    expect(isFollowCall({})).toBe(false);
    expect(isFollowCall(null)).toBe(false);
    expect(isFollowCall(undefined)).toBe(false);
  });
});

describe('followMargin', () => {
  it('is a fortieth of the viewport, between 8 and 24 px', () => {
    expect(followMargin(994)).toBe(24);
    expect(followMargin(700)).toBe(18);
    expect(followMargin(500)).toBe(13);
    expect(followMargin(200)).toBe(8);
    expect(followMargin(0)).toBe(8);
    expect(followMargin(NaN)).toBe(8);
  });
});

describe('boxOfRects and pageBoxInContainer', () => {
  it('takes the bounding box of the rects', () => {
    expect(boxOfRects([[100, 700, 300, 712]])).toEqual([100, 700, 300, 712]);
    expect(
      boxOfRects([
        [100, 700, 300, 712],
        [80, 680, 200, 692],
      ]),
    ).toEqual([80, 680, 300, 712]);
    expect(boxOfRects([])).toBeNull();
    expect(boxOfRects([[1, 2, 3]])).toBeNull();
  });

  // Zotero's getPositionBoundingViewRect (reader.js:77036): the PDF box's
  // corners through the page viewport, then the page div's client rect
  // and the container's scroll offsets
  it("maps a page's rects the way Zotero's getPositionBoundingViewRect does", () => {
    const page = {
      viewport: { convertToViewportPoint: (x: number, y: number): [number, number] => [x * 2, (800 - y) * 2] },
      div: { getBoundingClientRect: () => ({ x: 10, y: -3026 }) },
    };
    expect(pageBoxInContainer([[100, 700, 300, 712]], page, { scrollLeft: 0, scrollTop: 6024 })).toEqual([210, 3174, 610, 3198]);
    expect(pageBoxInContainer([], page, { scrollLeft: 0, scrollTop: 6024 })).toBeNull();
  });
});

describe('extentOf', () => {
  // The identity page: rects are already container coordinates
  const page = { viewport: { convertToViewportPoint: (x: number, y: number): [number, number] => [x, y] }, div: { getBoundingClientRect: () => ({ x: 0, y: 0 }) } };
  const pages = (i: number) => (i === 1 || i === 2 ? page : null);
  const scroll = { scrollLeft: 0, scrollTop: 0 };

  it('measures the head on its page and the whole across the next page', () => {
    expect(extentOf({ pageIndex: 1, rects: [A_HEAD] }, pages, scroll)).toEqual({ head: A_HEAD, whole: A_HEAD });
    expect(extentOf({ pageIndex: 1, rects: [A_HEAD], nextPageRects: [A_TAIL] }, pages, scroll)).toEqual({ head: A_HEAD, whole: A_WHOLE });
  });

  it('keeps the head alone when the next page is not there, and answers null for what it cannot measure', () => {
    expect(extentOf({ pageIndex: 2, rects: [A_HEAD], nextPageRects: [A_TAIL] }, pages, scroll)).toEqual({ head: A_HEAD, whole: A_HEAD });
    expect(extentOf({ pageIndex: 5, rects: [A_HEAD] }, pages, scroll)).toBeNull();
    expect(extentOf({ pageIndex: 1, rects: [] }, pages, scroll)).toBeNull();
    expect(extentOf({ pageIndex: 1 }, pages, scroll)).toBeNull();
    expect(extentOf({ pageIndex: 1, rects: [A_HEAD], rotation: 90 }, pages, scroll)).toBeNull();
    expect(extentOf(null, pages, scroll)).toBeNull();
  });
});

describe('followTarget', () => {
  it('centers a page-crossing sentence whose tail is below the bottom edge (case A)', () => {
    const target = decide({ head: A_HEAD, whole: A_WHOLE, part: null, viewport: at(2357) });
    expect(target.reason).toBe('cut');
    expect(target.fits).toBe(true);
    expect(target.top).toBeCloseTo(2801.5);
    expect(target.left).toBeUndefined();
  });

  it('centers a column-crossing sentence whose tail is above the top edge (case B)', () => {
    const target = decide({ head: B_BOX, whole: B_BOX, part: null, viewport: at(3808) });
    expect(target.reason).toBe('cut');
    expect(target.top).toBeCloseTo(3517.5);
  });

  it('leaves a sentence that is wholly on screen alone', () => {
    const box: Box = [100, 3000, 1000, 3035];
    const target = decide({ head: box, whole: box, part: null, viewport: at(2600) });
    // Zotero's method then runs: it finds the sentence visible and keeps the horizontal axis
    expect(target).toEqual({ reason: 'none', fits: true, handled: false });
  });

  it("keeps Zotero's own trigger: a start in the bottom quarter, or an end in the top quarter", () => {
    const low: Box = [100, 3400, 1000, 3435];
    const lowTarget = decide({ head: low, whole: low, part: null, viewport: at(2600) });
    expect(lowTarget.reason).toBe('zotero');
    expect(lowTarget.top).toBeCloseTo(2920.5);
    const high: Box = [100, 2620, 1000, 2655];
    const highTarget = decide({ head: high, whole: high, part: null, viewport: at(2600) });
    expect(highTarget.reason).toBe('zotero');
    expect(highTarget.top).toBeCloseTo(2140.5);
  });

  describe('a sentence taller than the viewport', () => {
    const head: Box = [100, 3000, 1000, 3015];
    const whole: Box = [100, 3000, 1000, 4287];

    it('follows the word being read, only when it leaves the viewport', () => {
      const inView = decide({ head, whole, part: [100, 3000, 160, 3015], viewport: at(2900) });
      // Ours even so: Zotero's rule would center the head again on every push
      expect(inView).toEqual({ reason: 'none', fits: false, handled: true });
      const below = decide({ head, whole, part: [100, 3900, 160, 3915], viewport: at(2900) });
      expect(below.reason).toBe('part');
      expect(below.top).toBeCloseTo(3410.5);
      const above = decide({ head, whole, part: [100, 3000, 160, 3015], viewport: at(3400) });
      expect(above.reason).toBe('part');
      expect(above.top).toBeCloseTo(2510.5);
    });

    it('brings the head to the top edge when there is no word to follow, and then holds still', () => {
      const first = decide({ head, whole, part: null, viewport: at(2000) });
      expect(first.reason).toBe('cut');
      expect(first.top).toBe(2976);
      // Already there: the head sits at the margin, and Zotero's top-quarter
      // trigger must not pull it back and forth on every push
      expect(decide({ head, whole, part: null, viewport: at(2976) })).toEqual({ reason: 'none', fits: false, handled: true });
    });
  });

  it('clamps the target to the document', () => {
    const last: Box = [100, 14800, 1000, 14835];
    expect(decide({ head: last, whole: last, part: null, viewport: at(13000) }).top).toBe(13932);
    const first: Box = [100, 10, 1000, 45];
    expect(decide({ head: first, whole: first, part: null, viewport: at(600) }).top).toBe(0);
  });

  it("keeps Zotero's horizontal rule on the part it brings in", () => {
    const wide = { clientWidth: 1184, scrollWidth: 2400 };
    const right: Box = [1300, 3400, 1700, 3435];
    expect(decide({ head: right, whole: right, part: null, viewport: at(2600, wide) }).left).toBe(526);
    const left: Box = [100, 3400, 400, 3435];
    expect(decide({ head: left, whole: left, part: null, viewport: at(2600, { ...wide, scrollLeft: 600 }) }).left).toBe(90);
    // Wider than the viewport and already overlapping it: no horizontal move
    const wider: Box = [0, 3400, 2000, 3435];
    expect(decide({ head: wider, whole: wider, part: null, viewport: at(2600, { ...wide, scrollLeft: 600 }) }).left).toBeUndefined();
    // Horizontally in view: no left at all
    const centered: Box = [300, 3400, 900, 3435];
    expect(decide({ head: centered, whole: centered, part: null, viewport: at(2600, wide) }).left).toBeUndefined();
  });

  it('takes the margin from the viewport when none is given', () => {
    // 994 px → 24 px: a tail 20 px inside the bottom edge is still "cut"
    const box: Box = [100, 3000, 1000, 3574];
    expect(followTarget({ head: box, whole: box, part: null, viewport: at(2600) }).reason).toBe('cut');
    expect(followTarget({ head: box, whole: box, part: null, viewport: at(2600), margin: 8 }).reason).toBe('none');
  });
});

/**
 * A reader tab as the module sees it: the internal reader's primary view is
 * a PDFView whose prototype owns navigateToPosition; its pdf.js pages map
 * rects to container coordinates by identity, so the fixtures above are
 * both PDF rects and container boxes.
 */
function fakeReader(options: { scrollTop?: number; state?: unknown } = {}) {
  const container = {
    scrollTop: options.scrollTop ?? 2357,
    scrollLeft: 0,
    clientWidth: 1184,
    clientHeight: 994,
    scrollWidth: 1184,
    scrollHeight: 14926,
    scrollTo: vi.fn(),
  };
  const page = {
    viewport: { convertToViewportPoint: (x: number, y: number): [number, number] => [x, y] },
    div: { getBoundingClientRect: () => ({ x: 0, y: -container.scrollTop }) },
  };
  const original = vi.fn();
  class PDFView {
    _pages: unknown[] = [];
    _readAloudState: unknown = options.state ?? null;
    _readAloudPositionLocked = false;
    _iframeWindow = {
      innerHeight: 994,
      document: { getElementById: (id: string) => (id === 'viewerContainer' ? container : null) },
      PDFViewerApplication: { pdfViewer: { _pages: [page, page, page] } },
    };
    setReadAloudState(state: unknown) { this._readAloudState = state; }
    lockPositionToReadAloud() { this._readAloudPositionLocked = true; }
    navigateToPosition(position: unknown, opts?: unknown): unknown {
      return original.call(this, position, opts);
    }
  }
  const view = new PDFView();
  const reader = { _internalReader: { _primaryView: view } };
  return { reader, view, container, original, proto: PDFView.prototype as any };
}

function push(view: any, position: unknown): void {
  view.setReadAloudState(Object.assign(view._readAloudState ?? {}, {
    active: true, popupOpen: true, paused: false, activeSegment: { sourcePosition: position },
  }));
}

function makeDeps(over: Partial<SentenceInViewDeps> = {}) {
  return {
    error: vi.fn(),
    debug: vi.fn(),
    cloneInto: vi.fn((_container: unknown, value: unknown) => ({ cloned: value })),
    now: () => 1000,
    ...over,
  } satisfies SentenceInViewDeps;
}

const A_POSITION = { pageIndex: 1, rects: [A_HEAD], nextPageRects: [A_TAIL] };

describe('createSentenceInView', () => {
  it("shadows the PDF view's navigateToPosition once per prototype, and only on a PDF view", () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const { reader, view, proto } = fakeReader();
    const before = proto.navigateToPosition;
    expect(module.attach(reader)).toBe(true);
    expect(proto.navigateToPosition).not.toBe(before);
    expect(module.attach(reader)).toBe(true);
    expect(module.patchCounts()).toEqual({ total: 3, live: 3 });
    expect(deps.debug).toHaveBeenCalledWith(expect.stringContaining('attached'));
    // A DOM view carries no pages
    expect(module.attach({ _internalReader: { _primaryView: { _readAloud: {} } } })).toBe(false);
    expect(module.attach({ _internalReader: null })).toBe(false);
    expect(module.attach(null)).toBe(false);
    void view;
  });

  it("scrolls the container itself on the follow's call when the sentence is cut, and never calls Zotero's method", () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const { reader, view, container, original } = fakeReader({ scrollTop: 2357 });
    module.attach(reader);
    push(view, A_POSITION);
    expect(original).not.toHaveBeenCalled();
    expect(deps.cloneInto).toHaveBeenCalledWith(container, { top: 2801.5, behavior: 'smooth' });
    expect(container.scrollTo).toHaveBeenCalledTimes(1);
    expect(container.scrollTo).toHaveBeenCalledWith({ cloned: { top: 2801.5, behavior: 'smooth' } });
    expect(deps.debug).toHaveBeenCalledWith(expect.stringMatching(/^sentence in view: cut on page 2: scrollTop 2357 -> 2802/));
    const seen = module.inspect(reader) as any;
    expect(seen.kind).toBe('pdf');
    expect(seen.patched).toBe(true);
    expect(seen.last).toMatchObject({ reason: 'cut', from: 2357, top: 2801.5, fits: true });
  });

  it("hands a sentence that is wholly on screen to Zotero's method with the same arguments", () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const { reader, view, container, original } = fakeReader({ scrollTop: 2700 });
    module.attach(reader);
    const position = { pageIndex: 1, rects: [[100, 3000, 1000, 3035]] };
    push(view, position);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0]).toEqual([position, { cloned: FOLLOW_OPTIONS }]);
    expect(original.mock.instances[0]).toBe(view);
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect((module.inspect(reader) as any).last).toMatchObject({ reason: 'none', fits: true });
  });

  it('passes every other navigate through untouched', () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const { reader, view, container, original } = fakeReader();
    module.attach(reader);
    const options = { block: 'nearest' };
    view.navigateToPosition(A_POSITION, options);
    view.navigateToPosition(A_POSITION);
    expect(original).toHaveBeenCalledTimes(2);
    expect(original.mock.calls[0]).toEqual([A_POSITION, options]);
    expect(original.mock.calls[1]).toEqual([A_POSITION, undefined]);
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(deps.cloneInto).not.toHaveBeenCalled();
  });

  it("falls back to Zotero's method when its own measuring throws, and logs the throw", () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const { reader, view, container, original } = fakeReader();
    module.attach(reader);
    (view as any)._iframeWindow.document.getElementById = () => {
      throw new Error('dead document');
    };
    push(view, A_POSITION);
    expect(original).toHaveBeenCalledTimes(1);
    expect(container.scrollTo).not.toHaveBeenCalled();
    expect(deps.error).toHaveBeenCalledTimes(1);
  });

  it('does not re-issue the same target on the pushes that follow inside a second and a half', () => {
    let now = 1000;
    const deps = makeDeps({ now: () => now });
    const module = createSentenceInView(deps);
    const { reader, view, container } = fakeReader({ scrollTop: 2357 });
    module.attach(reader);
    push(view, A_POSITION);
    // Mid-animation: the container has moved a little, the target is the same
    container.scrollTop = 2500;
    now = 1300;
    push(view, A_POSITION);
    expect(container.scrollTo).toHaveBeenCalledTimes(1);
    expect(deps.debug).toHaveBeenCalledTimes(2); // attached + one scroll
    // Long after: a lost scroll is issued again
    now = 3000;
    push(view, A_POSITION);
    expect(container.scrollTo).toHaveBeenCalledTimes(2);
  });

  describe('a sentence taller than the viewport', () => {
    const giant = { pageIndex: 1, rects: [[100, 3000, 1000, 3015]], nextPageRects: [[100, 3800, 1000, 4287]] };

    it('follows a real word when it leaves the viewport, and holds still while it is in view', () => {
      const state = { activeSegment: { sourcePosition: giant }, activeWordSourcePosition: { pageIndex: 1, rects: [[100, 3000, 160, 3015]] } };
      const deps = makeDeps({ wordTiming: () => 'real' });
      const module = createSentenceInView(deps);
      const { reader, view, container, original } = fakeReader({ scrollTop: 2900, state });
      module.attach(reader);
      push(view, giant);
      expect(container.scrollTo).not.toHaveBeenCalled();
      // Not Zotero's either: its rule would center the head again on every push
      expect(original).not.toHaveBeenCalled();
      state.activeWordSourcePosition = { pageIndex: 2, rects: [[100, 3900, 160, 3915]] };
      push(view, giant);
      expect(container.scrollTo).toHaveBeenCalledWith({ cloned: { top: 3410.5, behavior: 'smooth' } });
      expect((module.inspect(reader) as any).last).toMatchObject({ reason: 'part', fits: false });
    });

    it('takes the whole-sentence stand-in of a wordless voice for no word', () => {
      const state = { activeSegment: { sourcePosition: giant }, activeWordSourcePosition: { pageIndex: 1, rects: [[100, 3000, 1000, 3015]] } };
      const deps = makeDeps({ wordTiming: () => 'stand-in' });
      const module = createSentenceInView(deps);
      const { reader, view, container } = fakeReader({ scrollTop: 2000, state });
      module.attach(reader);
      push(view, giant);
      expect(container.scrollTo).toHaveBeenCalledWith({ cloned: { top: 2976, behavior: 'smooth' } });
      expect((module.inspect(reader) as any).part).toBeNull();
    });
  });

  it('reports what it sees, and puts the prototype back on dispose', () => {
    const deps = makeDeps();
    const module = createSentenceInView(deps);
    const state = { activeSegment: { sourcePosition: A_POSITION }, activeWordSourcePosition: null };
    const { reader, proto, original } = fakeReader({ scrollTop: 2357, state });
    expect((module.inspect(reader) as any).patched).toBe(false);
    (reader._internalReader._primaryView as any)._zoteroTTSSentenceInView = { at: 1, issued: true };
    module.attach(reader);
    const seen = module.inspect(reader) as any;
    expect(seen).toMatchObject({
      kind: 'pdf',
      patched: true,
      viewport: { scrollTop: 2357, clientHeight: 994 },
      sentence: { head: A_HEAD, whole: A_WHOLE, fits: true, cut: true },
      part: null,
      last: null,
    });
    expect(module.inspect({ _internalReader: { _primaryView: { _readAloud: {} } } })).toMatchObject({ kind: 'dom', patched: false });
    expect(module.inspect(null)).toMatchObject({ kind: 'none' });
    module.dispose();
    expect(module.patchCounts()).toEqual({ total: 0, live: 0 });
    const { view: fresh } = fakeReader();
    void fresh;
    expect(typeof proto.navigateToPosition).toBe('function');
    proto.navigateToPosition.call({}, 'p', 'o');
    expect(original).toHaveBeenCalledWith('p', 'o');
  });
});
