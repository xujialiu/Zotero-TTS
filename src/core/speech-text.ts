import type { Timestamp } from './providers/types';

/** Remove one enclosing ASCII pair, never punctuation within the text. */
export function prepareSpeechText(text: string, enabled: boolean): { text: string; removed: number[] } {
  if (enabled) {
    // Outside punctuation is retained, including quotes and a period after >.
    // The first < and last > define the single outer pair; never strip recursively.
    const open = text.indexOf('<');
    const close = text.lastIndexOf('>');
    const outside = /^[\p{P}\p{S}\s]*$/u;
    if (open >= 0 && close > open && outside.test(text.slice(0, open)) && outside.test(text.slice(close + 1))) {
      return { text: text.slice(0, open) + text.slice(open + 1, close) + text.slice(close + 1), removed: [open, close] };
    }
  }
  return { text, removed: [] };
}

/** Cached timestamps belong to the speech text. Return copies in document coordinates. */
export function restoreSpeechOffsets(timestamps: Timestamp[], removed: readonly number[]): Timestamp[] {
  if (!removed.length) return timestamps;
  const originalIndex = (index: number): number => {
    let original = index;
    for (const position of removed) if (position <= original) original++;
    return original;
  };
  const out: Timestamp[] = [];
  // Native replies may be reader-realm arrays: do not call map with a sandbox callback.
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const start = originalIndex(t.charStart);
    out.push({ start: t.start, end: t.end, charStart: start,
      charEnd: t.charEnd > t.charStart ? originalIndex(t.charEnd - 1) + 1 : start });
  }
  return out;
}
