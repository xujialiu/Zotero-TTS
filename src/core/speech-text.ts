import type { Timestamp } from './providers/types';

/** Remove one outer layer per group, with only punctuation/spacing outside groups. */
export function prepareSpeechText(text: string, enabled: boolean): { text: string; removed: number[] } {
  const unchanged = { text, removed: [] as number[] };
  if (!enabled) return unchanged;
  const outside = /^[\p{P}\p{S}\s]*$/u;
  const removed: number[] = [];
  let depth = 0;
  let open = -1;
  let after = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') {
      if (depth === 0) {
        if (!outside.test(text.slice(after, i))) return unchanged;
        open = i;
      }
      depth++;
    } else if (text[i] === '>') {
      if (depth === 0) return unchanged;
      if (--depth === 0) {
        removed.push(open, i);
        after = i + 1;
      }
    }
  }
  if (depth !== 0) {
    // Preserve #94's single wrapper around a comparison: <a < b> -> a < b.
    // Do not use this fallback across sibling groups or multiple closing brackets.
    const close = text.indexOf('>');
    if (removed.length || close <= open || close !== text.lastIndexOf('>') || text.indexOf('<', close) !== -1
      || !outside.test(text.slice(close + 1))) return unchanged;
    removed.push(open, close);
    after = close + 1;
  }
  if (!removed.length || !outside.test(text.slice(after))) return unchanged;
  const parts: string[] = [];
  let from = 0;
  for (const position of removed) {
    parts.push(text.slice(from, position));
    from = position + 1;
  }
  parts.push(text.slice(from));
  return { text: parts.join(''), removed };
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
