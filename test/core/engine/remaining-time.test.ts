import { describe, expect, it } from 'vitest';
import { ClipStore } from '../../../src/core/engine/clips';
import { FakeAudio, FakeFetch, VirtualClock, voice } from './harness';
import { RemainingTime } from '../../../src/core/engine/remaining-time';

const pauses = { sentence: { enabled: true, ms: 1000 }, paragraph: { enabled: true, ms: 2000 } };
describe('estimated remaining reading time', () => {
  it('uses known audio, learns pace for unread text, includes each gap once and scales with speed', () => {
    const time = new RemainingTime([
      { text: 'One two three.' }, { text: 'Four five six.' }, { text: 'Seven eight nine.', anchor: 'paragraphStart' },
    ]);
    expect(time.seconds(0, 3, 1, pauses)).toBe(6);
    time.record(0, 6);
    expect(time.seconds(0, 3, 1, pauses)).toBe(21);
    expect(time.seconds(0, 3, 2, pauses, 2)).toBe(9.5);
    expect(time.seconds(1, 2, 1, pauses)).toBe(6);
  });
});


it('handles mixed scripts and does not rescan text during repeated position or speed updates', () => {
  let reads = 0;
  const segments = Array.from({ length: 10000 }, () => ({ get text() { reads++; return '中文测试文字 One two three.'; } }));
  const time = new RemainingTime(segments);
  expect(time.seconds(9999, 10000, 1, pauses)).toBeCloseTo(2.2);
  const initialReads = reads;
  for (let i = 0; i < 1000; i++) time.seconds(i, 10000, 2, pauses);
  expect(reads).toBe(initialReads);
});

it('keeps measured silence without learning it as speaking pace, and rejects invalid ranges', () => {
  const time = new RemainingTime([{ text: 'One two three.' }, { text: 'Four five six.' }]);
  time.record(0, 0.001);
  expect(time.seconds(1, 2, 1, pauses)).toBe(1);
  expect(time.seconds(0, 2, 1, pauses)).toBeCloseTo(2.001);
  expect(time.seconds(-1, 2, 1, pauses)).toBeNull();
  expect(time.seconds(0, 3, 1, pauses)).toBeNull();
});


it('retains measured durations after decoded audio eviction without fetching for the estimate', async () => {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const segments = Array.from({ length: 40 }, () => ({ text: 'One two three.' }));
  const store = new ClipStore({ segments, voice: voice(), clock, fetch: fetch.fetch, decode: audio.decode });
  await store.get(0);
  const time = store.remainingTime;
  for (let i = 1; i < 40; i++) await store.get(i);
  expect(store.cached(0)).toBeUndefined();
  expect(time.seconds(0, 1, 1, pauses)).toBeCloseTo(0.7);
  expect(fetch.requests).toHaveLength(40);
});
