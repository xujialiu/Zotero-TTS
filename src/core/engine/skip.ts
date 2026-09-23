/**
 * Where a skip lands: Read Aloud's own rules (reader.js 39417-39459). A
 * sentence skip moves one segment, five with `accelerate`; a paragraph
 * skip moves to paragraph starts, and a skip back from the middle of a
 * paragraph first returns to that paragraph's start, so a paragraph counts
 * as one unit. Both stop at the ends of the document.
 *
 * Segments are the reader's array, walked by index (types.ts).
 */

import type { EngineSegment } from './types';

export type SkipGranularity = 'sentence' | 'paragraph';

const isParagraphStart = (segment: EngineSegment | undefined): boolean => segment?.anchor === 'paragraphStart';

/** The index a skip back from `position` lands on. */
export function skipBackTarget(segments: ArrayLike<EngineSegment>, position: number, granularity: string = 'paragraph', accelerate = false): number {
  let delta = accelerate ? 5 : 1;
  let target: number;
  if (granularity === 'sentence') {
    target = position - delta;
  } else {
    target = position;
    if (!isParagraphStart(segments[target])) delta++;
    for (let i = 0; i < delta; i++) {
      let previous = -1;
      for (let j = Math.min(target, segments.length) - 1; j >= 0; j--) {
        if (isParagraphStart(segments[j])) {
          previous = j;
          break;
        }
      }
      if (previous === -1) {
        target = 0;
        break;
      }
      target = previous;
    }
  }
  return Math.max(target, 0);
}

/** The index a skip ahead from `position` lands on. */
export function skipAheadTarget(segments: ArrayLike<EngineSegment>, position: number, granularity: string = 'paragraph', accelerate = false): number {
  const delta = accelerate ? 5 : 1;
  let target: number;
  if (granularity === 'sentence') {
    target = position + delta;
  } else {
    target = position;
    for (let i = 0; i < delta; i++) {
      let next = -1;
      for (let j = Math.max(target + 1, 0); j < segments.length; j++) {
        if (isParagraphStart(segments[j])) {
          next = j;
          break;
        }
      }
      if (next === -1) {
        target = segments.length - 1;
        break;
      }
      target = next;
    }
  }
  return Math.min(target, segments.length - 1);
}
