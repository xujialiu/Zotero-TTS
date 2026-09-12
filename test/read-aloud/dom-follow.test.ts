import { describe, expect, it, vi } from 'vitest';
import { createDOMFollow } from '../../src/read-aloud/dom-follow';

function fixture() {
  const doc: any = new EventTarget();
  const win: any = new EventTarget();
  Object.assign(win, { document: doc, innerWidth: 800, innerHeight: 1000, scrollX: 0, scrollY: 1000, scrollTo: vi.fn() });
  doc.defaultView = win;
  doc.documentElement = { scrollWidth: 800, scrollHeight: 8000, clientWidth: 800, clientHeight: 1000 };
  doc.scrollingElement = doc.documentElement;
  doc.hidden = false;
  const box = (top: number, bottom: number) => ({ left: 10, top, right: 700, bottom, width: 690, height: bottom - top });
  const ranges = new Map<any, any>();
  const range = (key: string, top: number, bottom: number) => {
    const r: any = { getBoundingClientRect: () => box(top, bottom), getClientRects: () => [box(top, bottom)], cloneRange: () => ({ ...r, collapse: vi.fn() }) };
    ranges.set(key, r); return key;
  };
  const nativeNavigate = vi.fn();
  class View {
    initialized = true; iframeWindow = win; iframeDocument = doc; flowMode = 'scrolled';
    flow = { _settleAnchorAfterProgrammaticScroll: vi.fn(), invalidate: vi.fn() };
    _readAloud: any;
    toDisplayedRange(key: any) { return ranges.get(key); }
    navigateToSelector = nativeNavigate;
    lockPositionToReadAloud() { this._readAloud.setPositionLocked(true); }
    _onManualNavigation() { this._readAloud.setPositionLocked(false); }
    _handleScroll() { if (!this._readAloud.scrolling) this._onManualNavigation(); }
    navigateToNextPage() { this._onManualNavigation(); }
    destroy() {}
  }
  const view = new View();
  const rendered = vi.fn();
  class Helper {
    state: any = null; positionLocked = true; scrolling = false; _view = view;
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (state.active && !previous?.active) this.positionLocked = true;
      if (this.positionLocked && previous?.activeSegment !== state.activeSegment) nativeNavigate('native');
      rendered(state);
      return 'render-result';
    }
    setPositionLocked(value: boolean) { this.positionLocked = value; }
    _resolveSegmentSelector(state: any) { return state.activeSegment?.sourcePosition; }
    _positionToSelector(position: any) { return position; }
  }
  const helper = view._readAloud = new Helper();
  const reader = { _window: {}, _internalReader: { _primaryView: view } };
  let mode: 'outside' | 'sentence' = 'outside';
  const deps = { mode: () => mode, resuming: () => false, wordTiming: () => 'real' as const, error: vi.fn() };
  const module = createDOMFollow(deps);
  const push = (key: string, word?: string) => helper.setState({ active: true, popupOpen: true, activeSegment: { position: key, sourcePosition: key }, activeWordSourcePosition: word });
  return { view, helper, module, reader, range, push, win, nativeNavigate, rendered, deps, mode: (v: typeof mode) => { mode = v; } };
}

describe('EPUB auto-scroll', () => {
  it('keeps manual disengagement through a native playback-toggle lock', () => {
    const f = fixture(); f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    f.view._onManualNavigation();
    f.deps.resuming = () => true;
    f.view.lockPositionToReadAloud(); f.push('a');
    expect(f.module.inspect(f.reader).following).toBe(false);
    f.deps.resuming = () => false;
    f.view.lockPositionToReadAloud(); f.push('a');
    expect(f.module.inspect(f.reader).following).toBe(true);
  });
  it('preserves native rendering and centers complete ranges only when clipped', () => {
    const f = fixture(); f.module.attach(f.reader);
    expect(f.push(f.range('edge', 950, 1000))).toBe('render-result');
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.push(f.range('cut', 950, 1050));
    expect(f.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1500 }));
    expect(f.rendered).toHaveBeenCalledTimes(2);
    expect(f.nativeNavigate).not.toHaveBeenCalled();
  });
  it('centers each sentence once, and re-centers on explicit return', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    const key = f.range('visible', 700, 750);
    f.push(key); f.push(key);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(1);
    f.view.lockPositionToReadAloud(); f.push(key);
    expect(f.win.scrollTo).toHaveBeenCalledTimes(2);
  });
  it('ignores automatic scroll callbacks but keeps manual navigation disengaged across modes and sentences', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    f.push(f.range('a', 700, 750)); f.view._handleScroll();
    expect(f.module.inspect(f.reader).following).toBe(true);
    f.view.navigateToNextPage(); f.win.scrollTo.mockClear();
    f.mode('outside'); f.push(f.range('b', 1100, 1200));
    expect(f.module.inspect(f.reader).following).toBe(false);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.view.lockPositionToReadAloud(); f.push('b');
    expect(f.win.scrollTo).toHaveBeenCalled();
  });
  it('keeps paginated layout and navigates only the head or a real clipped word', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    f.push(f.range('span', 0, 1800));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(1);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.push('span', f.range('word', 1100, 1120));
    expect(f.nativeNavigate).toHaveBeenCalledTimes(2);
  });
  it('uses a collapsed starting selector for paginated navigation, regardless of rectangle order', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    (f.helper as any)._collapseToStart = (selector: string) => selector + '-head';
    f.push(f.range('span', 0, 1800));
    expect(f.nativeNavigate).toHaveBeenCalledWith('span-head', expect.objectContaining({ block: 'start' }));
  });
  it('restores helper properties and methods on dispose', () => {
    const f = fixture(); const original = f.helper.setState;
    f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    f.view._onManualNavigation(); f.module.dispose();
    expect(f.helper.setState).toBe(original);
    expect(f.helper.positionLocked).toBe(false);
    expect(Object.getOwnPropertyDescriptor(f.helper, 'positionLocked')?.get).toBeUndefined();
    expect(f.deps.error).not.toHaveBeenCalled();
  });
  it('does not turn a visible paginated sentence in outside mode', () => {
    const f = fixture(); f.view.flowMode = 'paginated'; f.module.attach(f.reader);
    f.push(f.range('a', 900, 950));
    expect(f.nativeNavigate).not.toHaveBeenCalled();
  });
  it('defers hidden playback and recovers only the latest sentence while still following', () => {
    const f = fixture(); f.mode('sentence'); f.module.attach(f.reader);
    f.view.iframeDocument.hidden = true;
    f.push(f.range('old', 100, 120)); f.push(f.range('latest', 700, 750));
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    f.view.iframeDocument.hidden = false;
    f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1225 }));
    f.view._onManualNavigation(); f.win.scrollTo.mockClear();
    f.win.dispatchEvent(new Event('focus'));
    expect(f.win.scrollTo).not.toHaveBeenCalled();
    expect(f.module.inspect(f.reader).pending).toBe(false);
  });
  it('applies a setting change while paused without restarting playback or enabling disengaged following', () => {
    const f = fixture(); f.module.attach(f.reader);
    const key = f.range('a', 700, 750); f.push(key);
    f.helper.state.paused = true; f.mode('sentence'); f.module.refresh();
    expect(f.win.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1225 }));
    expect(f.helper.state.paused).toBe(true);
    f.view._onManualNavigation(); f.win.scrollTo.mockClear();
    f.mode('outside'); f.module.refresh(); f.mode('sentence'); f.module.refresh();
    expect(f.win.scrollTo).not.toHaveBeenCalled();
  });
  it('treats selection-edge dragging as manual navigation but ignores ordinary pointer motion', () => {
    const f = fixture(); f.module.attach(f.reader); f.push(f.range('a', 700, 750));
    const doc = f.view.iframeDocument;
    doc.getSelection = () => ({ isCollapsed: false });
    // The registered handler is tested with a trusted-shaped event through
    // an injected EventTarget; real OS trust remains a live check.
    const handlers: Record<string, (e: any) => void> = {};
    f.module.dispose();
    doc.addEventListener = (type: string, fn: (e: any) => void) => { handlers[type] = fn; };
    const module = createDOMFollow(f.deps); module.attach(f.reader);
    handlers.pointermove({ buttons: 0, clientX: 1, clientY: 1 });
    expect(module.inspect(f.reader).following).toBe(true);
    handlers.pointermove({ buttons: 1, clientX: 1, clientY: 1 });
    expect(module.inspect(f.reader).following).toBe(false);
    module.dispose();
  });
});
