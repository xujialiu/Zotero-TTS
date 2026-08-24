import { describe, expect, it, vi } from 'vitest';
import {
  createHighlightStyling,
  highlightColor,
  primaryHighlightColor,
  secondaryHighlightColor,
  type HighlightStyle,
  type HighlightStylingDeps,
} from '../../src/read-aloud/highlight-style';
import { WHOLE_SEGMENT_END_SECONDS } from '../../src/read-aloud/remote-interface';

const STYLE: HighlightStyle = { wordColor: '#ff0000', wordAlpha: 50, sentenceColor: '#00ff00', sentenceAlpha: 20, sentenceUnderWord: true };
const WORD = '#ff000080';
const SENTENCE = '#00ff0033';
const ZOTERO_SEGMENT = '#4072e573';
const ZOTERO_SENTENCE = '#4072e54d';

describe('highlightColor', () => {
  it("appends the opacity as Zotero's constants have it", () => {
    expect(highlightColor('#4072e5', 45)).toBe(ZOTERO_SEGMENT);
    expect(highlightColor('#4072e5', 30)).toBe(ZOTERO_SENTENCE);
    expect(highlightColor('#FF0000', 50)).toBe(WORD);
    expect(highlightColor('#0f0', 20)).toBe(SENTENCE);
  });

  it('clamps the opacity and refuses anything that is not a color', () => {
    expect(highlightColor('#000000', 250)).toBe('#000000ff');
    expect(highlightColor('#000000', -5)).toBe('#00000000');
    expect(highlightColor('#000000', NaN)).toBe('#000000ff');
    expect(highlightColor('red', 50)).toBeNull();
    expect(highlightColor('#12345', 50)).toBeNull();
    expect(highlightColor('', 50)).toBeNull();
  });

  it('picks the word color for a word and the sentence color for anything coarser', () => {
    expect(primaryHighlightColor(STYLE, 'word')).toBe(WORD);
    expect(primaryHighlightColor(STYLE, 'sentence')).toBe(SENTENCE);
    expect(primaryHighlightColor(STYLE, 'paragraph')).toBe(SENTENCE);
    expect(primaryHighlightColor(STYLE, null)).toBe(SENTENCE);
    expect(secondaryHighlightColor(STYLE)).toBe(SENTENCE);
  });
});

// ---- fakes of the two kinds of view, as the plugin sees them ---------------

type Position = { pageIndex: number; tag: string };
const segment = (tag: string) => ({ sourcePosition: { pageIndex: 0, tag } as Position, paragraphSourcePosition: { pageIndex: 0, tag: `${tag}-paragraph` } });

function fakePDF(granularity: string) {
  const pushed: Array<{ position: unknown; color: unknown }> = [];
  class Page {
    constructor(public _layer: unknown) {}
    _pushHighlightedPosition(_items: unknown, position: unknown, color: unknown) {
      pushed.push({ position, color });
    }
  }
  class PDFView {
    _pages: Page[] = [];
    _readAloudState: any = null;
    _readAloudHighlightedPosition: unknown = null;
    _readAloudSentenceHighlightedPosition: unknown = null;
    _readAloudSentenceTimeout: unknown = null;
    _render = vi.fn();
    _effectiveReadAloudPrimaryGranularity(_state: unknown) {
      return granularity;
    }
    // Zotero's: the primary slot follows the granularity; on a segment
    // change the secondary slot gets the skip flash (handed in as
    // `state.flash` here) or null, with a two-second timer
    async setReadAloudState(state: any) {
      const previous = this._readAloudState;
      this._readAloudState = state;
      if (!state.popupOpen) {
        this._readAloudHighlightedPosition = null;
        this._readAloudSentenceHighlightedPosition = null;
        this._render();
        return;
      }
      this._readAloudHighlightedPosition = granularity === 'word' ? state.activeWordSourcePosition : state.activeSegment.sourcePosition;
      if (state.activeSegment !== previous?.activeSegment) {
        this._readAloudSentenceHighlightedPosition = state.flash ?? null;
        this._readAloudSentenceTimeout = state.flash ? 42 : null;
      }
      this._render();
    }
  }
  const view = new PDFView();
  view._pages.push(new Page(view), new Page(view));
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: null as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
  return { view, page: view._pages[0], pushed, reader, Page, PDFView };
}

function fakeDOM(granularity: string) {
  class DOMView {
    _spotlights = new Map<string, unknown>();
    _readAloud: any;
    setSpotlight = vi.fn((key: string, selector: unknown, _timeout: number | null = 2000) => {
      if (selector) this._spotlights.set(key, selector);
      else this._spotlights.delete(key);
    });
    _getSpotlightColor(key: string) {
      return key === 'Navigation' ? 'selection' : key === 'ReadAloudActiveSegment' ? ZOTERO_SEGMENT : ZOTERO_SENTENCE;
    }
  }
  class ReadAloud {
    state: any = null;
    constructor(public _view: DOMView) {}
    _effectivePrimaryGranularity(_state: unknown) {
      return granularity;
    }
    _resolveSegmentSelector = vi.fn((state: any) => ({ selectorFor: state.activeSegment }));
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (!state.popupOpen) {
        this._view.setSpotlight('ReadAloudActiveSegment', null);
        this._view.setSpotlight('ReadAloudActiveSentence', null);
        return null;
      }
      this._view.setSpotlight('ReadAloudActiveSegment', { primary: true }, null);
      if (state.activeSegment !== previous?.activeSegment) {
        const flash = state.flash ?? null;
        this._view.setSpotlight('ReadAloudActiveSentence', flash, flash ? 2000 : null);
      }
      return { lang: 'en' };
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: null as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
  return { view, helper: view._readAloud as ReadAloud, reader, DOMView, ReadAloud };
}

function styling(over: Partial<HighlightStylingDeps> = {}, style: HighlightStyle = STYLE) {
  const current = { ...style };
  const deps = {
    style: () => current,
    clearTimeout: vi.fn((reader: any, id: unknown) => reader._iframeWindow.clearTimeout(id)),
    error: vi.fn(),
    ...over,
  } satisfies HighlightStylingDeps;
  return { styling: createHighlightStyling(deps), current, deps };
}

const A = segment('a');
const B = segment('b');
const word = (seg: typeof A, n: number) => ({ pageIndex: 0, tag: `${seg.sourcePosition.tag}-w${n}` });
const pdfState = (seg: typeof A, n = 1, extra: Record<string, unknown> = {}) => ({
  popupOpen: true,
  activeSegment: seg,
  activeWordSourcePosition: word(seg, n),
  ...extra,
});

// ---- PDF --------------------------------------------------------------------

describe('PDF colors', () => {
  it("recolours Zotero's primary highlight by the unit it shows, and the secondary slot with the sentence color", () => {
    for (const [granularity, expected] of [
      ['word', WORD],
      ['sentence', SENTENCE],
      ['paragraph', SENTENCE],
    ] as const) {
      const pdf = fakePDF(granularity);
      const { styling: s } = styling();
      expect(s.attach(pdf.reader)).toBe(true);
      const primary = { pageIndex: 0, tag: 'primary' };
      const secondary = { pageIndex: 0, tag: 'secondary' };
      const other = { pageIndex: 0, tag: 'selection' };
      pdf.view._readAloudHighlightedPosition = primary;
      pdf.view._readAloudSentenceHighlightedPosition = secondary;
      pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
      pdf.page._pushHighlightedPosition([], secondary, ZOTERO_SENTENCE);
      pdf.page._pushHighlightedPosition([], other, '#ffff00');
      expect(pdf.pushed.map((p) => p.color), granularity).toEqual([expected, SENTENCE, '#ffff00']);
      expect(pdf.pushed.map((p) => p.position)).toEqual([primary, secondary, other]);
    }
  });

  it("keeps Zotero's color when the configured one is not a color", () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling({}, { ...STYLE, wordColor: 'bright red' });
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(ZOTERO_SEGMENT);
  });

  it('reads the style on every use, so the pane applies on the next highlight', () => {
    const pdf = fakePDF('word');
    const { styling: s, current } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    current.wordColor = '#0000ff';
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, '#0000ff80']);
  });
});

describe('PDF sentence under the word', () => {
  it('keeps the current sentence in the secondary slot through the word updates of a segment', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    expect(pdf.view._render).toHaveBeenCalledTimes(2);
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    // One render per update is Zotero's own; nothing to redraw for us
    expect(pdf.view._render).toHaveBeenCalledTimes(3);
    await pdf.view.setReadAloudState(pdfState(B, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(B.sourcePosition);
  });

  it("cancels the timer of Zotero's own flash of the same sentence, so it stays", async () => {
    const pdf = fakePDF('word');
    const { styling: s, deps } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1, { flash: A.sourcePosition, lastSkipGranularity: 'sentence' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    expect(deps.clearTimeout).toHaveBeenCalledWith(pdf.reader, 42);
    expect(pdf.reader._iframeWindow.clearTimeout).toHaveBeenCalledWith(42);
  });

  it('leaves a paragraph flash alone until it expires, then restores the sentence', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const paragraph = A.paragraphSourcePosition;
    await pdf.view.setReadAloudState(pdfState(A, 1, { flash: paragraph, lastSkipGranularity: 'paragraph' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(paragraph);
    // Zotero's timer blanks the slot
    pdf.view._readAloudSentenceHighlightedPosition = null;
    await pdf.view.setReadAloudState(pdfState(A, 2, { lastSkipGranularity: 'paragraph' }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('does nothing in sentence mode, with the popup closed, or for a sentence without a page', async () => {
    const sentenceMode = fakePDF('sentence');
    styling().styling.attach(sentenceMode.reader);
    await sentenceMode.view.setReadAloudState(pdfState(A));
    expect(sentenceMode.view._readAloudSentenceHighlightedPosition).toBeNull();

    const closed = fakePDF('word');
    styling().styling.attach(closed.reader);
    await closed.view.setReadAloudState({ ...pdfState(A), popupOpen: false });
    expect(closed.view._readAloudSentenceHighlightedPosition).toBeNull();

    const pageless = fakePDF('word');
    styling().styling.attach(pageless.reader);
    await pageless.view.setReadAloudState(pdfState({ ...A, sourcePosition: { tag: 'no-page' } as any }));
    expect(pageless.view._readAloudSentenceHighlightedPosition).toBeNull();
  });

  it('takes its highlight back when the switch is turned off, and nothing else', async () => {
    const pdf = fakePDF('word');
    const { styling: s, current } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    current.sentenceUnderWord = false;
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();

    // A flash Zotero set itself is not ours to remove
    await pdf.view.setReadAloudState(pdfState(B, 1, { flash: B.paragraphSourcePosition }));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(B.paragraphSourcePosition);
  });

  it('returns what Zotero returned and logs a failure of its own part without breaking the update', async () => {
    const pdf = fakePDF('word');
    const error = vi.fn();
    const { styling: s } = styling({
      error,
      style: () => {
        throw new Error('prefs gone');
      },
    });
    s.attach(pdf.reader);
    await expect(pdf.view.setReadAloudState(pdfState(A))).resolves.toBeUndefined();
    expect(pdf.view._readAloudHighlightedPosition).toEqual(word(A, 1));
    expect(error).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ---- EPUB / snapshot ----------------------------------------------------------

describe('DOM view colors', () => {
  it('recolours the two Read Aloud spotlights and nothing else', () => {
    const dom = fakeDOM('word');
    const { styling: s } = styling();
    expect(s.attach(dom.reader)).toBe(true);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSentence')).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor('Navigation')).toBe('selection');

    const sentenceMode = fakeDOM('sentence');
    styling().styling.attach(sentenceMode.reader);
    expect(sentenceMode.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });

  it("keeps Zotero's color when the configured one is not a color", () => {
    const dom = fakeDOM('word');
    styling({}, { ...STYLE, sentenceColor: '' }).styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSentence')).toBe(ZOTERO_SENTENCE);
  });
});

describe('DOM view sentence under the word', () => {
  const domState = (seg: typeof A, extra: Record<string, unknown> = {}) => ({ popupOpen: true, activeSegment: seg, ...extra });

  it('keeps the sentence spotlight, resolving the selector once per segment', () => {
    const dom = fakeDOM('word');
    const { styling: s } = styling();
    s.attach(dom.reader);
    expect(dom.helper.setState(domState(A))).toEqual({ lang: 'en' });
    const selector = dom.view._spotlights.get('ReadAloudActiveSentence');
    expect(selector).toEqual({ selectorFor: A });
    expect(dom.view.setSpotlight).toHaveBeenCalledWith('ReadAloudActiveSentence', selector, null);
    dom.helper.setState(domState(A));
    dom.helper.setState(domState(A));
    expect(dom.helper._resolveSegmentSelector).toHaveBeenCalledTimes(1);
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBe(selector);
    dom.helper.setState(domState(B));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: B });
    expect(dom.helper._resolveSegmentSelector).toHaveBeenCalledTimes(2);
  });

  it("replaces Zotero's flash of the same sentence at once, but lets a paragraph flash expire first", () => {
    const dom = fakeDOM('word');
    styling().styling.attach(dom.reader);
    const sentenceFlash = { flashOf: 'a' };
    dom.helper.setState(domState(A, { flash: sentenceFlash, lastSkipGranularity: 'sentence' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });

    const paragraphFlash = { flashOf: 'b-paragraph' };
    dom.helper.setState(domState(B, { flash: paragraphFlash, lastSkipGranularity: 'paragraph' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBe(paragraphFlash);
    // Zotero's timer removes it
    dom.view._spotlights.delete('ReadAloudActiveSentence');
    dom.helper.setState(domState(B, { lastSkipGranularity: 'paragraph' }));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: B });
  });

  it('does nothing in sentence mode or with the popup closed, and takes its spotlight back when switched off', () => {
    const sentenceMode = fakeDOM('sentence');
    styling().styling.attach(sentenceMode.reader);
    sentenceMode.helper.setState(domState(A));
    expect(sentenceMode.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);

    const dom = fakeDOM('word');
    const { styling: s, current } = styling();
    s.attach(dom.reader);
    dom.helper.setState(domState(A));
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(true);
    current.sentenceUnderWord = false;
    dom.helper.setState(domState(A));
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    current.sentenceUnderWord = true;
    dom.helper.setState({ ...domState(A), popupOpen: false });
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
  });
});

// ---- what the reader hands an exported function ---------------------------------

/**
 * The reader calls the patched methods with `this` and arguments behind Xray
 * wrappers: a plain object's own properties are visible, its prototype's
 * methods are not, and assignments land on the wrapper. Modelled with a
 * proxy; `waiveXrays` maps it back to the real object.
 */
function xrays() {
  const targets = new WeakMap<object, object>();
  const wrappers = new WeakMap<object, object>();
  const wrap = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (targets.has(obj)) return obj;
    const existing = wrappers.get(obj);
    if (existing) return existing;
    const proxy: object = new Proxy(obj, {
      get: (t, k) => (Object.prototype.hasOwnProperty.call(t, k) ? wrap((t as any)[k]) : undefined),
      set: () => true,
    });
    wrappers.set(obj, proxy);
    targets.set(proxy, obj);
    return proxy;
  };
  const waiveXrays = (value: unknown) => (value && typeof value === 'object' ? (targets.get(value) ?? value) : value);
  return { wrap, waiveXrays };
}

describe('behind Xray wrappers', () => {
  it('the bug: without waiving, the primary highlight falls back to the sentence color and the sentence is never kept', async () => {
    const pdf = fakePDF('word');
    const { wrap } = xrays();
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const state = pdfState(A);
    await pdf.view.setReadAloudState.call(wrap(pdf.view), wrap(state));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(primary), ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('waives them: the word color is found and the sentence is kept, on the real view', async () => {
    const pdf = fakePDF('word');
    const { wrap, waiveXrays } = xrays();
    const { styling: s } = styling({ waiveXrays });
    s.attach(pdf.reader);
    const state = pdfState(A);
    await pdf.view.setReadAloudState.call(wrap(pdf.view), wrap(state));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(primary), ZOTERO_SEGMENT);
    pdf.page._pushHighlightedPosition.call(wrap(pdf.page), [], wrap(A.sourcePosition), ZOTERO_SENTENCE);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, SENTENCE]);
    // The original still receives what the reader passed
    expect(pdf.pushed[0].position).toBe(wrap(primary));
    expect((s.inspect(pdf.reader).views as any[])[0]).toMatchObject({ granularity: 'word', sentenceSlot: 'ours' });
  });

  it('waives them in the EPUB and snapshot views too', () => {
    const dom = fakeDOM('word');
    const { wrap, waiveXrays } = xrays();
    styling({ waiveXrays }).styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor.call(wrap(dom.view), 'ReadAloudActiveSegment')).toBe(WORD);
    const state = { popupOpen: true, activeSegment: A };
    dom.helper.setState.call(wrap(dom.helper), wrap(state));
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- attaching ------------------------------------------------------------------

describe('attach / dispose', () => {
  it("exports every patched function into the reader's compartment, patches once, and restores on dispose", async () => {
    const pdf = fakePDF('word');
    const exportFunction = vi.fn((fn: (...args: any[]) => any, _target: object) => fn);
    const { styling: s } = styling({ exportFunction });
    const originalPush = pdf.Page.prototype._pushHighlightedPosition;
    const originalSet = pdf.PDFView.prototype.setReadAloudState;
    expect(s.attach(pdf.reader)).toBe(true);
    expect(s.attach(pdf.reader)).toBe(true);
    expect(exportFunction).toHaveBeenCalledTimes(2);
    expect(exportFunction.mock.calls.map((c) => c[1])).toEqual([pdf.Page.prototype, pdf.PDFView.prototype]);
    expect(pdf.Page.prototype._pushHighlightedPosition).not.toBe(originalPush);

    s.dispose();
    expect(pdf.Page.prototype._pushHighlightedPosition).toBe(originalPush);
    expect(pdf.PDFView.prototype.setReadAloudState).toBe(originalSet);
    await pdf.view.setReadAloudState(pdfState(A));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();
  });

  it('covers a split view through the shared prototype, and the SDT views', () => {
    const dom = fakeDOM('word');
    const second = new dom.DOMView();
    second._readAloud = new dom.ReadAloud(second);
    (dom.reader._internalReader as any)._secondaryView = second;
    styling().styling.attach(dom.reader);
    expect(second._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('waits for the PDF pages to exist, and tolerates a reader without views', () => {
    const pdf = fakePDF('word');
    pdf.view._pages.length = 0;
    const { styling: s } = styling();
    expect(s.attach(pdf.reader)).toBe(false);
    pdf.view._pages.push(new pdf.Page(pdf.view));
    expect(s.attach(pdf.reader)).toBe(true);
    expect(s.attach({ _internalReader: {} })).toBe(false);
    expect(s.attach(null)).toBe(false);
  });

  it('describes what it sees in a reader, as plain data', async () => {
    const pdf = fakePDF('word');
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState(pdfState(A));
    const report = s.inspect(pdf.reader);
    expect(report.style).toEqual(STYLE);
    expect(report.views).toEqual([
      {
        kind: 'pdf',
        patched: true,
        pages: 2,
        method: 'function',
        granularity: 'word',
        wholeSegmentWord: false,
        state: { popupOpen: true, highlightGranularity: null, segmentGranularity: null, segment: true, segmentPage: 0, wordPosition: true },
        sentenceSlot: 'ours',
      },
    ]);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(s.inspect(null)).toEqual({ views: [], style: STYLE });
  });

  it('leaves a view it does not recognize alone', () => {
    const reader = { _internalReader: { _primaryView: { something: 'else' } } };
    const { styling: s, deps } = styling();
    expect(s.attach(reader)).toBe(false);
    expect(deps.error).not.toHaveBeenCalled();
  });
});

// ---- the whole-segment stand-in (a voice without word timestamps) ----------

describe('word mode with the whole-segment stand-in timestamp', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const real = { start: 0.1, end: 0.4, charStart: 0, charEnd: 5 };

  it('PDF: the primary is the sentence, so it takes the sentence color and the sentence slot stays empty', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBeNull();
  });

  it('PDF: a real word timestamp keeps the word color and the kept sentence', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = real;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(WORD);
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('DOM: the primary spotlight takes the sentence color and the sentence spotlight is not doubled', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBeUndefined();
  });

  it('DOM: a real word timestamp keeps the word color', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = real;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });
});
