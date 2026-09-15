import { tokenize } from './align';
import type { Timestamp } from './providers/types';

export interface MenuVoice { id: string; label?: string; creditsPerMinute?: number | null }

/** Match Zotero's buildVoiceOptions, without invoking callbacks in a reader realm. */
export function playerVoices<T extends MenuVoice>(list: ArrayLike<T> | null | undefined): T[] {
  const result: T[] = [];
  for (let i = 0; i < (list?.length ?? 0); i++) if (list![i]?.id) result.push(list![i]);
  return result.sort((a, b) => (a.creditsPerMinute ?? -1) - (b.creditsPerMinute ?? -1));
}

export function adjacentVoice<T extends MenuVoice>(list: readonly T[], selected: string, direction: -1 | 1): T | null {
  if (list.length < 2) return null;
  const index = list.findIndex(v => v.id === selected);
  return index < 0 ? null : list[(index + direction + list.length) % list.length];
}

export type WordBoundary = { end: number; offset: number; charStart: number };
export type WordDecision = { boundary: WordBoundary | null; reason: string };
type Span = { start: number; end: number };
type Stamp = Timestamp & { span: Span | null };
const TIME_EPSILON = 1e-9; // Floating-point equality, not an estimated speech boundary.

/** Copy realm data and check ordering, without requiring complete sentence coverage. */
function ordered(list: ArrayLike<Timestamp>, tokens: readonly Span[], length: number): Stamp[] | null {
  const result: Stamp[] = [];
  let lastStart = -Infinity, lastChar = -1;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    // Kokoro can place the first onset before sample zero. Preserve that
    // alignment; only the eventual seek offset must be inside playable audio.
    if (!t || !Number.isFinite(t.start) || !Number.isFinite(t.end) || t.end < t.start
      || t.start < lastStart || !Number.isInteger(t.charStart) || !Number.isInteger(t.charEnd)
      || t.charStart < lastChar || t.charStart < 0 || t.charEnd <= t.charStart || t.charEnd > length) return null;
    const covered = tokens.filter(token => token.end > t.charStart && token.start < t.charEnd);
    const first = covered[0], last = covered[covered.length - 1];
    // A whole token can include punctuation in one voice and exclude it in another.
    // Grouped tokens are valid at their outside edges; never cut inside one.
    const span = first && first.start >= t.charStart && last.end <= t.charEnd
      ? { start: first.start, end: last.end } : null;
    result.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd, span });
    lastStart = t.start; lastChar = t.charStart;
  }
  return result;
}

/** No timestamp may put text from the other side of this cut on its audio side. */
function separates(list: readonly Stamp[], char: number, time: number): boolean {
  return list.every(t => {
    const start = t.span?.start ?? t.charStart, end = t.span?.end ?? t.charEnd;
    if (end <= char) return t.end <= time + TIME_EPSILON;
    if (start >= char) return t.start >= time - TIME_EPSILON;
    return false;
  });
}

/** Find the earliest provable shared text boundary, not a perfect timing map of the whole sentence. */
export function inspectWordHandoff(text: string, oldTimes: ArrayLike<Timestamp> | null | undefined,
  newTimes: ArrayLike<Timestamp> | null | undefined, progress: number, oldDuration: number, newDuration: number,
): WordDecision {
  const none = (reason: string): WordDecision => ({ boundary: null, reason });
  if (!oldTimes?.length) return none('no-old-timings');
  if (!newTimes?.length) return none('no-new-timings');
  if (!Number.isFinite(progress) || !Number.isFinite(oldDuration) || !Number.isFinite(newDuration)
    || oldDuration <= 0 || newDuration <= 0) return none('invalid-audio-clock');
  const tokens = tokenize(text);
  const old = ordered(oldTimes, tokens, text.length), next = ordered(newTimes, tokens, text.length);
  if (!old || !next) return none('invalid-timing-order');
  let remaining = false;
  for (const current of old) {
    if (!current.span || current.end <= current.start || current.end <= progress || current.end > oldDuration) continue;
    const following = tokens.find(token => token.start >= current.span!.end);
    if (!following) continue;
    remaining = true;
    // The old voice must actually locate the following token: an unaligned gap
    // at this cut is unsafe, though an unrelated gap later is harmless.
    if (!old.some(t => t.span?.start === following.start && t.start + TIME_EPSILON >= current.end)) continue;
    if (!separates(old, following.start, current.end)) continue;
    for (const target of next) {
      if (target.span?.start !== following.start || target.start < 0 || target.start >= newDuration || target.end <= target.start) continue;
      if (!separates(next, following.start, target.start)) continue;
      return { boundary: { end: current.end, offset: target.start, charStart: following.start }, reason: 'shared-word-boundary' };
    }
  }
  return none(remaining ? 'no-shared-word-boundary' : 'no-remaining-word-boundary');
}

export function wordHandoff(text: string, oldTimes: ArrayLike<Timestamp> | null | undefined,
  newTimes: ArrayLike<Timestamp> | null | undefined, progress: number, oldDuration: number, newDuration: number,
): WordBoundary | null {
  return inspectWordHandoff(text, oldTimes, newTimes, progress, oldDuration, newDuration).boundary;
}

/** Resume only after the exact paused word; grouped speech has no safe next-word offset. */
export function pausedWordHandoff(text: string, oldTimes: ArrayLike<Timestamp> | null | undefined,
  newTimes: ArrayLike<Timestamp> | null | undefined, progress: number, oldDuration: number, newDuration: number,
): WordBoundary | null {
  if (!oldTimes?.length || !Number.isFinite(progress)) return null;
  const tokens = tokenize(text);
  const old = ordered(oldTimes, tokens, text.length);
  if (!old) return null;
  let current: Stamp | undefined;
  for (const t of old) if (t.start <= progress) current = t;
  if (!current?.span || !tokens.some(t => t.start === current!.span!.start && t.end === current!.span!.end)) return null;
  const boundary = wordHandoff(text, oldTimes, newTimes, current.start - TIME_EPSILON, oldDuration, newDuration);
  return boundary?.end === current.end ? boundary : null;
}
