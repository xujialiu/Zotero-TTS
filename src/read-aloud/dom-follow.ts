/** EPUB following with explicit input intent and whole-range geometry (#93). */
import { autoScrollMode } from '../core/settings';
import { followTarget, RETARGET_MS, type Box, type SentenceInViewDeps } from './sentence-in-view';
import { createManualFollow, intersectsViewport, type ManualFollow } from './manual-follow';

interface Owned {
  manual: ManualFollow;
  reader: any; view: any; helper: any;
  following: boolean; active: boolean; paused: boolean; force: boolean;
  key: string | null; mode: string; pending: boolean; reason: string;
  last: { at: number; top?: number; left?: number; reason: string } | null;
  navigating: number; undo: Array<() => void>;
}

export function createDOMFollow(deps: SentenceInViewDeps) {
  const records = new Map<any, Owned>();
  const dead = (v: any) => !!deps.isDead?.(v);
  const waive = (v: any): any => deps.waiveXrays ? deps.waiveXrays(v) : v;
  const exported = (fn: (...args: any[]) => any, target: any) => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  let disposed = false;

  function shadow(r: Owned, object: any, name: string, make: (original: any) => (...args: any[]) => any) {
    if (typeof object[name] !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    const wrapper = exported(make(object[name]), object);
    object[name] = wrapper;
    r.undo.push(() => {
      if (dead(object) || object[name] !== wrapper) return;
      if (descriptor) Object.defineProperty(object, name, descriptor);
      else delete object[name];
    });
  }

  function disengage(r: Owned, reason: string) {
    if (r.navigating || !r.following) return;
    r.following = false; r.force = false; r.pending = false; r.reason = reason;
    const win = r.view.iframeWindow;
    win.scrollTo(win.scrollX, win.scrollY);
  }

  function navigateManually(r: Owned, original: any, self: any, args: any[]) {
    if (r.navigating) return Reflect.apply(original, self, args);
    r.manual.begin('navigation');
    const done = r.manual.task();
    try {
      const result: any = Reflect.apply(original, self, args);
      if (result?.then) Reflect.apply(result.then, result, [exported(done, r.view), exported(done, r.view)]);
      else done();
      return result;
    } catch (error) { done(); throw error; }
  }

  function visible(r: Owned) {
    return !r.view._suspended && !r.view.iframeDocument.hidden && r.reader._window?.windowState !== 2;
  }

  function rects(range: any): Box[] {
    const list = range?.getClientRects();
    const boxes: Box[] = [];
    for (let i = 0; list && i < list.length; i++) {
      const b = list[i];
      if (b.width || b.height) boxes.push([b.left, b.top, b.right, b.bottom]);
    }
    return boxes;
  }
  const union = (boxes: Box[]): Box => [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];

  function navigate(r: Owned, selector: any) {
    const options = { ifNeeded: false, block: 'start', behavior: 'smooth', skipHistory: true };
    // A whole range's left/top edge need not be its reading-order start
    // in RTL or vertical pagination. Use Zotero's starting-character probe.
    const target = r.helper._collapseToStart?.(selector) ?? selector;
    r.navigating++;
    try { r.view.navigateToSelector(target, deps.cloneInto ? deps.cloneInto(r.view.iframeDocument.documentElement, options) : options); }
    finally { r.navigating--; }
  }

  function run(r: Owned, state = waive(r.helper.state)) {
    if (deps.enabled?.() === false && !(r.force && r.reason === 'explicit')) return;
    if (disposed || dead(r.view) || !state?.active || !state.popupOpen || state.annotationPopup || !r.view.initialized) return;
    if (state.paused && !r.force) return;
    if (r.manual.suspended) { r.manual.retry(); return; }
    if (!r.following) return;
    if (r.manual.active) { r.manual.retry(); return; }
    if (!visible(r)) { r.pending = true; return; }
    const selector = r.helper._resolveSegmentSelector(state);
    if (!selector) return;
    const key = JSON.stringify(selector);
    const mode = autoScrollMode(deps.mode?.());
    const entered = r.key !== key;
    const changedMode = r.mode !== mode;
    const reset = r.pending || changedMode || r.force;
    if (reset) r.last = null;
    let range = r.view.toDisplayedRange(selector);
    // Unmounted EPUB sections have no displayed range. Native navigation
    // mounts the section before highlighting; remeasure the complete range.
    if (!range) { navigate(r, selector); range = r.view.toDisplayedRange(selector); }
    const boxes = rects(range);
    if (!boxes.length) { r.pending = true; return; }
    const win = r.view.iframeWindow;
    const doc = r.view.iframeDocument;
    const root = doc.scrollingElement ?? doc.documentElement;
    const width = doc.documentElement.clientWidth || win.innerWidth;
    const height = doc.documentElement.clientHeight || win.innerHeight;
    const whole = union(boxes);
    let part: Box | null = null;
    let wordSelector: any = null;
    if (deps.wordTiming?.(r.reader) === 'real' && state.activeWordSourcePosition) {
      wordSelector = r.helper._positionToSelector(state.activeWordSourcePosition);
      const words = rects(wordSelector && r.view.toDisplayedRange(wordSelector));
      if (words.length) part = union(words);
    }
    const outside = (b: Box) => b[0] < 0 || b[1] < 0 || b[2] > width || b[3] > height;
    if (r.view.flowMode === 'paginated') {
      // A spread-crossing sentence cannot fit on one page. Start at its
      // first rect, then turn only for a real word that leaves the spread.
      const fits = whole[2] - whole[0] <= width && whole[3] - whole[1] <= height;
      const target = r.force || ((entered || changedMode) && (mode === 'sentence' || !fits || outside(whole))) ? selector :
        !fits ? (part && outside(part) ? wordSelector : null) : outside(whole) ? selector : null;
      if (target) {
        navigate(r, target);
        r.last = { at: Date.now(), reason: 'page' };
      }
    } else {
      const translate = (b: Box): Box => [b[0] + win.scrollX, b[1] + win.scrollY, b[2] + win.scrollX, b[3] + win.scrollY];
      const target = followTarget({ head: translate(boxes[0]), whole: translate(whole), part: part && translate(part),
        viewport: { scrollTop: win.scrollY, scrollLeft: win.scrollX, clientWidth: width, clientHeight: height,
          scrollHeight: root.scrollHeight, scrollWidth: root.scrollWidth }, mode, entered: entered || changedMode, force: r.force });
      const now = deps.now?.() ?? Date.now();
      if (target.reason !== 'none' && !(r.last && r.last.top === target.top && r.last.left === target.left && now - r.last.at < RETARGET_MS)) {
        const options: Record<string, unknown> = { behavior: 'smooth' };
        if (target.top !== undefined) options.top = target.top;
        if (target.left !== undefined) options.left = target.left;
        win.scrollTo(deps.cloneInto ? deps.cloneInto(doc.documentElement, options) : options);
        // Keep EPUB's user anchor and cached visible sections in sync.
        r.view.flow?._settleAnchorAfterProgrammaticScroll?.();
        r.view.flow?.invalidate?.();
        r.last = { at: now, top: target.top, left: target.left, reason: target.reason };
      }
    }
    r.key = key; r.mode = mode; r.force = false; r.pending = false;
  }

  const attempt = (r: Owned, state?: any) => { try { run(r, state); } catch (e) { deps.error(e); } };

  function listen(r: Owned, target: any, name: string, fn: (e: any) => void, capture = true) {
    if (!target?.addEventListener) return;
    const listener = exported((event: any) => { try { if (!dead(r.view)) fn(waive(event)); } catch (e) { deps.error(e); } }, target);
    target.addEventListener(name, listener, capture);
    r.undo.push(() => { if (!dead(target)) target.removeEventListener(name, listener, capture); });
  }

  function own(r: Owned, key: 'positionLocked' | 'scrolling', value: boolean) {
    const descriptor = Object.getOwnPropertyDescriptor(r.helper, key);
    if (descriptor?.configurable === false || descriptor?.get || descriptor?.set) throw new Error(`Zotero-TTS: cannot own EPUB ${key}`);
    Object.defineProperty(r.helper, key, { configurable: true, enumerable: true,
      get: exported(() => value, r.helper), set: exported(() => {}, r.helper) });
    r.undo.push(() => {
      if (dead(r.helper)) return;
      const restored = key === 'positionLocked' ? r.following : false;
      if (descriptor) Object.defineProperty(r.helper, key, { ...descriptor, value: restored });
      else { delete r.helper[key]; r.helper[key] = restored; }
    });
  }

  function release(r: Owned) {
    records.delete(r.view);
    r.manual.cancel();
    for (const undo of r.undo.reverse()) { try { undo(); } catch (e) { deps.error(e); } }
  }

  function attach(reader: any): boolean {
    if (disposed) return false;
    for (const r of records.values()) if (dead(r.view)) release(r);
    let attached = false;
    for (const raw of [reader?._internalReader?._primaryView, reader?._internalReader?._secondaryView]) {
      const view = waive(raw);
      // Scope is EPUB: snapshots and Reading Mode keep native following.
      if (!view || dead(view) || !['scrolled', 'paginated'].includes(view.flowMode) || !view._readAloud || !view.iframeDocument) continue;
      if (records.has(view)) { attached = true; continue; }
      const helper = waive(view._readAloud);
      const state = waive(helper.state);
      const r: Owned = { reader, view, helper, following: !!state?.active && helper.positionLocked !== false,
        active: !!state?.active, paused: !!state?.paused, force: false, key: null, mode: autoScrollMode(deps.mode?.()),
        pending: false, reason: 'initial', last: null, navigating: 0, undo: [], manual: null! };
      r.manual = createManualFollow({
        enabled: () => deps.keepFollowingWhileVisible?.() !== false,
        following: () => r.following && !disposed && !dead(r.view),
        available: () => r.active && !disposed && !dead(r.view),
        paused: () => r.paused,
        sentenceKey: () => { const position = waive(r.helper.state)?.activeSegment?.sourcePosition; return position ? JSON.stringify(position) : null; },
        capture: () => {
          const selector = r.helper._resolveSegmentSelector(waive(r.helper.state));
          return () => {
            if (!visible(r) || !r.view.initialized || !selector) return null;
            const doc = r.view.iframeDocument, win = r.view.iframeWindow;
            const width = doc.documentElement.clientWidth || win.innerWidth;
            const height = doc.documentElement.clientHeight || win.innerHeight;
            if (!(width > 0 && height > 0)) return null;
            // No displayed range for a known sentence means its EPUB section is off screen.
            const boxes = rects(r.view.toDisplayedRange(selector));
            for (const box of boxes) if (intersectsViewport(box, [0, 0, width, height])) return true;
            return false;
          };
        },
        stop: () => { const win = r.view.iframeWindow; win.scrollTo(win.scrollX, win.scrollY); },
        disengage: reason => disengage(r, reason),
        resume: () => { if (!r.following) r.reason = 'visible'; r.following = true; r.last = null; attempt(r); },
        error: deps.error,
      });
      try {
        own(r, 'positionLocked', false);
        // Native scroll handlers are already bound. This flag bypasses only
        // their scroll-based unlock; semantic/manual input still disengages.
        own(r, 'scrolling', true);
        shadow(r, helper, 'setPositionLocked', original => function(this: any, locked: boolean) {
          if (locked && deps.resuming?.(r.reader)) return Reflect.apply(original, this, [locked]);
          if (locked) { r.manual.cancel(); r.following = true; r.force = true; r.reason = 'explicit'; }
          else if (!r.navigating) r.manual.begin('navigation');
          return Reflect.apply(original, this, [locked]);
        });
        shadow(r, helper, 'setState', original => function(this: any, rawState: any) {
          const state = waive(rawState);
          if (state?.active && !r.active) { r.manual.cancel(); r.following = true; r.key = null; r.last = null; r.reason = 'session'; }
          if (state?.active && r.active && r.paused && !state.paused) {
            r.manual.cancel(); r.following = true; r.force = true; r.last = null; r.reason = 'resume';
          }
          if (state?.paused && !r.paused) {
            r.pending = false; r.force = false;
            const win = r.view.iframeWindow; win.scrollTo(win.scrollX, win.scrollY);
          }
          r.active = !!state?.active; r.paused = !!state?.paused;
          if (!r.active || !state.popupOpen) { r.manual.cancel(); r.following = false; r.pending = false; }
          // Mount/navigate before native spotlight rendering, as Zotero does.
          attempt(r, rawState);
          return Reflect.apply(original, this, [rawState]);
        });
        shadow(r, view, 'navigate', original => function(this: any, ...args: any[]) {
          if (!waive(args[1])?.skipHistory) return navigateManually(r, original, this, args);
          return Reflect.apply(original, this, args);
        });
        for (const name of ['navigateBack', 'navigateForward', 'navigateToNextPage', 'navigateToPreviousPage', 'navigateToFirstPage', 'navigateToLastPage', 'findNext', 'findPrevious']) {
          shadow(r, view, name, original => function(this: any, ...args: any[]) {
            return navigateManually(r, original, this, args);
          });
        }
        shadow(r, view, 'destroy', original => function(this: any, ...args: any[]) {
          release(r); return Reflect.apply(original, this, args);
        });
        const win = view.iframeWindow, doc = view.iframeDocument;
        const content = (e: any) => !e.target?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="dialog"], [role="menu"]');
        listen(r, doc, 'wheel', e => { if (e.isTrusted !== false && !e.ctrlKey && !e.metaKey && (e.deltaX || e.deltaY) && content(e)) r.manual.begin('wheel'); });
        listen(r, doc, 'touchmove', e => { if (e.isTrusted !== false && !e.defaultPrevented && e.touches?.length === 1 && content(e)) { r.manual.hold(true); r.manual.begin('touch'); } });
        listen(r, doc, 'keydown', e => {
          if (e.isTrusted !== false && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(e.key) && content(e)) { r.manual.hold(true, 'keyboard'); r.manual.begin('keyboard'); }
        });
        listen(r, win, 'keyup', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(e.key)) r.manual.hold(false, 'keyboard'); });
        listen(r, win, 'blur', () => r.manual.releaseHolds());
        listen(r, doc, 'pointerdown', e => {
          if (e.isTrusted === false || e.button !== 0 || !content(e)) return;
          r.manual.hold(true);
          const root = doc.documentElement;
          if ((root.scrollHeight > root.clientHeight && e.clientX >= root.clientWidth) ||
            (root.scrollWidth > root.clientWidth && e.clientY >= root.clientHeight)) r.manual.begin('scrollbar');
        });
        listen(r, doc, 'pointermove', e => {
          if (e.isTrusted === false || !e.buttons || !content(e) || doc.getSelection?.()?.isCollapsed !== false) return;
          if (e.clientX < 20 || e.clientY < 20 || e.clientX > win.innerWidth - 20 || e.clientY > win.innerHeight - 20) r.manual.begin('selection');
        });
        listen(r, win, 'scroll', () => r.manual.scroll());
        for (const name of ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'blur']) listen(r, win, name, () => r.manual.hold(false));
        const restore = () => { if (r.paused && !r.force) return; if (r.following || r.manual.suspended) { if (!visible(r)) r.manual.releaseHolds(); r.pending = true; attempt(r); } };
        for (const name of ['resize', 'focus', 'pageshow']) listen(r, win, name, restore);
        listen(r, doc, 'visibilitychange', restore);
        if (reader._window) for (const name of ['sizemodechange', 'focus']) listen(r, reader._window, name, restore);
        records.set(view, r); attached = true;
      } catch (e) { release(r); deps.error(e); }
    }
    return attached;
  }

  return {
    attach,
    refresh() { for (const r of records.values()) if (!dead(r.view)) attempt(r); },
    /** Pause does not change intent; current-sentence protection does. */
    automatic(reader: any): boolean | null {
      const view = waive(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView);
      const r = dead(view) ? undefined : records.get(view);
      return r ? r.following && !r.manual.active && !r.manual.suspended : null;
    },
    manual(reader: any): void {
      for (const r of records.values()) if (r.reader === reader && !dead(r.view)) {
        r.manual.cancel(); disengage(r, 'player');
      }
    },
    inspect(reader: any): Record<string, unknown> {
      const view = waive(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView);
      const r = records.get(view);
      return r ? { kind: 'epub', patched: true, following: r.following, paused: r.paused, sentenceProtected: r.manual.sentenceProtected, interacting: r.manual.interacting, visibilityPaused: r.manual.suspended, keepFollowingWhileVisible: deps.keepFollowingWhileVisible?.() !== false, pending: r.pending, mode: autoScrollMode(deps.mode?.()),
        flow: r.view.flowMode, reason: r.reason, last: r.last } : { kind: 'dom', patched: false };
    },
    dispose() { disposed = true; for (const r of [...records.values()]) release(r); },
  };
}
