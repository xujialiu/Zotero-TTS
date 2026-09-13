import type { Timestamp } from './providers/types';

export const DEFAULT_BRACKET_PAIRS = '<> []';
export type BracketValidation =
  | { ok: true; pairs: Array<[string, string]> }
  | { ok: false; reason: 'empty' | 'entry' | 'duplicate'; entry: string };

export function validateBracketPairs(value: string): BracketValidation {
  const entries = value.trim().split(/\s+/u);
  if (!value.trim()) return { ok: false, reason: 'empty', entry: '' };
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const entry of entries) {
    const chars = Array.from(entry);
    if (chars.length !== 2 || chars[0] === chars[1] || !chars.every(c => /^[\p{P}\p{S}]$/u.test(c))) {
      return { ok: false, reason: 'entry', entry };
    }
    if (seen.has(entry)) return { ok: false, reason: 'duplicate', entry };
    seen.add(entry);
    pairs.push([chars[0], chars[1]]);
  }
  return { ok: true, pairs };
}

/** One pass preserves nested layers across different pair types and source offsets. */
export function prepareSpeechText(text: string, enabled: boolean, pairs = DEFAULT_BRACKET_PAIRS): { text: string; removed: number[] } {
  const unchanged = { text, removed: [] as number[] };
  if (!enabled) return unchanged;
  const parsed = validateBracketPairs(pairs);
  // Invalid externally restored settings must never cause guessed deletions.
  if (!parsed.ok) return unchanged;
  const openings = new Map<string, string[]>();
  const closings = new Set<string>();
  for (const [a, b] of parsed.pairs) {
    openings.set(a, [...(openings.get(a) ?? []), b]);
    closings.add(b);
  }
  const outside = /^[\p{P}\p{S}\s]*$/u;
  const stack: string[] = [];
  const removed: number[] = [];
  let open = 0, openWidth = 0, after = 0, index = 0;
  let onlyAngles = true;
  for (const char of text) {
    const i = index;
    index += char.length;
    const options = openings.get(char);
    if ((options || closings.has(char)) && char !== '<' && char !== '>') onlyAngles = false;
    if (stack.length && stack[stack.length - 1] === char) {
      stack.pop();
      if (!stack.length) {
        for (let j = 0; j < openWidth; j++) removed.push(open + j);
        for (let j = 0; j < char.length; j++) removed.push(i + j);
        after = index;
      }
    } else if (options) {
      // Shared opening symbols are valid configuration, but ambiguous text is preserved.
      if (options.length !== 1) return unchanged;
      if (!stack.length) {
        if (!outside.test(text.slice(after, i))) return unchanged;
        open = i; openWidth = char.length;
      }
      stack.push(options[0]);
    } else if (closings.has(char)) {
      return unchanged;
    }
  }
  if (stack.length) {
    // Retain the explicitly supported #94 comparison wrapper, without widening it.
    return onlyAngles && parsed.pairs.some(([a, b]) => a === '<' && b === '>')
      ? prepareAngleText(text, true) : unchanged;
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

/** Remove one outer layer per group, with only punctuation/spacing outside groups. */
function prepareAngleText(text: string, enabled: boolean): { text: string; removed: number[] } {
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
