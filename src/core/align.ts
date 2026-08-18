import type { Timestamp } from './providers/types';

export type TimedWord = {
  text: string;
  /** 秒 */
  start: number;
  /** 秒 */
  end: number;
};

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
  const haystack = sourceText.toLowerCase();
  const out: Timestamp[] = [];
  let cursor = 0;

  for (const word of words) {
    const needle = word.text.toLowerCase().trim();
    if (!needle) continue;

    const at = haystack.indexOf(needle, cursor);
    if (at === -1) continue;

    out.push({
      start: word.start,
      end: word.end,
      charStart: at,
      charEnd: at + needle.length,
    });
    cursor = at + needle.length;
  }

  return out;
}
