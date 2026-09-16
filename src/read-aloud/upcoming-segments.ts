import { liveReaderValue } from './reader-access';

export interface UpcomingSegmentsDeps {
  /** `Components.utils.isDeadWrapper`: a reader whose window is gone answers nothing (issue #116). */
  isDead(value: unknown): boolean;
  /** read-aloud/invisible-text.ts `isInvisibleSegment`: what the page does not show is not warmed. */
  isInvisible(segment: unknown): boolean;
  error(e: unknown): void;
}

/**
 * The texts of the playback segments after the one whose text is `text`,
 * in speaking order, for the prefetcher. The list is the *controller's*
 * `_segments` — the sentence-level sequence its own `_prefetchFrom`
 * iterates — NOT `manager.segments`, which is the coarser list the reader
 * reported (verified live: warming that list synthesized paragraphs the
 * player never asks for). The search is anchored at the controller's
 * playback position so a sentence that repeats earlier in the document
 * cannot pull the window backwards. Reader-side arrays are read with
 * plain loops only: their `map`/`indexOf` would run in the reader's
 * compartment, which may not call back into sandbox-owned values.
 *
 * Segments the page does not show are left out (read-aloud/invisible-text.ts):
 * the player refuses them, and warming one would synthesize the very audio
 * that refusal exists to avoid — in the background, where nothing is
 * playing to make the cost visible.
 *
 * The controller is reached through `liveReaderValue`: a synthesis result
 * that lands after its tab closed asks for the next segments of a reader
 * whose window is gone, and reading `_internalReader` then throws `can't
 * access dead object` (issue #116). That reader has nothing coming, so it
 * answers [] with no log; the catch below is for anything else.
 */
export function upcomingSegmentTexts(reader: any, text: string, count: number, deps: UpcomingSegmentsDeps): string[] {
  try {
    const controller = liveReaderValue(reader, deps.isDead, '_internalReader', '_readAloudManager', '_controller');
    const segments = controller?._segments;
    const length = typeof segments?.length === 'number' ? segments.length : 0;
    if (!length) return [];
    const position = controller._currentIndex ?? controller._position;
    const from = typeof position === 'number' && position >= 0 && position < length ? position : 0;
    let at = -1;
    for (let i = from; i < length; i++) {
      if (segments[i]?.text === text) {
        at = i;
        break;
      }
    }
    if (at === -1) return [];
    const out: string[] = [];
    for (let i = at + 1; i < length && out.length < count; i++) {
      const segment = segments[i];
      const t = segment?.text;
      if (typeof t === 'string' && t && !deps.isInvisible(segment)) out.push(t);
    }
    return out;
  } catch (e) {
    deps.error(e);
    return [];
  }
}
