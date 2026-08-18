import type { Timestamp } from './providers/types';

export type TimedWord = {
  text: string;
  /** 秒 */
  start: number;
  /** 秒 */
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
 * 把 TTS 引擎给出的词文本对齐回原文，求出字符偏移。
 *
 * 引擎只告诉我们"第 1.2 秒念的是 quick"，不告诉我们 quick 在原文
 * 哪个位置。这里用一个单向游标顺序查找：既保证重复词落在自己那次
 * 出现上，也保证 O(n)。
 *
 * 找不到的词直接丢弃而不是猜位置 —— 猜出来的高亮会把读者的视线
 * 拉到错误的地方，比没有高亮更糟。
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
