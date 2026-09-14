import { describe, expect, it } from 'vitest';
import { MAX_GAP_PT, findSplitParagraphs, joinParagraphParts, type ParagraphJoin } from '../../src/read-aloud/paragraph-parts';
import { type BlockLike } from '../../src/read-aloud/skipped-lines';

/**
 * The owner's manuscript as Zotero's document worker structured it,
 * measured live on 2026-09-14 (issue #104): blocks 108, 109 and 110 of the
 * pack carry their measured rects and texts, none of them linked as parts
 * although 108 → 109 and 109 → 110 each cut a sentence; 111 is the page
 * number of the next page. Rects are `[pageIndex, x0, y0, x1, y1]` in PDF
 * points, y up.
 */
const TAIL_108 = 'To ensure accurate quantitative analysis, images should be corrected for lateral magnification based on the actual AL of each eye. That said, image magnification error correction is not required for';
const HEAD_109 = 'longitudinal monitoring of individuals ';
const TAIL_109 = ' or for other instances in which no significant change in AL is expected. It is also worth noting that some OCTA-derived metrics are not impacted by AL,';
const HEAD_110 = 'including FAZ-C ';
const TAIL_110 = '. Despite growing awareness, uncorrected images remain common.';

function block(over: Partial<BlockLike> & { texts?: string[] }): BlockLike {
  const { texts, ...rest } = over;
  return { type: 'paragraph', content: (texts ?? ['']).map((text) => ({ text })), ...rest } as BlockLike;
}

/** The pack around page 13: 108 filler blocks, then the measured ones. */
function manuscript(): BlockLike[] {
  const filler: BlockLike[] = [];
  for (let i = 0; i < 108; i++) {
    filler.push(block({ anchor: { pageRects: [[Math.floor(i / 9), 93.84, 700 - (i % 9) * 60, 512, 740 - (i % 9) * 60]] }, texts: [`Filler paragraph number ${i}, ending with a period.`] }));
  }
  return [
    ...filler,
    // 108: the paragraph cut after "not required for"
    block({ anchor: { pageRects: [[12, 93.84, 249.28, 512.52, 448.58]] }, texts: ['In this study, we showed that applying the correction altered intergroup differences in OCTA metrics. ', TAIL_108] }),
    // 109: its continuation, cut again after "impacted by AL,"
    block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: [HEAD_109, '[66]', TAIL_109] }),
    // 110: the continuation of that
    block({ anchor: { pageRects: [[12, 93.84, 106.6, 515.21, 186.98]] }, texts: [HEAD_110, '[67]', TAIL_110] }),
    // 111: the next page's number
    block({ flowClass: 'excluded', anchor: { pageRects: [[13, 300, 40, 312, 50]] }, texts: ['14'] }),
    // 112: a real paragraph at the top of the next page
    block({ anchor: { pageRects: [[13, 93.84, 600, 515, 717]] }, texts: ['Several limitations of this study should be acknowledged.'] }),
  ];
}

const PDF = { processor: { type: 'pdf' } };

describe('findSplitParagraphs', () => {
  it('finds both cuts of the manuscript, in order, with their pages and texts', () => {
    const joins = findSplitParagraphs(manuscript(), PDF);
    expect(joins.map((j) => [j.after, j.before, j.page])).toEqual([
      [108, 109, 12],
      [109, 110, 12],
    ]);
    expect(joins[0].textA.endsWith('not required for')).toBe(true);
    expect(joins[0].textB.startsWith('longitudinal monitoring')).toBe(true);
  });

  it('joins across a page break over the page number, when the last block ends mid-sentence', () => {
    const content = manuscript();
    content[110] = block({ anchor: { pageRects: [[12, 93.84, 106.6, 515.21, 186.98]] }, texts: ['including FAZ-C, which the literature has consistently found to be robust to changes in'] });
    content[112] = block({ anchor: { pageRects: [[13, 93.84, 690, 515, 717]] }, texts: ['axial length, as three independent groups have reported.'] });
    const joins = findSplitParagraphs(content, PDF);
    expect(joins.map((j) => [j.after, j.before, j.page])).toEqual([
      [108, 109, 12],
      [109, 110, 12],
      [110, 112, 12],
    ]);
  });

  it('joins a block at the top of the next column', () => {
    const content = manuscript();
    content[109] = block({ anchor: { pageRects: [[12, 310, 500, 530, 700]] }, texts: [HEAD_109, '[66]', TAIL_109] });
    content[110] = block({ anchor: { pageRects: [[12, 310, 106.6, 530, 486]] }, texts: [HEAD_110, '[67]', TAIL_110] });
    content[108] = block({ anchor: { pageRects: [[12, 93.84, 60, 295, 448.58]] }, texts: [TAIL_108] });
    expect(findSplitParagraphs(content, PDF).map((j) => [j.after, j.before])).toEqual([
      [108, 109],
      [109, 110],
    ]);
  });

  it('takes a citation bracket, or a bracket group before a lowercase word, as the start of a continuation', () => {
    const content = manuscript();
    content[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['[66]', ' or for other instances in which no significant change in AL is expected.'] });
    expect(findSplitParagraphs(content, PDF).map((j) => [j.after, j.before])).toEqual([[108, 109]]);

    const table = manuscript();
    table[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['(Table 4) exhibited the largest effect sizes, suggesting that they are the ones to keep.'] });
    expect(findSplitParagraphs(table, PDF).map((j) => [j.after, j.before])).toEqual([[108, 109]]);

    const capitalAfter = manuscript();
    capitalAfter[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['(A) The first criterion is the effect size, which must exceed the threshold.'] });
    expect(findSplitParagraphs(capitalAfter, PDF).map((j) => [j.after, j.before])).toEqual([]);
  });

  it('leaves a real paragraph boundary alone: the first ends a sentence, or the second starts with a capital or a bare digit', () => {
    const ends = manuscript();
    ends[108] = block({ anchor: { pageRects: [[12, 93.84, 249.28, 512.52, 448.58]] }, texts: ['That said, correction is not always required.'] });
    ends[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['longitudinal monitoring is one case. It is also worth noting that some metrics are not impacted by AL.'] });
    expect(findSplitParagraphs(ends, PDF)).toEqual([]);

    const capital = manuscript();
    capital[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['Longitudinal monitoring of individuals is one case. Some metrics are not impacted by AL.'] });
    expect(findSplitParagraphs(capital, PDF).map((j) => [j.after, j.before])).toEqual([]);

    const digit = manuscript();
    digit[109] = block({ anchor: { pageRects: [[12, 93.84, 201.76, 517.8, 234.62]] }, texts: ['2023 was the year the correction became standard. Some metrics are not impacted by AL.'] });
    expect(findSplitParagraphs(digit, PDF).map((j) => [j.after, j.before])).toEqual([]);
  });

  it('leaves a block that is already a part, a heading, a container or an excluded block alone', () => {
    const linked = manuscript();
    linked[109].previousPart = [50];
    expect(findSplitParagraphs(linked, PDF).map((j) => [j.after, j.before])).toEqual([[109, 110]]);

    const chained = manuscript();
    chained[108].nextPart = [110];
    expect(findSplitParagraphs(chained, PDF).map((j) => [j.after, j.before])).toEqual([[109, 110]]);

    const heading = manuscript();
    heading[109].type = 'heading';
    expect(findSplitParagraphs(heading, PDF)).toEqual([]);

    const container = manuscript();
    container[109] = { type: 'list', content: [block({ texts: ['longitudinal item'] })] } as BlockLike;
    expect(findSplitParagraphs(container, PDF)).toEqual([]);

    const excluded = manuscript();
    excluded[109].flowClass = 'excluded';
    expect(findSplitParagraphs(excluded, PDF)).toEqual([]);
  });

  it('leaves a block that is not where the next line would be alone', () => {
    const far = manuscript();
    far[109] = block({ anchor: { pageRects: [[12, 93.84, 60, 517.8, 249.28 - MAX_GAP_PT - 1]] }, texts: [HEAD_109, '[66]', TAIL_109] });
    far[110] = block({ anchor: { pageRects: [[12, 93.84, 20, 515.21, 50]] }, texts: [HEAD_110, '[67]', TAIL_110] });
    expect(findSplitParagraphs(far, PDF).map((j) => [j.after, j.before])).toEqual([[109, 110]]);

    const beside = manuscript();
    beside[109] = block({ anchor: { pageRects: [[12, 520, 100, 700, 200]] }, texts: [HEAD_109, '[66]', TAIL_109] });
    expect(findSplitParagraphs(beside, PDF)).toEqual([]);

    const above = manuscript();
    above[109] = block({ anchor: { pageRects: [[12, 93.84, 500, 517.8, 530]] }, texts: [HEAD_109, '[66]', TAIL_109] });
    expect(findSplitParagraphs(above, PDF)).toEqual([]);

    const later = manuscript();
    later[109] = block({ anchor: { pageRects: [[14, 93.84, 690, 517.8, 717]] }, texts: [HEAD_109, '[66]', TAIL_109] });
    later[110] = block({ anchor: { pageRects: [[14, 93.84, 600, 515.21, 680]] }, texts: [HEAD_110, '[67]', TAIL_110] });
    expect(findSplitParagraphs(later, PDF).map((j) => [j.after, j.before])).toEqual([[109, 110]]);
  });

  it('walks only a PDF, and copes with an empty or missing structure', () => {
    expect(findSplitParagraphs(manuscript(), { processor: { type: 'epub' } })).toEqual([]);
    expect(findSplitParagraphs(manuscript(), null).length).toBe(2);
    expect(findSplitParagraphs([], PDF)).toEqual([]);
    expect(findSplitParagraphs(null, PDF)).toEqual([]);
    expect(findSplitParagraphs([null as any, block({ texts: ['x'] })], PDF)).toEqual([]);
  });

  it('reads a reader-realm array by index: a `map` or `find` that never calls back changes nothing', () => {
    const content = manuscript();
    const hostile = new Proxy(content, {
      get(target, prop, receiver) {
        if (prop === 'find' || prop === 'some' || prop === 'filter' || prop === 'map') return () => undefined;
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(findSplitParagraphs(hostile, PDF).length).toBe(2);
  });
});

describe('joinParagraphParts', () => {
  it('writes the part links through makeRef and returns the count', () => {
    const content = manuscript();
    const joins = findSplitParagraphs(content, PDF);
    const made: number[][] = [];
    const count = joinParagraphParts(content, joins, (ref) => {
      made.push(ref);
      return { ref };
    });
    expect(count).toBe(2);
    expect(content[108].nextPart).toEqual({ ref: [109] });
    expect(content[109].previousPart).toEqual({ ref: [108] });
    expect(content[109].nextPart).toEqual({ ref: [110] });
    expect(content[110].previousPart).toEqual({ ref: [109] });
    expect(made).toEqual([[109], [108], [110], [109]]);
    expect(content[110].nextPart).toBeUndefined();
  });

  it('skips a join whose blocks have gained a link since the sieve ran', () => {
    const content = manuscript();
    const joins: ParagraphJoin[] = findSplitParagraphs(content, PDF);
    content[109].previousPart = [7];
    expect(joinParagraphParts(content, joins, (ref) => ref)).toBe(1);
    expect(content[108].nextPart).toBeUndefined();
    expect(content[109].nextPart).toEqual([110]);
  });
});
