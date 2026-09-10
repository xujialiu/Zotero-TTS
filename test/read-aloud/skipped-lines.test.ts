import { describe, expect, it, vi } from 'vitest';
import {
  COLUMN_TOLERANCE_PT,
  MAX_LINE_CHARS,
  MAX_LINE_HEIGHT_PT,
  MIN_LINE_CHARS,
  MIN_LINE_WORDS,
  blockText,
  createSkippedLines,
  endsMidSentence,
  findSkippedLines,
  furnitureKey,
  looksLikeProse,
  restoreSkippedLines,
  type BlockLike,
  type SkippedLinesDeps,
} from '../../src/read-aloud/skipped-lines';

/**
 * The owner's manuscript as Zotero's document worker structured it,
 * measured live on 2026-09-10 (issue #87): blocks 13, 15, 16 and 17 carry
 * their measured rects, texts and links; block 16 is the line the
 * classifier threw out — `flowClass: 'excluded'`, no `previousPart`, no
 * `nextPart` — while block 15's chain jumps over it to 17. Everything
 * else in the array is filler with the same shape. Rects are
 * `[pageIndex, x0, y0, x1, y1]` in PDF points, y up, on 792 pt pages.
 */
const TAIL_15 = 'Sampson et al. report that 60% of the myopia studies they reviewed, all published after';
const LINE_16 = '2023, had not. The omission matters most in myopia, in which the exposure of interest,';
const LINE_17 = 'axial elongation, is also the source of the error.';

function block(over: Partial<BlockLike> & { texts?: string[] }): BlockLike {
  const { texts, ...rest } = over;
  return { type: 'paragraph', flowClass: 'body', content: (texts ?? ['']).map((text) => ({ text })), ...rest } as BlockLike;
}

/** Zotero's pack with the lost line at index 16: 13 filler blocks, then the four measured ones and one more paragraph. */
function manuscript(): BlockLike[] {
  const filler: BlockLike[] = [];
  for (let i = 0; i < 13; i++) {
    filler.push(block({ pageRects: [[0, 90.02, 700 - i * 40, 522.1, 712 - i * 40]], texts: [`Filler paragraph number ${i} of the first page, ending with a period.`] }));
  }
  return [
    ...filler,
    // 13: the heading of the main text, rightly excluded
    block({ flowClass: 'excluded', pageRects: [[1, 90.02, 706.22, 158.99, 716.94]], texts: ['MAIN TEXT'] }),
    // 14: a heading below it
    block({ type: 'heading', pageRects: [[1, 90.02, 680, 200, 692]], texts: ['Introduction'] }),
    // 15: the paragraph that runs to the foot of page 2 and on
    block({
      nextPart: [17],
      pageRects: [[1, 90.02, 85.15, 522.1, 468.71]],
      texts: ['An OCT instrument scans a fixed angle, so the size of what it images depends on the axial length. ', TAIL_15],
    }),
    // 16: the first line of page 3, thrown out
    block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: [LINE_16] }),
    // 17: the second line, where the chain lands
    block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: [LINE_17] }),
    // 18: the next paragraph
    block({ pageRects: [[2, 90.02, 600, 522.1, 672]], texts: ['Uncorrected images nevertheless remain common in the literature of the field.'] }),
  ];
}

describe('blockText, endsMidSentence, looksLikeProse, furnitureKey', () => {
  it('joins the text nodes of a leaf block and ignores what is not text', () => {
    expect(blockText(block({ texts: ['abc ', 'def'] }))).toBe('abc def');
    expect(blockText({ content: [{ text: 'a' }, {}, { text: 3 }, null, { text: 'b' }] } as any)).toBe('ab');
    expect(blockText({} as any)).toBe('');
    expect(blockText(null as any)).toBe('');
  });

  it('knows a sentence that stops short of its end', () => {
    expect(endsMidSentence(TAIL_15)).toBe(true);
    expect(endsMidSentence(LINE_16)).toBe(true);
    expect(endsMidSentence('… were five times more bank')).toBe(true);
    expect(endsMidSentence('The end.')).toBe(false);
    expect(endsMidSentence('Really?')).toBe(false);
    expect(endsMidSentence('Stop!')).toBe(false);
    expect(endsMidSentence('He said “no.”')).toBe(false);
    expect(endsMidSentence('(see below.)  ')).toBe(false);
    expect(endsMidSentence('and so on…')).toBe(false);
    expect(endsMidSentence('')).toBe(false);
  });

  it('takes prose and refuses furniture', () => {
    expect(looksLikeProse(LINE_16)).toBe(true);
    expect(looksLikeProse('4,565. By the beginning of the 1980s, there were five times more bank')).toBe(true);
    expect(looksLikeProse("subject's axial length to that assumed by the system (24.46mm). Also eyes with longer")).toBe(true);
    // Too short, or too few words however long
    expect(looksLikeProse('MAIN TEXT')).toBe(false);
    expect(looksLikeProse('2023, had not.')).toBe(false);
    expect(looksLikeProse('supplementary information available online')).toBe(false);
    expect(looksLikeProse('one two three four five six seven')).toBe(true);
    expect(MIN_LINE_CHARS).toBe(30);
    // Addresses of any kind
    expect(looksLikeProse('downloaded from https://iovs.arvojournals.org on 2026-09-10 by a reader of the journal')).toBe(false);
    expect(looksLikeProse('see www.example.org for the supplementary material of this article and more')).toBe(false);
    expect(looksLikeProse('doi: 10.1167/iovs.65.4.12 published online by the association for research in vision')).toBe(false);
    expect(looksLikeProse('correspondence to the first author at someone@example.edu who will answer for the group')).toBe(false);
    // Mostly capitals
    expect(looksLikeProse('INVESTIGATIVE OPHTHALMOLOGY AND VISUAL SCIENCE, VOLUME 65, ISSUE 4, APRIL')).toBe(false);
    expect(MIN_LINE_WORDS).toBe(5);
  });

  it('masks digits and whitespace so a running head matches itself on every page', () => {
    expect(furnitureKey('Liu et al.  · Axial length · 3')).toBe(furnitureKey('Liu et al. · Axial length · 14'));
    expect(furnitureKey('Page 3 of 12')).toBe('page # of #');
    expect(furnitureKey(LINE_16)).not.toBe(furnitureKey(LINE_17));
  });
});

describe('findSkippedLines', () => {
  it("finds the manuscript's block 16 between 15 and 17, on page 3, above the line the chain lands on", () => {
    expect(findSkippedLines(manuscript())).toEqual([{ index: 16, after: 15, before: 17, page: 2, text: LINE_16 }]);
  });

  it('leaves the MAIN TEXT heading alone: not prose, no chain jumps it', () => {
    const lines = findSkippedLines(manuscript());
    expect(lines.map((l) => l.index)).not.toContain(13);
  });

  it('refuses a running head, whose digit-masked text is on another page', () => {
    const content = manuscript();
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['liu and colleagues, axial length and the magnification of an angiogram, page 3'] });
    content[13] = block({ flowClass: 'excluded', pageRects: [[1, 90.02, 706.22, 521.75, 717.14]], texts: ['liu and colleagues, axial length and the magnification of an angiogram, page 2'] });
    expect(findSkippedLines(content)).toEqual([]);
  });

  it('refuses a footnote address and a title-case banner', () => {
    const content = manuscript();
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['downloaded from https://example.org/journal on 2026-09-10 for personal use only'] });
    expect(findSkippedLines(content)).toEqual([]);
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['Copyright 2026 The Authors. Published by the Association for Research in Vision'] });
    expect(findSkippedLines(content)).toEqual([]);
  });

  it("refuses a line on the chain's first page, one below the landing block, and one in another column", () => {
    const content = manuscript();
    // A footnote at the foot of page 2, under block 15
    content[16] = block({ flowClass: 'excluded', pageRects: [[1, 90.02, 60, 521.75, 71]], texts: [LINE_16] });
    expect(findSkippedLines(content)).toEqual([]);
    // Under block 17 on page 3
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 500, 521.75, 511]], texts: [LINE_16] });
    expect(findSkippedLines(content)).toEqual([]);
    // The right column of a two-column page
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02 + COLUMN_TOLERANCE_PT + 200, 706.22, 521.75, 717.14]], texts: [LINE_16] });
    expect(findSkippedLines(content)).toEqual([]);
  });

  it('refuses a block that is not a single short line, or not a paragraph, or not a leaf', () => {
    const content = manuscript();
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 680, 521.75, 717.14]], texts: [LINE_16] });
    expect(MAX_LINE_HEIGHT_PT).toBe(24);
    expect(findSkippedLines(content)).toEqual([]);
    content[16] = block({
      flowClass: 'excluded',
      pageRects: [
        [2, 90.02, 706.22, 521.75, 717.14],
        [2, 90.02, 690, 521.75, 701],
      ],
      texts: [LINE_16],
    });
    expect(findSkippedLines(content)).toEqual([]);
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['word '.repeat(MAX_LINE_CHARS / 5 + 1) + 'more'] });
    expect(findSkippedLines(content)).toEqual([]);
    content[16] = block({ type: 'heading', flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: [LINE_16] });
    expect(findSkippedLines(content)).toEqual([]);
    content[16] = { type: 'list', flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], content: [block({ texts: [LINE_16] })] } as any;
    expect(findSkippedLines(content)).toEqual([]);
  });

  it('needs a join to prove the line belongs: either end of it', () => {
    // The first page's paragraph ends with a period and the line starts a capital: nothing proves it
    const content = manuscript();
    content[15] = block({ nextPart: [17], pageRects: [[1, 90.02, 85.15, 522.1, 468.71]], texts: ['Sampson et al. report that most of the myopia studies had not corrected it.'] });
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['The omission matters most in myopia, in which the exposure of interest is the error.'] });
    content[17] = block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: ['Axial elongation is also the source of the error.'] });
    expect(findSkippedLines(content)).toEqual([]);
    // The line's own end runs into a lowercase landing block that the first page's period cannot explain: restored
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['The omission matters most in myopia, in which the exposure of interest,'] });
    content[17] = block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: [LINE_17] });
    expect(findSkippedLines(content).map((l) => l.index)).toEqual([16]);
    // The same landing block after a first page that ends mid-sentence: Zotero's own join explains it, the line is not proven
    content[15] = block({ nextPart: [17], pageRects: [[1, 90.02, 85.15, 522.1, 468.71]], texts: [TAIL_15] });
    expect(findSkippedLines(content)).toEqual([]);
    // The first page ends mid-sentence and the line starts lowercase, though it ends a sentence and the landing block starts a new one
    content[15] = block({ nextPart: [17], pageRects: [[1, 90.02, 85.15, 522.1, 468.71]], texts: [TAIL_15] });
    content[16] = block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['2023, had not corrected their measurements for the axial length of the eye.'] });
    content[17] = block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: ['The omission matters most in myopia.'] });
    expect(findSkippedLines(content).map((l) => l.index)).toEqual([16]);
  });

  it('takes two lines between the same two blocks, in order, and a jump within a page', () => {
    const content = manuscript();
    content.splice(16, 1,
      block({ flowClass: 'excluded', pageRects: [[2, 90.02, 720, 521.75, 731]], texts: ['2023, had not. The omission matters most in myopia, in which the exposure of'] }),
      block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['interest, the elongation of the eye along its axis over the years of growth,'] }),
    );
    content[15] = block({ nextPart: [18], pageRects: [[1, 90.02, 85.15, 522.1, 468.71]], texts: [TAIL_15] });
    content[18] = block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: [LINE_17] });
    expect(findSkippedLines(content).map((l) => [l.index, l.after, l.before])).toEqual([
      [16, 15, 18],
      [17, 15, 18],
    ]);
  });

  it('does nothing on a structure that is not a PDF, is empty, or has no chain', () => {
    expect(findSkippedLines(manuscript(), { processor: { type: 'epub' } })).toEqual([]);
    expect(findSkippedLines(manuscript(), { processor: { type: 'pdf' } })).toHaveLength(1);
    expect(findSkippedLines([])).toEqual([]);
    expect(findSkippedLines(null as any)).toEqual([]);
    const content = manuscript();
    delete content[15].nextPart;
    delete content[17].previousPart;
    expect(findSkippedLines(content)).toEqual([]);
  });
});

describe('restoreSkippedLines', () => {
  it('relinks the chain through the line and gives it the body flow, with refs made by the caller', () => {
    const content = manuscript();
    const made: unknown[] = [];
    const makeRef = (ref: number[]) => {
      const copy = [...ref];
      made.push(copy);
      return copy;
    };
    expect(restoreSkippedLines(content, findSkippedLines(content), makeRef)).toBe(1);
    expect(content[15].nextPart).toEqual([16]);
    expect(content[16].previousPart).toEqual([15]);
    expect(content[16].nextPart).toEqual([17]);
    expect(content[17].previousPart).toEqual([16]);
    expect(content[16].flowClass).toBe('body');
    expect(made).toHaveLength(4);
    // A second pass finds nothing: the line is in the flow now
    expect(findSkippedLines(content)).toEqual([]);
    expect(restoreSkippedLines(content, findSkippedLines(content), makeRef)).toBe(0);
  });

  it('chains two lines in order', () => {
    const content = manuscript();
    content.splice(16, 1,
      block({ flowClass: 'excluded', pageRects: [[2, 90.02, 720, 521.75, 731]], texts: ['2023, had not. The omission matters most in myopia, in which the exposure of'] }),
      block({ flowClass: 'excluded', pageRects: [[2, 90.02, 706.22, 521.75, 717.14]], texts: ['interest, the elongation of the eye along its axis over the years of growth,'] }),
    );
    content[15] = block({ nextPart: [18], pageRects: [[1, 90.02, 85.15, 522.1, 468.71]], texts: [TAIL_15] });
    content[18] = block({ previousPart: [15], pageRects: [[2, 90.02, 685.58, 315.13, 696.5]], texts: [LINE_17] });
    expect(restoreSkippedLines(content, findSkippedLines(content), (r) => [...r])).toBe(2);
    expect(content[15].nextPart).toEqual([16]);
    expect(content[16].previousPart).toEqual([15]);
    expect(content[16].nextPart).toEqual([17]);
    expect(content[17].previousPart).toEqual([16]);
    expect(content[17].nextPart).toEqual([18]);
    expect(content[18].previousPart).toEqual([17]);
  });
});

/** A reader tab the way the module sees it: the internal reader's class owns `_loadSDT`, which resolves the structure. */
function fakeReader(structure: unknown, opts: { fail?: boolean } = {}) {
  class Reader {
    _sdt: unknown = null;
    async _loadSDT() {
      if (opts.fail) throw new Error('no pack');
      if (!this._sdt && structure) this._sdt = { structure, mapper: {} };
      return this._sdt;
    }
  }
  const internal = new Reader();
  return { reader: { _internalReader: internal, _iframeWindow: {} }, internal, Reader };
}

function deps(over: Partial<SkippedLinesDeps> = {}): SkippedLinesDeps & { errors: unknown[]; lines: string[] } {
  const errors: unknown[] = [];
  const lines: string[] = [];
  return {
    enabled: () => true,
    error: (e) => errors.push(e),
    debug: (m) => lines.push(m),
    errors,
    lines,
    ...over,
  };
}

describe('createSkippedLines', () => {
  it("shadows _loadSDT on the reader's prototype and repairs the structure it resolves, once", async () => {
    const structure = { metadata: { processor: { type: 'pdf' } }, content: manuscript() };
    const { reader, internal, Reader } = fakeReader(structure);
    const d = deps();
    const skipped = createSkippedLines(d);
    expect(skipped.attach(reader)).toBe(true);
    expect(skipped.attach(reader)).toBe(true);
    expect(skipped.patchCounts()).toEqual({ total: 1, live: 1 });
    const sdt = await internal._loadSDT();
    expect(sdt).toBe(internal._sdt);
    expect(structure.content[15].nextPart).toEqual([16]);
    expect(structure.content[16].flowClass).toBe('body');
    expect(d.lines).toEqual([
      'skipped lines attached to a reader',
      `skipped line restored on page 3: "${LINE_16}" (86 chars) between blocks 15 and 17`,
    ]);
    // Cached by Zotero: the second call resolves the same object and finds nothing more to do
    expect(await internal._loadSDT()).toBe(sdt);
    expect(d.lines).toHaveLength(2);
    expect(skipped.inspect(reader)).toMatchObject({
      patched: true,
      enabled: true,
      loaded: true,
      excluded: 1,
      restored: [{ index: 16, after: 15, before: 17, page: 2, chars: 86, head: LINE_16.slice(0, 60) }],
    });
    skipped.dispose();
    expect(Object.prototype.hasOwnProperty.call(Reader.prototype, '_loadSDT')).toBe(true);
    expect(skipped.patchCounts()).toEqual({ total: 0, live: 0 });
  });

  it('leaves the structure alone while the switch is off, and reports so', async () => {
    const structure = { metadata: { processor: { type: 'pdf' } }, content: manuscript() };
    const { reader, internal } = fakeReader(structure);
    const d = deps({ enabled: () => false });
    const skipped = createSkippedLines(d);
    skipped.attach(reader);
    await internal._loadSDT();
    expect(structure.content[15].nextPart).toEqual([17]);
    expect(structure.content[16].flowClass).toBe('excluded');
    expect(d.lines).toEqual(['skipped lines attached to a reader']);
    expect(skipped.inspect(reader)).toMatchObject({ patched: true, enabled: false, loaded: true, restored: [] });
  });

  it('passes a missing structure and a failure through, and logs a throw of its own without breaking the load', async () => {
    const none = fakeReader(null);
    const skipped = createSkippedLines(deps());
    skipped.attach(none.reader);
    expect(await none.internal._loadSDT()).toBeNull();
    const failing = fakeReader({ content: manuscript() }, { fail: true });
    skipped.attach(failing.reader);
    await expect(failing.internal._loadSDT()).rejects.toThrow('no pack');
    // A structure whose content throws when read
    const trap = { content: new Proxy([], { get: () => { throw new Error('trap'); } }) };
    const trapped = fakeReader(trap);
    const d = deps();
    const s2 = createSkippedLines(d);
    s2.attach(trapped.reader);
    expect(await trapped.internal._loadSDT()).toBe(trapped.internal._sdt);
    expect(d.errors).toHaveLength(1);
  });

  it('builds the returned promise and the refs in the reader through the deps', async () => {
    const structure = { content: manuscript() };
    const { reader, internal } = fakeReader(structure);
    const readerPromise = vi.fn((_reader: unknown, executor: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void) => new Promise(executor));
    const exportTo = vi.fn((_reader: unknown, fn: (...a: any[]) => any) => fn);
    const cloneInto = vi.fn((_reader: unknown, value: unknown) => structuredClone(value));
    const skipped = createSkippedLines(deps({ readerPromise, exportTo, cloneInto }));
    skipped.attach(reader);
    expect(await internal._loadSDT()).toBe(internal._sdt);
    expect(readerPromise).toHaveBeenCalledTimes(1);
    expect(exportTo).toHaveBeenCalled();
    expect(cloneInto).toHaveBeenCalledTimes(4);
    expect(structure.content[16].nextPart).toEqual([17]);
  });

  it('does not attach without an internal reader or a _loadSDT, and inspects a reader it has not patched', () => {
    const skipped = createSkippedLines(deps());
    expect(skipped.attach({})).toBe(false);
    expect(skipped.attach({ _internalReader: {} })).toBe(false);
    expect(skipped.inspect({ _internalReader: {} })).toMatchObject({ patched: false, loaded: false, restored: [] });
    expect(skipped.inspect(null)).toMatchObject({ patched: false });
  });
});
