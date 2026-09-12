import { describe, expect, it, vi } from 'vitest';
import { createPdfFollow } from '../../src/read-aloud/pdf-follow';
import { createResumeGuard } from '../../src/read-aloud/resume-guard';

class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, fn: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (event: any) => void) { this.listeners.get(type)?.delete(fn); }
  emit(type: string, props: any = {}) {
    const event = { type, target: this, isTrusted: true, defaultPrevented: false, ...props };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
    return event;
  }
  count() { return [...this.listeners.values()].reduce((n, listeners) => n + listeners.size, 0); }
}

function fixture(deps: Partial<Parameters<typeof createPdfFollow>[0]> = {}) {
  const document = Object.assign(new Events(), { hidden: false });
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const win = Object.assign(new Events(), {
    document, windowState: 1,
    requestAnimationFrame: (fn: () => void) => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
  });
  const container = Object.assign(new Events(), {
    clientLeft: 0, clientTop: 0, clientWidth: 980, clientHeight: 780,
    offsetWidth: 1000, offsetHeight: 800, scrollWidth: 2000, scrollHeight: 6000,
    scrollTop: 0, scrollLeft: 0, parentElement: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }),
    contains(target: any): boolean { for (let t = target; t; t = t.parentElement) if (t === this) return true; return false; },
    scrollTo: vi.fn(),
  });
  Object.assign(document, { getElementById: () => container });
  const original = vi.fn();
  const returned = Promise.resolve('native');
  const find = vi.fn();
  class View {
    _pages: unknown[] = [];
    _iframeWindow = win;
    _readAloudState: any = { active: false, popupOpen: false };
    _readAloudPositionLocked = false;
    _readAloudScrolling = false;
    _findController = { _onNavigate: find };
    _tool = { type: 'pointer' };
    action: any = null;
    _selectionRanges: any[] = [];
    _scrollSelectionHeadIntoView(_ranges: any[] = []) { return 'selection'; }
    _isPositionInViewBounds(_position: unknown) { return true; }
    rendered = 0;
    setReadAloudState(state: any) {
      if (state.active && !this._readAloudState.active) this._readAloudPositionLocked = true;
      this._readAloudState = state;
      this.rendered++;
      if (this._readAloudPositionLocked) this.navigateToPosition(state.activeSegment?.sourcePosition, followOptions);
      return returned;
    }
    navigateToPosition(...args: any[]) { return original(...args); }
    lockPositionToReadAloud() { this._readAloudPositionLocked = true; }
    navigate(_location: any, _options?: any) { return 'navigation'; }
    navigateToNextPage() { return 'next'; }
    setSuspended(_suspended: boolean) {}
    destroy() {}
  }
  const view = new View();
  const reader = { _window: win, _internalReader: { _primaryView: view } };
  const follow = vi.fn();
  const error = vi.fn();
  const controller = createPdfFollow({ follow, error, ...deps });
  const state = (index = 1) => ({ active: true, popupOpen: true, paused: false, segments: [], activeSegment: { sourcePosition: { pageIndex: index } } });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const start = () => { controller.attach(reader, view); view.setReadAloudState(state()); };
  return { controller, reader, view, win, document, container, state, follow, error, original, returned, find, flush, frames, start, View };
}
const followOptions = { ifNeeded: true, inline: 'nearest', visibilityMargin: -200, behavior: 'smooth' };

describe('PDF follow ownership (#90)', () => {
  it('does not mistake the native playback toggle lock for explicit return', () => {
    const guard = createResumeGuard({ error: vi.fn() });
    const f = fixture({ resuming: reader => guard.resuming(reader) });
    const internal = f.reader._internalReader as any;
    internal.toggleReadAloudPaused = () => { f.view.lockPositionToReadAloud(); f.view.setReadAloudState(f.state()); };
    guard.attach(f.reader); f.start();
    f.view.setReadAloudState({ ...f.state(), paused: true });
    f.container.emit('wheel', { deltaY: 50 }); f.follow.mockClear();
    internal.toggleReadAloudPaused();
    expect(f.controller.inspect(f.view).following).toBe(false);
    expect(f.follow).not.toHaveBeenCalled();
    f.view.lockPositionToReadAloud(); f.view.setReadAloudState(f.state());
    expect(f.controller.inspect(f.view).following).toBe(true);
    expect(f.follow).toHaveBeenCalledOnce();
    guard.dispose(); f.controller.dispose();
  });
  it('keeps native rendering, state and Promise identity but disables native follow', () => {
    const f = fixture(); f.controller.attach(f.reader, f.view);
    const state = f.state();
    expect(f.view.setReadAloudState(state)).toBe(f.returned);
    expect(f.view._readAloudState).toBe(state);
    expect(f.view.rendered).toBe(1);
    expect(f.original).not.toHaveBeenCalled();
    expect(f.follow).toHaveBeenCalledTimes(1);
    expect(f.controller.inspect(f.view)).toMatchObject({ owned: true, following: true });
  });

  it('survives late native unlocks across later sentences and drops queued native follows', () => {
    const f = fixture(); f.start(); f.follow.mockClear();
    f.view._readAloudPositionLocked = false;
    f.view._readAloudScrolling = false;
    f.container.emit('scroll');
    for (let i = 2; i < 12; i++) f.view.setReadAloudState(f.state(i));
    expect(f.follow).toHaveBeenCalledTimes(10);
    f.view.navigateToPosition({}, followOptions);
    expect(f.original).not.toHaveBeenCalled();
    f.view.navigateToPosition({}, { block: 'nearest' });
    expect(f.original).toHaveBeenCalledTimes(1);
  });

  it('disengages on wheel immediately and never relocks on later state or visibility events', () => {
    const f = fixture(); f.start(); f.follow.mockClear();
    f.container.emit('wheel', { deltaY: 20 });
    for (let i = 2; i < 8; i++) f.view.setReadAloudState(f.state(i));
    f.document.emit('visibilitychange'); f.flush();
    expect(f.follow).not.toHaveBeenCalled();
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'wheel' });
    expect(f.container.scrollTo).toHaveBeenCalled(); // Cancel the outstanding animation at its current position
    f.view.lockPositionToReadAloud();
    f.view.setReadAloudState(f.state(8));
    expect(f.follow).toHaveBeenCalled();
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
  });

  it('does not classify zoom, empty wheel, clicks or nested controls as manual scrolling', () => {
    const f = fixture(); f.start();
    f.container.emit('wheel', { ctrlKey: true, deltaY: 20 });
    f.container.emit('wheel', { deltaX: 0, deltaY: 0 });
    f.container.emit('pointerdown', { button: 0, clientX: 100, clientY: 100 });
    f.win.emit('pointerup');
    const input = { localName: 'input', parentElement: f.container };
    f.container.emit('wheel', { target: input, deltaY: 20 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
  });

  it('lets consumed/custom shortcuts and editable keys through, but recognizes actual page keys', () => {
    const f = fixture(); f.start();
    f.document.emit('keydown', { target: f.container, key: 'ArrowRight', defaultPrevented: true });
    f.document.emit('keydown', { target: f.container, key: 'Enter', shiftKey: true, defaultPrevented: true });
    f.document.emit('keydown', { target: { localName: 'textarea', parentElement: f.container }, key: 'PageDown' });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.document.emit('keydown', { target: f.container, key: 'PageDown' });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'keyboard' });
  });

  it('recognizes page keys targeted at the PDF body without broadening wheel scope', () => {
    const f = fixture(); f.start();
    const body = {}; Object.assign(f.document, { body });
    f.container.emit('wheel', { target: body, deltaY: 20 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.document.emit('keydown', { target: body, key: 'End' });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'keyboard' });
  });

  it('handles navigation before PDF.js consumes Home/End in the window bubble phase', () => {
    const f = fixture(); f.start();
    f.win.addEventListener('keydown', e => { e.defaultPrevented = true; });
    const event = f.document.emit('keydown', { target: f.container, key: 'Home' });
    f.win.emit('keydown', event);
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'keyboard' });
  });

  it('recognizes keyboard selection navigation even when capture stopped key propagation', () => {
    const f = fixture(); f.start();
    f.view._scrollSelectionHeadIntoView();
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.view._selectionRanges = [{ head: true, collapsed: false, position: { rects: [[1, 2, 3, 4]] } }];
    expect(f.view._scrollSelectionHeadIntoView(f.view._selectionRanges)).toBe('selection');
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'selection' });
  });

  it('allows a gray-area touch pan with an annotation tool, as Zotero does', () => {
    const f = fixture(); f.start(); f.view._tool.type = 'highlight';
    f.container.emit('touchmove', { target: { id: 'viewer', parentElement: f.container }, touches: [{}] });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'pan' });
  });

  it('keeps manual navigation disengaged when playback resumes, even if the sentence is visible', () => {
    const f = fixture(); f.start();
    f.view.setReadAloudState({ ...f.state(), paused: true });
    f.container.emit('wheel', { deltaY: 10 });
    f.view._readAloudPositionLocked = true;
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false });
    f.follow.mockClear();
    f.view.setReadAloudState(f.state());
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'wheel' });
    expect(f.follow).not.toHaveBeenCalled();
    f.view.setReadAloudState({ ...f.state(), paused: true });
    f.container.emit('wheel', { deltaY: 1000 });
    f.view._isPositionInViewBounds = () => false;
    f.follow.mockClear(); f.view.setReadAloudState(f.state());
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false });
    expect(f.follow).not.toHaveBeenCalled();
  });

  it('distinguishes the scrollbar gutter from a click in the gray page margin', () => {
    const f = fixture(); f.start();
    f.container.emit('pointerdown', { button: 0, clientX: 20, clientY: 200 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.container.emit('pointerdown', { button: 0, clientX: 990, clientY: 200 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'scrollbar' });
  });

  it('requires movement for a hand-tool drag and does not confuse annotation dragging with panning', () => {
    const f = fixture(); f.start(); f.view._tool.type = 'hand';
    f.container.emit('pointerdown', { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.win.emit('pointermove', { target: f.container, buttons: 1, clientX: 120, clientY: 100, pointerId: 1 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'pan' });
  });

  it('disengages only on an allowed touch pan, not a pen or selection gesture', () => {
    const f = fixture(); f.start();
    f.container.emit('pointerdown', { pointerType: 'pen', button: 0, clientX: 100, clientY: 100 });
    f.win.emit('pointermove', { pointerType: 'pen', buttons: 1, clientX: 120, clientY: 100 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.container.emit('touchmove', { touches: [{ clientX: 100, clientY: 100 }], defaultPrevented: true });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    f.container.emit('touchmove', { touches: [{ clientX: 110, clientY: 100 }] });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'pan' });
  });

  it('recognizes explicit navigation and actual find results, not history restoration', () => {
    const f = fixture(); f.start();
    expect(f.view.navigate({}, { skipHistory: true })).toBe('navigation');
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
    expect(f.view.navigate({ pageIndex: 5 })).toBe('navigation');
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'navigation' });
    f.view.lockPositionToReadAloud();
    f.view._findController._onNavigate(2, 3);
    expect(f.find).toHaveBeenCalledWith(2, 3);
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false, reason: 'find' });
  });

  it('defers hidden scrolling and restores the latest state once, even while paused', () => {
    const f = fixture(); f.win.windowState = 2; f.start();
    f.view.setReadAloudState({ ...f.state(9), paused: true });
    expect(f.follow).not.toHaveBeenCalled();
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true, pending: true });
    f.win.windowState = 1;
    f.win.emit('sizemodechange'); f.document.emit('visibilitychange');
    expect(f.frames.size).toBe(1); f.flush();
    expect(f.follow).toHaveBeenCalledTimes(1);
    expect(f.view._readAloudState.activeSegment.sourcePosition.pageIndex).toBe(9);
    expect(f.follow.mock.calls[0][3]).toBe(true);
  });

  it('uses PDF renderability rather than the independently hidden chrome document', () => {
    const f = fixture();
    const host = Object.assign(new Events(), { document: Object.assign(new Events(), { hidden: true }), windowState: 1 });
    (f.reader as any)._window = host;
    f.start();
    expect(f.follow).toHaveBeenCalledTimes(1);
    expect(f.controller.inspect(f.view)).toMatchObject({ visible: true, pending: false });
    host.windowState = 2;
    f.follow.mockClear(); f.view.setReadAloudState(f.state(2));
    expect(f.follow).not.toHaveBeenCalled();
    expect(f.controller.inspect(f.view)).toMatchObject({ pending: true });
    host.windowState = 1; host.emit('sizemodechange'); f.flush();
    expect(f.follow).toHaveBeenCalledTimes(1);
    f.controller.dispose();
  });

  it('rechecks manual disengagement and closed sessions before a scheduled restoration', () => {
    const f = fixture(); f.start(); f.follow.mockClear();
    f.win.emit('resize');
    f.container.emit('wheel', { deltaY: 20 });
    f.flush(); expect(f.follow).not.toHaveBeenCalled();
    f.view.setReadAloudState({ active: false, popupOpen: false });
    f.win.emit('focus'); f.flush(); expect(f.follow).not.toHaveBeenCalled();
  });

  it('initializes a secondary view on its first state push and keeps manual state independent', () => {
    const f = fixture(); f.start();
    const secondary = new f.View();
    secondary.setReadAloudState(f.state());
    expect(f.controller.inspect(secondary)).toMatchObject({ owned: true, following: true });
    f.view.navigateToNextPage();
    expect(f.controller.inspect(f.view)).toMatchObject({ following: false });
    expect(f.controller.inspect(secondary)).toMatchObject({ following: true });
  });

  it('fails atomically when the native lock cannot be shadowed', () => {
    const f = fixture();
    Object.defineProperty(f.view, '_readAloudPositionLocked', { value: false, writable: true, configurable: false });
    expect(f.controller.attach(f.reader, f.view)).toBe(false);
    f.view.setReadAloudState(f.state());
    expect(f.original).toHaveBeenCalled();
    expect(f.follow).not.toHaveBeenCalled();
    expect(f.container.count()).toBe(0);
  });

  it('destroys one view without allowing queued restoration to recreate its controller', () => {
    const f = fixture(); f.start(); f.follow.mockClear();
    f.win.emit('resize');
    f.view.destroy();
    f.flush();
    expect(f.follow).not.toHaveBeenCalled();
    expect(f.controller.inspect(f.view)).toEqual({ owned: false });
    expect(f.win.count() + f.document.count() + f.container.count()).toBe(0);
    f.view.setReadAloudState(f.state(3));
    expect(f.controller.inspect(f.view)).toEqual({ owned: false });
    const secondary = new f.View(); secondary.setReadAloudState(f.state(4));
    expect(f.controller.inspect(secondary)).toMatchObject({ following: true });
    f.controller.dispose();
  });

  it('removes live host listeners even when a closed view is already a dead wrapper', () => {
    const dead = new Set<unknown>();
    const f = fixture({ isDead: value => dead.has(value) }); f.start();
    const listeners = f.win.count() + f.document.count() + f.container.count();
    dead.add(f.view);
    const secondary = new f.View();
    f.controller.attach(f.reader, secondary);
    expect(f.win.count() + f.document.count() + f.container.count()).toBe(listeners);
    f.controller.dispose();
    expect(f.win.count() + f.document.count() + f.container.count()).toBe(0);
  });

  it('keeps annotation popup updates from scrolling and resumes when the popup closes', () => {
    const f = fixture(); f.start(); f.follow.mockClear();
    f.view.setReadAloudState({ ...f.state(3), annotationPopup: { id: 'annotation' } });
    expect(f.follow).not.toHaveBeenCalled();
    f.view.setReadAloudState({ ...f.state(3), annotationPopup: null });
    expect(f.follow).toHaveBeenCalledTimes(1);
  });

  it('does not cancel following for wheel input on a nested scrolling region', () => {
    const f = fixture(); f.start();
    Object.assign(f.win, { getComputedStyle: () => ({ overflowY: 'auto', overflowX: 'hidden' }) });
    const nested = { parentElement: f.container, scrollHeight: 200, clientHeight: 100 };
    f.container.emit('wheel', { target: nested, deltaY: 20 });
    expect(f.controller.inspect(f.view)).toMatchObject({ following: true });
  });

  it('restores descriptors, callbacks, listeners and pending work on dispose', () => {
    const f = fixture(); const originalState = f.view.setReadAloudState; f.start();
    f.win.emit('resize');
    f.controller.dispose();
    expect(f.view.setReadAloudState).toBe(originalState);
    expect(Object.getOwnPropertyDescriptor(f.view, '_readAloudPositionLocked')?.get).toBeUndefined();
    expect(f.view._findController._onNavigate).toBe(f.find);
    expect(f.win.count() + f.document.count() + f.container.count()).toBe(0);
    expect(f.frames.size).toBe(0);
  });
});
