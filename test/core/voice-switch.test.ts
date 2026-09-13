import { describe, expect, it } from 'vitest';
import { playerVoices, adjacentVoice, wordHandoff } from '../../src/core/voice-switch';

const text = 'One two three.';
const old = [
  { start: 0, end: 0.4, charStart: 0, charEnd: 3 },
  { start: 0.5, end: 0.9, charStart: 4, charEnd: 7 },
  { start: 1, end: 1.4, charStart: 8, charEnd: 13 },
];
const next = old.map(t => ({ ...t, start: t.start * 2, end: t.end * 2 }));
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
  it('refuses stand-ins, incomplete alignment, overlapping timings and split words', () => {
    expect(wordHandoff(text, [{ start: 0, end: 86400, charStart: 0, charEnd: text.length }], next, 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, [], 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, next.map((t, i) => i === 1 ? { ...t, charStart: 5 } : t), 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old.map((t, i) => i === 1 ? { ...t, start: 0.3 } : t), next, 0.1, 2, 4)).toBeNull();
    expect(wordHandoff(text, old, next.map(t => ({ ...t, start: NaN })), 0.1, 2, 4)).toBeNull();
  });
});
