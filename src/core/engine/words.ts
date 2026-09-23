/**
 * Which word is being spoken: the index into a clip's word timings that
 * Read Aloud's manager highlights (`activeTimestampIndex`).
 *
 * Read Aloud's engine arms one wall-clock timer per timing when a clip
 * starts: every timing that ends after the start offset fires at
 * `max(0, start − offset) ÷ rate` seconds, so the ones already under way
 * fire at once, in order, and each sets the index (reader.js 40087-40103).
 * The Engine keeps that choice of word but reads the time off the audio
 * clock instead (issue #133, a departure settled 2026-09-23): the context's
 * time since the source started, less the output latency, times the rate —
 * so the word waits for the sound on a Bluetooth headset, and stops when
 * the sound stalls. `elapsed` below is that span, in seconds of the
 * unstretched audio; before the first sound it is negative, and no word of
 * the clip is lit yet.
 *
 * Timings are the reader's objects, read by index (types.ts).
 */

import type { WordTiming } from './types';

/** When timing `t` fires after a start at `offset`, in seconds of unstretched audio; null when it never does (it ended before the offset). */
function dueAt(t: WordTiming | undefined, offset: number): number | null {
  if (!t) return null;
  const start = Number(t.start);
  const end = Number(t.end);
  // Read Aloud's engine skips `timestamp.end <= offset`; anything else fires,
  // at once when its start is already behind (reader.js 40090-40093)
  if (!(end > offset)) return null;
  const due = Math.max(0, start - offset);
  return Number.isNaN(due) ? null : due;
}

/**
 * The index Read Aloud's timers would have set last once `elapsed` seconds
 * of unstretched audio have played from `offset`: the latest-due timing,
 * the later one of a tie, as timers of equal delay fire in the order they
 * were armed. Null while none is due.
 */
export function wordAt(timings: ArrayLike<WordTiming> | null | undefined, offset: number, elapsed: number): number | null {
  const length = timings ? Number(timings.length) || 0 : 0;
  let best: number | null = null;
  let bestDue = -Infinity;
  for (let i = 0; i < length; i++) {
    const due = dueAt(timings![i], offset);
    if (due === null || due > elapsed) continue;
    if (due >= bestDue) {
      bestDue = due;
      best = i;
    }
  }
  return best;
}

/** How much more unstretched audio must play before `wordAt` can answer differently; null when no timing is still to come. */
export function untilNextWord(timings: ArrayLike<WordTiming> | null | undefined, offset: number, elapsed: number): number | null {
  const length = timings ? Number(timings.length) || 0 : 0;
  let next: number | null = null;
  for (let i = 0; i < length; i++) {
    const due = dueAt(timings![i], offset);
    if (due === null || due <= elapsed) continue;
    if (next === null || due < next) next = due;
  }
  return next === null ? null : next - elapsed;
}

/**
 * The word at a playback position, as `syncActiveWordToPlayback` picks it
 * when the highlight switches to Word (reader.js 40122-40137): the first
 * timing that ends after the position, else the last. Null without timings.
 */
export function wordAtPosition(timings: ArrayLike<WordTiming> | null | undefined, position: number): number | null {
  const length = timings ? Number(timings.length) || 0 : 0;
  if (!length) return null;
  for (let i = 0; i < length; i++) {
    if (position < Number(timings![i]?.end)) return i;
  }
  return length - 1;
}
