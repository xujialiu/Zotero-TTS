/** EPUB following with explicit input intent and whole-range geometry (#93). */
import { autoScrollMode } from '../core/settings';
import { followTarget, RETARGET_MS, type Box, type SentenceInViewDeps } from './sentence-in-view';

interface Owned {
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
    if (disposed || dead(r.view) || !r.following || !state?.active || !state.popupOpen || state.annotationPopup || !r.view.initialized) return;
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
        pending: false, reason: 'initial', last: null, navigating: 0, undo: [] };
      try {
        own(r, 'positionLocked', false);
        // Native scroll handlers are already bound. This flag bypasses only
        // their scroll-based unlock; semantic/manual input still disengages.
        own(r, 'scrolling', true);
        shadow(r, helper, 'setPositionLocked', original => function(this: any, locked: boolean) {
          if (locked && deps.resuming?.(r.reader)) return Reflect.apply(original, this, [locked]);
          if (locked) { r.following = true; r.force = true; r.reason = 'explicit'; }
          else disengage(r, 'navigation');
          return Reflect.apply(original, this, [locked]);
        });
        shadow(r, helper, 'setState', original => function(this: any, rawState: any) {
          const state = waive(rawState);
          if (state?.active && !r.active) { r.following = true; r.key = null; r.last = null; r.reason = 'session'; }
          r.active = !!state?.active; r.paused = !!state?.paused;
          if (!r.active || !state.popupOpen) { r.following = false; r.pending = false; }
          // Mount/navigate before native spotlight rendering, as Zotero does.
          attempt(r, rawState);
          return Reflect.apply(original, this, [rawState]);
        });
        shadow(r, view, 'navigate', original => function(this: any, ...args: any[]) {
          if (!waive(args[1])?.skipHistory) disengage(r, 'navigation');
          return Reflect.apply(original, this, args);
        });
        for (const name of ['navigateBack', 'navigateForward', 'findNext', 'findPrevious']) {
          shadow(r, view, name, original => function(this: any, ...args: any[]) {
            disengage(r, 'navigation'); return Reflect.apply(original, this, args);
          });
        }
        shadow(r, view, 'destroy', original => function(this: any, ...args: any[]) {
          release(r); return Reflect.apply(original, this, args);
        });
        const win = view.iframeWindow, doc = view.iframeDocument;
        const content = (e: any) => !e.target?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="dialog"], [role="menu"]');
        listen(r, doc, 'wheel', e => { if (e.isTrusted !== false && !e.ctrlKey && !e.metaKey && (e.deltaX || e.deltaY) && content(e)) disengage(r, 'wheel'); });
        listen(r, doc, 'touchmove', e => { if (e.isTrusted !== false && !e.defaultPrevented && e.touches?.length === 1 && content(e)) disengage(r, 'touch'); });
        listen(r, doc, 'keydown', e => {
          if (e.isTrusted !== false && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar'].includes(e.key) && content(e)) disengage(r, 'keyboard');
        });
        listen(r, doc, 'pointerdown', e => {
          if (e.isTrusted === false || e.button !== 0 || !content(e)) return;
          const root = doc.documentElement;
          if ((root.scrollHeight > root.clientHeight && e.clientX >= root.clientWidth) ||
            (root.scrollWidth > root.clientWidth && e.clientY >= root.clientHeight)) disengage(r, 'scrollbar');
        });
        listen(r, doc, 'pointermove', e => {
          if (e.isTrusted === false || !e.buttons || !content(e) || doc.getSelection?.()?.isCollapsed !== false) return;
          if (e.clientX < 20 || e.clientY < 20 || e.clientX > win.innerWidth - 20 || e.clientY > win.innerHeight - 20) disengage(r, 'selection');
        });
        const restore = () => { if (r.following) { r.pending = true; attempt(r); } };
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
    inspect(reader: any): Record<string, unknown> {
      const view = waive(reader?._internalReader?._lastView ?? reader?._internalReader?._primaryView);
      const r = records.get(view);
      return r ? { kind: 'epub', patched: true, following: r.following, pending: r.pending, mode: autoScrollMode(deps.mode?.()),
        flow: r.view.flowMode, reason: r.reason, last: r.last } : { kind: 'dom', patched: false };
    },
    dispose() { disposed = true; for (const r of [...records.values()]) release(r); },
  };
}
