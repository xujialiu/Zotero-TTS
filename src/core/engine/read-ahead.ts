/**
 * The order Read Aloud's engine fetches ahead in (`_prefetchFrom`,
 * reader.js 40258-40301), which the Engine keeps for every voice: up to
 * three segments past the one that just started, the next one first, the
 * rest by how likely each is to arrive late — its estimated fetch time
 * against the time left until it plays, less 50 ms per segment of
 * distance. Fetch time is learned per character as the session goes
 * (`FetchTimer`, reader.js 40367-40375, 40391-40396).
 */

import type { EngineSegment } from './types';

/** How far ahead, and how many at once (reader.js 40259-40260). */
export const READ_AHEAD_WINDOW = 3;
export const READ_AHEAD_CONCURRENCY = 2;

const EST_PLAYBACK_CHARS_PER_SECOND = 16;
const EXP_MOVING_AVERAGE_ALPHA = 0.25;
const LATENCY_PADDING_MS = 250;
const DEFAULT_MS_PER_CHAR = 1.5;

const textLength = (segment: EngineSegment | undefined): number => (typeof segment?.text === 'string' ? segment.text.length : 0);

/** Seconds a segment will take to play at `speed` (reader.js 40386-40390). */
export function estimatePlaybackTime(segment: EngineSegment | undefined, speed: number): number {
  const secsAt1x = textLength(segment) / EST_PLAYBACK_CHARS_PER_SECOND;
  return Math.max(0.2, secsAt1x / speed);
}

/** An exponential moving average of fetch milliseconds per character, ignoring near-instant answers (cache hits). */
export class FetchTimer {
  perCharMs: number | null = null;

  record(segment: EngineSegment | undefined, elapsedMs: number): void {
    const length = textLength(segment);
    if (!length) return;
    const perChar = elapsedMs / length;
    if (this.perCharMs === null) {
      this.perCharMs = perChar;
    } else if (perChar > this.perCharMs * 0.1) {
      this.perCharMs = EXP_MOVING_AVERAGE_ALPHA * perChar + (1 - EXP_MOVING_AVERAGE_ALPHA) * this.perCharMs;
    }
  }

  /** Estimated milliseconds to fetch a segment (reader.js 40391-40396). */
  estimate(segment: EngineSegment | undefined): number {
    return LATENCY_PADDING_MS + (this.perCharMs ?? DEFAULT_MS_PER_CHAR) * textLength(segment);
  }
}

export interface ReadAheadInput {
  segments: ArrayLike<EngineSegment>;
  /** The first index to fetch: one past the segment that just started. */
  startIndex: number;
  /** The segment playing: the last one that started, else the position. */
  playingIndex: number;
  /** Seconds left of the clip playing. */
  remaining: number;
  speed: number;
  /** `forwardStopIndex`, when the run has one. */
  forwardStopIndex: number | null;
  timer: FetchTimer;
}

/** The indices to fetch, in the order Read Aloud's engine takes them off its list. */
export function readAheadOrder(input: ReadAheadInput): number[] {
  const { segments, startIndex, playingIndex, remaining, speed, timer } = input;
  const endIndex = Math.min(startIndex + READ_AHEAD_WINDOW, input.forwardStopIndex ?? segments.length);
  if (startIndex >= endIndex) return [];
  const prefixSums = [0];
  for (let i = playingIndex + 1; i < endIndex; i++) {
    prefixSums.push(prefixSums[prefixSums.length - 1] + estimatePlaybackTime(segments[i], speed));
  }
  const timeUntilStart = (i: number): number => {
    if (i <= playingIndex) return 0;
    const offset = i - (playingIndex + 1);
    const sumNext = offset >= 0 && offset < prefixSums.length ? prefixSums[offset] : 0;
    return (remaining + sumNext) * 1000;
  };
  const candidates: { index: number; score: number }[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const risk = timer.estimate(segments[i]) - timeUntilStart(i);
    let score = risk - (i - playingIndex) * 50;
    if (i === playingIndex + 1) score += 10_000;
    candidates.push({ index: i, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.index);
}

/**
 * Run `fetch` over `order` the way Read Aloud's `keepFetching` does
 * (reader.js 40302-40327), two at a time — including its quirk that the
 * second of a pair is asked for before the first, since the first call
 * starts the second before it awaits its own. A slow server that answers one
 * request at a time sees exactly the sequence it sees today. `stopped` ends
 * the run between fetches.
 */
export function runReadAhead(order: number[], fetch: (index: number) => Promise<unknown>, stopped: () => boolean): void {
  const candidates = [...order];
  let inProgress = 0;
  const keepFetching = async (): Promise<void> => {
    if (stopped() || !candidates.length) return;
    const index = candidates.shift()!;
    inProgress++;
    if (inProgress < READ_AHEAD_CONCURRENCY) void keepFetching();
    try {
      await fetch(index);
    } catch {
      // Ignored: playback asks again when it gets there
    } finally {
      inProgress--;
    }
    if (inProgress < READ_AHEAD_CONCURRENCY) void keepFetching();
  };
  while (inProgress < READ_AHEAD_CONCURRENCY && candidates.length) void keepFetching();
}
