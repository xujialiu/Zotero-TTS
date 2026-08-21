import type { Timestamp } from './providers/types';

export type TimedWord = {
  text: string;
  /** seconds */
  start: number;
  /** seconds */
  end: number;
};

/**
 * Fold a string to lowercase with per-code-point semantics, building an index map.
 *
 * `String.prototype.toLowerCase()` is not length-preserving: 'İ' (U+0130) becomes
 * 'i̇' (U+0069 U+0307), changing the string length. We must map indices in the
 * folded string back to positions in the original.
 *
 * Both haystack and needle must fold the same way (per code point, not whole-string)
 * to handle context-sensitive rules like Greek final sigma, where 'ΑΣ'.toLowerCase()
 * is 'ας' but per-code-point is 'ασ'.
 */
function foldWithIndex(source: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let originalIndex = 0;
  for (const ch of source) {
    // Iterates by code point; ch can be an astral pair
    const lower = ch.toLowerCase();
    // The lowercased char may be shorter or longer than ch
    for (let k = 0; k < lower.length; k++) {
      map.push(originalIndex);
    }
    folded += lower;
    originalIndex += ch.length; // 2 for astral code points
  }
  return { folded, map };
}

/**
 * Align the word text produced by the TTS engine back to the source text,
 * deriving character offsets.
 *
 * The engine only tells us "the word spoken at 1.2s is quick", not where
 * quick sits in the original text. We do a one-directional cursor search
 * here: it guarantees a repeated word lands on its own occurrence, and it
 * keeps the search O(n).
 *
 * A word that can't be found is dropped outright rather than guessed at —
 * a guessed highlight would drag the reader's eye to the wrong spot, which
 * is worse than no highlight at all.
 */
export function alignWordsToText(words: TimedWord[], sourceText: string): Timestamp[] {
  const { folded: haystackFolded, map: haystackMap } = foldWithIndex(sourceText);
  const out: Timestamp[] = [];
  let cursor = 0;

  for (const word of words) {
    const { folded: needleFolded } = foldWithIndex(word.text.trim());
    if (!needleFolded) continue;

    const at = haystackFolded.indexOf(needleFolded, cursor);
    if (at === -1) continue;

    const end = at + needleFolded.length;
    const charStart = haystackMap[at];
    const charEnd = end < haystackMap.length ? haystackMap[end] : sourceText.length;

    // Degenerate empty range is a guess; drop it
    if (charEnd <= charStart) continue;

    out.push({
      start: word.start,
      end: word.end,
      charStart,
      charEnd,
    });
    cursor = end;
  }

  return out;
}
