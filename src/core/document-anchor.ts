/**
 * A COPY of OpenReader's `src/core/document/anchor.ts` (the copy rule: the plugin's
 * provider layer went to OpenReader the same way, its ADR 0013). The two
 * files must change in step: a Document Id is the join key of the shared
 * positions file (docs/spec/SYNC-FORMAT.md, section 6.3), and a byte of
 * difference between the two implementations names one book twice.
 */

/**
 * The **text anchor** half of a Reading Position (ADR 0008): a quotation of the
 * Utterance, with enough of the text around it to find it again, and the
 * matching that decides whether a locator landed where it claims.
 *
 * This file exists because of one failure mode. A CFI handed between this app
 * and the desktop plugin does not fail by raising an error — Zotero's CFI
 * generator and resolver disagree about text steps, and issues #3 and #4 showed
 * the result is a **silent resolution to the wrong node**. "A bookmark that
 * quietly lands three paragraphs away is worse than no bookmark." So text, not
 * the locator, is the arbiter of whether a place is the right place. The
 * renderer already works this way for the highlight; ADR 0008 makes it the rule
 * for positions too.
 *
 * ## Normalisation is load-bearing
 *
 * Anchors are normalised on **both** the storing and the matching side.
 *
 * Storing is NFC, because that is the form Zotero normalises EPUB text to, so
 * an anchor written here is directly comparable to one written there. The
 * plugin has already been bitten once by an exact comparison against a document
 * that happened to be NFD, and the failure was silent.
 *
 * Matching is stricter than a single normal form, and deliberately so. The
 * character search tries the anchor in NFC **and** in NFD, which keeps every
 * offset a true offset into the text that was searched — normalising a copy of
 * the document would produce offsets into the copy, and the renderer builds its
 * `Range` from offsets into the real text. Below that, matching falls to the
 * token keys of `core/align.ts`, which are NFKC-folded: NFKC subsumes canonical
 * composition, so an NFD document and an NFC anchor fold to the same key
 * without either side being rewritten. NFC, NFD and NFKC are all measured
 * working on this Hermes (notes/NOTES_2026-09-19.md).
 *
 * ## Why the aligner
 *
 * `core/align.ts` is 292 lines of longest-common-subsequence matching with
 * bridging, written for the same class of problem — a provider reporting words
 * that differ from the ones it was given. An anchor that no longer matches
 * exactly, because the document was re-flowed or re-punctuated, is the same
 * question asked of different inputs, and ADR 0008 names it as the reason this
 * design is cheap here.
 *
 * ## What is never used to find a place
 *
 * Counting Utterances. `sentencex` here and SDT in the desktop plugin segment
 * differently (ADR 0006), so "the 214th utterance" is a different place on each
 * side. Nothing in this directory takes an Utterance index.
 */

import { alignWords, tokenize, type TimedWord } from './align';

type Token = ReturnType<typeof tokenize>[number];

/**
 * How many code units of the document either side of the quotation are kept.
 *
 * Enough to separate two occurrences of a repeated sentence — a chapter
 * epigraph, a refrain, "He said nothing." — and short enough that an anchor per
 * Document stays a few hundred bytes in a file the owner syncs.
 */
export const ANCHOR_CONTEXT = 32;

/**
 * A quotation of the Utterance and its surroundings, all NFC.
 *
 * `prefix` and `suffix` are **only** used to choose between places that match
 * the quotation equally well. They never make a match where `exact` did not,
 * which keeps one thing deciding whether the text agrees and a different thing
 * deciding which of two agreements is meant.
 */
export interface TextAnchor {
  /** The Utterance itself. */
  exact: string;
  /** The document's text immediately before it. Empty when the quotation starts the text it came from. */
  prefix: string;
  /** The document's text immediately after it. */
  suffix: string;
}

/** The normal form an anchor is stored in. NFC, because that is what Zotero writes (ADR 0008). */
export function normalizeAnchorText(text: string): string {
  return text.normalize('NFC');
}

/**
 * An anchor for the characters `[start, end)` of `text`.
 *
 * `text` is the enclosing text the quotation came out of — for EPUB the Block,
 * whose own text the renderer reports verbatim — and `start`/`end` are UTF-16
 * code-unit offsets into it, the same coordinates `UtteranceSpan` and a Word
 * Timing use. The context comes from that same text, which is why this takes
 * the enclosing text rather than the quotation alone: an anchor built from the
 * Utterance by itself has no context and cannot tell two identical paragraphs
 * apart.
 */
export function createTextAnchor(text: string, start: number, end: number, context: number = ANCHOR_CONTEXT): TextAnchor {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return {
    exact: normalizeAnchorText(text.slice(from, to)),
    prefix: normalizeAnchorText(text.slice(Math.max(0, from - context), from)),
    suffix: normalizeAnchorText(text.slice(to, Math.min(text.length, to + context))),
  };
}

/**
 * How well a place's text agrees with an anchor.
 *
 * `exact` — the same characters, once the two normal forms are accounted for.
 * `aligned` — the same words, or nearly, found through `core/align.ts`. The
 * distinction is kept rather than collapsed into a boolean because it is what a
 * debug line needs to say, and because a caller that wants to rewrite a stored
 * locator should know which kind of agreement it is acting on.
 */
export type AnchorAgreement = 'exact' | 'aligned';

/** Where an anchor was found in a text, and on what evidence. */
export interface AnchorMatch {
  /** UTF-16 code-unit offsets into the text that was searched, half-open. */
  start: number;
  end: number;
  agreement: AnchorAgreement;
  /** The fraction of the anchor's own words that were found. 1 whenever every one of them was. */
  matched: number;
  /** How many words of `prefix` and `suffix` also matched, either side. This is what chooses between repeated text. */
  context: number;
  /** Another place in the same text matched exactly as well. Nothing may choose between them (philosophy rule 1). */
  ambiguous: boolean;
}

/**
 * Below this fraction of the anchor's words, the text is not called the same
 * Utterance. Chosen to be strict rather than generous: the cost of refusing is
 * that the owner resumes at the start of a document, and the cost of accepting
 * is the silent three-paragraph drift ADR 0008 exists to prevent.
 */
const MIN_MATCHED = 0.7;

/**
 * And of the matched region, this fraction has to be the anchor's own words.
 *
 * A longest common subsequence is a *subsequence*: without this, the handful of
 * common words in "and the of to" would pair across half a chapter and report a
 * span covering all of it. The density test is what makes an aligned match a
 * place rather than a smear.
 */
const MIN_DENSITY = 0.5;

/** A cap on how many identical occurrences are scored. Two are enough to know a text is ambiguous; this is only so a pathological anchor cannot walk a whole book. */
const MAX_OCCURRENCES = 64;

/**
 * Where `anchor` sits in `text`, or null when it is not there.
 *
 * Tried in order — the same characters, then the same words in the same order,
 * then nearly the same words — and the first kind that finds anything is the
 * only kind considered, so a weaker match never outranks a stronger one
 * somewhere else in the same text.
 *
 * Returns null, and never a guess, when the text does not hold the anchor. An
 * anchor whose quotation contains no letter or digit — a scene break written
 * `* * *` is an Utterance and is not Speakable — can only ever match by
 * characters, because there is nothing for the aligner to pair.
 */
export function matchAnchor(anchor: TextAnchor, text: string): AnchorMatch | null {
  if (!anchor.exact || !text) return null;
  const tokens = tokenize(text);

  let agreement: AnchorAgreement = 'exact';
  let spans = characterSpans(text, anchor.exact);

  if (!spans.length) {
    agreement = 'aligned';
    const keys = tokenize(anchor.exact).map((token) => token.key);
    if (!keys.length) return null;
    spans = runSpans(tokens, keys);
    if (!spans.length) {
      const span = alignedSpan(anchor.exact, text, tokens, keys.length);
      if (!span) return null;
      spans = [span];
    }
  }

  const prefixKeys = tokenize(anchor.prefix).map((token) => token.key);
  const suffixKeys = tokenize(anchor.suffix).map((token) => token.key);
  const scored: AnchorMatch[] = spans.map((span) => ({
    ...span,
    agreement,
    context: contextScore(tokens, prefixKeys, suffixKeys, span),
    ambiguous: false,
  }));
  scored.sort(compareMatches);
  const best = scored[0];
  return { ...best, ambiguous: scored.length > 1 && compareMatches(best, scored[1]) === 0 };
}

/**
 * Whether the quotation holds anything the word matching can work with — which
 * is the same question as whether it is **Speakable** (CONTEXT.md).
 *
 * An anchor that is not can still be found by an exact character match, and can
 * never be found by anything else, so a failed search on one means something
 * different from a failed search on an ordinary sentence. `resolveReadingPosition`
 * reports the difference rather than calling both "not found".
 */
export function anchorHasWords(anchor: TextAnchor): boolean {
  return tokenize(anchor.exact).length > 0;
}

/**
 * Which of two matches is the better place, for `Array.prototype.sort` —
 * negative when `a` is better.
 *
 * Stronger agreement first, then more of the anchor found, then more of the
 * context around it. Zero means nothing distinguishes them, which is the answer
 * that makes a position ambiguous rather than resolved.
 */
export function compareMatches(a: AnchorMatch, b: AnchorMatch): number {
  if (a.agreement !== b.agreement) return a.agreement === 'exact' ? -1 : 1;
  if (a.matched !== b.matched) return b.matched - a.matched;
  return b.context - a.context;
}

interface Span {
  start: number;
  end: number;
  matched: number;
}

/**
 * Every place the quotation appears as characters: the anchor as stored, then
 * composed, then decomposed.
 *
 * Both normal forms are searched for rather than one of them being imposed on
 * the document, and that is the load-bearing choice. Normalising the text would
 * produce a *copy* of it, and every offset found would be an offset into the
 * copy — while the renderer builds its `Range` from offsets into the real text.
 * Searching for the other spelling instead keeps them true (ADR 0008).
 *
 * `createTextAnchor` writes NFC, so the second attempt only fires for an anchor
 * that came from somewhere else, and the third for an NFC anchor against a
 * document that happens to be NFD — the exact pair ADR 0008 records as having
 * failed silently once already.
 */
function characterSpans(text: string, exact: string): Span[] {
  const tried = new Set<string>();
  for (const spelling of [exact, exact.normalize('NFC'), exact.normalize('NFD')]) {
    if (tried.has(spelling)) continue;
    tried.add(spelling);
    const found = occurrences(text, spelling);
    if (found.length) return found.map((start) => ({ start, end: start + spelling.length, matched: 1 }));
  }
  return [];
}

function occurrences(text: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let at = text.indexOf(needle); at >= 0 && out.length < MAX_OCCURRENCES; at = text.indexOf(needle, at + 1)) out.push(at);
  return out;
}

/** Every run of `tokens` whose keys are exactly the anchor's, in order: the same words, spelled or spaced differently. */
function runSpans(tokens: readonly Token[], keys: readonly string[]): Span[] {
  const out: Span[] = [];
  for (let i = 0; i + keys.length <= tokens.length && out.length < MAX_OCCURRENCES; i++) {
    let j = 0;
    while (j < keys.length && tokens[i + j].key === keys[j]) j++;
    if (j === keys.length) out.push({ start: tokens[i].start, end: tokens[i + keys.length - 1].end, matched: 1 });
  }
  return out;
}

/**
 * The one span `core/align.ts` pairs the anchor's words onto, when they are not
 * all there in order.
 *
 * Each of the anchor's tokens is handed to the aligner as a "spoken word" whose
 * time is its own index, which is exactly the shape the aligner was written
 * for: a list of words that may differ from the text, to be placed on that
 * text. What comes back is the char spans it paired, in the text's own
 * coordinates.
 */
function alignedSpan(exact: string, text: string, tokens: readonly Token[], total: number): Span | null {
  const words: TimedWord[] = tokenize(exact).map((token, i) => ({ text: exact.slice(token.start, token.end), start: i, end: i + 1 }));
  const report = alignWords(words, text);
  if (!report.timestamps.length) return null;
  const matched = report.paired / total;
  if (matched < MIN_MATCHED) return null;
  const start = report.timestamps[0].charStart;
  const end = report.timestamps[report.timestamps.length - 1].charEnd;
  const inside = tokens.filter((token) => token.start >= start && token.end <= end).length;
  if (!inside || report.paired / inside < MIN_DENSITY) return null;
  return { start, end, matched };
}

/**
 * How many words of the stored context also match, immediately before and
 * immediately after the span — counted backwards from the quotation on one side
 * and forwards on the other, stopping at the first word that differs.
 *
 * Counted in words rather than characters so that a document whose whitespace,
 * punctuation or normalisation differs still scores; the keys are
 * `core/align.ts`'s, so this is the same comparison the match itself used.
 */
function contextScore(tokens: readonly Token[], prefixKeys: readonly string[], suffixKeys: readonly string[], span: Span): number {
  const before: string[] = [];
  const after: string[] = [];
  for (const token of tokens) {
    if (token.end <= span.start) before.push(token.key);
    else if (token.start >= span.end) after.push(token.key);
  }
  let score = 0;
  for (let i = 1; i <= Math.min(before.length, prefixKeys.length); i++) {
    if (before[before.length - i] !== prefixKeys[prefixKeys.length - i]) break;
    score++;
  }
  for (let i = 0; i < Math.min(after.length, suffixKeys.length); i++) {
    if (after[i] !== suffixKeys[i]) break;
    score++;
  }
  return score;
}
