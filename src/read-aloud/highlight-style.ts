/**
 * The colors of Zotero's Read Aloud highlights, and a sentence highlight
 * kept around the word one.
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
 * always resolves); when the primary does draw, the two are kept from
 * tinting the same pixels by the rule below.
 *
 * The two highlights never overlap: the secondary is drawn only where the
 * primary is not. Both are translucent and Zotero draws them at its own
 * opacity — PDF rectangles at .4 `multiply` (.3 `plus-lighter` in a dark
 * theme), EPUB paths at 50% inside one `multiply` container — so an overlap
 * is the product of the two colors and is neither of them: the word came
 * out darker than the color that was picked, and a primary covering the
 * whole sentence (the stand-in position of a wordless voice) tinted it
 * twice. How the sentence is cut differs by view kind:
 *
 * - PDF: at paint time, in the same `_pushHighlightedPosition`. The
 *   position rectangles of the word and of the sentence are line boxes
 *   built by the same mapper, so the word is simply subtracted from the
 *   sentence (subtractRects) and the pieces are pushed instead. The slot
 *   still holds the real sentence position, and the hole follows the word
 *   with no extra render: Zotero rebuilds the display list on every word
 *   anyway, and diffs it by signature.
 * - EPUB / snapshot: two spotlight slots of our own, keyed
 *   'ZoteroTTSSentenceHead' / 'ZoteroTTSSentenceTail' — `_renderAnnotations`
 *   iterates the whole `_spotlights` map, and the shadowed
 *   `_getSpotlightColor` answers for them. What they hold is not a selector
 *   but a piece of one (SentencePiece), turned into a range by the shadowed
 *   `toDisplayedRange`: the sentence and the word are resolved through
 *   Zotero's own resolver at render time and the one is cut at the other.
 *   No CFI of ours is ever generated — Zotero's generator and resolver
 *   disagree about text steps (issues #3/#4), so a CFI we built would be
 *   wrong exactly where those are. Zotero expands a spotlight rectangle to
 *   the line height, and only for its own two keys, so the pieces are
 *   glyph-height and the word stands a little proud of them.
 */

import { createProtoPatches } from './proto-patches';
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

/** Below what a piece of a highlight is not worth drawing, in PDF points. */
const RECT_EPSILON = 0.1;

const isRect = (r: unknown): r is number[] => Array.isArray(r) && r.length === 4 && r.every((n) => Number.isFinite(n));

/** Zotero's own `sameLine` (pdf-position-mapper): 60% of the shorter height has to overlap. */
export function sameLine(a: number[], b: number[]): boolean {
  if (!isRect(a) || !isRect(b)) return false;
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const shorter = Math.max(0.001, Math.min(a[3] - a[1], b[3] - b[1]));
  return overlap / shorter >= 0.6;
}

/**
 * `rect` minus `hole`, in Zotero's `[x1, y1, x2, y2]`: the piece left and
 * the piece right of it. The cut runs the full height of the rectangle, not
 * only the hole's own — a word box is a little shorter than its line box
 * whenever the line has a taller character on it, and a strip left above or
 * below the word would change thickness with every word, so the whole line
 * would flicker. Rectangles that are not on the same line do not cut each
 * other; a rectangle nothing cuts comes back by identity.
 */
function subtractRect(rect: number[], hole: number[]): number[][] {
  if (!isRect(rect) || !isRect(hole) || !sameLine(rect, hole)) return [rect];
  const [ax1, ay1, ax2, ay2] = rect;
  const [bx1, , bx2] = hole;
  if (bx2 <= ax1 + RECT_EPSILON || bx1 >= ax2 - RECT_EPSILON) return [rect];
  const pieces: number[][] = [];
  if (bx1 - ax1 > RECT_EPSILON) pieces.push([ax1, ay1, bx1, ay2]);
  if (ax2 - bx2 > RECT_EPSILON) pieces.push([bx2, ay1, ax2, ay2]);
  return pieces;
}

/** Every rectangle of `rects` with every rectangle of `holes` cut out of it; a rectangle nothing overlaps comes back by identity. */
export function subtractRects(rects: number[][], holes: number[][]): number[][] {
  let pieces = rects;
  for (const hole of holes) {
    if (!pieces.length) break;
    const next: number[][] = [];
    for (const piece of pieces) next.push(...subtractRect(piece, hole));
    pieces = next;
  }
  return pieces;
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
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface HighlightStyling {
  /** Patch the reader's views; true once they are. Repeat calls are cheap no-ops, so this may be called on every Read Aloud event. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for Tools → Developer → Run JavaScript (`Zotero.ZoteroTTS.diagnostics.highlight()`). */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every patched prototype back. */
  dispose(): void;
}

const SENTENCE_KEY = 'ReadAloudActiveSentence';
const SEGMENT_KEY = 'ReadAloudActiveSegment';
/** Spotlight slots of our own, for the sentence cut in two around the word. Zotero iterates its `_spotlights` map by key, so any key draws. */
const PIECE_KEYS = { head: 'ZoteroTTSSentenceHead', tail: 'ZoteroTTSSentenceTail' } as const;

/** What one of our slots holds: a piece of the sentence, cut at the word when it is drawn. */
interface SentencePiece {
  ztts: 'head' | 'tail';
  sentence: unknown;
  word: unknown;
}
/**
 * Set on a view whose `toDisplayedRange` is patched, so a piece put in its
 * map resolves. A property and not a WeakSet: a view reached from a waived
 * Xray is a different wrapper object than the same view reached from here,
 * and comparing identities across the membrane is meaningless — a boolean
 * reads the same through either.
 */
const PIECES_READY = '_zoteroTTSSentencePieces';

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
  /** Every prototype this module shadows, per reader tab, so shutdown can put them back — see proto-patches.ts for why a closed tab's entry is dropped rather than restored. */
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const patchedViews = new WeakSet<object>();
  /** The sentence position / selector this module put into a view's secondary slot, to tell it from Zotero's flashes. */
  const oursPDF = new WeakMap<object, unknown>();
  const oursDOM = new WeakMap<object, { segment: unknown; selector: unknown }>();
  /** Per helper: Zotero's primary spotlight currently shows the wrong text, so its color is transparent. Recomputed on every state push (a real word moves every word). */
  const hiddenPrimary = new WeakMap<object, boolean>();
  /** Per helper: the two pieces of the sentence, and whether the map they are in has been drawn since. */
  const piecesDOM = new WeakMap<object, { head: SentencePiece; tail: SentencePiece; dirty: boolean }>();
  /** The views whose slots we may have filled, to take them back on dispose: Zotero's own `_getSpotlightColor` throws on a key it does not know. */
  const domViews: Array<{ deref(): any }> = [];

  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const renderAnnotations = (view: any): void => {
    try {
      if (typeof view?._renderAnnotations === 'function') view._renderAnnotations();
    } catch (e) {
      deps.error(e);
    }
  };

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
  const activeWordInfo = (reader: any): { kind: 'real' | 'stand-in' | 'none'; timestamp: any } => {
    let kind: 'real' | 'stand-in' | 'none' = 'none';
    let timestamp: any = null;
    try {
      timestamp = reader?._internalReader?._readAloudManager?.activeTimestamp ?? null;
      if (timestamp) kind = timestamp.start === 0 && timestamp.end === WHOLE_SEGMENT_END_SECONDS ? 'stand-in' : 'real';
    } catch (e) {
      deps.error(e);
    }
    logChange('word-timestamp', `highlight: active word timestamp ${kind}`);
    return { kind, timestamp };
  };
  const activeWordTimestamp = (reader: any): 'real' | 'stand-in' | 'none' => activeWordInfo(reader).kind;
  const demote = (g: Granularity | null, reader: unknown): Granularity | null => (g === 'word' && activeWordTimestamp(reader) !== 'real' ? 'sentence' : g);
  const pdfRawGranularity = (view: any) => granularityOf(view?._effectiveReadAloudPrimaryGranularity, view, view?._readAloudState);
  const domRawGranularity = (helper: any) => granularityOf(helper?._effectivePrimaryGranularity, helper, helper?.state);
  const pdfGranularity = (reader: unknown, view: any) => demote(pdfRawGranularity(view), reader);
  const domGranularity = (reader: unknown, helper: any) => demote(domRawGranularity(helper), reader);


  // ---- PDF ------------------------------------------------------------------

  /** Zotero's `_rectsForThisPage`: the rectangles a position has on the page being drawn. */
  function rectsOnPage(position: any, pageIndex: unknown): number[][] | null {
    if (!position || typeof pageIndex !== 'number') return null;
    if (position.pageIndex === pageIndex) return Array.isArray(position.rects) ? position.rects : null;
    if (position.pageIndex + 1 === pageIndex) return Array.isArray(position.nextPageRects) ? position.nextPageRects : null;
    return null;
  }

  /**
   * The primary's rectangles grown to the height of the sentence line each
   * sits on, so the primary fills the slot the sentence leaves for it
   * exactly — the cut runs the full height of the line, and a word box is
   * often a little shorter than that. `null` when there is no sentence
   * under it, or when it already fits.
   */
  function fittedPrimaryPDF(reader: unknown, page: any, layer: any, primary: any): unknown {
    const rects = rectsOnPage(primary, page?._pageIndex);
    const lines = rectsOnPage(layer._readAloudSentenceHighlightedPosition, page?._pageIndex);
    if (!rects?.length || !lines?.length) return null;
    let changed = false;
    const fitted = rects.map((rect) => {
      const line = rects === lines ? null : lines.find((candidate) => sameLine(candidate, rect));
      if (!line || (line[1] === rect[1] && line[3] === rect[3])) return [rect[0], rect[1], rect[2], rect[3]];
      changed = true;
      return [rect[0], line[1], rect[2], line[3]];
    });
    if (!changed) return null;
    logChange('pdf-primary-fit', 'highlight: the primary is grown to the height of the sentence line it sits on');
    const grown = { pageIndex: page._pageIndex, rects: fitted };
    return deps.cloneIntoReader ? deps.cloneIntoReader(reader, grown) : grown;
  }

  /**
   * The secondary position with the primary's rectangles cut out of it, so
   * the two never tint the same pixels: the sentence leaves the word alone
   * (both are translucent and Zotero's rectangles multiply, so an overlap is
   * neither color), and a primary that covers the whole sentence — the
   * stand-in word position of a voice without word timestamps — leaves
   * nothing of it to draw twice. `null` means draw what Zotero passed;
   * `'nothing'` means do not draw at all.
   */
  function withoutPrimaryPDF(reader: unknown, page: any, layer: any, secondary: any): unknown | 'nothing' | null {
    const rects = rectsOnPage(secondary, page?._pageIndex);
    const holes = rectsOnPage(layer._readAloudHighlightedPosition, page?._pageIndex);
    if (!rects?.length || !holes?.length) return null;
    const pieces = subtractRects(rects, holes);
    if (pieces.length === rects.length && pieces.every((piece, i) => piece === rects[i])) return null;
    logChange('pdf-secondary-trim', `highlight: the secondary highlight gives ${holes.length} rectangle(s) of the primary back, ${pieces.length} left of ${rects.length}`);
    if (!pieces.length) return 'nothing';
    // Copied, not passed on: an untouched line comes back as the reader's own
    // array, and what goes to cloneInto is plain data of ours
    const trimmed = { pageIndex: page._pageIndex, rects: pieces.map((r) => [r[0], r[1], r[2], r[3]]) };
    return deps.cloneIntoReader ? deps.cloneIntoReader(reader, trimmed) : trimmed;
  }

  function keepSentencePDF(reader: unknown, view: any, state: any): void {
    const style = deps.style();
    const on = !!(style.sentenceUnderWord && state?.popupOpen && pdfRawGranularity(view) === 'word');
    // Between segments the manager drops the active segment and the word
    // timestamp, and Zotero skips its own update — the last word's primary
    // stays on the page, now in the sentence color. Taking the sentence from
    // around it would leave that one word alone there.
    if (on && !state.activeSegment) return;
    let want: any = on ? (state.activeSegment?.sourcePosition ?? null) : null;
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
    patches.shadow(pageProto, '_pushHighlightedPosition', (original) =>
      function (this: any, items: unknown, position: unknown, color: unknown) {
        let replaced = color;
        let drawnPosition = position;
        try {
          const page = waive(this);
          const layer = page?._layer;
          const drawn = waive(position);
          if (drawn && layer) {
            if (drawn === layer._readAloudHighlightedPosition) {
              const style = deps.style();
              replaced = primaryHighlightColor(style, pdfGranularity(reader, layer)) ?? color;
              logChange('pdf-primary', `highlight: primary ${String(replaced)} (word ${style.wordColor}/${style.wordAlpha}, sentence ${style.sentenceColor}/${style.sentenceAlpha}, Zotero ${String(color)})`);
              const fitted = fittedPrimaryPDF(reader, page, layer, drawn);
              if (fitted) drawnPosition = fitted;
            } else if (drawn === layer._readAloudSentenceHighlightedPosition) {
              replaced = secondaryHighlightColor(deps.style()) ?? color;
              logChange('pdf-secondary', `highlight: secondary ${String(replaced)} (Zotero ${String(color)})`);
              const trimmed = withoutPrimaryPDF(reader, page, layer, drawn);
              if (trimmed === 'nothing') return undefined;
              if (trimmed) drawnPosition = trimmed;
            }
          }
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, [items, drawnPosition, replaced]);
      },
    );
    patches.shadow(viewProto, 'setReadAloudState', (original) =>
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
  /** The selector's displayed text (normalized), or null when it does not resolve. */
  const displayedText = (view: any, sel: any): string | null => {
    try {
      const range = sel != null ? view.toDisplayedRange(sel) : null;
      return range ? normText(range.toString()) : null;
    } catch (e) {
      deps.error(e);
      return null;
    }
  };
  /** The parent's spec-to-legacy text-step map, from its real child list: spec numbers a text step by elements-before (2k+1), the resolver by its position in the text-node list. */
  function textStepMap(parent: any): Map<number, number> | null {
    try {
      const nodes = parent?.childNodes;
      if (!nodes) return null;
      const map = new Map<number, number>();
      let elements = 0;
      let texts = 0;
      for (let i = 0; i < nodes.length; i++) {
        const kind = nodes[i]?.nodeType;
        if (kind === 1) elements += 1;
        else if (kind === 3) {
          const spec = 2 * elements + 1;
          if (!map.has(spec)) map.set(spec, 2 * texts + 1);
          texts += 1;
        }
      }
      return map;
    } catch (e) {
      deps.error(e);
      return null;
    }
  }
  /**
   * Rewrite the selector's text steps through the resolver's own convention;
   * only a rewrite whose displayed text equals `text` counts. Two shapes: a
   * path ending in a text step (offsets bare, one text node) is retried with
   * the candidate steps; a range whose endpoints sit in different text nodes
   * of the same parent (`,/3:64,/5:130`) is rewritten through the parent's
   * real child structure, discovered with a one-character probe. Candidates
   * are cloned before probing — reader code cannot read a sandbox object.
   */
  function repairSelectorForText(reader: unknown, view: any, selector: any, text: string): any {
    const value = typeof selector?.value === 'string' ? selector.value : '';
    if (!text) return null;
    const mk = (v: string) => {
      const raw = { type: selector.type, conformsTo: selector.conformsTo, value: v };
      return deps.cloneIntoReader ? deps.cloneIntoReader(reader, raw) : raw;
    };
    const single = /^epubcfi\(([^,[\]]*)\/(\d*[13579])(,[^,[\]]*,[^,[\]]*)?\)$/.exec(value);
    if (single) {
      for (const step of [1, 3, 5, 7, 9]) {
        if (String(step) === single[2]) continue;
        const candidate = mk(`epubcfi(${single[1]}/${step}${single[3] ?? ''})`);
        if (displayedText(view, candidate) === text) return candidate;
      }
      return null;
    }
    const cross = /^epubcfi\(([^,[\]]+),\/(\d*[13579])(:\d+),\/(\d*[13579])(:\d+)\)$/.exec(value);
    if (cross) {
      let parent: any = null;
      for (const step of [1, 3, 5, 7, 9]) {
        try {
          const range = view.toDisplayedRange(mk(`epubcfi(${cross[1]}/${step},:0,:1)`));
          parent = range?.startContainer?.parentNode ?? null;
          if (parent) break;
        } catch (e) {
          deps.error(e);
        }
      }
      const map = textStepMap(parent);
      const start = map?.get(Number(cross[2]));
      const end = map?.get(Number(cross[4]));
      if (!start || !end) return null;
      const candidate = mk(`epubcfi(${cross[1]},/${start}${cross[3]},/${end}${cross[5]})`);
      if (displayedText(view, candidate) === text) return candidate;
    }
    return null;
  }
  function resolvableSelector(reader: unknown, view: any, selector: any, segment: any): any {
    if (typeof view?.toDisplayedRange !== 'function') return selector;
    // The resolver can also land on the WRONG text node without failing: a
    // paragraph with an inline element mid-text has two text nodes, and the
    // legacy numbering reads the spec's /3 as the second of them (issue #4).
    // So a resolved range only counts when its text is the sentence.
    const text = normText(segment?.text);
    const shown = displayedText(view, selector);
    if (shown !== null && (!text || shown === text)) return selector;
    const repaired = repairSelectorForText(reader, view, selector, text);
    if (repaired) {
      logChange('sentence-repair', 'highlight: sentence selector repaired');
      return repaired;
    }
    logChange('sentence-repair', 'highlight: sentence selector does not resolve to the sentence and no rewrite does');
    return null;
  }

  /**
   * Zotero's word position resolves to the wrong node the same way the
   * sentence selector does (issues #3/#4). Runs BEFORE the original
   * setState: verify the state's word position against the text it should
   * show — the active timestamp's slice of the sentence for a real word,
   * the whole sentence for the stand-in — and swap in a verified rewrite so
   * Zotero draws the primary at the right place. When no rewrite shows the
   * expected text, the primary's color goes transparent instead (the
   * plugin cannot reposition what it cannot repair). Re-evaluated on every
   * push, since a real word moves with every word event.
   */
  function repairWordPosition(reader: unknown, helper: any, state: any): void {
    const view = helper?._view;
    if (!view || typeof view.toDisplayedRange !== 'function') return;
    if (!state?.popupOpen) {
      hiddenPrimary.set(helper, false);
      return;
    }
    const segment = state.activeSegment;
    const selector = state.activeWordSourcePosition;
    if (!segment || !selector || domRawGranularity(helper) !== 'word') return;
    const { kind, timestamp } = activeWordInfo(reader);
    if (kind === 'none') return;
    const wholeText = String(segment.text ?? '');
    const expected = normText(kind === 'real' && timestamp ? wholeText.slice(timestamp.charStart, timestamp.charEnd) : wholeText);
    if (!expected) return;
    if (displayedText(view, selector) === expected) {
      hiddenPrimary.set(helper, false);
      return;
    }
    const repaired = repairSelectorForText(reader, view, selector, expected);
    if (repaired) {
      logChange('word-repair', 'highlight: word position repaired before drawing');
      state.activeWordSourcePosition = repaired;
      hiddenPrimary.set(helper, false);
      return;
    }
    logChange('word-repair', 'highlight: word position shows the wrong text and no rewrite fixes it; painting the primary transparent');
    hiddenPrimary.set(helper, true);
  }

  /** The segment's selector, verified (and repaired) once per segment. */
  function sentenceSelector(reader: unknown, helper: any, state: any): unknown {
    const cached = oursDOM.get(helper);
    if (cached && cached.segment === state.activeSegment) return cached.selector;
    const resolved = helper._resolveSegmentSelector(state);
    if (!resolved) return null;
    const selector = resolvableSelector(reader, helper._view, resolved, state.activeSegment);
    if (!selector) return null;
    oursDOM.set(helper, { segment: state.activeSegment, selector });
    return selector;
  }

  /**
   * The two pieces the sentence is cut into around the word, put in
   * spotlight slots of our own. Runs BEFORE the original setState, so
   * Zotero's own render of the moved word draws them; a word update only
   * rewrites what the slots hold, leaving the map — and the render count —
   * alone. What the slots hold is not a selector but a piece of one, turned
   * into a range by the `toDisplayedRange` below: no CFI of ours is ever
   * generated, and the pieces are cut from the very ranges Zotero draws.
   */
  function preparePiecesDOM(reader: unknown, helper: any, state: any): void {
    const view = helper?._view;
    const spotlights: Map<unknown, unknown> | undefined = view?._spotlights;
    if (!spotlights || !view[PIECES_READY]) return;
    const style = deps.style();
    const on = !!(style.sentenceUnderWord && state?.popupOpen && domRawGranularity(helper) === 'word');
    // The gap between segments: Zotero keeps the last word's spotlight on
    // screen, so the sentence stays around it (see keepSentencePDF)
    if (on && !state.activeSegment) return;
    const selector = on && state.activeSegment ? sentenceSelector(reader, helper, state) : null;
    const pieces = piecesDOM.get(helper);
    const shown = spotlights.has(PIECE_KEYS.head);
    if (!selector) {
      if (shown) {
        spotlights.delete(PIECE_KEYS.head);
        spotlights.delete(PIECE_KEYS.tail);
        if (pieces) pieces.dirty = true;
        logChange('dom-pieces', 'highlight: the sentence goes back to one piece');
      }
      return;
    }
    const kept = pieces ?? { head: { ztts: 'head' as const, sentence: null, word: null }, tail: { ztts: 'tail' as const, sentence: null, word: null }, dirty: false };
    // No word to cut out — between two words, or one Zotero is painting
    // transparent because it lands on the wrong text — draws the sentence
    // whole, out of the head, rather than putting it in another slot: the
    // two are drawn differently (Zotero grows a rectangle of its own to the
    // line height) and swapping them would make the highlight jump.
    const word = hiddenPrimary.get(helper) ? null : (state.activeWordSourcePosition ?? null);
    for (const piece of [kept.head, kept.tail]) {
      piece.sentence = selector;
      piece.word = word;
    }
    piecesDOM.set(helper, kept);
    if (!shown) {
      spotlights.set(PIECE_KEYS.head, kept.head);
      spotlights.set(PIECE_KEYS.tail, kept.tail);
      kept.dirty = true;
      logChange('dom-pieces', 'highlight: the sentence is drawn around the word');
    }
  }

  /** One render when the pieces appeared or went, none while they only follow the word. */
  function flushPiecesDOM(helper: any): void {
    const pieces = piecesDOM.get(helper);
    if (!pieces?.dirty) return;
    pieces.dirty = false;
    renderAnnotations(helper?._view);
  }

  /**
   * One piece of the sentence, as a range: resolve the sentence and the word
   * through Zotero's own resolver and cut the one at the other. Anything
   * that leaves the word unusable — it does not resolve, or it resolves
   * outside the sentence — falls back to the whole sentence in the head and
   * nothing in the tail, which is what Zotero drew before this existed.
   */
  function pieceRange(view: any, original: AnyFn, piece: SentencePiece): unknown {
    const resolve = (selector: unknown) => {
      if (selector == null) return null;
      try {
        return Reflect.apply(original, view, [selector]) ?? null;
      } catch (e) {
        deps.error(e);
        return null;
      }
    };
    const sentence: any = resolve(piece.sentence);
    const whole = piece.ztts === 'head' ? sentence : null;
    if (!sentence || typeof sentence.cloneRange !== 'function' || typeof sentence.comparePoint !== 'function') return whole;
    const word: any = resolve(piece.word);
    if (!word) return whole;
    const inside = (node: unknown, offset: unknown) => {
      try {
        return sentence.comparePoint(node, offset) === 0;
      } catch {
        return false;
      }
    };
    if (!inside(word.startContainer, word.startOffset) || !inside(word.endContainer, word.endOffset)) return whole;
    try {
      const cut = sentence.cloneRange();
      if (piece.ztts === 'head') cut.setEnd(word.startContainer, word.startOffset);
      else cut.setStart(word.endContainer, word.endOffset);
      return cut.collapsed ? null : cut;
    } catch (e) {
      deps.error(e);
      return whole;
    }
  }

  function keepSentenceDOM(reader: unknown, helper: any, state: any): void {
    const view = helper?._view;
    const spotlights: Map<unknown, unknown> | undefined = view?._spotlights;
    if (!spotlights || typeof view.setSpotlight !== 'function') return;
    const style = deps.style();
    const cached = oursDOM.get(helper);
    if (spotlights.has(PIECE_KEYS.head)) {
      // The pieces already show the sentence around the word. Zotero's own
      // flash of the same sentence would draw it a second time, over the
      // word as well; its timer only removes the selector it set, so
      // dropping it is safe. A flash of another unit is left to expire.
      const flash = spotlights.get(SENTENCE_KEY);
      if (flash && (flash === cached?.selector || state?.lastSkipGranularity === 'sentence')) view.setSpotlight(SENTENCE_KEY, null);
      return;
    }
    const on = !!(style.sentenceUnderWord && state?.popupOpen && domRawGranularity(helper) === 'word');
    // The gap between segments: leave what is drawn (see keepSentencePDF)
    if (on && !state.activeSegment) return;
    const want = on && !!state.activeSegment;
    if (!want) {
      if (cached && spotlights.get(SENTENCE_KEY) === cached.selector) view.setSpotlight(SENTENCE_KEY, null);
      oursDOM.delete(helper);
      return;
    }
    const selector = sentenceSelector(reader, helper, state);
    if (!selector) return;
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
    patches.shadow(viewProto, '_getSpotlightColor', (original) =>
      function (this: any, key: unknown) {
        try {
          if (key === SEGMENT_KEY) {
            const helper = waive(this)?._readAloud;
            if (hiddenPrimary.get(helper)) return '#00000000';
            const color = primaryHighlightColor(deps.style(), domGranularity(reader, helper));
            if (color) return color;
          } else if (key === SENTENCE_KEY || key === PIECE_KEYS.head || key === PIECE_KEYS.tail) {
            const color = secondaryHighlightColor(deps.style());
            if (color) return color;
            // Zotero knows no key of ours to fall back to; its sentence color is the one we stand in for
            if (key !== SENTENCE_KEY) return Reflect.apply(original, this, [SENTENCE_KEY]);
          }
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, [key]);
      },
    );
    const rangeProto = ownerOf(view, 'toDisplayedRange');
    if (rangeProto) {
      patches.shadow(rangeProto, 'toDisplayedRange', (original) =>
        function (this: any, selector: unknown) {
          let piece: SentencePiece | null = null;
          try {
            const held = waive(selector) as SentencePiece | null;
            if (held && (held.ztts === 'head' || held.ztts === 'tail')) piece = held;
          } catch (e) {
            deps.error(e);
          }
          if (!piece) return Reflect.apply(original, this, [selector]);
          try {
            return pieceRange(this, original, piece);
          } catch (e) {
            deps.error(e);
            return null;
          }
        },
      );
      view[PIECES_READY] = true;
      domViews.push(typeof WeakRef === 'function' ? new WeakRef(view) : { deref: () => view });
    }
    patches.shadow(helperProto, 'setState', (original) =>
      function (this: any, ...args: unknown[]) {
        try {
          repairWordPosition(reader, waive(this), waive(args[0]));
          preparePiecesDOM(reader, waive(this), waive(args[0]));
        } catch (e) {
          deps.error(e);
        }
        const result = Reflect.apply(original, this, args);
        try {
          keepSentenceDOM(reader, waive(this), waive(args[0]));
          flushPiecesDOM(waive(this));
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
    /** PDF: what the sentence gives back to the primary on the primary's page. */
    const trim = (view: any) => {
      try {
        const pageIndex = view._readAloudHighlightedPosition?.pageIndex;
        const rects = rectsOnPage(view._readAloudSentenceHighlightedPosition, pageIndex);
        const holes = rectsOnPage(view._readAloudHighlightedPosition, pageIndex);
        if (!rects?.length || !holes?.length) return null;
        return { page: pageIndex, rects: rects.length, holes: holes.length, pieces: subtractRects(rects, holes).length };
      } catch (e) {
        return String(e);
      }
    };
    /** EPUB / snapshot: the text a slot of ours draws, which is the proof it resolves. */
    const pieceText = (view: any, key: string) => {
      try {
        const selector = view._spotlights?.get(key);
        if (!selector) return null;
        const range = view.toDisplayedRange(selector);
        if (range === null || range === undefined) return null;
        const text = String(range);
        return text.length > 40 ? `${text.slice(0, 40)}…` : text;
      } catch (e) {
        return String(e);
      }
    };
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
          secondaryTrim: pdf ? trim(view) : undefined,
          sentencePieces: pdf
            ? undefined
            : view._spotlights?.has(PIECE_KEYS.head)
              ? { head: pieceText(view, PIECE_KEYS.head), tail: pieceText(view, PIECE_KEYS.tail) }
              : false,
        };
      } catch (e) {
        return { error: String(e) };
      }
    };
    return { views: views.map(describe), style: deps.style() };
  }

  function dispose(): void {
    // Before the originals are back: Zotero's own _getSpotlightColor throws
    // on a key it does not know, and ours would still be in the map
    for (const ref of domViews) {
      try {
        const view = ref.deref();
        const spotlights: Map<unknown, unknown> | undefined = view?._spotlights;
        if (!spotlights) continue;
        delete view[PIECES_READY];
        const head = spotlights.delete(PIECE_KEYS.head);
        const tail = spotlights.delete(PIECE_KEYS.tail);
        if (head || tail) renderAnnotations(view);
      } catch (e) {
        deps.error(e);
      }
    }
    domViews.length = 0;
    patches.restoreAll();
  }

  return { attach, inspect, patchCounts: patches.counts, dispose };
}
