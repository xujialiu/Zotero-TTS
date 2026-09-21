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

/**
 * Remove every configured pair wherever it encloses text, keeping the text
 * inside, every nesting layer included (issue #127: Fish takes a bracketed
 * word inside a sentence as an instruction and never says it). A bracket
 * without its partner stays. Positions are UTF-16 code units, ascending.
 */
export function prepareSpeechText(text: string, enabled: boolean, pairs = DEFAULT_BRACKET_PAIRS): { text: string; removed: number[] } {
  const unchanged = { text, removed: [] as number[] };
  if (!enabled) return unchanged;
  const parsed = validateBracketPairs(pairs);
  // Invalid externally restored settings must never cause guessed deletions.
  if (!parsed.ok) return unchanged;
  const list = parsed.pairs;
  const angle = (p: number) => list[p][0] === '<' && list[p][1] === '>';
  // The unpaired opening brackets of each pair; sign marks a < that reads as math.
  const pending = list.map((): Array<{ at: number; width: number; sign: boolean }> => []);
  const removed: number[] = [];
  let index = 0;
  for (const char of text) {
    const at = index;
    index += char.length;
    // A closing bracket takes the nearest unpaired opening one of its own
    // pair, whatever lies between, so crossing groups lose both pairs.
    let pair = -1, slot = -1, keep = false;
    for (let p = 0; p < list.length; p++) {
      const open = pending[p];
      if (list[p][1] !== char || !open.length) continue;
      let s = open.length - 1, sign = false;
      if (angle(p)) {
        // A pair whose two signs both read as math is a comparison and stays
        // (x < 5 and y > 3); a plain > falls back to a sign-like < (< 100 exp>).
        sign = isMathSign(text, at);
        s = lastSign(open, sign);
        if (s < 0 && !sign) s = open.length - 1;
        if (s < 0) continue;
      }
      if (pair < 0 || open[s].at > pending[pair][slot].at) { pair = p; slot = s; keep = sign; }
    }
    if (pair >= 0) {
      const [opening] = pending[pair].splice(slot, 1);
      if (!keep) {
        for (let j = 0; j < opening.width; j++) removed.push(opening.at + j);
        for (let j = 0; j < char.length; j++) removed.push(at + j);
      }
      continue;
    }
    const opens = list.flatMap(([a], p) => (a === char ? [p] : []));
    // Shared opening symbols are valid configuration, but ambiguous text is preserved.
    if (opens.length > 1) return unchanged;
    if (opens.length) pending[opens[0]].push({ at, width: char.length, sign: angle(opens[0]) && isMathSign(text, at) });
  }
  if (!removed.length) return unchanged;
  removed.sort((a, b) => a - b);
  const parts: string[] = [];
  let from = 0;
  for (const position of removed) {
    parts.push(text.slice(from, position));
    from = position + 1;
  }
  parts.push(text.slice(from));
  return { text: parts.join(''), removed };
}

/** x < 5, p<0.05, <=, ->: a < or > that reads as a math sign or an arrow, not a bracket. */
function isMathSign(text: string, at: number): boolean {
  const before = text[at - 1], after = text[at + 1];
  if (before === '=' || after === '=' || (text[at] === '>' && before === '-')) return true;
  if (before === undefined || after === undefined) return false;
  return (/\s/u.test(before) && /\s/u.test(after)) || (/[A-Za-z0-9]/.test(before) && /[A-Za-z0-9]/.test(after));
}

function lastSign(open: ReadonlyArray<{ sign: boolean }>, sign: boolean): number {
  for (let i = open.length - 1; i >= 0; i--) if (open[i].sign === sign) return i;
  return -1;
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
