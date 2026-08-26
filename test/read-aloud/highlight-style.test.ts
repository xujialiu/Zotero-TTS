import { describe, expect, it, vi } from 'vitest';
import {
  createHighlightStyling,
  highlightColor,
  primaryHighlightColor,
  secondaryHighlightColor,
  subtractRects,
  type HighlightStyle,
  type HighlightStylingDeps,
} from '../../src/read-aloud/highlight-style';
import { WHOLE_SEGMENT_END_SECONDS } from '../../src/read-aloud/remote-interface';

const STYLE: HighlightStyle = { wordColor: '#ff0000', wordAlpha: 50, sentenceColor: '#00ff00', sentenceAlpha: 20, sentenceUnderWord: true };
const WORD = '#ff000080';
const SENTENCE = '#00ff0033';
const ZOTERO_SEGMENT = '#4072e573';
// What the fake manager reports while a word is being read; null models the
// gap between segments (ActiveSegmentChange(null) resets the manager).
const REAL_TIMESTAMP = { start: 0.1, end: 0.4, charStart: 0, charEnd: 5 };
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

describe('subtractRects', () => {
  // A line of a sentence, in Zotero's [x1, y1, x2, y2]
  const LINE = [10, 100, 200, 112];

  it('leaves the rectangles alone, by identity, when nothing overlaps them', () => {
    expect(subtractRects([LINE], [])).toEqual([LINE]);
    expect(subtractRects([LINE], [[300, 100, 320, 112]])[0]).toBe(LINE);
    expect(subtractRects([LINE], [[10, 200, 200, 212]])[0]).toBe(LINE);
    // Touching edges are not an overlap
    expect(subtractRects([LINE], [[200, 100, 240, 112]])[0]).toBe(LINE);
  });

  it('cuts the full height of the line, so its outline does not change as the word moves', () => {
    // A word box a little shorter than its line still takes the whole slot:
    // a strip left above or below it would change thickness with every word
    expect(subtractRects([LINE], [[80, 100, 120, 109]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
    expect(subtractRects([LINE], [[80, 101, 120, 113]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
  });

  it('leaves one piece for a word at either end of the line', () => {
    expect(subtractRects([LINE], [[10, 100, 60, 112]])).toEqual([[60, 100, 200, 112]]);
    expect(subtractRects([LINE], [[150, 100, 200, 112]])).toEqual([[10, 100, 150, 112]]);
  });

  it('leaves nothing when the hole spans the line, as a stand-in word does', () => {
    expect(subtractRects([LINE], [LINE])).toEqual([]);
    expect(subtractRects([LINE], [[0, 90, 300, 120]])).toEqual([]);
  });

  it("does not cut a line the hole only passes over, by Zotero's own same-line test", () => {
    // 60% of the shorter height has to overlap, as mergeLineRects has it
    expect(subtractRects([LINE], [[80, 105, 120, 130]])[0]).toBe(LINE);
    expect(subtractRects([LINE], [[80, 103, 120, 120]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
    ]);
  });

  it('cuts every hole out of every rectangle, and keeps the untouched lines', () => {
    const second = [10, 80, 200, 92];
    expect(subtractRects([LINE, second], [[80, 100, 120, 112], [30, 80, 50, 92]])).toEqual([
      [10, 100, 80, 112],
      [120, 100, 200, 112],
      [10, 80, 30, 92],
      [50, 80, 200, 92],
    ]);
  });

  it('drops slivers thinner than a tenth of a point, and anything that is not a rectangle', () => {
    expect(subtractRects([LINE], [[10.05, 100, 199.95, 112]])).toEqual([]);
    expect(subtractRects([LINE], [[80, 100, 120] as number[]])[0]).toBe(LINE);
    expect(subtractRects([[10, 100, 200] as number[]], [[80, 100, 120, 109]])).toEqual([[10, 100, 200]]);
  });
});

// ---- fakes of the two kinds of view, as the plugin sees them ---------------

type Position = { pageIndex: number; tag: string };
const segment = (tag: string) => ({ sourcePosition: { pageIndex: 0, tag } as Position, paragraphSourcePosition: { pageIndex: 0, tag: `${tag}-paragraph` } });

function fakePDF(granularity: string) {
  const pushed: Array<{ position: unknown; color: unknown }> = [];
  class Page {
    constructor(
      public _layer: unknown,
      public _pageIndex = 0,
    ) {}
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
      // Zotero skips the whole update, positions and all, without an active
      // position: the previous segment's highlights stay on screen
      if (state.activeSegment?.sourcePosition?.pageIndex === undefined) return;
      this._readAloudHighlightedPosition = granularity === 'word' ? state.activeWordSourcePosition : state.activeSegment.sourcePosition;
      if (state.activeSegment !== previous?.activeSegment) {
        this._readAloudSentenceHighlightedPosition = state.flash ?? null;
        this._readAloudSentenceTimeout = state.flash ? 42 : null;
      }
      this._render();
    }
  }
  const view = new PDFView();
  view._pages.push(new Page(view, 0), new Page(view, 1));
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: REAL_TIMESTAMP as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
  return { view, page: view._pages[0], nextPage: view._pages[1], pushed, reader, Page, PDFView };
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
      this._view.setSpotlight(
        'ReadAloudActiveSegment',
        state.primarySelector !== undefined ? state.primarySelector : state.activeWordSourcePosition !== undefined ? state.activeWordSourcePosition : { primary: true },
        null,
      );
      if (state.activeSegment !== previous?.activeSegment) {
        const flash = state.flash ?? null;
        this._view.setSpotlight('ReadAloudActiveSentence', flash, flash ? 2000 : null);
      }
      return { lang: 'en' };
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: { activeTimestamp: REAL_TIMESTAMP as unknown } }, _iframeWindow: { clearTimeout: vi.fn() } };
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

// ---- the sentence leaves the word alone -----------------------------------

describe('PDF: the secondary highlight is drawn only where the primary is not', () => {
  const SENTENCE_POS = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
  const WORD_POS = { pageIndex: 0, rects: [[80, 100, 120, 110]] };
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  function drawing(over: Partial<HighlightStylingDeps> = clone) {
    const pdf = fakePDF('word');
    const { styling: s } = styling(over);
    s.attach(pdf.reader);
    return { ...pdf, styling: s };
  }
  const draw = (pdf: ReturnType<typeof fakePDF>, page = pdf.page) => {
    page._pushHighlightedPosition([], pdf.view._readAloudHighlightedPosition, ZOTERO_SEGMENT);
    page._pushHighlightedPosition([], pdf.view._readAloudSentenceHighlightedPosition, ZOTERO_SENTENCE);
  };

  it('cuts the word out of the sentence, so the word is the color that was picked', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD, SENTENCE]);
    expect(pdf.pushed[1].position).toEqual({
      pageIndex: 0,
      rects: [
        [10, 100, 80, 112],
        [120, 100, 200, 112],
      ],
      cloned: true,
    });
  });

  it('grows the word to the height of its line, so it fills the slot the sentence leaves', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed[0].position).toEqual({ pageIndex: 0, rects: [[80, 100, 120, 112]], cloned: true });

    // A word that already fills its line is passed on untouched
    const fits = drawing();
    fits.view._readAloudHighlightedPosition = { pageIndex: 0, rects: [[80, 100, 120, 112]] };
    fits.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(fits);
    expect(fits.pushed[0].position).toBe(fits.view._readAloudHighlightedPosition);
  });

  it('draws nothing of the sentence when the primary covers it, as a wordless voice does', () => {
    const pdf = drawing();
    // The stand-in word position of a voice without word timestamps is the
    // whole segment: Zotero's primary and our kept sentence are the same region
    pdf.view._readAloudHighlightedPosition = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.color)).toEqual([WORD]);
  });

  it('leaves the sentence untouched, by identity, on a page the primary is not on', () => {
    const pdf = drawing();
    const spanning = { pageIndex: 0, rects: [[10, 100, 200, 112]], nextPageRects: [[10, 700, 90, 712]] };
    pdf.view._readAloudHighlightedPosition = { pageIndex: 1, rects: [[20, 700, 60, 710]] };
    pdf.view._readAloudSentenceHighlightedPosition = spanning;
    draw(pdf);
    expect(pdf.pushed[1].position).toBe(spanning);

    // ... and cuts it on the page it is on, through the next page's rectangles
    draw(pdf, pdf.nextPage);
    expect(pdf.pushed[3].position).toEqual({
      pageIndex: 1,
      rects: [
        [10, 700, 20, 712],
        [60, 700, 90, 712],
      ],
      cloned: true,
    });
  });

  it('leaves a position without rectangles alone, and needs no cloning then', () => {
    const cloneIntoReader = vi.fn((_r: unknown, value: unknown) => value);
    const pdf = drawing({ cloneIntoReader });
    const primary = { pageIndex: 0, tag: 'primary' };
    const secondary = { pageIndex: 0, tag: 'secondary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.view._readAloudSentenceHighlightedPosition = secondary;
    draw(pdf);
    expect(pdf.pushed.map((p) => p.position)).toEqual([primary, secondary]);
    expect(cloneIntoReader).not.toHaveBeenCalled();
  });

  it('reports the trim in the diagnostics', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    expect((pdf.styling.inspect(pdf.reader).views as any[])[0]).toMatchObject({ secondaryTrim: { page: 0, rects: 1, holes: 1, pieces: 2 } });
  });

  it('keeps the sentence through the gap between segments, where Zotero leaves the last word drawn', async () => {
    const pdf = drawing();
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    // ActiveSegmentChange(null): no segment, no word timestamp, and Zotero's
    // own update skipped -- its stale primary is still on the page, and now
    // in the sentence color. Taking the sentence from around it would leave
    // that one word alone on the page.
    pdf.reader._internalReader._readAloudManager.activeTimestamp = null;
    await pdf.view.setReadAloudState({ popupOpen: true, activeSegment: null, activeWordSourcePosition: null });
    expect(pdf.view._readAloudHighlightedPosition).toEqual(word(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    pdf.page._pushHighlightedPosition([], pdf.view._readAloudHighlightedPosition, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('leaves the selection highlight and everything else alone', () => {
    const pdf = drawing();
    pdf.view._readAloudHighlightedPosition = WORD_POS;
    pdf.view._readAloudSentenceHighlightedPosition = SENTENCE_POS;
    const selection = { pageIndex: 0, rects: [[10, 100, 200, 112]] };
    pdf.page._pushHighlightedPosition([], selection, '#ffff00');
    expect(pdf.pushed).toEqual([{ position: selection, color: '#ffff00' }]);
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

// ---- EPUB / snapshot: the sentence drawn around the word ------------------------

const HEAD = 'ZoteroTTSSentenceHead';
const TAIL = 'ZoteroTTSSentenceTail';

/**
 * A DOM view whose selectors are `{ from, to }` character ranges of one text
 * node, so the pieces the sentence is cut into can be read back as text.
 * `toDisplayedRange` sits on the prototype, where Zotero has it, so the
 * plugin can shadow it; `_getSpotlightColor` throws on an unknown key, as
 * Zotero's does.
 */
function fakeRangeDOM(text: string, granularity = 'word') {
  const NODE = { text };
  class FakeRange {
    startContainer = NODE;
    endContainer = NODE;
    constructor(
      public startOffset: number,
      public endOffset: number,
    ) {}
    get collapsed() {
      return this.startOffset >= this.endOffset;
    }
    cloneRange() {
      return new FakeRange(this.startOffset, this.endOffset);
    }
    setStart(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      this.startOffset = offset;
      if (this.endOffset < offset) this.endOffset = offset;
    }
    setEnd(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      this.endOffset = offset;
      if (this.startOffset > offset) this.startOffset = offset;
    }
    comparePoint(node: unknown, offset: number) {
      if (node !== NODE) throw new Error('WrongDocumentError');
      return offset < this.startOffset ? -1 : offset > this.endOffset ? 1 : 0;
    }
    toString() {
      return text.slice(this.startOffset, this.endOffset);
    }
  }
  class DOMView {
    _spotlights = new Map<string, unknown>();
    _readAloud: any;
    _renderAnnotations = vi.fn();
    setSpotlight = vi.fn((key: string, selector: unknown, _timeout: number | null = 2000) => {
      if (selector) this._spotlights.set(key, selector);
      else this._spotlights.delete(key);
      this._renderAnnotations();
    });
    _getSpotlightColor(key: string) {
      if (key === 'ReadAloudActiveSegment') return ZOTERO_SEGMENT;
      if (key === 'ReadAloudActiveSentence') return ZOTERO_SENTENCE;
      throw new Error('Unknown highlight key: ' + key);
    }
    toDisplayedRange(selector: any) {
      return selector && typeof selector.from === 'number' ? new FakeRange(selector.from, selector.to) : null;
    }
  }
  class ReadAloud {
    state: any = null;
    constructor(public _view: DOMView) {}
    _effectivePrimaryGranularity(_state: unknown) {
      return granularity;
    }
    _resolveSegmentSelector = vi.fn((state: any) => state.activeSegment?.selector ?? null);
    setState(state: any) {
      const previous = this.state;
      this.state = state;
      if (!state.popupOpen) {
        this._view.setSpotlight('ReadAloudActiveSegment', null);
        this._view.setSpotlight('ReadAloudActiveSentence', null);
        return null;
      }
      // Without an active segment Zotero touches nothing: the last word's
      // spotlight stays on screen
      if (!state.activeSegment) return null;
      this._view.setSpotlight('ReadAloudActiveSegment', state.activeWordSourcePosition ?? null, null);
      if (state.activeSegment !== previous?.activeSegment) {
        const flash = state.flash ?? null;
        this._view.setSpotlight('ReadAloudActiveSentence', flash, flash ? 2000 : null);
      }
      return null;
    }
  }
  const view = new DOMView();
  view._readAloud = new ReadAloud(view);
  const manager = { activeTimestamp: null as unknown };
  const reader = { _internalReader: { _primaryView: view, _readAloudManager: manager }, _iframeWindow: { clearTimeout: vi.fn() } };
  /** What the view would draw for a spotlight of ours, as text. */
  const drawn = (key: string) => {
    const selector = view._spotlights.get(key);
    if (selector === undefined) return undefined;
    const range = view.toDisplayedRange(selector);
    return range === null ? null : String(range);
  };
  return { view, helper: view._readAloud as ReadAloud, reader, manager, drawn, DOMView };
}

describe('EPUB and snapshot: the sentence is drawn around the word', () => {
  // The same sentence twice, so a word position can land on the wrong copy
  const TEXT = 'In truth, I lean away. I lean away.';
  const SEGMENT = { selector: { from: 0, to: 22 }, text: 'In truth, I lean away.' };
  const LEAN = { from: 12, to: 16 };
  const AWAY = { from: 17, to: 21 };

  interface Reading {
    /** The word's characters in the segment, when they are not the selector's own. */
    chars?: [number, number];
    /** The whole-segment timestamp of a voice without word timings. */
    standIn?: boolean;
    state?: Record<string, unknown>;
  }

  function reader(granularity = 'word') {
    const dom = fakeRangeDOM(TEXT, granularity);
    const { styling: s, current } = styling();
    s.attach(dom.reader);
    const read = (word: unknown, { chars, standIn, state }: Reading = {}) => {
      const [charStart, charEnd] = chars ?? [(word as any).from ?? 0, (word as any).to ?? 0];
      dom.manager.activeTimestamp = standIn ? { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart, charEnd } : { start: 0.1, end: 0.4, charStart, charEnd };
      return dom.helper.setState({ popupOpen: true, activeSegment: SEGMENT, activeWordSourcePosition: word, ...state });
    };
    return { ...dom, styling: s, current, read };
  }

  it('cuts the sentence into the piece before and the piece after the word', () => {
    const dom = reader();
    dom.read(LEAN);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
    expect(dom.drawn(TAIL)).toBe(' away.');
    // The whole sentence is no longer drawn under the word
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    expect(dom.view._getSpotlightColor(HEAD)).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor(TAIL)).toBe(SENTENCE);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('follows the word without touching the spotlight map or drawing an extra frame', () => {
    const dom = reader();
    dom.read(LEAN);
    const [head, tail] = [dom.view._spotlights.get(HEAD), dom.view._spotlights.get(TAIL)];
    const renders = dom.view._renderAnnotations.mock.calls.length;
    dom.read(AWAY);
    expect(dom.view._spotlights.get(HEAD)).toBe(head);
    expect(dom.view._spotlights.get(TAIL)).toBe(tail);
    expect(dom.drawn(HEAD)).toBe('In truth, I lean ');
    expect(dom.drawn(TAIL)).toBe('.');
    // Zotero's own render of the moved word, and none of ours
    expect(dom.view._renderAnnotations.mock.calls.length).toBe(renders + 1);
  });

  it('draws neither piece where the word covers the whole sentence, as a wordless voice does', () => {
    const dom = reader();
    dom.read({ from: 0, to: 22 }, { standIn: true });
    expect(dom.view._spotlights.has(HEAD)).toBe(true);
    expect(dom.drawn(HEAD)).toBeNull();
    expect(dom.drawn(TAIL)).toBeNull();
  });

  it('draws the whole sentence, once, when the word is not inside it', () => {
    // The word position resolves to the right text in the wrong place (issue #4)
    const dom = reader();
    dom.read({ from: 25, to: 29 }, { chars: [12, 16] });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
  });

  it('draws the whole sentence in the head when the word position resolves to nothing', () => {
    const dom = reader();
    dom.read({ nothing: true }, { chars: [12, 16] });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    // No rewrite shows the word, so Zotero's primary is painted transparent
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
  });

  it('keeps the pieces through a push without a word, drawing the sentence whole', () => {
    const dom = reader();
    dom.read(LEAN);
    dom.manager.activeTimestamp = null;
    dom.helper.setState({ popupOpen: true, activeSegment: SEGMENT, activeWordSourcePosition: null });
    expect(dom.drawn(HEAD)).toBe('In truth, I lean away.');
    expect(dom.drawn(TAIL)).toBeNull();
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
  });

  it('keeps the pieces around the last word through the gap between segments', () => {
    const dom = reader();
    dom.read(LEAN);
    // ActiveSegmentChange(null): Zotero keeps the last word's spotlight, now
    // in the sentence color, and the sentence has to stay around it
    dom.manager.activeTimestamp = null;
    dom.helper.setState({ popupOpen: true, activeSegment: null, activeWordSourcePosition: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBe(LEAN);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
    expect(dom.drawn(TAIL)).toBe(' away.');
  });

  it('takes the pieces back when the switch goes off, the popup closes, or the granularity changes', () => {
    const off = reader();
    off.read(LEAN);
    expect(off.view._spotlights.has(HEAD)).toBe(true);
    off.current.sentenceUnderWord = false;
    off.read(LEAN);
    expect(off.view._spotlights.has(HEAD)).toBe(false);
    expect(off.view._spotlights.has(TAIL)).toBe(false);

    const closed = reader();
    closed.read(LEAN);
    closed.helper.setState({ popupOpen: false, activeSegment: SEGMENT, activeWordSourcePosition: LEAN });
    expect(closed.view._spotlights.has(HEAD)).toBe(false);
    expect(closed.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);

    const sentenceMode = reader('sentence');
    sentenceMode.read(LEAN);
    expect(sentenceMode.view._spotlights.has(HEAD)).toBe(false);
  });

  it("drops Zotero's own flash of the same sentence, which would draw it over the word again", () => {
    const dom = reader();
    dom.read(LEAN, { state: { flash: SEGMENT.selector, lastSkipGranularity: 'sentence' } });
    expect(dom.view._spotlights.has('ReadAloudActiveSentence')).toBe(false);
    expect(dom.drawn(HEAD)).toBe('In truth, I ');
  });

  it('takes the pieces back on dispose, so the reader is never left asking for a color of ours', () => {
    const dom = reader();
    dom.read(LEAN);
    expect(dom.view._renderAnnotations).toHaveBeenCalled();
    dom.styling.dispose();
    expect(dom.view._spotlights.has(HEAD)).toBe(false);
    expect(dom.view._spotlights.has(TAIL)).toBe(false);
    // Zotero's own method is back, and nothing left in the map throws in it
    for (const key of dom.view._spotlights.keys()) expect(() => dom.view._getSpotlightColor(key)).not.toThrow();
  });

  it('reports the pieces in the diagnostics', () => {
    const dom = reader();
    dom.read(LEAN);
    expect((dom.styling.inspect(dom.reader).views as any[])[0]).toMatchObject({
      kind: 'dom',
      sentencePieces: { head: 'In truth, I ', tail: ' away.' },
    });
  });

  it('leaves the sentence in one piece when toDisplayedRange is not where it can be patched', () => {
    // Another Zotero version: nothing resolves a piece, so none is put out
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = REAL_TIMESTAMP;
    (dom.view as any).toDisplayedRange = vi.fn(() => ({ toString: () => 'anything' }));
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A, activeWordSourcePosition: { word: true } });
    expect(dom.view._spotlights.has(HEAD)).toBe(false);
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
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
        activeWordTimestamp: 'real',
        primaryShown: true,
        state: { popupOpen: true, highlightGranularity: null, segmentGranularity: null, segment: true, segmentPage: 0, wordPosition: true },
        sentenceSlot: 'ours',
        secondaryTrim: null,
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

  it('PDF: the primary is the sentence, so it takes the sentence color, and the sentence is still kept', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    const primary = { pageIndex: 0, tag: 'primary' };
    pdf.view._readAloudHighlightedPosition = primary;
    pdf.page._pushHighlightedPosition([], primary, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
    // The primary may hold a selector that fails only at render time (broken
    // CFI), which is undetectable here — so the slot is kept regardless
    await pdf.view.setReadAloudState(pdfState(A, 1));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
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

  it('DOM: the primary spotlight takes the sentence color, and the sentence spotlight is kept too', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });

  it('DOM: a real word timestamp keeps the word color', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = real;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });
});

// ---- issue #2: the gap between segments -----------------------------------

describe('the gap between segments (no active timestamp, stale primary still drawn)', () => {
  it('PDF: keeps the stale primary in the sentence color instead of flashing the word color', () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = null;
    styling().styling.attach(pdf.reader);
    const stale = { pageIndex: 0, tag: 'the old sentence' };
    pdf.view._readAloudHighlightedPosition = stale;
    pdf.page._pushHighlightedPosition([], stale, ZOTERO_SEGMENT);
    expect(pdf.pushed[0].color).toBe(SENTENCE);
  });

  it('DOM: the primary spotlight takes the sentence color during the gap', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = null;
    styling().styling.attach(dom.reader);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });
});

// ---- issue #3: the primary fails to resolve (broken CFI in an EPUB) --------

describe('word mode with a stand-in whose primary position fails to resolve', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };

  it('PDF: puts the sentence into the secondary slot when the primary is not drawn', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState({ ...pdfState(A, 1), activeWordSourcePosition: null });
    expect(pdf.view._readAloudHighlightedPosition).toBeNull();
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('PDF: keeps the slot when the primary resolves again — a doubled tint beats going dark', async () => {
    const pdf = fakePDF('word');
    pdf.reader._internalReader._readAloudManager.activeTimestamp = whole;
    const { styling: s } = styling();
    s.attach(pdf.reader);
    await pdf.view.setReadAloudState({ ...pdfState(A, 1), activeWordSourcePosition: null });
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
    await pdf.view.setReadAloudState(pdfState(A, 2));
    expect(pdf.view._readAloudSentenceHighlightedPosition).toBe(A.sourcePosition);
  });

  it('DOM: sets the sentence spotlight when the primary spotlight is not drawn', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A, primarySelector: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBeUndefined();
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });

  it('DOM: keeps the sentence spotlight while the primary is drawn as well', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBeTruthy();
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- issue #3 root cause: the resolver cannot resolve the generated CFI ----

describe('repairing a sentence selector the resolver cannot resolve', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'Wine and hazelnut country, somewhere.' };
  const BROKEN = { type: 'FragmentSelector', conformsTo: 'cfi', value: 'epubcfi(/6/16!/4/4/12/3,:32,:168)' };
  const REPAIRED_VALUE = 'epubcfi(/6/16!/4/4/12/1,:32,:168)';

  function repairableDOM() {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ ...BROKEN })) as never;
    // Like the real reader: an object not cloned into its compartment is unreadable
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) =>
      sel?.cloned && sel.value === REPAIRED_VALUE ? { toString: () => 'Wine  and hazelnut country, somewhere.' } : null,
    );
    return dom;
  }

  it('rewrites the text step until the displayed text matches the sentence, cloning the selector for the reader', () => {
    const dom = repairableDOM();
    const cloneIntoReader = vi.fn((_reader: unknown, value: unknown) => ({ ...(value as object), cloned: true }));
    styling({ cloneIntoReader }).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, primarySelector: null });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(REPAIRED_VALUE);
    expect(slot?.cloned).toBe(true);
    expect(cloneIntoReader).toHaveBeenCalledWith(dom.reader, expect.objectContaining({ value: REPAIRED_VALUE }));
  });

  it('sets nothing when no rewrite shows the sentence text — never a wrong highlight', () => {
    const dom = repairableDOM();
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) =>
      sel?.cloned && sel.value === REPAIRED_VALUE ? { toString: () => 'a completely different passage' } : null,
    );
    styling({ cloneIntoReader: (_r, value) => ({ ...(value as object), cloned: true }) }).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, primarySelector: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBeUndefined();
  });

  it('leaves a selector that resolves as it is', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    (dom.view as any).toDisplayedRange = vi.fn(() => ({ toString: () => 'anything' }));
    styling().styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: A });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toEqual({ selectorFor: A });
  });
});

// ---- issue #4: the selector resolves, but to the wrong text node -----------

describe('a sentence selector that resolves to the wrong text', () => {
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'In truth, I lean away.' };
  const WRONG = 'epubcfi(/6/16!/4/4/26/3,:0,:22)';
  const RIGHT = 'epubcfi(/6/16!/4/4/26/1,:0,:22)';

  function misresolvingDOM() {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.value === WRONG) return { toString: () => 'turning to syrup in the' };
      if (sel?.cloned && sel.value === RIGHT) return { toString: () => 'In truth,  I lean away.' };
      if (sel?.primary) return { toString: () => 'turning to syrup in the' };
      return null;
    });
    return dom;
  }
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  it('rewrites the selector when the displayed text is not the sentence, though it resolves', () => {
    const dom = misresolvingDOM();
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(RIGHT);
  });

  it('repairs the misplaced stand-in word position, so the primary lands right in the sentence color', () => {
    const dom = misresolvingDOM();
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG } });
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(RIGHT);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);

    const good = fakeDOM('word');
    good.reader._internalReader._readAloudManager.activeTimestamp = whole;
    good.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: RIGHT })) as never;
    (good.view as any).toDisplayedRange = vi.fn((sel: any) => (sel?.value === RIGHT || sel?.primary ? { toString: () => 'In truth, I lean away.' } : null));
    styling(clone).styling.attach(good.reader);
    good.helper.setState({ popupOpen: true, activeSegment: SEG });
    expect(good.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(SENTENCE);
  });
});

describe('a real word whose position resolves to the wrong text', () => {
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'In truth, I lean away.' };
  const real = { start: 0.4, end: 0.7, charStart: 12, charEnd: 16 }; // "lean"
  const WRONG_WORD = 'epubcfi(/6/16!/4/4/26/3,:12,:16)';
  const RIGHT_WORD = 'epubcfi(/6/16!/4/4/26/1,:12,:16)';
  const SENT = 'epubcfi(/6/16!/4/4/26/1,:0,:22)';
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  function domReading(rightWordResolves: boolean) {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = real;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: SENT })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.value === WRONG_WORD) return { toString: () => 'syru' };
      if (sel?.value === RIGHT_WORD && (rightWordResolves ? true : false)) return { toString: () => 'lean' };
      if (sel?.value === SENT) return { toString: () => 'In truth, I lean away.' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    return dom;
  }

  it('repairs the word position before Zotero draws it, so the word color lands on the right word', () => {
    const dom = domReading(true);
    const state = { popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_WORD } };
    dom.helper.setState(state);
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(RIGHT_WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });

  it('paints the primary transparent when no rewrite shows the active word', () => {
    const dom = domReading(false);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: { type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_WORD } });
    const primary = dom.view._spotlights.get('ReadAloudActiveSegment') as any;
    expect(primary?.value).toBe(WRONG_WORD);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe('#00000000');
  });

  it('leaves a correct word position untouched, with the word color', () => {
    const dom = domReading(true);
    const right = { type: 'FragmentSelector', conformsTo: 'cfi', value: RIGHT_WORD };
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: right });
    expect(dom.view._spotlights.get('ReadAloudActiveSegment')).toBe(right);
    expect(dom.view._getSpotlightColor('ReadAloudActiveSegment')).toBe(WORD);
  });
});

describe('a sentence spanning two text nodes (range endpoints in different nodes)', () => {
  const SEG = { sourcePosition: { pageIndex: 0, tag: 'seg' }, paragraphSourcePosition: { pageIndex: 0, tag: 'seg-p' }, text: 'I have seen cousins pulled into secondary.' };
  const whole = { start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: 42 };
  const WRONG_CROSS = 'epubcfi(/6/16!/4/4/26,/3:64,/5:130)';
  const RIGHT_CROSS = 'epubcfi(/6/16!/4/4/26,/1:64,/3:130)';
  const PROBE_1 = 'epubcfi(/6/16!/4/4/26/1,:0,:1)';
  // The paragraph: [pagebreak span, textA, inline span, textB]
  const PARENT = { childNodes: [{ nodeType: 1 }, { nodeType: 3 }, { nodeType: 1 }, { nodeType: 3 }] };
  const clone = { cloneIntoReader: (_r: unknown, value: unknown) => ({ ...(value as object), cloned: true }) };

  it('maps the spec text steps through the real child structure and repairs both endpoints', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_CROSS })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.cloned && sel.value === PROBE_1) return { toString: (): string => 'I', startContainer: { parentNode: PARENT } };
      if (sel?.cloned && sel.value === RIGHT_CROSS) return { toString: (): string => 'I have  seen cousins pulled into secondary.' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: null });
    const slot = dom.view._spotlights.get('ReadAloudActiveSentence') as any;
    expect(slot?.value).toBe(RIGHT_CROSS);
  });

  it('sets nothing when the repaired range does not show the sentence', () => {
    const dom = fakeDOM('word');
    dom.reader._internalReader._readAloudManager.activeTimestamp = whole;
    dom.helper._resolveSegmentSelector = vi.fn(() => ({ type: 'FragmentSelector', conformsTo: 'cfi', value: WRONG_CROSS })) as never;
    (dom.view as any).toDisplayedRange = vi.fn((sel: any) => {
      if (sel?.cloned && sel.value === PROBE_1) return { toString: (): string => 'I', startContainer: { parentNode: PARENT } };
      if (sel?.cloned && sel.value === RIGHT_CROSS) return { toString: (): string => 'some other passage entirely' };
      return null;
    });
    styling(clone).styling.attach(dom.reader);
    dom.helper.setState({ popupOpen: true, activeSegment: SEG, activeWordSourcePosition: null });
    expect(dom.view._spotlights.get('ReadAloudActiveSentence')).toBeUndefined();
  });
});
