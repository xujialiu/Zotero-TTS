/**
 * The pure half of the shared position's two crossings, over Zotero's SDT
 * structure (docs/spec/SYNC-FORMAT.md, sections 6.4 and 6.5):
 *
 * - **Capture**: from the active Read Aloud segment to a shared item — the
 *   block's element path as the locator, the sentence as `anchor.exact`, and
 *   the same block's text either side as `prefix`/`suffix`.
 * - **Resume**: from a shared item written elsewhere to an SDT position Zotero
 *   starts at — the block the locator names first, then every block, matched
 *   by the anchor's text and never by the locator alone. An element CFI that
 *   names a container starts Zotero at the section's first sentence and one
 *   that names the wrong block does so silently (notes/NOTES_2026-09-21.md,
 *   17:18), which is why nothing here hands a locator to Zotero.
 *
 * Nothing here touches a reader. The SDT structure arrives as a snapshot —
 * `{ ref, path, text, starts }` per leaf block — produced by `walkSnapshot`,
 * which is written to run in either compartment (index.ts hands its source to
 * the reader window so a 124,908-block novel is walked at native speed, and
 * falls back to walking the wrapped structure from the sandbox). The facts it
 * relies on are Zotero's own `walkLeafBlocks`/`isLeafBlock` (reader.js
 * 59961-60010) and `EPUBPositionMapper._buildIndex` (reader.js 62560-62615):
 * a leaf block is one whose `content` holds only text nodes, its
 * `anchor.selectorMap` is its CFI path with the spine step, and a segment's
 * `position.start` is `[...blockRef, nodeIndex, charInNode]`.
 */

import { anchorHasWords, compareMatches, matchAnchor, type AnchorAgreement, type AnchorMatch, type TextAnchor } from '../core/document-anchor';
import { ANCHOR_CONTEXT, EPUB_LOCATOR_PATTERN, locatorOfPath, locatorPath, type SharedAnchor } from './xujialiu-positions-file';

/** One leaf block of the SDT structure, as much of it as a crossing needs. */
export interface BlockSnapshot {
  /** The index path into the structure's nested `content` arrays — the `ref` Zotero's own walker yields. */
  ref: number[];
  /** `anchor.selectorMap` with its assertions stripped, spine step included: `/6/34!/4/2/4/2/4`. */
  path: string;
  /** The block's text nodes concatenated; NFC and whitespace-collapsed, as the worker wrote them. */
  text: string;
  /** Where each of the block's `content` entries starts in `text`, or -1 for an entry that is not a text node. */
  starts: number[];
}

/**
 * Every leaf block of `structure` as a JSON string of `BlockSnapshot[]`, or
 * only the blocks related to `wantPath` (the same path, a descendant of it,
 * or an ancestor of it) when one is given.
 *
 * **Self-contained on purpose**: index.ts hands `walkSnapshot.toString()` to
 * the reader window's `Function`, so nothing here may reach outside the
 * function — no imports, no module helpers, no syntax esbuild would rewrite
 * into a helper call. Returns a string because that is what crosses a
 * compartment boundary without a wrapper.
 */
export function walkSnapshot(structure: unknown, wantPath: string | null): string {
  const out: BlockSnapshot[] = [];
  const related = (path: string): boolean => {
    if (wantPath === null) return true;
    if (path === wantPath) return true;
    const longer = path.length > wantPath.length ? path : wantPath;
    const shorter = longer === path ? wantPath : path;
    if (longer.indexOf(shorter) !== 0) return false;
    const next = longer.charAt(shorter.length);
    return next === '/' || next === ':' || next === '!';
  };
  const isLeaf = (node: { text?: unknown; content?: unknown }): boolean => {
    if (!node || typeof node.text === 'string') return false;
    if (!Array.isArray(node.content) || node.content.length === 0) return true;
    for (let i = 0; i < node.content.length; i++) {
      const child = node.content[i] as { text?: unknown } | null;
      if (child && typeof child.text !== 'string') return false;
    }
    return true;
  };
  const walk = (node: { text?: unknown; content?: unknown; anchor?: { selectorMap?: unknown } } | null, ref: number[]): void => {
    if (!node || typeof node.text === 'string') return;
    if (isLeaf(node)) {
      const map = node.anchor ? node.anchor.selectorMap : null;
      if (typeof map !== 'string') return;
      const path = map.replace(/\[[^\]]*\]/g, '');
      if (!related(path)) return;
      let text = '';
      const starts: number[] = [];
      const nodes = Array.isArray(node.content) ? node.content : [];
      for (let i = 0; i < nodes.length; i++) {
        const child = nodes[i] as { text?: unknown } | null;
        if (child && typeof child.text === 'string') {
          starts.push(text.length);
          text += child.text;
        } else {
          starts.push(-1);
        }
      }
      out.push({ ref, path, text, starts });
      return;
    }
    const content = Array.isArray(node.content) ? node.content : [];
    for (let i = 0; i < content.length; i++) walk(content[i] as never, ref.concat(i));
  };
  const top = structure && Array.isArray((structure as { content?: unknown }).content) ? ((structure as { content: unknown[] }).content) : [];
  for (let i = 0; i < top.length; i++) walk(top[i] as never, [i]);
  return JSON.stringify(out);
}

/** `walkSnapshot`, parsed. */
export function snapshotBlocks(structure: unknown, wantPath: string | null = null): BlockSnapshot[] {
  return JSON.parse(walkSnapshot(structure, wantPath)) as BlockSnapshot[];
}

/**
 * The one block a `ref` names, read straight out of the structure — a walk of
 * `ref.length` property reads, which is what makes capture cheap enough to
 * run on every sentence of a 124,908-block novel from the sandbox.
 */
export function blockAtRef(structure: unknown, ref: readonly number[]): BlockSnapshot | null {
  let node = structure as { content?: unknown; anchor?: { selectorMap?: unknown }; text?: unknown } | null;
  for (let at = 0; at < ref.length; at++) {
    if (!node || !Array.isArray(node.content)) return null;
    node = node.content[ref[at]] as typeof node;
  }
  if (!node || typeof node.text === 'string') return null;
  const map = node.anchor?.selectorMap;
  if (typeof map !== 'string') return null;
  const children = Array.isArray(node.content) ? (node.content as { text?: unknown }[]) : [];
  // Index loops throughout: `structure` may be a reader-compartment object
  // behind a wrapper, whose arrays never run a sandbox callback (MEMORY.md).
  // Zotero's leaf rule (reader.js 59961-59969): a block is a leaf only when
  // every child is a text node. A container holds blocks, not a sentence.
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && typeof child.text !== 'string') return null;
  }
  const starts: number[] = [];
  let text = '';
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && typeof child.text === 'string') {
      starts.push(text.length);
      text += child.text;
    } else {
      starts.push(-1);
    }
  }
  return { ref: [...ref], path: map.replace(/\[[^\]]*\]/g, ''), text, starts };
}

/**
 * A block path as the spec's locator wants it: element steps only. Zotero
 * anchors a paragraph made of bare text directly inside a container at the
 * text node itself (worker, `createTextNode` paragraphs), whose path ends in
 * an odd step; that step is dropped, because upstream epub.js resolved such
 * paths to the right node in 81 of 430 cases (notes, 17:18) and the anchor
 * finds the sentence inside the parent anyway. Null when what is left is not
 * a locator this spec allows.
 */
export function elementLocator(path: string): string | null {
  const bang = path.indexOf('!');
  if (bang < 0) return null;
  const steps = path.slice(bang + 1).split('/').filter((step) => step !== '');
  while (steps.length && Number(steps[steps.length - 1]) % 2 === 1) steps.pop();
  if (!steps.length) return null;
  const locator = locatorOfPath(`${path.slice(0, bang)}!/${steps.join('/')}`);
  return EPUB_LOCATOR_PATTERN.test(locator) ? locator : null;
}

/** What the sampler reads off `manager.activeSegment`: its text and its SDT position, copied out of the reader. */
export interface SegmentLike {
  text: string;
  start: readonly number[];
  end: readonly number[];
}

/** The shared half of a captured position: the locator and the anchor. The stamp is the caller's. */
export interface SharedCapture {
  locator: string;
  anchor: SharedAnchor;
}

/**
 * The offset of an SDT content point `[...ref, node, char]` in the block's
 * concatenated text, or null when the point is not in this block or names
 * something that is not a text node.
 */
export function offsetInBlock(block: BlockSnapshot, point: readonly number[]): number | null {
  const depth = block.ref.length;
  if (point.length !== depth + 2) return null;
  for (let i = 0; i < depth; i++) if (point[i] !== block.ref[i]) return null;
  const node = point[depth];
  const char = point[depth + 1];
  const start = block.starts[node];
  if (typeof start !== 'number' || start < 0 || !Number.isInteger(char) || char < 0) return null;
  return Math.min(start + char, block.text.length);
}

/**
 * The shared item's locator and anchor for the active segment of `block`
 * (spec 6.4, 6.5): the block's element path, the segment's own text as the
 * quotation, and up to 32 code units of the same block either side of where
 * the segment sits in it. Null when the segment does not start in this block
 * or the block has no locator the spec allows.
 */
export function captureShared(block: BlockSnapshot, segment: SegmentLike): SharedCapture | null {
  const locator = elementLocator(block.path);
  if (!locator) return null;
  const exact = segment.text.normalize('NFC');
  if (!exact) return null;
  const start = offsetInBlock(block, segment.start);
  if (start === null) return null;
  let end = offsetInBlock(block, segment.end);
  if (end === null || end < start) end = Math.min(block.text.length, start + exact.length);
  return {
    locator,
    anchor: {
      exact,
      prefix: block.text.slice(Math.max(0, start - ANCHOR_CONTEXT), start).normalize('NFC'),
      suffix: block.text.slice(end, Math.min(block.text.length, end + ANCHOR_CONTEXT)).normalize('NFC'),
    },
  };
}

/** An SDT position — `{ start: [...ref, node, char], end }` — Zotero's `startReadAloudAtPosition` takes as it stands (reader.js 84117-84127, `isSDTPosition` 79494). */
export interface SDTPosition {
  start: number[];
  end: number[];
}

/**
 * The SDT position for the characters `[start, end)` of `block`'s text: the
 * text node each offset falls in and the offset inside it. The end point
 * takes the last node that starts *before* it, as Zotero's own
 * `offsetToPoint(chain, offset, true)` does, so a sentence ending exactly at
 * a node boundary ends in that node rather than at the next one's start.
 */
export function sdtPositionAt(block: BlockSnapshot, start: number, end: number): SDTPosition | null {
  const nodeAt = (offset: number, strictlyBefore: boolean): number | null => {
    let found: number | null = null;
    for (let i = 0; i < block.starts.length; i++) {
      const at = block.starts[i];
      if (at < 0) continue;
      if (strictlyBefore ? at < offset : at <= offset) found = i;
    }
    return found;
  };
  const from = nodeAt(start, false);
  const to = end > start ? nodeAt(end, true) : from;
  if (from === null || to === null) return null;
  return { start: [...block.ref, from, start - block.starts[from]], end: [...block.ref, to, end - block.starts[to]] };
}

/** Why the stored locator was not used as it stood. */
export type LocatorProblem = 'locator-did-not-resolve' | 'text-disagreed';

export type SharedResolution =
  | {
      outcome: 'resolved';
      block: BlockSnapshot;
      /** Offsets into `block.text`, half-open. */
      start: number;
      end: number;
      agreement: AnchorAgreement;
      /** Null when the locator's own block held the sentence; otherwise why it was found elsewhere. */
      moved: LocatorProblem | null;
    }
  | { outcome: 'unresolved'; because: LocatorProblem; search: 'not-found' | 'ambiguous' | 'anchor-not-matchable' };

/**
 * Where a shared item's sentence is in this document (spec 6.5): the locator's
 * own block first — the leaf block with that path, or the leaves under it, or
 * the leaf it lies in — then every block. A tie is refused rather than
 * settled, because two places that match equally well are exactly the silent
 * wrong landing the anchor exists to prevent.
 */
export function resolveSharedItem(anchor: TextAnchor, locator: string, blocks: readonly BlockSnapshot[]): SharedResolution {
  const path = locatorPath(locator);
  const own = path === null ? [] : blocks.filter((block) => related(block.path, path));
  const inOwn = best(anchor, own);
  if (inOwn && !inOwn.tied) return { outcome: 'resolved', block: inOwn.block, start: inOwn.match.start, end: inOwn.match.end, agreement: inOwn.match.agreement, moved: null };
  const because: LocatorProblem = own.length ? 'text-disagreed' : 'locator-did-not-resolve';
  if (inOwn?.tied) return { outcome: 'unresolved', because, search: 'ambiguous' };
  const everywhere = best(anchor, blocks);
  if (!everywhere) return { outcome: 'unresolved', because, search: anchorHasWords(anchor) ? 'not-found' : 'anchor-not-matchable' };
  if (everywhere.tied) return { outcome: 'unresolved', because, search: 'ambiguous' };
  return { outcome: 'resolved', block: everywhere.block, start: everywhere.match.start, end: everywhere.match.end, agreement: everywhere.match.agreement, moved: because };
}

/** Whether two paths are the same block, or one lies inside the other, at a step boundary. */
function related(a: string, b: string): boolean {
  if (a === b) return true;
  const longer = a.length > b.length ? a : b;
  const shorter = longer === a ? b : a;
  if (!longer.startsWith(shorter)) return false;
  const next = longer.charAt(shorter.length);
  return next === '/' || next === ':' || next === '!';
}

/** The best-matching block of `candidates`, and whether another tied with it. */
function best(anchor: TextAnchor, candidates: readonly BlockSnapshot[]): { block: BlockSnapshot; match: AnchorMatch; tied: boolean } | null {
  let found: { block: BlockSnapshot; match: AnchorMatch } | null = null;
  let tied = false;
  for (const block of candidates) {
    const match = matchAnchor(anchor, block.text);
    if (!match) continue;
    if (!found) {
      found = { block, match };
      continue;
    }
    const order = compareMatches(match, found.match);
    if (order < 0) {
      found = { block, match };
      tied = false;
    } else if (order === 0) {
      tied = true;
    }
  }
  return found ? { ...found, tied } : null;
}
