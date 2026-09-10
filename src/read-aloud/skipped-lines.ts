/**
 * A page's first line that Zotero's document analysis threw out of the
 * reading order, put back before the sentences are cut (issue #87).
 *
 * Zotero reads a PDF from its structure pack (`.zotero-sdt-cache` beside
 * the attachment): the document worker's block classifier labels every
 * block `body`, `auxiliary` or `excluded` (`applyBlockClassifierPredictions`,
 * document-worker/worker.js:144026 in 10.0.2-beta.9) and links the parts
 * of a paragraph split across pages or columns by `nextPart` /
 * `previousPart` refs, skipping the excluded. `collectChainTexts`
 * (reader.js:71329) then walks the leaf blocks, drops every block whose
 * `flowClass` is `excluded` (71332) and joins each chain's text
 * (`getPartChain`, 70938) into the paragraph the sentences are cut from.
 *
 * The classifier takes a single line in the top band of a page for a
 * running head now and then — measured over the owner's library: 4 of 96
 * documents, every one a line continuing a sentence from the page before,
 * two of them starting with a number. Such a line is in no chain, so in
 * no sentence: the voice reads straight from the foot of one page to the
 * second line of the next, and the join sounds like a sentence.
 *
 * This module shadows `_loadSDT` on the reader-realm Reader's prototype
 * per tab (proto-patches.ts; `_loadSDT` is reader.js:84023, the one place
 * the structure is materialized for Read Aloud and Reading Mode alike) and,
 * when the structure resolves, walks its top-level blocks once: a block
 * that fails the `excluded` label by the five tests of `findSkippedLines`
 * is linked back into the chain that jumps over it and given the `body`
 * flow. Zotero's own code does the rest — the chain text, the sentence
 * cut, the rects on both pages (`_materializeSourcePositions`, 84105), the
 * highlights and the follow. The position mapper is built from the same
 * block objects and resolves spans by node, not by flow
 * (`PDFPositionMapper.textNodeSpansToSourcePosition`, 61868), so patching
 * after it exists is safe; `_loadSDT` caches its result, so the walk runs
 * once per tab and a second call finds nothing left to do.
 *
 * Compartments: the shadow runs exported into the reader's compartment,
 * `this` and the resolved structure arrive behind Xray wrappers and are
 * waived before they are read or written — an assignment through an Xray
 * lands on the wrapper. The ref arrays are built in the reader's window
 * (`cloneInto`): a sandbox array stored in a reader object is one the
 * reader may not read. The promise handed back is the reader window's own
 * (`new win.Promise`), the way the remote interface answers Zotero, and
 * the callbacks are exported, since the reader's promise calls them.
 */

import { createProtoPatches, type AnyFn } from './proto-patches';

/** A block of the structure pack as this module reads it; refs are index paths, `[15]` for a top-level block. */
export interface BlockLike {
  type?: unknown;
  flowClass?: unknown;
  /** Text nodes (`{ text }`) for a leaf block, child blocks for a container. */
  content?: unknown;
  /** `[pageIndex, x0, y0, x1, y1]` per line run, PDF points, y up. */
  pageRects?: unknown;
  anchor?: { pageRects?: unknown } | null;
  previousPart?: unknown;
  nextPart?: unknown;
}

/** A line the sieve found: the block's top-level index, the blocks the chain jumps from and to, its page and text. */
export interface SkippedLine {
  index: number;
  after: number;
  before: number;
  page: number;
  text: string;
}

export interface StructureMetadata {
  processor?: { type?: unknown } | null;
}

/** A single line: one rect no taller than this, in PDF points (a 12 pt line measures 11; two lines of 9 pt at single spacing about 22). */
export const MAX_LINE_HEIGHT_PT = 24;
/** And no longer than this: a full-width line of body text holds about 120 characters. */
export const MAX_LINE_CHARS = 200;
/** Prose has at least this much: a page number, a year or a section label does not. */
export const MIN_LINE_CHARS = 30;
export const MIN_LINE_WORDS = 5;
/** The line's left edge against the landing block's: the same column. */
export const COLUMN_TOLERANCE_PT = 12;

const ADDRESS = /https?:\/\/|www\.|doi\.org|\b10\.\d{4,}\/|\S@\S/i;
/** A sentence's end: a terminator, then any closing quotes or brackets, then nothing. */
const SENTENCE_END = /[.!?…][)\]}"'”’»]*\s*$/;

/** The text of a leaf block: its text nodes joined, read by index (a reader-side array's `map` may not take our callback). */
export function blockText(block: BlockLike | null | undefined): string {
  const nodes = block?.content as ArrayLike<{ text?: unknown } | null> | undefined;
  const length = nodes && typeof nodes.length === 'number' ? nodes.length : 0;
  let text = '';
  for (let i = 0; i < length; i++) {
    const t = nodes![i]?.text;
    if (typeof t === 'string') text += t;
  }
  return text;
}

/** Zotero's own notion (reader.js `isLeafBlock`): a block whose content is text nodes, or empty. */
export function isLeafBlock(block: BlockLike | null | undefined): boolean {
  if (!block || typeof block !== 'object') return false;
  const nodes = block.content as ArrayLike<{ text?: unknown } | null> | undefined;
  if (!nodes || typeof nodes.length !== 'number') return true;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node && typeof node.text !== 'string') return false;
  }
  return true;
}

/** The block's page rects, each `[pageIndex, x0, y0, x1, y1]` of finite numbers; null when there are none. */
export function pageRectsOf(block: BlockLike | null | undefined): number[][] | null {
  const raw = (block?.pageRects ?? block?.anchor?.pageRects) as ArrayLike<ArrayLike<unknown>> | undefined;
  const length = raw && typeof raw.length === 'number' ? raw.length : 0;
  if (!length) return null;
  const rects: number[][] = [];
  for (let i = 0; i < length; i++) {
    const r = raw![i];
    if (!r || typeof r.length !== 'number' || r.length < 5) return null;
    const rect: number[] = [];
    for (let j = 0; j < 5; j++) {
      const n = Number(r[j]);
      if (!Number.isFinite(n)) return null;
      rect.push(n);
    }
    rects.push(rect);
  }
  return rects;
}

/** Whether the text stops short of a sentence's end. Empty text continues nothing. */
export function endsMidSentence(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !SENTENCE_END.test(t);
}

function startsWith(text: string, re: RegExp): boolean {
  return re.test(text.trim());
}

/** Running prose, as against page furniture: long enough, words enough, no address, not mostly capitals. */
export function looksLikeProse(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_LINE_CHARS || t.length > MAX_LINE_CHARS) return false;
  if (t.split(/\s+/).length < MIN_LINE_WORDS) return false;
  if (ADDRESS.test(t)) return false;
  const letters = t.match(/\p{L}/gu) ?? [];
  const capitals = t.match(/\p{Lu}/gu) ?? [];
  return letters.length > 0 && capitals.length <= letters.length / 2;
}

/** What a running head keeps from page to page: every run of digits one mask, whitespace folded, case dropped. */
export function furnitureKey(text: string): string {
  return text.replace(/\p{Nd}+/gu, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A top-level ref `[n]` as its index, anything else null. */
function topIndex(ref: unknown): number | null {
  const r = ref as ArrayLike<unknown> | null;
  if (!r || typeof r.length !== 'number' || r.length !== 1) return null;
  const n = Number(r[0]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

interface Seen {
  block: BlockLike;
  leaf: boolean;
  excluded: boolean;
  text: string;
  rects: number[][] | null;
  page: number | null;
}

/**
 * The lines to put back, in reading order. Five tests, all of which a block
 * must pass (the sieve on the issue's 942 jumped blocks over 96 documents
 * gave the 4 real losses and 13 look-alikes on two of them; these are those
 * two, the geometry and the join):
 *
 * 1. a leaf block typed `paragraph` with `flowClass: 'excluded'`, one rect
 *    no taller than MAX_LINE_HEIGHT_PT, at most MAX_LINE_CHARS long;
 * 2. a chain jumps over it — a block A before it, not excluded, whose
 *    `nextPart` names a block B after it, a leaf and not excluded;
 * 3. it sits on B's page, above B, in B's column;
 * 4. its text reads as prose (`looksLikeProse`) and its digit-masked text
 *    is not that of a block on another page — the running head's signature;
 * 5. a join proves it belongs: A ends mid-sentence and the line starts with
 *    a lowercase letter or a digit, or A ends a sentence while the line
 *    ends mid-sentence and B starts with a lowercase letter. Several lines
 *    between A and B are judged as one run, first against A and last
 *    against B.
 *
 * Only a PDF's structure is walked; an EPUB's or a snapshot's is left alone.
 */
export function findSkippedLines(content: ArrayLike<BlockLike> | null | undefined, metadata?: StructureMetadata | null): SkippedLine[] {
  const type = metadata?.processor?.type;
  if (type !== undefined && type !== null && type !== 'pdf') return [];
  const length = content && typeof content.length === 'number' ? content.length : 0;
  if (!length) return [];

  const seen: Seen[] = [];
  const pagesByKey = new Map<string, Set<number>>();
  for (let i = 0; i < length; i++) {
    const block = content![i];
    const leaf = isLeafBlock(block);
    const text = leaf ? blockText(block) : '';
    const rects = block && typeof block === 'object' ? pageRectsOf(block) : null;
    const page = rects ? rects[0][0] : null;
    seen.push({ block, leaf, excluded: !!block && block.flowClass === 'excluded', text, rects, page });
    if (leaf && text.trim() && page !== null) {
      const key = furnitureKey(text);
      let pages = pagesByKey.get(key);
      if (!pages) pagesByKey.set(key, (pages = new Set()));
      pages.add(page);
    }
  }

  const found: SkippedLine[] = [];
  for (let a = 0; a < length; a++) {
    const A = seen[a];
    if (!A.leaf || A.excluded) continue;
    const b = topIndex(A.block.nextPart);
    if (b === null || b <= a + 1 || b >= length) continue;
    const B = seen[b];
    if (!B.leaf || B.excluded || !B.rects || B.page === null) continue;
    const landing = B.rects[0];
    const run: SkippedLine[] = [];
    for (let x = a + 1; x < b; x++) {
      const X = seen[x];
      // 1. a single short line the classifier itself calls a paragraph
      if (!X.excluded || !X.leaf || X.block.type !== 'paragraph' || !X.rects || X.rects.length !== 1) continue;
      const rect = X.rects[0];
      if (Math.abs(rect[4] - rect[2]) > MAX_LINE_HEIGHT_PT) continue;
      // 3. on B's page, above B, in B's column
      if (rect[0] !== B.page || rect[2] < landing[4] - 2 || Math.abs(rect[1] - landing[1]) > COLUMN_TOLERANCE_PT) continue;
      // 4. prose, and not a running head's text
      if (!looksLikeProse(X.text)) continue;
      const pages = pagesByKey.get(furnitureKey(X.text));
      if (pages && (pages.size > 1 || !pages.has(rect[0]))) continue;
      run.push({ index: x, after: a, before: b, page: rect[0], text: X.text });
    }
    if (!run.length) continue;
    // 5. the join, at either end of the run. B's lowercase start proves the
    // run only when A cannot explain it: with A mid-sentence too, Zotero's
    // own A → B join is as good an explanation, and a banner between them
    // would ride on it.
    const first = run[0].text;
    const last = run[run.length - 1].text;
    const fromA = endsMidSentence(A.text) && startsWith(first, /^[\p{Ll}\p{Nd}]/u);
    const intoB = !endsMidSentence(A.text) && endsMidSentence(last) && startsWith(B.text, /^\p{Ll}/u);
    if (fromA || intoB) found.push(...run);
  }
  return found;
}

/**
 * Links each run back into its chain — `A.nextPart → X₁`, `Xₙ.nextPart → B`,
 * the `previousPart`s the other way — and gives every line the `body`
 * flow. `makeRef` builds the ref arrays where the structure lives (the
 * reader's window); the blocks are written as given, so hand this the
 * waived structure. Returns how many lines were put back.
 */
export function restoreSkippedLines(content: ArrayLike<BlockLike>, lines: SkippedLine[], makeRef: (ref: number[]) => unknown): number {
  let count = 0;
  let i = 0;
  while (i < lines.length) {
    const { after, before } = lines[i];
    const run: SkippedLine[] = [];
    while (i < lines.length && lines[i].after === after && lines[i].before === before) run.push(lines[i++]);
    let previous = after;
    for (const line of run) {
      const block = content[line.index];
      content[previous].nextPart = makeRef([line.index]);
      block.previousPart = makeRef([previous]);
      block.flowClass = 'body';
      previous = line.index;
      count += 1;
    }
    content[previous].nextPart = makeRef([before]);
    content[before].previousPart = makeRef([previous]);
  }
  return count;
}

export interface SkippedLinesDeps {
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays: `this` and the resolved structure arrive behind Xray wrappers. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** A ref array built in the reader's own window (Components.utils.cloneInto). Optional for tests. */
  cloneInto?(reader: unknown, value: unknown): unknown;
  /** A promise of the reader's own window, the way the remote interface answers Zotero. Optional for tests. */
  readerPromise?(reader: unknown, executor: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void): unknown;
  /** A callback the reader's promise may call (Components.utils.exportFunction into the reader's window). Optional for tests. */
  exportTo?(reader: unknown, fn: AnyFn): AnyFn;
  /** Components.utils.isDeadWrapper. Optional for tests. */
  isDead?(value: unknown): boolean;
  /** The switch: `readAloud.restoreSkippedLines`, read when a structure lands. */
  enabled(): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface SkippedLines {
  /** Shadow `_loadSDT` on this reader's internal reader; true once it is. */
  attach(reader: any): boolean;
  /** For diagnostics.skippedLines(): the patch, the switch, whether the structure is loaded, and every line put back. */
  inspect(reader: any): Record<string, unknown>;
  patchCounts(): { total: number; live: number };
  dispose(): void;
}

interface Repair {
  at: number;
  restored: Array<{ index: number; after: number; before: number; page: number; chars: number; head: string }>;
}

function ownerOf(obj: unknown, name: string): any {
  let proto = obj && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  for (let depth = 0; depth < 8 && proto && proto !== Object.prototype; depth++) {
    if (Object.prototype.hasOwnProperty.call(proto, name) && typeof proto[name] === 'function') return proto;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

export function createSkippedLines(deps: SkippedLinesDeps): SkippedLines {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const patchedReaders = new WeakSet<object>();
  const repairs = new WeakMap<object, Repair>();
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const exportTo = (reader: unknown, fn: AnyFn): AnyFn => (deps.exportTo ? deps.exportTo(reader, fn) : fn);

  /** The walk, on the structure `_loadSDT` resolved; every throw is the plugin's to log, never Zotero's load to break. */
  function repair(reader: any, sdt: unknown): void {
    try {
      const structure = waive(waive(sdt)?.structure);
      if (!structure) return;
      const record: Repair = { at: Date.now(), restored: [] };
      if (deps.enabled()) {
        const content = waive(structure.content);
        const lines = findSkippedLines(content, waive(structure.metadata) ?? null);
        if (lines.length) {
          restoreSkippedLines(content, lines, (ref) => (deps.cloneInto ? deps.cloneInto(reader, ref) : ref));
          for (const line of lines) {
            record.restored.push({ index: line.index, after: line.after, before: line.before, page: line.page, chars: line.text.length, head: line.text.slice(0, 60) });
            deps.debug?.(`skipped line restored on page ${line.page + 1}: "${line.text}" (${line.text.length} chars) between blocks ${line.after} and ${line.before}`);
          }
        }
      }
      // Zotero caches the structure, so a later load resolves the same object and restores nothing: what the first walk did stays on record
      if (!repairs.has(reader) || record.restored.length) repairs.set(reader, record);
    } catch (e) {
      deps.error(e);
    }
  }

  /** The original's promise, with the walk between its resolution and Zotero's, as a promise of the reader's window. */
  function follow(reader: any, loading: any): unknown {
    const executor = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      waive(loading).then(
        exportTo(reader, (sdt: unknown) => {
          if (sdt) repair(reader, sdt);
          resolve(sdt);
        }),
        exportTo(reader, (e: unknown) => reject(e)),
      );
    };
    return deps.readerPromise ? deps.readerPromise(reader, exportTo(reader, executor)) : new Promise(executor);
  }

  function attach(reader: any): boolean {
    const internal = reader?._internalReader;
    if (!internal || typeof internal !== 'object') return false;
    if (patchedReaders.has(internal)) return true;
    try {
      const proto = ownerOf(internal, '_loadSDT');
      if (!proto) return false;
      patches.shadow(proto, '_loadSDT', (original) =>
        function (this: any) {
          return follow(reader, Reflect.apply(original, this, []));
        },
      );
      patchedReaders.add(internal);
      deps.debug?.('skipped lines attached to a reader');
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function inspect(reader: any): Record<string, unknown> {
    const internal = reader?._internalReader;
    if (!internal || typeof internal !== 'object') return { patched: false, enabled: safeEnabled(), loaded: false, restored: [] };
    const proto = ownerOf(internal, '_loadSDT');
    const patched = !!proto && patches.has(proto, '_loadSDT');
    let loaded = false;
    let excluded: number | null = null;
    try {
      const content = waive(waive(waive(internal._sdt)?.structure)?.content);
      loaded = !!content;
      if (content && typeof content.length === 'number') {
        excluded = 0;
        for (let i = 0; i < content.length; i++) if (content[i]?.flowClass === 'excluded') excluded += 1;
      }
    } catch (e) {
      deps.error(e);
    }
    const repair = repairs.get(reader);
    return { patched, enabled: safeEnabled(), loaded, excluded, restored: repair?.restored ?? [], at: repair?.at ?? null };
  }

  function safeEnabled(): boolean | null {
    try {
      return deps.enabled();
    } catch {
      return null;
    }
  }

  return {
    attach,
    inspect,
    patchCounts: () => patches.counts(),
    dispose: () => patches.restoreAll(),
  };
}
