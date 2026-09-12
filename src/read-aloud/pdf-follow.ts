/**
 * PDF following belongs to the plugin, not to scroll-event timing (#90).
 *
 * Zotero 10.0.2-beta.9's setReadAloudState (reader.js:76421) renders
 * synchronously, then schedules its follower only when the native lock is
 * true. Keep that lock false with a reversible instance accessor, preserve
 * the original state and return value, and follow after its rendering work.
 * Native scroll listeners and their popup/selection work remain untouched.
 * Only deliberate input/navigation changes our lock; no timer infers intent.
 */
import { createProtoPatches, type AnyFn } from './proto-patches';

export function isFollowCall(options: unknown): boolean {
  if (!options || typeof options !== 'object') return false;
  const o = options as Record<string, unknown>;
  return o.ifNeeded === true && o.inline === 'nearest' && typeof o.visibilityMargin === 'number' && o.visibilityMargin < 0;
}

interface Deps {
  resuming?(reader: any): boolean;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?(value: unknown): unknown;
  isDead?(value: unknown): boolean;
  follow(reader: any, view: any, originalNavigate: AnyFn, reset: boolean, force: boolean): void;
  clear?(view: any): void;
  error(error: unknown): void;
  debug?(message: string): void;
}

interface OwnedView {
  id: number;
  reader: any;
  view: any;
  originalNavigate: AnyFn;
  descriptor: PropertyDescriptor | undefined;
  following: boolean;
  active: boolean;
  paused: boolean;
  pending: boolean;
  reset: boolean;
  force: boolean;
  reason: string;
  frame: number | null;
  frameWindow: any;
  undo: Array<() => void>;
  find: any;
  pointer: { x: number; y: number; id: unknown; type: string } | null;
}

const ID = '_zoteroTTSPdfFollowId';
const NAVIGATION = ['navigateBack', 'navigateForward', 'navigateToNextPage', 'navigateToPreviousPage', 'navigateToFirstPage', 'navigateToLastPage'];
const PAGE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

function ownerOf(view: any, name: string): any {
  let proto = Object.getPrototypeOf(view);
  for (let i = 0; i < 8 && proto && proto !== Object.prototype; i++, proto = Object.getPrototypeOf(proto)) {
    if (Object.prototype.hasOwnProperty.call(proto, name) && typeof proto[name] === 'function') return proto;
  }
  return null;
}

export function createPdfFollow(deps: Deps) {
  const patches = createProtoPatches(deps);
  const records = new Map<number, OwnedView>();
  const originals = new WeakMap<object, AnyFn>();
  const failed = new WeakSet<object>();
  const destroyed = new WeakSet<object>();
  let nextId = 0;
  let disposed = false;
  const waive = (value: any): any => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const exported = (fn: AnyFn, target: any): AnyFn => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  const dead = (view: any): boolean => !!deps.isDead?.(view);
  const recordOf = (view: any): OwnedView | undefined => dead(view) ? undefined : records.get(view?.[ID]);
  const containerOf = (view: any): any => view._iframeWindow?.document?.getElementById('viewerContainer');

  function visible(r: OwnedView): boolean {
    const host = r.reader._window;
    const win = r.view._iframeWindow;
    // A playing PDF can be renderable while its host chrome document still
    // reports hidden. Only the PDF's own state and actual minimization gate
    // an attempt; focus/visibility signals remeasure after a suppressed scroll.
    return !r.view._suspended && !win?.document?.hidden && host?.windowState !== 2;
  }

  function cancelFrame(r: OwnedView): void {
    if (r.frame !== null && !dead(r.frameWindow)) r.frameWindow.cancelAnimationFrame(r.frame);
    r.frame = null;
  }

  function run(r: OwnedView): void {
    if (disposed || dead(r.view) || !records.has(r.id) || !r.following) return;
    bindFind(r);
    const state = waive(r.view._readAloudState);
    if (!state?.active || !state.popupOpen || state.annotationPopup || !state.activeSegment?.sourcePosition) return;
    if (!visible(r)) { r.pending = true; r.reset = true; return; }
    const reset = r.reset || r.pending;
    r.reset = false;
    const force = r.force;
    r.force = false;
    r.pending = false;
    try { deps.follow(r.reader, r.view, r.originalNavigate, reset, force); }
    catch (e) { deps.error(e); }
  }

  function schedule(r: OwnedView): void {
    if (!r.following || !r.active || dead(r.view)) return;
    r.reset = true;
    r.pending = true;
    if (!visible(r) || r.frame !== null) return;
    const win = r.view._iframeWindow;
    if (typeof win.requestAnimationFrame !== 'function') { run(r); return; }
    r.frameWindow = win;
    r.frame = win.requestAnimationFrame(exported(() => { r.frame = null; run(r); }, win));
  }

  function disengage(r: OwnedView, reason: string): void {
    if (!r.following) return;
    r.following = false;
    r.force = false;
    r.reason = reason;
    r.pending = false;
    r.reset = true;
    cancelFrame(r);
    // Stop an automatic animation before the user's own movement wins. The
    // positional overload avoids a foreign options dictionary in the reader.
    const c = containerOf(r.view);
    c?.scrollTo(c.scrollLeft, c.scrollTop);
    deps.debug?.(`pdf follow: manual ${reason}`);
  }

  function bindFind(r: OwnedView): void {
    const find = waive(r.view._findController);
    if (!find || find === r.find || typeof find._onNavigate !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(find, '_onNavigate');
    const original = find._onNavigate;
    const wrapper = exported(function(this: any, ...args: any[]) {
      disengage(r, 'find');
      return Reflect.apply(original, this, args);
    }, find);
    find._onNavigate = wrapper;
    r.find = find;
    r.undo.push(() => {
      if (dead(find) || find._onNavigate !== wrapper) return;
      if (descriptor) Object.defineProperty(find, '_onNavigate', descriptor);
      else delete find._onNavigate;
    });
  }

  function listen(r: OwnedView, target: any, type: string, fn: (event: any) => void, capture = false): void {
    if (!target?.addEventListener) return;
    const handler = exported((event: any) => {
      try { if (records.has(r.id) && !dead(r.view)) fn(waive(event)); }
      catch (e) { deps.error(e); }
    }, target);
    target.addEventListener(type, handler, capture);
    r.undo.push(() => { if (!dead(target)) target.removeEventListener(type, handler, capture); });
  }

  /** Ignore editor/popup controls and nested scroll regions, not PDF pages. */
  function inViewer(r: OwnedView, target: any): boolean {
    const c = containerOf(r.view);
    if (!target || !c?.contains(target)) return false;
    for (let node = target; node && node !== c && !node.isSameNode?.(c); node = node.parentElement) {
      const name = String(node.localName ?? '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(name) || node.isContentEditable || node.getAttribute?.('role') === 'slider') return false;
      if (node.closest?.('[role="dialog"], [role="menu"], .popup')) return false;
      if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
        const style = r.view._iframeWindow.getComputedStyle?.(node);
        if (style && /(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) return false;
      }
    }
    return true;
  }

  function bindInput(r: OwnedView): void {
    const c = containerOf(r.view);
    const win = r.view._iframeWindow;
    listen(r, c, 'wheel', e => {
      if (e.isTrusted !== false && !e.ctrlKey && !e.metaKey && (e.deltaX || e.deltaY) && inViewer(r, e.target)) disengage(r, 'wheel');
    }, true);
    // After window-capture shortcuts/selection handling, before PDF.js's
    // window-bubble Home/End/page-fit navigation consumes the same keys.
    listen(r, win.document, 'keydown', e => {
      const pageTarget = [win.document.body, win.document.documentElement].some(node => node && (node === e.target || node.isSameNode?.(e.target)));
      if (e.isTrusted !== false && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && PAGE_KEYS.has(e.key) && (pageTarget || inViewer(r, e.target))) disengage(r, 'keyboard');
    }, true);
    listen(r, c, 'pointerdown', e => {
      if (e.isTrusted === false || e.button !== 0 || !inViewer(r, e.target)) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const left = c.clientLeft ?? 0;
      const top = c.clientTop ?? 0;
      const vertical = c.scrollHeight > c.clientHeight && (x < left || x >= left + c.clientWidth);
      const horizontal = c.scrollWidth > c.clientWidth && (y < top || y >= top + c.clientHeight);
      if (vertical || horizontal) { disengage(r, 'scrollbar'); return; }
      r.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId, type: e.pointerType ?? 'mouse' };
    }, true);
    listen(r, win, 'pointermove', e => {
      const p = r.pointer;
      if (!p || e.isTrusted === false || (p.id !== undefined && p.id !== e.pointerId) || p.type !== 'mouse' || !e.buttons) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 3) return;
      if (r.view._tool?.type === 'hand') { disengage(r, 'pan'); return; }
      const rect = c.getBoundingClientRect();
      const edge = e.clientY < rect.top + 20 || e.clientY > rect.bottom - 20 || e.clientX < rect.left + 20 || e.clientX > rect.right - 20;
      if (edge && r.view.action?.type === 'selectText') disengage(r, 'selection');
    });
    for (const type of ['pointerup', 'pointercancel', 'blur']) listen(r, win, type, () => { r.pointer = null; });
    listen(r, c, 'touchmove', e => {
      if (e.isTrusted === false || e.defaultPrevented || e.touches?.length !== 1 || !inViewer(r, e.target)) return;
      if ((r.view._tool?.type === 'pointer' || e.target?.id === 'viewer') && r.view.action?.type !== 'selectText') disengage(r, 'pan');
    });
    listen(r, win.document, 'visibilitychange', () => schedule(r));
    for (const type of ['resize', 'focus', 'pageshow']) listen(r, win, type, () => schedule(r));
    const host = r.reader._window;
    if (host && host !== win) {
      listen(r, host.document, 'visibilitychange', () => schedule(r));
      for (const type of ['sizemodechange', 'resize', 'focus']) listen(r, host, type, () => schedule(r));
    } else listen(r, win, 'sizemodechange', () => schedule(r));
  }

  function release(r: OwnedView): void {
    records.delete(r.id);
    cancelFrame(r);
    for (const undo of r.undo.reverse()) { try { undo(); } catch (e) { deps.error(e); } }
    if (dead(r.view)) return;
    deps.clear?.(r.view);
    // Give native following the current intent on disable, not an obsolete
    // pre-install flag that would undo a manual navigation during our session.
    if (r.descriptor) Object.defineProperty(r.view, '_readAloudPositionLocked', { ...r.descriptor, ...('value' in r.descriptor ? { value: r.following } : {}) });
    else { delete r.view._readAloudPositionLocked; r.view._readAloudPositionLocked = r.following; }
    delete r.view[ID];
  }

  function ensure(reader: any, view: any, originalNavigate: AnyFn): OwnedView | undefined {
    if (disposed || dead(view) || failed.has(view) || destroyed.has(view)) return;
    const existing = recordOf(view);
    if (existing) return existing;
    if (!containerOf(view)) return;
    const descriptor = Object.getOwnPropertyDescriptor(view, '_readAloudPositionLocked');
    if (descriptor?.configurable === false || descriptor?.get || descriptor?.set) {
      failed.add(view);
      deps.error(new Error('Zotero-TTS: PDF follow cannot own the native position lock'));
      return;
    }
    const state = waive(view._readAloudState);
    const r: OwnedView = { id: ++nextId, reader, view, originalNavigate, descriptor,
      following: !!state?.active && view._readAloudPositionLocked !== false,
      active: !!state?.active, paused: !!state?.paused, pending: false, reset: true, force: false, reason: 'initial',
      frame: null, frameWindow: null, undo: [], find: null, pointer: null };
    try {
      Object.defineProperty(view, '_readAloudPositionLocked', { configurable: true, enumerable: descriptor?.enumerable ?? true,
        get: exported(() => false, view), set: exported(() => {}, view) });
      view[ID] = r.id;
      records.set(r.id, r);
      deps.clear?.(view);
      bindInput(r);
      bindFind(r);
      deps.debug?.('pdf follow attached');
      return r;
    } catch (e) {
      release(r);
      failed.add(view);
      deps.error(e);
      return;
    }
  }

  function attach(reader: any, rawView: any): boolean {
    const view = waive(rawView);
    if (disposed || !view || dead(view) || !Array.isArray(view._pages)) return false;
    // Compact dead records while another tab is attached, without reading
    // any property through a dead wrapper.
    for (const r of records.values()) if (dead(r.view)) release(r);
    const proto = ownerOf(view, 'setReadAloudState');
    if (!proto || typeof proto.lockPositionToReadAloud !== 'function' || typeof proto.navigateToPosition !== 'function') return false;
    const originalNavigate = originals.get(proto) ?? proto.navigateToPosition;
    originals.set(proto, originalNavigate);
    if (!patches.has(proto, 'setReadAloudState')) {
      const get = (self: any) => ensure(reader, waive(self), originalNavigate);
      patches.shadow(proto, 'navigateToPosition', original => function(this: any, ...args: any[]) {
        if (get(this) && isFollowCall(waive(args[1]))) return;
        return Reflect.apply(original, this, args);
      });
      patches.shadow(proto, 'setReadAloudState', original => function(this: any, ...args: any[]) {
        const r = get(this);
        const result = Reflect.apply(original, this, args);
        if (r) {
          const state = waive(args[0]);
          if (state?.active && !r.active) { r.following = true; r.reason = 'session'; r.reset = true; deps.clear?.(r.view); }
          r.active = !!state?.active;
          r.paused = !!state?.paused;
          if (!state?.active || !state.popupOpen) { r.following = false; r.pending = false; cancelFrame(r); }
          run(r);
        }
        return result;
      });
      patches.shadow(proto, 'lockPositionToReadAloud', original => function(this: any, ...args: any[]) {
        const r = get(this);
        if (r && deps.resuming?.(r.reader)) return Reflect.apply(original, this, args);
        if (r) { r.following = true; r.reason = 'explicit'; r.reset = true; r.force = true; }
        return Reflect.apply(original, this, args);
      });
      for (const name of ['navigate', ...NAVIGATION]) {
        if (typeof proto[name] !== 'function') continue;
        patches.shadow(proto, name, original => function(this: any, ...args: any[]) {
          const r = get(this);
          if (r && (name !== 'navigate' || !waive(args[1])?.skipHistory)) disengage(r, 'navigation');
          return Reflect.apply(original, this, args);
        });
      }
      if (typeof proto._scrollSelectionHeadIntoView === 'function') patches.shadow(proto, '_scrollSelectionHeadIntoView', original => function(this: any, ...args: any[]) {
        const r = get(this);
        const ranges = waive(args[0]);
        if (r && Array.isArray(ranges)) {
          for (let i = 0; i < ranges.length; i++) {
            if (ranges[i]?.head && !ranges[i].collapsed) { disengage(r, 'selection'); break; }
          }
        }
        return Reflect.apply(original, this, args);
      });
      if (typeof proto.setSuspended === 'function') patches.shadow(proto, 'setSuspended', original => function(this: any, ...args: any[]) {
        const result = Reflect.apply(original, this, args);
        const r = get(this);
        if (r && !args[0]) schedule(r);
        return result;
      });
      if (typeof proto.destroy === 'function') patches.shadow(proto, 'destroy', original => function(this: any, ...args: any[]) {
        const v = waive(this);
        const r = recordOf(v);
        destroyed.add(v);
        if (r) release(r);
        return Reflect.apply(original, this, args);
      });
    }
    return !!ensure(reader, view, originalNavigate);
  }

  return {
    attach,
    refresh() { for (const r of records.values()) run(r); },
    inspect(view: any): Record<string, unknown> {
      const r = recordOf(waive(view));
      return r ? { owned: true, following: r.following, pending: r.pending, reason: r.reason, visible: visible(r) } : { owned: false };
    },
    patchCounts: () => patches.counts(),
    dispose(): void {
      disposed = true;
      for (const r of [...records.values()]) release(r);
      patches.restoreAll();
    },
  };
}
