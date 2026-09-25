import { describe, expect, it } from 'vitest';
import { gapBefore } from '../../../src/core/engine/gap';
import { LruMap } from '../../../src/core/engine/lru';
import { FetchTimer, readAheadOrder, runReadAhead } from '../../../src/core/engine/read-ahead';
import { skipAheadTarget, skipBackTarget } from '../../../src/core/engine/skip';
import type { EngineSegment, WordTiming } from '../../../src/core/engine/types';
import { untilNextWord, wordAt, wordAtPosition } from '../../../src/core/engine/words';
import { flush } from './harness';

/** `findLastIndex`, which the bundle uses and ES2022's typings lack. */
type ES2023Array = { findLastIndex(fn: (segment: EngineSegment) => boolean): number };

/** Read Aloud's skip, as the bundle writes it (reader.js 39417-39459), array methods and all. */
function zoteroSkip(segments: EngineSegment[], position: number, back: boolean, granularity: string, accelerate: boolean): number {
  let delta = accelerate ? 5 : 1;
  let newPosition: number;
  if (back) {
    if (granularity === 'sentence') {
      newPosition = position - delta;
    } else {
      newPosition = position;
      if (segments[newPosition]?.anchor !== 'paragraphStart') delta++;
      for (let i = 0; i < delta; i++) {
        const previousIndex = (segments.slice(0, newPosition) as unknown as ES2023Array).findLastIndex((s) => s.anchor === 'paragraphStart');
        if (previousIndex === -1) {
          newPosition = 0;
          break;
        }
        newPosition = previousIndex;
      }
    }
    return Math.max(newPosition, 0);
  }
  if (granularity === 'sentence') {
    newPosition = position + delta;
  } else {
    newPosition = position;
    for (let i = 0; i < delta; i++) {
      const nextIndex = segments.slice(newPosition + 1).findIndex((s) => s.anchor === 'paragraphStart');
      if (nextIndex === -1) {
        newPosition = segments.length - 1;
        break;
      }
      newPosition = nextIndex + newPosition + 1;
    }
  }
  return Math.min(newPosition, segments.length - 1);
}

describe('skip targets', () => {
  it('land where Read Aloud’s skips land, on every position of random documents', () => {
    let seed = 7;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let doc = 0; doc < 60; doc++) {
      const segments: EngineSegment[] = Array.from({ length: 1 + Math.floor(next() * 25) }, (_, i) => ({
        text: `s${i}`,
        anchor: i === 0 || next() < 0.3 ? 'paragraphStart' : null,
      }));
      for (let position = 0; position < segments.length; position++) {
        for (const granularity of ['sentence', 'paragraph']) {
          for (const accelerate of [false, true]) {
            expect(skipBackTarget(segments, position, granularity, accelerate)).toBe(zoteroSkip(segments, position, true, granularity, accelerate));
            expect(skipAheadTarget(segments, position, granularity, accelerate)).toBe(zoteroSkip(segments, position, false, granularity, accelerate));
          }
        }
      }
    }
  });

  it('default to a paragraph, one at a time', () => {
    const segments: EngineSegment[] = [{ text: 'a', anchor: 'paragraphStart' }, { text: 'b' }, { text: 'c', anchor: 'paragraphStart' }, { text: 'd' }];
    expect(skipAheadTarget(segments, 0)).toBe(2);
    expect(skipBackTarget(segments, 2)).toBe(0);
  });
});

describe('the word at a time', () => {
  const stamps: WordTiming[] = [
    { start: 0, end: 0.3, charStart: 0, charEnd: 3 },
    { start: 0.3, end: 0.6, charStart: 4, charEnd: 7 },
    { start: 0.6, end: 0.9, charStart: 8, charEnd: 12 },
  ];

  it('is the latest timing due, none before the first sound', () => {
    expect(wordAt(stamps, 0, -0.01)).toBe(null);
    expect(wordAt(stamps, 0, 0)).toBe(0);
    expect(wordAt(stamps, 0, 0.29)).toBe(0);
    expect(wordAt(stamps, 0, 0.3)).toBe(1);
    expect(wordAt(stamps, 0, 5)).toBe(2);
  });

  it('from an offset, skips what ended before it and fires what is under way at once, the later of a tie', () => {
    // At 0.45 the first ended (dropped), the second is under way (due at 0), the third due at 0.15
    expect(wordAt(stamps, 0.45, 0)).toBe(1);
    expect(wordAt(stamps, 0.45, 0.15)).toBe(2);
    // Two under way: both due at 0, the later wins, as timers of equal delay fire in order
    expect(wordAt([{ start: 0, end: 1, charStart: 0, charEnd: 1 }, { start: 0.1, end: 1, charStart: 2, charEnd: 3 }], 0.5, 0)).toBe(1);
  });

  it('says how much more audio until the next change', () => {
    expect(untilNextWord(stamps, 0, 0.1)).toBeCloseTo(0.2, 9);
    expect(untilNextWord(stamps, 0, -0.2)).toBeCloseTo(0.2, 9);
    expect(untilNextWord(stamps, 0, 0.6)).toBe(null);
    expect(untilNextWord(null, 0, 0)).toBe(null);
  });

  it('on demand, is the first timing that ends after the position, else the last', () => {
    expect(wordAtPosition(stamps, 0.1)).toBe(0);
    expect(wordAtPosition(stamps, 0.3)).toBe(1);
    expect(wordAtPosition(stamps, 7)).toBe(2);
    expect(wordAtPosition([], 1)).toBe(null);
  });
});

describe('read-ahead', () => {
  const doc: EngineSegment[] = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(200), 'd'.repeat(10), 'e'.repeat(40)].map((text) => ({ text }));

  it('takes the next segment first, then the riskiest, within three', () => {
    const timer = new FetchTimer();
    expect(readAheadOrder({ segments: doc, startIndex: 1, playingIndex: 0, remaining: 2, speed: 1, forwardStopIndex: null, timer })).toEqual([1, 2, 3]);
    // The next segment's head start is 10 s of risk: a far slower one after it can still go first
    timer.record(doc[0], 400 * 40);
    expect(readAheadOrder({ segments: doc, startIndex: 1, playingIndex: 0, remaining: 0.5, speed: 1, forwardStopIndex: null, timer })).toEqual([2, 1, 3]);
    expect(readAheadOrder({ segments: doc, startIndex: 4, playingIndex: 3, remaining: 1, speed: 1, forwardStopIndex: null, timer })).toEqual([4]);
    expect(readAheadOrder({ segments: doc, startIndex: 1, playingIndex: 0, remaining: 1, speed: 1, forwardStopIndex: 3, timer: new FetchTimer() })).toEqual([1, 2]);
    expect(readAheadOrder({ segments: doc, startIndex: 5, playingIndex: 4, remaining: 1, speed: 1, forwardStopIndex: null, timer })).toEqual([]);
  });

  it('learns fetch time per character, ignoring near-instant answers', () => {
    const timer = new FetchTimer();
    expect(timer.estimate(doc[0])).toBe(250 + 1.5 * 40);
    timer.record(doc[0], 800);
    expect(timer.perCharMs).toBe(20);
    timer.record(doc[0], 40);
    expect(timer.perCharMs).toBe(20);
    timer.record(doc[0], 400);
    expect(timer.perCharMs).toBe(0.25 * 10 + 0.75 * 20);
    timer.record({ text: '' }, 999);
    expect(timer.perCharMs).toBe(17.5);
  });

  it('runs two at a time, the second asked for first, and stops when told', async () => {
    const asked: number[] = [];
    const answers = new Map<number, () => void>();
    const fetch = (i: number) => {
      asked.push(i);
      return new Promise<void>((resolve) => answers.set(i, resolve));
    };
    let stopped = false;
    runReadAhead([5, 6, 7, 8], fetch, () => stopped);
    expect(asked).toEqual([6, 5]);
    answers.get(5)!();
    await flush();
    expect(asked).toEqual([6, 5, 7]);
    stopped = true;
    answers.get(6)!();
    answers.get(7)!();
    await flush();
    expect(asked).toEqual([6, 5, 7]);
  });
});

describe('LruMap', () => {
  it('drops the least recently used at capacity, a get counting as a use', () => {
    const map = new LruMap<number, string>(2);
    map.set(1, 'a').set(2, 'b');
    map.get(1);
    map.set(3, 'c');
    expect([...map.keys()]).toEqual([1, 3]);
    map.set(1, 'A');
    expect([...map.entries()]).toEqual([
      [3, 'c'],
      [1, 'A'],
    ]);
  });
});

describe('gapBefore', () => {
  const settings = { sentence: { enabled: true, ms: 300 }, paragraph: { enabled: false, ms: 0 } };
  it('waits nothing before a paragraph while its switch is off, and ignores the voice’s own delay', () => {
    expect(gapBefore({ anchor: 'paragraphStart' }, 1, settings)).toBe(0);
    expect(gapBefore({ anchor: null }, 2, settings)).toBe(150);
    expect(gapBefore(null, 1, settings)).toBe(300);
  });
});
