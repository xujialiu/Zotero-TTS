/**
 * The colors of Zotero's Read Aloud highlights, and a sentence highlight
 * kept under the word one.
 *
 * Zotero draws two highlights from constants hard-coded in its reader
 * bundle: READ_ALOUD_ACTIVE_SEGMENT_COLOR ('#4072e573') for the unit at the
 * chosen granularity — word, sentence or paragraph — and
 * READ_ALOUD_ACTIVE_SENTENCE_COLOR ('#4072e54d') for a two-second flash of
 * the unit a skip moved by. Neither is a pref or a CSS variable, so the
 * plugin shadows, per reader, the two methods that hand those constants to
 * the renderer:
 *
 * - PDF: Page.prototype._pushHighlightedPosition(items, position, color),
 *   called per page with the view's `_readAloudHighlightedPosition` or
 *   `_readAloudSentenceHighlightedPosition`. The position's identity says
 *   which highlight is being drawn, so the constants never need matching.
 * - EPUB / snapshot: DOMView.prototype._getSpotlightColor(key), keyed
 *   'ReadAloudActiveSegment' / 'ReadAloudActiveSentence'.
 *
 * The sentence under the word reuses Zotero's flash slot: after the view's
 * state update (PDFView.prototype.setReadAloudState, or the DOM views'
 * ReadAloud helper's setState) the slot is pointed at the current sentence
 * and kept there, while a flash of another unit (the paragraph after a
 * paragraph skip) is left to expire on its own.
 *
 * Every patched function is exported into the reader's compartment
 * (Components.utils.exportFunction) and calls the original through
 * Reflect.apply, for the reasons in memory-sync.ts. What the reader passes
 * into an exported function — `this` and the arguments — arrives behind
 * Xray wrappers, which show a plain object's own properties but not its
 * prototype's methods, and which swallow assignments; they are waived
 * (Components.utils.waiveXrays) before use, while the original is still
 * called with what arrived. Prototypes belong to one reader tab's bundle, so
 * each reader is patched once and the secondary (split) view shares the
 * patch. Anything that is not where this expects it — another Zotero
 * version — leaves Zotero's own behavior in place.
 *
 * Word color only while a real word timestamp is active. A voice without
 * word timings hands Zotero one timestamp spanning the whole segment
 * (remote-interface.wholeSegmentTimestamp, told apart by its sentinel end
 * WHOLE_SEGMENT_END_SECONDS), so word mode shows the sentence. And between
 * segments Zotero dispatches ActiveSegmentChange(null) while the view keeps
 * drawing the previous primary (setReadAloudState skips the update without
 * an active position), so the manager's activeTimestamp is null although a
 * whole stale sentence is on screen — the buffering spinner made that gap
 * seconds long and the sentence flashed the word color (issue #2). In both
 * cases the primary takes the sentence color.
 *
 * And the demoted primary may not be drawn at all: the whole-segment word
 * position often maps to a CFI the view cannot resolve, common in EPUBs —
 * undetectable from outside, because the slot holds a selector that only
 * fails at render time. So in word mode the kept-sentence slot is filled
 * regardless (the segment's own selector, computed at segmentation time,
 * always resolves); when the primary does draw, the doubled tint over the
 * same region is what every version before 1.5.3 showed (issue #3).
 */

import { WHOLE_SEGMENT_END_SECONDS } from './remote-interface';

export interface HighlightStyle {
  /** '#rrggbb' */
  wordColor: string;
  /** 0–100 */
  wordAlpha: number;
  sentenceColor: string;
  sentenceAlpha: number;
  /** In word mode, keep the sentence highlighted as well. */
  sentenceUnderWord: boolean;
}

export type Granularity = 'word' | 'sentence' | 'paragraph';

/** '#rrggbb' (or '#rgb') plus an opacity in percent → '#rrggbbaa', the form Zotero's constants take; null when the color is not one. */
export function highlightColor(hex: string, alphaPercent: number): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let rgb = m[1].toLowerCase();
  if (rgb.length === 3) rgb = [...rgb].map((c) => c + c).join('');
  const percent = Number.isFinite(alphaPercent) ? Math.min(100, Math.max(0, alphaPercent)) : 100;
  const alpha = Math.round((percent / 100) * 255);
  return `#${rgb}${alpha.toString(16).padStart(2, '0')}`;
}

/** The color for Zotero's primary highlight, by the unit it currently shows: the word color for a word, the sentence color otherwise. */
export function primaryHighlightColor(style: HighlightStyle, granularity: Granularity | null): string | null {
  return granularity === 'word'
    ? highlightColor(style.wordColor, style.wordAlpha)
    : highlightColor(style.sentenceColor, style.sentenceAlpha);
}

/** The color for Zotero's secondary slot: the sentence under a word, or the flash after a skip. */
export function secondaryHighlightColor(style: HighlightStyle): string | null {
  return highlightColor(style.sentenceColor, style.sentenceAlpha);
}

type AnyFn = (...args: any[]) => any;

export interface HighlightStylingDeps {
  /** Read on every use, so the pane's inputs apply on the next highlight. */
  style(): HighlightStyle;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Cancels a timer the reader's code set in its own window (reader._iframeWindow.clearTimeout). */
  clearTimeout?(reader: unknown, id: unknown): void;
  /**
   * Components.utils.waiveXrays: `this` and the arguments of an exported
   * function arrive behind Xray wrappers, which hide a plain object's
   * prototype methods and swallow assignments. Optional for tests.
   */
  waiveXrays?(value: unknown): unknown;
  /**
   * Components.utils.cloneInto into the reader's compartment: an object
   * built in the sandbox is unreadable by reader code (the opposite
   * direction of the Xrays above), so a repaired selector must be cloned
   * before setSpotlight. Optional for tests.
   */
  cloneIntoReader?(reader: unknown, value: unknown): unknown;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface HighlightStyling {
  /** Patch the reader's views; true once they are. Repeat calls are cheap no-ops, so this may be called on every Read Aloud event. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for Tools → Developer → Run JavaScript (`Zotero.ZoteroTTS.diagnostics.highlight()`). */
  inspect(reader: unknown): Record<string, unknown>;
  /** Put every patched prototype back. */
  dispose(): void;
}

const SENTENCE_KEY = 'ReadAloudActiveSentence';
const SEGMENT_KEY = 'ReadAloudActiveSegment';

const isGranularity = (g: unknown): g is Granularity => g === 'word' || g === 'sentence' || g === 'paragraph';

/** The prototype in `obj`'s chain that owns the method, so the patch lands where Zotero defined it. */
function ownerOf(obj: unknown, name: string): any {
  let proto = obj && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  for (let depth = 0; depth < 8 && proto && proto !== Object.prototype; depth++) {
    if (Object.prototype.hasOwnProperty.call(proto, name) && typeof proto[name] === 'function') return proto;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

export function createHighlightStyling(deps: HighlightStylingDeps): HighlightStyling {
  const patches: Array<{ proto: any; name: string; original: AnyFn }> = [];
  const patchedViews = new WeakSet<object>();
  /** The sentence position / selector this module put into a view's secondary slot, to tell it from Zotero's flashes. */
  const oursPDF = new WeakMap<object, unknown>();
  const oursDOM = new WeakMap<object, { segment: unknown; selector: unknown }>();

  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);

  function shadow(proto: any, name: string, make: (original: AnyFn) => AnyFn): void {
    if (patches.some((p) => p.proto === proto && p.name === name)) return;
    const original = proto[name] as AnyFn;
    const wrapper = make(original);
    proto[name] = deps.exportFunction ? deps.exportFunction(wrapper, proto) : wrapper;
    patches.push({ proto, name, original });
  }

  // One debug line per change of what matters, never one per render
  const lastLogged = new Map<string, string>();
  const logChange = (key: string, message: string) => {
    if (lastLogged.get(key) === message) return;
    lastLogged.set(key, message);
    deps.debug?.(message);
  };

  const granularityOf = (fn: unknown, self: unknown, state: unknown): Granularity | null => {
    let g: unknown = null;
    try {
      g = typeof fn === 'function' ? Reflect.apply(fn, self, [state]) : null;
    } catch (e) {
      deps.error(e);
    }
    const s = state as { highlightGranularity?: unknown; segmentGranularity?: unknown } | null;
    logChange(
      'granularity',
      `highlight: effective granularity ${String(g)} (method ${typeof fn}; state ${s ? `highlight=${String(s.highlightGranularity)} segments=${String(s.segmentGranularity)}` : 'missing'})`,
    );
    return isGranularity(g) ? g : null;
  };
  /** What the manager's active word timestamp is: a real word, the whole-segment stand-in of a wordless voice, or none (the gap between segments, system voices). */
  const activeWordTimestamp = (reader: any): 'real' | 'stand-in' | 'none' => {
    let kind: 'real' | 'stand-in' | 'none' = 'none';
    try {
      const ts = reader?._internalReader?._readAloudManager?.activeTimestamp;
      if (ts) kind = ts.start === 0 && ts.end === WHOLE_SEGMENT_END_SECONDS ? 'stand-in' : 'real';
    } catch (e) {
      deps.error(e);
    }
    logChange('word-timestamp', `highlight: active word timestamp ${kind}`);
    return kind;
  };
  const demote = (g: Granularity | null, reader: unknown): Granularity | null => (g === 'word' && activeWordTimestamp(reader) !== 'real' ? 'sentence' : g);
  const pdfRawGranularity = (view: any) => granularityOf(view?._effectiveReadAloudPrimaryGranularity, view, view?._readAloudState);
  const domRawGranularity = (helper: any) => granularityOf(helper?._effectivePrimaryGranularity, helper, helper?.state);
  const pdfGranularity = (reader: unknown, view: any) => demote(pdfRawGranularity(view), reader);
  const domGranularity = (reader: unknown, helper: any) => demote(domRawGranularity(helper), reader);


  // ---- PDF ------------------------------------------------------------------

  function keepSentencePDF(reader: unknown, view: any, state: any): void {
    const style = deps.style();
    let want: any = style.sentenceUnderWord && state?.popupOpen && pdfRawGranularity(view) === 'word' ? (state.activeSegment?.sourcePosition ?? null) : null;
    if (want && want.pageIndex === undefined) want = null;
    const slot = view._readAloudSentenceHighlightedPosition ?? null;
    const mine = oursPDF.get(view) ?? null;
    logChange(
      'pdf-sentence',
      `highlight: sentence under word ${want ? 'wanted' : 'not wanted'} (switch ${style.sentenceUnderWord}, popup ${!!state?.popupOpen}); slot ${slot === null ? 'empty' : slot === want ? 'this sentence' : slot === mine ? 'ours' : 'another unit'}`,
    );
    if (!want) {
      // Switched off, or not in word mode: take back only what we put there
      if (mine && slot === mine) {
        view._readAloudSentenceHighlightedPosition = null;
        view._render();
      }
      oursPDF.delete(view);
      return;
    }
    if (slot === want) {
      // Zotero's own flash of this very sentence (after a sentence skip), or
      // ours already: its timer would blank it two seconds later
      if (view._readAloudSentenceTimeout != null) deps.clearTimeout?.(reader, view._readAloudSentenceTimeout);
      oursPDF.set(view, want);
      return;
    }
    // A flash of another unit — the paragraph after a paragraph skip — shows until it expires
    if (slot && slot !== mine) return;
    view._readAloudSentenceHighlightedPosition = want;
    oursPDF.set(view, want);
    view._render();
  }

  function patchPDF(reader: unknown, view: any): boolean {
    const page = Array.isArray(view._pages) ? view._pages[0] : undefined;
    const pageProto = page ? ownerOf(page, '_pushHighlightedPosition') : null;
    const viewProto = ownerOf(view, 'setReadAloudState');
    if (!pageProto || !viewProto || typeof view._render !== 'function') return false;
    shadow(pageProto, '_pushHighlightedPosition', (original) =>
      function (this: any, items: unknown, position: unknown, color: unknown) {
        let replaced = color;
        try {
          const layer = waive(this)?._layer;
          const drawn = waive(position);
          if (drawn && layer) {
            if (drawn === layer._readAloudHighlightedPosition) {
              const style = deps.style();
              replaced = primaryHighlightColor(style, pdfGranularity(reader, layer)) ?? color;
              logChange('pdf-primary', `highlight: primary ${String(replaced)} (word ${style.wordColor}/${style.wordAlpha}, sentence ${style.sentenceColor}/${style.sentenceAlpha}, Zotero ${String(color)})`);
            } else if (drawn === layer._readAloudSentenceHighlightedPosition) {
              replaced = secondaryHighlightColor(deps.style()) ?? color;
              logChange('pdf-secondary', `highlight: secondary ${String(replaced)} (Zotero ${String(color)})`);
            }
          }
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, [items, position, replaced]);
      },
    );
    shadow(viewProto, 'setReadAloudState', (original) =>
      function (this: any, ...args: unknown[]) {
        // Zotero's method is async but sets the highlight positions before
        // its first await, so they are in place when the original returns
        const result = Reflect.apply(original, this, args);
        try {
          keepSentencePDF(reader, waive(this), waive(args[0]));
        } catch (e) {
          deps.error(e);
        }
        return result;
      },
    );
    return true;
  }

  // ---- EPUB / snapshot ------------------------------------------------------

  /**
   * Zotero's CFI resolver takes a text step /n as the (n-1)/2-th member of
   * the parent's text-node list, while its generator numbers the position
   * among all children (the CFI spec) — a paragraph that starts with an
   * element (the pagebreak anchors of printed EPUBs) gets a selector the
   * resolver cannot find, and Zotero's own primary goes dark with it
   * (issue #3). When the sentence selector does not resolve, rewrite the
   * final text step through the resolver's own convention and keep the
   * first rewrite whose displayed text is exactly the segment's text.
   */
  const normText = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
  function resolvableSelector(reader: unknown, view: any, selector: any, segment: any): any {
    if (typeof view?.toDisplayedRange !== 'function') return selector;
    const rangeOf = (sel: any) => {
      try {
        return view.toDisplayedRange(sel) ?? null;
      } catch (e) {
        deps.error(e);
        return null;
      }
    };
    if (rangeOf(selector)) return selector;
    const value = typeof selector?.value === 'string' ? selector.value : '';
    const m = /^epubcfi\(([^,[\]]*)\/(\d*[13579])(,[^,[\]]*,[^,[\]]*)?\)$/.exec(value);
    const text = normText(segment?.text);
    if (!m || !text) {
      logChange('sentence-repair', `highlight: sentence selector does not resolve and cannot be rewritten (${value || 'no value'})`);
      return null;
    }
    for (const step of [1, 3, 5, 7, 9]) {
      if (String(step) === m[2]) continue;
      // Cloned before probing: reader code cannot read a sandbox object,
      // so an unprobed clone would make every candidate "fail to resolve"
      const raw = { type: selector.type, conformsTo: selector.conformsTo, value: `epubcfi(${m[1]}/${step}${m[3] ?? ''})` };
      const candidate = deps.cloneIntoReader ? deps.cloneIntoReader(reader, raw) : raw;
      const range = rangeOf(candidate);
      if (range && normText(range.toString()) === text) {
        logChange('sentence-repair', `highlight: sentence selector repaired, text step /${m[2]} -> /${step}`);
        return candidate;
      }
    }
    logChange('sentence-repair', 'highlight: sentence selector does not resolve and no rewrite shows the sentence');
    return null;
  }

  function keepSentenceDOM(reader: unknown, helper: any, state: any): void {
    const view = helper?._view;
    const spotlights: Map<unknown, unknown> | undefined = view?._spotlights;
    if (!spotlights || typeof view.setSpotlight !== 'function') return;
    const style = deps.style();
    const cached = oursDOM.get(helper);
    const want = !!(style.sentenceUnderWord && state?.popupOpen && state.activeSegment && domRawGranularity(helper) === 'word');
    if (!want) {
      if (cached && spotlights.get(SENTENCE_KEY) === cached.selector) view.setSpotlight(SENTENCE_KEY, null);
      oursDOM.delete(helper);
      return;
    }
    let selector = cached && cached.segment === state.activeSegment ? cached.selector : null;
    if (!selector) {
      selector = helper._resolveSegmentSelector(state);
      if (!selector) return;
      selector = resolvableSelector(reader, view, selector, state.activeSegment);
      if (!selector) return;
      oursDOM.set(helper, { segment: state.activeSegment, selector });
    }
    const current = spotlights.get(SENTENCE_KEY);
    if (current === selector) return;
    // Zotero's flash of this very sentence (after a sentence skip) is
    // replaced outright — its timer only removes the selector it set. A
    // flash of another unit (the paragraph) shows until it expires.
    if (current && current !== cached?.selector && state.lastSkipGranularity !== 'sentence') return;
    view.setSpotlight(SENTENCE_KEY, selector, null);
  }

  function patchDOM(reader: unknown, view: any): boolean {
    const helper = view._readAloud;
    const viewProto = ownerOf(view, '_getSpotlightColor');
    const helperProto = helper ? ownerOf(helper, 'setState') : null;
    if (!viewProto || !helperProto || typeof helper._resolveSegmentSelector !== 'function') return false;
    shadow(viewProto, '_getSpotlightColor', (original) =>
      function (this: any, key: unknown) {
        try {
          if (key === SEGMENT_KEY) {
            const color = primaryHighlightColor(deps.style(), domGranularity(reader, waive(this)?._readAloud));
            if (color) return color;
          } else if (key === SENTENCE_KEY) {
            const color = secondaryHighlightColor(deps.style());
            if (color) return color;
          }
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, [key]);
      },
    );
    shadow(helperProto, 'setState', (original) =>
      function (this: any, ...args: unknown[]) {
        const result = Reflect.apply(original, this, args);
        try {
          keepSentenceDOM(reader, waive(this), waive(args[0]));
        } catch (e) {
          deps.error(e);
        }
        return result;
      },
    );
    return true;
  }

  // ---- wiring ---------------------------------------------------------------

  function attach(reader: any): boolean {
    const internal = reader?._internalReader;
    if (!internal) return false;
    const views = [internal._primaryView, internal._secondaryView, internal._primarySDTView, internal._secondarySDTView].filter(
      (v) => v && typeof v === 'object',
    );
    let done = false;
    for (const view of views) {
      if (patchedViews.has(view)) {
        done = true;
        continue;
      }
      try {
        const ok = Array.isArray(view._pages) ? patchPDF(reader, view) : view._readAloud ? patchDOM(reader, view) : false;
        if (ok) {
          patchedViews.add(view);
          deps.debug?.(`highlight style attached to a ${Array.isArray(view._pages) ? 'PDF' : 'DOM'} view`);
        }
        done = ok || done;
      } catch (e) {
        deps.error(e);
      }
    }
    return done;
  }

  function inspect(reader: any): Record<string, unknown> {
    const internal = reader?._internalReader;
    const views = [internal?._primaryView, internal?._secondaryView, internal?._primarySDTView, internal?._secondarySDTView].filter(
      (v) => v && typeof v === 'object',
    );
    const describe = (raw: any) => {
      try {
        const view = waive(raw);
        const pdf = Array.isArray(view._pages);
        const state = pdf ? view._readAloudState : view._readAloud?.state;
        const slot = pdf ? (view._readAloudSentenceHighlightedPosition ?? null) : (view._spotlights?.get(SENTENCE_KEY) ?? null);
        const mine = pdf ? oursPDF.get(view) : oursDOM.get(view._readAloud)?.selector;
        return {
          kind: pdf ? 'pdf' : view._readAloud ? 'dom' : 'unknown',
          patched: patchedViews.has(raw),
          pages: pdf ? view._pages.length : undefined,
          method: typeof (pdf ? view._effectiveReadAloudPrimaryGranularity : view._readAloud?._effectivePrimaryGranularity),
          granularity: pdf ? pdfGranularity(reader, view) : domGranularity(reader, view._readAloud),
          activeWordTimestamp: activeWordTimestamp(reader),
          primaryShown: pdf ? view._readAloudHighlightedPosition != null : (view._spotlights?.get(SEGMENT_KEY) ?? null) != null,
          state: state
            ? {
                popupOpen: !!state.popupOpen,
                highlightGranularity: state.highlightGranularity ?? null,
                segmentGranularity: state.segmentGranularity ?? null,
                segment: !!state.activeSegment,
                segmentPage: state.activeSegment?.sourcePosition?.pageIndex ?? null,
                wordPosition: !!state.activeWordSourcePosition,
              }
            : null,
          sentenceSlot: slot === null ? 'empty' : slot === mine ? 'ours' : 'other',
        };
      } catch (e) {
        return { error: String(e) };
      }
    };
    return { views: views.map(describe), style: deps.style() };
  }

  function dispose(): void {
    for (const { proto, name, original } of patches.reverse()) {
      try {
        proto[name] = original;
      } catch (e) {
        deps.error(e);
      }
    }
    patches.length = 0;
  }

  return { attach, inspect, dispose };
}
