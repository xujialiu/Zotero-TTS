/**
 * A paragraph Zotero's document analysis cut in the middle of a sentence,
 * joined back before the sentences are cut (issue #104).
 *
 * The document worker's block model now and then starts a new block on an
 * ordinary body line, and its part-linking rule (`canLinkParagraphs`,
 * document-worker/worker.js:155896 in 10.0.2-beta.9) rejoins two blocks
 * only when the first one's last line runs full (`lastLineRag` within 1 pt,
 * 155928) — which a block cut mid-paragraph never does, its last line being
 * short by definition. Read Aloud cuts sentences per chain
 * (`sdt_segments_buildSDTReadAloudSegments`, reader.js:71256), so the
 * sentence across the break is spoken as two, the second marked
 * `paragraphStart`. Measured over the owner's manuscript: 19 of 559
 * segments; 2 of 122 in the publisher's typeset version.
 *
 * This module is the pure sieve and the join; `skipped-lines.ts` runs them
 * in its `_loadSDT` shadow, after the skipped-line restore of #87, on the
 * same waived structure, and Zotero's own chain walk, sentence cut, rects,
 * highlights and follow do the rest. A join is written as the part link the
 * worker would have written: `A.nextPart = [B]`, `B.previousPart = [A]`.
 */

import { COLUMN_TOLERANCE_PT, blockText, endsMidSentence, isLeafBlock, pageRectsOf, type BlockLike, type StructureMetadata } from './skipped-lines';

/** Two blocks to join: the top-level indices, the page the first ends on, and both texts. */
export interface ParagraphJoin {
  after: number;
  before: number;
  page: number;
  textA: string;
  textB: string;
}

/**
 * How far below A's last line B's first line may sit on the same page, in
 * PDF points: a double-spaced line is 24–28 pt, a paragraph gap a little
 * more; a figure or a table between the two is far more.
 */
export const MAX_GAP_PT = 36;

/**
 * A continuation's start: a lowercase letter, a citation bracket (`[66]`,
 * `(12)`), or a short bracket group followed by a lowercase word —
 * `(Table 4) exhibited` was the one real split the first live run left
 * (2026-09-14). Never a capital, and never a bare digit.
 */
const CONTINUES = /^(?:\p{Ll}|[[(]\s*\p{Nd}|[[(][^\])]{1,40}[\])]\s*\p{Ll})/u;

function hasRef(value: unknown): boolean {
  return value !== undefined && value !== null;
}

interface Edges {
  page: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/** The edges of a block on one page: its first page for a landing block, its last page for a leaving one. */
function edgesOn(rects: number[][], last: boolean): Edges {
  const page = rects[last ? rects.length - 1 : 0][0];
  let x0 = Infinity;
  let x1 = -Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r[0] !== page) continue;
    x0 = Math.min(x0, r[1]);
    x1 = Math.max(x1, r[3]);
    bottom = Math.min(bottom, r[2]);
    top = Math.max(top, r[4]);
  }
  return { page, x0, x1, top, bottom };
}

/** Whether B sits where A's next line would be: directly below A in its column, at the top of the next column, or on the next page. */
function follows(a: Edges, b: Edges): boolean {
  if (b.page === a.page + 1) return true;
  if (b.page !== a.page) return false;
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const gap = a.bottom - b.top;
  if (overlap > 0 && gap >= -2 && gap <= MAX_GAP_PT) return true;
  return b.x0 >= a.x1 - COLUMN_TOLERANCE_PT && b.top >= a.bottom;
}

/**
 * The joins, in reading order. Every one passes four tests:
 *
 * 1. A and B are consecutive top-level leaf blocks typed `paragraph`,
 *    neither `excluded`, with only `excluded` blocks (a page number, a
 *    running head) between them; A has no `nextPart` and B no
 *    `previousPart`;
 * 2. A's text ends mid-sentence (`endsMidSentence` of #87);
 * 3. B's text starts with a lowercase letter, a citation bracket, or a
 *    short bracket group and then a lowercase word — never a capital, and
 *    never a bare digit, which opens real paragraphs too;
 * 4. B sits where A's next line would be (`follows`).
 *
 * Only a PDF's structure is walked. The array is read by index: a
 * reader-realm array's `find` / `some` / `filter` never call a chrome
 * callback.
 */
export function findSplitParagraphs(content: ArrayLike<BlockLike> | null | undefined, metadata?: StructureMetadata | null): ParagraphJoin[] {
  const type = metadata?.processor?.type;
  if (type !== undefined && type !== null && type !== 'pdf') return [];
  const length = content && typeof content.length === 'number' ? content.length : 0;
  const found: ParagraphJoin[] = [];
  for (let a = 0; a < length; a++) {
    const A = content![a];
    if (!A || typeof A !== 'object' || A.type !== 'paragraph' || A.flowClass === 'excluded' || !isLeafBlock(A) || hasRef(A.nextPart)) continue;
    // 1. the next block that is not excluded
    let b = a + 1;
    while (b < length && content![b] && typeof content![b] === 'object' && content![b].flowClass === 'excluded') b++;
    if (b >= length) break;
    const B = content![b];
    if (!B || typeof B !== 'object' || B.type !== 'paragraph' || !isLeafBlock(B) || hasRef(B.previousPart)) continue;
    // 2. and 3. the texts
    const textA = blockText(A);
    const textB = blockText(B);
    if (!endsMidSentence(textA) || !CONTINUES.test(textB.trim())) continue;
    // 4. the geometry
    const rectsA = pageRectsOf(A);
    const rectsB = pageRectsOf(B);
    if (!rectsA || !rectsB) continue;
    const edgesA = edgesOn(rectsA, true);
    if (!follows(edgesA, edgesOn(rectsB, false))) continue;
    found.push({ after: a, before: b, page: edgesA.page, textA, textB });
  }
  return found;
}

/**
 * Writes each join as a part link — `A.nextPart → B`, `B.previousPart → A` —
 * skipping a pair that has gained a link since the sieve ran. `makeRef`
 * builds the ref arrays where the structure lives (the reader's window);
 * the blocks are written as given, so hand this the waived structure.
 * Returns how many joins were written.
 */
export function joinParagraphParts(content: ArrayLike<BlockLike>, joins: ParagraphJoin[], makeRef: (ref: number[]) => unknown): number {
  let count = 0;
  for (let i = 0; i < joins.length; i++) {
    const { after, before } = joins[i];
    const A = content[after];
    const B = content[before];
    if (!A || !B || hasRef(A.nextPart) || hasRef(B.previousPart)) continue;
    A.nextPart = makeRef([before]);
    B.previousPart = makeRef([after]);
    count += 1;
  }
  return count;
}
