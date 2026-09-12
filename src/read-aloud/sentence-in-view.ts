/**
 * The whole sentence on screen while Read Aloud follows a PDF (issue #83).
 *
 * Zotero's PDF view follows the reading position on every state push while
 * the position is locked: `setReadAloudState` (reader.js:76421 in
 * 10.0.2-beta.9) calls `navigateToPosition(activeSegment.sourcePosition,
 * { ifNeeded: true, visibilityMargin: -innerHeight / 4, block: 'center',
 * inline: 'nearest', behavior: 'smooth' })` (76472–76479). That method
 * measures the sentence by the box of its rects on its first page only
 * (`getPositionBoundingViewRect`, 77036, through `getPositionBoundingRect(
 * position, position.pageIndex)`, 32305), and `getScrollTarget` (75155)
 * scrolls only when that box's top is in the bottom quarter of the viewport
 * or its bottom in the top quarter (75171), to put the top on the center
 * line (75183). The box's bottom is never held against the viewport's
 * bottom edge, nor its top against the top edge, and the sentence's
 * continuation on the next page (`nextPageRects`) is never measured — so a
 * sentence continued past the bottom, on the next page or at the top of the
 * next column stays cut, and Shift+Enter, which lands in the same branch,
 * cannot bring the tail in. Measured 2026-09-10 (notes/NOTES_2026-09-10.md).
 *
 * The PDF-only controller in pdf-follow.ts owns the follow state (#90),
 * preserves Zotero's state/highlight work and calls this geometry directly.
 * The native scroll/debounce branch is disabled on owned views: delayed
 * scroll events cannot disengage following, but deliberate navigation can.
 * Both pages are measured, the whole centered when it fits, else the real
 * word followed when available; unmeasurable positions and horizontal-only
 * navigation use the saved native method under the same plugin-owned lock.
 *
 * Compartments: the shadow runs exported into the reader's compartment, so
 * `this`, the position and the options arrive behind Xray wrappers (waived
 * through the dep); reader-realm functions are called with primitives only,
 * their arrays walked by index. The scroll options are built here and cloned
 * into the container's own window before `scrollTo`, which reads a foreign
 * dictionary as empty (measured 2026-09-10).
 */

import type { AutoScrollMode } from '../core/settings';
import type { WordTiming } from '../core/highlight-level';
import type { AnyFn } from './proto-patches';
import { createPdfFollow } from './pdf-follow';
export { isFollowCall } from './pdf-follow';

/** A box in the container's coordinates, `[left, top, right, bottom]` in CSS px — Zotero's own shape. */
export type Box = [number, number, number, number];

/** What `#viewerContainer` reports. */
export interface Viewport {
  scrollTop: number;
  scrollLeft: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

/** Why following moved: sentence entry, explicit return, clipped content or a real word. */
export type FollowReason = 'sentence' | 'return' | 'cut' | 'part' | 'none';

export interface FollowInput {
  mode?: AutoScrollMode;
  entered?: boolean;
  force?: boolean;
  /** The box of the sentence's rects on its first page — what Zotero measures. */
  head: Box;
  /** The union of every part's box: the head, and the next page's rects when the sentence has them. */
  whole: Box;
  /** The box of the word being read, when the voice has real word timing; null otherwise. */
  part: Box | null;
  viewport: Viewport;
  /** The breathing room inside the viewport's edges; `followMargin` of the viewport when left out. */
  margin?: number;
}

export interface FollowTarget {
  reason: FollowReason;
  /** Whether the whole sentence fits the actual viewport. */
  fits: boolean;
  /**
   * Whether the measurement is usable. Fully visible content is handled
   * here too, so native early-scroll triggers cannot run afterward.
   */
  handled: boolean;
  top?: number;
  left?: number;
}

const MARGIN_MIN = 8;
const MARGIN_MAX = 24;
const MARGIN_SHARE = 40;
/** Zotero's inline-nearest margin (reader.js NEAREST_MARGIN, 75153). */
const NEAREST_MARGIN = 10;
/**
 * A target already issued is not issued again on the pushes inside this
 * window: the follow calls on every word push, mid-animation included, and
 * the targets below do not depend on where the animation is.
 */
export const RETARGET_MS = 1500;
/** Where the shadow keeps its last decision, on the view itself: a WeakMap keyed by a waived wrapper misses the same view reached from our side. */
const LAST = '_zoteroTTSSentenceInView';

/** A fortieth of the viewport, between 8 and 24 px. */
export function followMargin(clientHeight: number): number {
  const share = Math.round(clientHeight / MARGIN_SHARE);
  if (!Number.isFinite(share)) return MARGIN_MIN;
  return Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, share));
}

/** The bounding box of Zotero's rects, `[x1, y1, x2, y2]` each; null for none, or a malformed one. */
export function boxOfRects(rects: unknown): Box | null {
  if (!Array.isArray(rects) || rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  // By index: a reader-realm array takes no sandbox callback
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!Array.isArray(r) || r.length < 4) return null;
    const a = Number(r[0]);
    const b = Number(r[1]);
    const c = Number(r[2]);
    const d = Number(r[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return null;
    x1 = Math.min(x1, a);
    y1 = Math.min(y1, b);
    x2 = Math.max(x2, c);
    y2 = Math.max(y2, d);
  }
  return [x1, y1, x2, y2];
}

export function unionBoxes(a: Box, b: Box): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** The corner of a pdf.js page view this module reads. */
export interface PageLike {
  viewport: { convertToViewportPoint(x: number, y: number): ArrayLike<number> };
  div: { getBoundingClientRect(): { x: number; y: number } };
}

export interface ScrollOffsets {
  scrollLeft: number;
  scrollTop: number;
}

/**
 * A page's rects as a box in container coordinates — Zotero's
 * `getPositionBoundingViewRect` (reader.js:77036) step for step: the PDF
 * box's corners through the page viewport, the page div's client rect, the
 * container's scroll offsets.
 */
export function pageBoxInContainer(rects: unknown, page: PageLike, scroll: ScrollOffsets): Box | null {
  const r = boxOfRects(rects);
  if (!r) return null;
  const p1 = page.viewport.convertToViewportPoint(r[0], r[1]);
  const p2 = page.viewport.convertToViewportPoint(r[2], r[3]);
  const x1 = Number(p1[0]);
  const y2 = Number(p1[1]);
  const x2 = Number(p2[0]);
  const y1 = Number(p2[1]);
  const pr = page.div.getBoundingClientRect();
  return [
    pr.x + Math.min(x1, x2) + scroll.scrollLeft,
    pr.y + Math.min(y1, y2) + scroll.scrollTop,
    pr.x + Math.max(x1, x2) + scroll.scrollLeft,
    pr.y + Math.max(y1, y2) + scroll.scrollTop,
  ];
}

/** A Read Aloud position as this module reads it: a page, its rects, the next page's when the sentence runs on. */
export interface PositionLike {
  pageIndex?: unknown;
  rects?: unknown;
  nextPageRects?: unknown;
  rotation?: unknown;
}

export interface Extent {
  head: Box;
  whole: Box;
}

/**
 * The head (first-page box) and the whole (with the next page's box when
 * there is one) of a position; null for what cannot be measured — no rects,
 * a page the viewer does not have, a rotated position — which the caller
 * leaves to Zotero.
 */
export function extentOf(
  position: PositionLike | null | undefined,
  pageAt: (index: number) => PageLike | null | undefined,
  scroll: ScrollOffsets,
): Extent | null {
  if (!position || typeof position !== 'object') return null;
  const index = position.pageIndex;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  if (position.rotation) return null;
  const first = pageAt(index);
  if (!first) return null;
  const head = pageBoxInContainer(position.rects, first, scroll);
  if (!head) return null;
  let whole: Box = head;
  const nextRects = position.nextPageRects;
  if (Array.isArray(nextRects) && nextRects.length) {
    const next = pageAt(index + 1);
    const tail = next ? pageBoxInContainer(nextRects, next, scroll) : null;
    if (tail) whole = unionBoxes(head, tail);
  }
  return { head, whole };
}

/** Whether any of the box lies outside the viewport less the margin. */
export function isOutside(box: Box, viewport: Viewport, margin: number): boolean {
  return box[1] < viewport.scrollTop + margin || box[3] > viewport.scrollTop + viewport.clientHeight - margin;
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, high));

/** Zotero's `inline: 'nearest'` rule (reader.js:75190–75206) on the box brought in; undefined when nothing has to move. */
function inlineNearest(box: Box, v: Viewport): number | undefined {
  const x = box[0];
  const right = box[2];
  const viewportRight = v.scrollLeft + v.clientWidth;
  const width = right - x;
  let left: number | undefined;
  if (width <= v.clientWidth) {
    const inlineMargin = Math.min(NEAREST_MARGIN, Math.max(0, (v.clientWidth - width) / 2));
    if (x < v.scrollLeft) left = x - inlineMargin;
    else if (right > viewportRight) left = right - v.clientWidth + inlineMargin;
  } else if (x > v.scrollLeft) {
    left = x;
  } else if (right < viewportRight) {
    left = right - v.clientWidth;
  }
  if (left === undefined) return undefined;
  left = clamp(left, 0, Math.max(0, v.scrollWidth - v.clientWidth));
  return Math.abs(left - v.scrollLeft) < 1 ? undefined : left;
}

/**
 * The follow decision: center on sentence entry in sentence mode, otherwise
 * only after actual clipping; explicit return always centers a fitting sentence. A sentence taller than the viewport follows the word being read
 * when that leaves the viewport, centered; without a word its head goes to
 * the top edge plus the margin, once. A target that is where the view
 * already stands is no scroll.
 */
export function followTarget(input: FollowInput): FollowTarget {
  const { head, whole, part, viewport: v } = input;
  const CH = v.clientHeight;
  const ST = v.scrollTop;
  if (!(CH > 0)) return { reason: 'none', fits: false, handled: false };
  const margin = input.margin ?? followMargin(CH);
  const fits = whole[3] - whole[1] <= CH;
  let reason: FollowReason = 'none';
  let focus = whole;
  let top: number | undefined;
  if (fits) {
    if (input.force || (input.mode === 'sentence' && input.entered) || isOutside(whole, v, 0)) {
      reason = input.force ? 'return' : input.mode === 'sentence' && input.entered ? 'sentence' : 'cut';
      top = (whole[1] + whole[3]) / 2 - CH / 2;
    }
  } else if (input.entered || input.force) {
    reason = input.force ? 'return' : 'cut';
    focus = head;
    top = head[1] - margin;
  } else if (part) {
    focus = part;
    if (isOutside(part, v, 0)) {
      reason = 'part';
      top = (part[1] + part[3]) / 2 - CH / 2;
    }
  } else {
    // No word timing: never repeatedly drag a tall sentence back to its head.
    return { reason: 'none', fits, handled: true };
  }
  const left = inlineNearest(focus, v);
  if (top !== undefined) top = clamp(top, 0, Math.max(0, v.scrollHeight - CH));
  if (top !== undefined && Math.abs(top - ST) < 1) top = undefined;
  if (top === undefined && left === undefined) return { reason: 'none', fits, handled: true };
  const target: FollowTarget = { reason: reason === 'none' ? 'cut' : reason, fits, handled: true };
  if (top !== undefined) target.top = top;
  if (left !== undefined) target.left = left;
  return target;
}

export interface SentenceInViewDeps {
  resuming?(reader: any): boolean;
  mode?(): AutoScrollMode;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays: `this` and the arguments of an exported function arrive behind Xray wrappers. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.cloneInto into the container's own window: `scrollTo` reads a dictionary from another compartment as empty. Optional for tests. */
  cloneInto?(container: unknown, value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  /** What the reader's active word timestamp is (highlight-style.ts): only a real word is followed. Optional: without it no word is. */
  wordTiming?(reader: unknown): WordTiming;
  /** The clock of the re-target window. Optional: Date.now. */
  now?(): number;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface SentenceInView {
  refresh(): void;
  /** Patch the reader's PDF views; true once they are. Repeat calls are cheap no-ops, so this may be called on every Read Aloud event. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for `Zotero.ZoteroTTS.diagnostics.sentenceInView()`. */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every patched prototype back. */
  dispose(): void;
}

/** The last decision the shadow made on a view, kept on the view for the diagnostic and the re-target window. */
interface LastDecision {
  at: number;
  reason: FollowReason;
  fits: boolean;
  from: number;
  top: number | null;
  left: number | null;
  /** Whether a scroll was issued for it (false: a repeat inside the window, or nothing to do). */
  issued: boolean;
}

export function createSentenceInView(deps: SentenceInViewDeps): SentenceInView {
  const entries = new WeakMap<object, { key: string; mode: AutoScrollMode }>();
  const controller = createPdfFollow({
    ...deps,
    clear(view) { delete view[LAST]; entries.delete(view); },
    follow(reader, view, originalNavigate, reset, force) {
      if (reset) delete view[LAST];
      const position = waive(waive(view._readAloudState)?.activeSegment)?.sourcePosition;
      if (!position) return;
      let container: any = null;
      const options = { ifNeeded: true, visibilityMargin: -(view._iframeWindow.innerHeight ?? 1000) / 4,
        block: 'center', inline: 'nearest', behavior: 'smooth' };
      try {
        container = containerOf(view);
        if (follow(reader, view, waive(position), options, force)) return;
      } catch (e) { deps.error(e); }
      // The saved method retains Zotero's horizontal-nearest behavior and
      // handles uncommon positions we cannot measure, without its lock/timer.
      const result = Reflect.apply(originalNavigate, view, [position, deps.cloneInto ? deps.cloneInto(container, options) : options]);
      if (result?.catch) result.catch(deps.exportFunction ? deps.exportFunction(deps.error, view) : deps.error);
    },
  });
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const now = (): number => (deps.now ? deps.now() : Date.now());

  const containerOf = (view: any): any => view?._iframeWindow?.document?.getElementById?.('viewerContainer') ?? null;
  const pagesOf = (view: any): any[] | null => {
    const pages = view?._iframeWindow?.PDFViewerApplication?.pdfViewer?._pages;
    return Array.isArray(pages) ? pages : null;
  };

  /** The sentence and the word against the container, or null for what Zotero should handle. */
  function measure(reader: unknown, view: any, position: unknown): { extent: Extent; part: Box | null; viewport: Viewport } | null {
    const container = containerOf(view);
    const pages = pagesOf(view);
    if (!container || !pages) return null;
    const scroll: ScrollOffsets = { scrollLeft: Number(container.scrollLeft), scrollTop: Number(container.scrollTop) };
    const pageAt = (i: number): PageLike | null => (i >= 0 && i < pages.length ? (pages[i] ?? null) : null);
    const extent = extentOf(position as PositionLike, pageAt, scroll);
    if (!extent) return null;
    const viewport: Viewport = {
      scrollTop: scroll.scrollTop,
      scrollLeft: scroll.scrollLeft,
      clientWidth: Number(container.clientWidth),
      clientHeight: Number(container.clientHeight),
      scrollWidth: Number(container.scrollWidth),
      scrollHeight: Number(container.scrollHeight),
    };
    let part: Box | null = null;
    if (deps.wordTiming?.(reader) === 'real') {
      const word = waive(waive(view._readAloudState)?.activeWordSourcePosition);
      if (word && typeof word.pageIndex === 'number') {
        const page = pageAt(word.pageIndex);
        if (page) part = pageBoxInContainer(word.rects, page, scroll);
      }
    }
    return { extent, part, viewport };
  }

  /** The follow's call: true when answered here, false when Zotero's method should run. */
  function follow(reader: unknown, view: any, position: any, options: any, force: boolean): boolean {
    const m = measure(reader, view, position);
    if (!m) return false;
    const mode = deps.mode?.() ?? 'outside';
    const key = JSON.stringify(position);
    const previous = entries.get(view);
    const entered = previous?.key !== key;
    const changedMode = previous?.mode !== mode;
    if (changedMode) delete view[LAST];
    entries.set(view, { key, mode });
    // First rect is the reading-order head, even when a column-crossing
    // sentence's union starts at the top of its second column.
    let head = m.extent.head;
    const page = pagesOf(view)?.[position.pageIndex];
    if (page && position.rects?.length) head = pageBoxInContainer([position.rects[0]], page, m.viewport) ?? head;
    const target = followTarget({ head, whole: m.extent.whole, part: m.part, viewport: m.viewport,
      mode, entered: entered || changedMode, force });
    const last: LastDecision | undefined = view[LAST];
    const at = now();
    const decision: LastDecision = {
      at,
      reason: target.reason,
      fits: target.fits,
      from: m.viewport.scrollTop,
      top: target.top ?? null,
      left: target.left ?? null,
      issued: false,
    };
    if (!target.handled || target.reason === 'none') {
      view[LAST] = decision;
      return target.handled;
    }
    if (last?.issued && last.top === decision.top && last.left === decision.left && at - last.at < RETARGET_MS) {
      // The same target, issued moments ago: the animation is on its way
      view[LAST] = { ...decision, at: last.at, issued: true };
      return true;
    }
    const opts: Record<string, unknown> = { behavior: options?.behavior ?? 'smooth' };
    if (target.top !== undefined) opts.top = target.top;
    if (target.left !== undefined) opts.left = target.left;
    const container = containerOf(view);
    container.scrollTo(deps.cloneInto ? deps.cloneInto(container, opts) : opts);
    decision.issued = true;
    view[LAST] = decision;
    const pageIndex = Number(position?.pageIndex);
    deps.debug?.(
      `sentence in view: ${target.reason} on page ${pageIndex + 1}: scrollTop ${Math.round(m.viewport.scrollTop)} -> ${Math.round(target.top ?? m.viewport.scrollTop)}` +
        `, sentence ${Math.round(m.extent.whole[3] - m.extent.whole[1])} px, viewport ${Math.round(m.viewport.clientHeight)} px`,
    );
    return true;
  }

  function pdfViewsOf(reader: any): any[] {
    const internal = reader?._internalReader;
    if (!internal) return [];
    return [internal._primaryView, internal._secondaryView].filter((v) => v && typeof v === 'object' && Array.isArray(v._pages));
  }

  function attach(reader: any): boolean {
    let done = false;
    for (const view of pdfViewsOf(reader)) {
      try { if (controller.attach(reader, view)) done = true; }
      catch (e) { deps.error(e); }
    }
    return done;
  }

  function inspect(reader: any): Record<string, unknown> {
    const internal = reader?._internalReader;
    const views = internal ? [internal._primaryView, internal._secondaryView].filter((v) => v && typeof v === 'object') : [];
    const view = views.find((v) => Array.isArray(v._pages)) ?? views[0];
    if (!view) return { kind: 'none', patched: false };
    if (!Array.isArray(view._pages)) return { kind: 'dom', patched: false };
    const ownership = controller.inspect(view);
    const patched = ownership.owned === true;
    let sentence: Record<string, unknown> | null = null;
    let part: Box | null = null;
    let viewport: Viewport | null = null;
    try {
      const state = waive(view._readAloudState);
      const position = waive(state?.activeSegment)?.sourcePosition ?? null;
      const m = position ? measure(reader, waive(view), waive(position)) : null;
      if (m) {
        viewport = m.viewport;
        part = m.part;
        const margin = 0;
        sentence = {
          head: m.extent.head,
          whole: m.extent.whole,
          fits: m.extent.whole[3] - m.extent.whole[1] <= m.viewport.clientHeight - 2 * margin,
          cut: isOutside(m.extent.whole, m.viewport, margin),
        };
      }
    } catch (e) {
      deps.error(e);
    }
    const last: LastDecision | undefined = view[LAST];
    return { kind: 'pdf', mode: deps.mode?.() ?? 'outside', patched, ...ownership, viewport, sentence, part, last: last ? { ...last } : null };
  }

  return {
    attach,
    refresh: () => controller.refresh(),
    inspect,
    patchCounts: () => controller.patchCounts(),
    dispose: () => controller.dispose(),
  };
}
