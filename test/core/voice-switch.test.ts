import { describe, expect, it } from 'vitest';
import { playerVoices, adjacentVoice, wordHandoff } from '../../src/core/voice-switch';
import { alignWordsToText } from '../../src/core/align';
import { readFileSync } from 'node:fs';

const text = 'One two three.';
const old = [
  { start: 0, end: 0.4, charStart: 0, charEnd: 3 },
  { start: 0.5, end: 0.9, charStart: 4, charEnd: 7 },
  { start: 1, end: 1.4, charStart: 8, charEnd: 13 },
];
const next = old.map(t => ({ ...t, start: t.start * 2, end: t.end * 2 }));
const captured = JSON.parse(readFileSync(new URL('../fixtures/voice-switch/kokoro-negative-start.json', import.meta.url), 'utf8'));
describe('voice list and text-aligned handoff', () => {
  it('copies realm arrays by index and preserves order within each cost group', () => {
    const list = Object.assign([{ id: 'a', creditsPerMinute: 2 }, { id: 'b' }, { id: 'c' }, { id: 'd', creditsPerMinute: 1 }],
      { filter: () => [], map: () => [], sort: () => [] });
    expect(playerVoices(list).map(v => v.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(list[0].id).toBe('a');
    expect(adjacentVoice(playerVoices(list), 'b', -1)?.id).toBe('a');
    expect(adjacentVoice(playerVoices(list), 'a', 1)?.id).toBe('b');
    expect(adjacentVoice([], 'a', 1)).toBeNull();
    expect(adjacentVoice([{ id: 'a' }], 'a', 1)).toBeNull();
    expect(adjacentVoice([{ id: 'a' }, { id: 'b' }], 'missing', 1)).toBeNull();
  });
  it('matches text offsets, not equal playback seconds or timestamp indices', () => {
    expect(wordHandoff(text, old, next, 0.15, 2, 4)).toEqual({ end: 0.4, offset: 1, charStart: 4 });
    expect(wordHandoff(text, old, next, 0.6, 2, 4)).toEqual({ end: 0.9, offset: 2, charStart: 8 });
    expect(wordHandoff(text, old, next, 1.2, 2, 4)).toBeNull();
  });
  it('refuses stand-ins and unsafe cuts, but can use a later safe word boundary', () => {
    expect(wordHandoff(text, [{ start: 0, end: 86400, charStart: 0, charEnd: text.length }], next, 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, [], 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, next.map((t, i) => i === 1 ? { ...t, charStart: 5 } : t), 0.1, 2, 4))
      .toEqual({ end: 0.9, offset: 2, charStart: 8 });
    expect(wordHandoff(text, old.map((t, i) => i === 1 ? { ...t, start: 0.3 } : t), next, 0.1, 2, 4))
      .toEqual({ end: 0.9, offset: 2, charStart: 8 });
    expect(wordHandoff('One two', old.slice(0, 2), [{ ...next[0], end: 1.2 }, next[1]], 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, next.map(t => ({ ...t, start: NaN })), 0.1, 2, 4)).toBeNull();
  });
  it('does not reject an early boundary because Kokoro bridges a later phrase', () => {
    const source = 'We scanned 3 by 3 mm today.';
    // Exercise Kokoro's real normalization/bridging path with deterministic test times.
    const times = alignWordsToText(['We', 'scanned', 'three', 'times', 'three', 'mm', 'today'].map((text, i) =>
      ({ text, start: i / 2, end: (i + 1) / 2 })), source);
    expect(times.some(t => source.slice(t.charStart, t.charEnd) === '3 by 3')).toBe(true);
    expect(wordHandoff(source, times, times, 0.1, 4, 4)).toEqual({ end: 0.5, offset: 0.5, charStart: 3 });
  });
  it('allows zero-duration tokens away from the cut and missing later alignment', () => {
    const zero = old.map((t, i) => i === 2 ? { ...t, end: t.start } : t);
    expect(wordHandoff(text, zero, next, 0.1, 2, 4)).toEqual({ end: 0.4, offset: 1, charStart: 4 });
    expect(wordHandoff(text, old.slice(0, 2), next, 0.1, 2, 4)).toEqual({ end: 0.4, offset: 1, charStart: 4 });
  });
  it('does not use a zero-duration token itself as proof that a spoken word finished', () => {
    const zero = old.map((t, i) => i === 1 ? { ...t, end: t.start } : t);
    expect(wordHandoff(text, zero, next, 0.45, 2, 4)).toBeNull();
  });
  it('keeps usable boundaries when Kokoro starts its first timestamp before the audio origin', () => {
    const beforeOrigin = old.map((t, i) => i === 0 ? { ...t, start: -0.05 } : t);
    const target = next.map((t, i) => i === 0 ? { ...t, start: -0.012 } : t);
    expect(wordHandoff(text, beforeOrigin, target, 0.15, 2, 4)).toEqual({ end: 0.4, offset: 1, charStart: 4 });
    expect(beforeOrigin[0].start).toBe(-0.05);
    expect(target[0].start).toBe(-0.012);
  });
  it('never seeks to a negative target onset even when its text range matches', () => {
    expect(wordHandoff('One two', old.slice(0, 2), [{ ...next[1], start: -0.01 }], 0.1, 2, 4)).toBeNull();
  });
  it('hands off at the next word using the exact captured Kokoro response and readiness position', () => {
    const before = JSON.stringify(captured);
    expect(wordHandoff(captured.text, captured.old.timestamps, captured.target.timestamps, 0.432 + 1.8 * 0.04,
      captured.old.duration, captured.target.duration)).toEqual({ end: 0.6204583333333333, offset: 0.650375, charStart: 14 });
    expect(JSON.stringify(captured)).toBe(before);
  });
  it('keeps every usable captured Kokoro boundary, including floating-point joins', () => {
    for (let i = 0; i + 1 < captured.old.timestamps.length; i++) {
      const from = captured.old.timestamps[i], to = captured.target.timestamps[i + 1];
      const progress = Math.max(0, from.start + (from.end - from.start) / 2);
      expect(wordHandoff(captured.text, captured.old.timestamps, captured.target.timestamps, progress,
        captured.old.duration, captured.target.duration), `boundary after ${captured.text.slice(from.charStart, from.charEnd)}`)
        .toEqual({ end: from.end, offset: to.start, charStart: to.charStart });
    }
  });
  it('matches the next spoken token even when one voice includes punctuation or groups later words', () => {
    const punctuation = next.map((t, i) => i === 2 ? { ...t, charEnd: 14 } : t);
    expect(wordHandoff(text, old, punctuation, 0.6, 2, 4)).toEqual({ end: 0.9, offset: 2, charStart: 8 });
    const grouped = [next[0], { ...next[1], end: next[2].end, charEnd: 13 }];
    expect(wordHandoff(text, old, grouped, 0.1, 2, 4)).toEqual({ end: 0.4, offset: 1, charStart: 4 });
  });
  it('supports adjacent Chinese tokens without cutting a token or a decimal', () => {
    const source = '今天天气很好';
    const times = alignWordsToText([{ text: '今天', start: 0, end: 0.4 }, { text: '天气', start: 0.4, end: 0.8 },
      { text: '很好', start: 0.8, end: 1.2 }], source);
    expect(wordHandoff(source, times, times, 0.1, 2, 2)).toEqual({ end: 0.4, offset: 0.4, charStart: 2 });
    const decimal = 'Value 29.83 today';
    const numeric = alignWordsToText(['Value', 'twenty-nine', 'point', 'eight', 'three', 'today'].map((text, i) =>
      ({ text, start: i, end: i + 1 })), decimal);
    expect(wordHandoff(decimal, numeric, numeric, 1.5, 7, 7)).toEqual({ end: 5, offset: 5, charStart: 12 });
    // This target claims its next word starts inside 29.83: never seek to it.
    expect(wordHandoff(decimal, numeric, [{ ...numeric[1], charStart: 9 }], 0.1, 7, 7)).toBeNull();
  });
});
