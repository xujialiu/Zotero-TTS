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

const letter = /[\p{L}\p{N}\p{M}]/u;
const insideWord = (text: string, at: number) => at > 0 && at < text.length
  && /[\p{L}\p{N}\p{M}'’]/u.test(text[at - 1]) && /[\p{L}\p{N}\p{M}'’]/u.test(text[at]);

function reliable(text: string, list: ArrayLike<Timestamp> | null | undefined, duration: number): Timestamp[] | null {
  if (!list?.length || !Number.isFinite(duration) || duration <= 0) return null;
  const result: Timestamp[] = [];
  let time = 0, char = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t || !Number.isFinite(t.start) || !Number.isFinite(t.end) || t.start < time || t.end <= t.start
      || t.end > duration + 0.02 || !Number.isInteger(t.charStart) || !Number.isInteger(t.charEnd)
      || t.charStart < char || t.charEnd <= t.charStart || t.charEnd > text.length
      || insideWord(text, t.charStart) || insideWord(text, t.charEnd)) return null;
    // Missing spoken text or phrase-level timestamps cannot prove a next-word handoff.
    if (letter.test(text.slice(char, t.charStart)) || /[\p{L}\p{N}]\s+[\p{L}\p{N}]/u.test(text.slice(t.charStart, t.charEnd))) return null;
    result.push({ start: t.start, end: t.end, charStart: t.charStart, charEnd: t.charEnd });
    time = t.end;
    char = t.charEnd;
  }
  return letter.test(text.slice(char)) ? null : result;
}

/** The current word must finish; the new voice starts at the following word's own onset. */
export function wordHandoff(text: string, oldTimes: ArrayLike<Timestamp> | null | undefined,
  newTimes: ArrayLike<Timestamp> | null | undefined, progress: number, oldDuration: number, newDuration: number,
): { end: number; offset: number; charStart: number } | null {
  const old = reliable(text, oldTimes, oldDuration), next = reliable(text, newTimes, newDuration);
  if (!old || !next || !Number.isFinite(progress)) return null;
  const i = old.findIndex(t => t.end > progress);
  if (i < 0 || i + 1 >= old.length) return null;
  const following = old[i + 1];
  const target = next.find(t => t.charStart === following.charStart && t.charEnd === following.charEnd);
  return target ? { end: old[i].end, offset: target.start, charStart: target.charStart } : null;
}
