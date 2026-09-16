import { describe, expect, it, vi } from 'vitest';
import { upcomingSegmentTexts } from '../../src/read-aloud/upcoming-segments';

/** What a nuked reader compartment hands back: every property read throws. */
const deadObject = new Proxy({}, { get() { throw new Error("can't access dead object"); } });

function readerWith(segments: unknown[], position = 0) {
  return { _internalReader: { _readAloudManager: { _controller: { _segments: segments, _currentIndex: position } } } };
}

function depsWith(overrides: Partial<{ isDead(value: unknown): boolean; isInvisible(segment: unknown): boolean; error(e: unknown): void }> = {}) {
  return { isDead: (value: unknown) => value === deadObject, isInvisible: () => false, error: vi.fn(), ...overrides };
}

describe('the texts the prefetcher warms', () => {
  it('answers the segments after the anchor, in order, up to the count', () => {
    const reader = readerWith([{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }, { text: 'Four.' }]);
    expect(upcomingSegmentTexts(reader, 'Two.', 5, depsWith())).toEqual(['Three.', 'Four.']);
    expect(upcomingSegmentTexts(reader, 'One.', 2, depsWith())).toEqual(['Two.', 'Three.']);
  });

  it('searches from the playback position, so a sentence repeated earlier cannot pull the window back', () => {
    const reader = readerWith([{ text: 'Same.' }, { text: 'A.' }, { text: 'Same.' }, { text: 'B.' }], 2);
    expect(upcomingSegmentTexts(reader, 'Same.', 3, depsWith())).toEqual(['B.']);
  });

  it('leaves out the segments the page does not show', () => {
    const hidden = { text: 'Hidden.', invisible: true };
    const reader = readerWith([{ text: 'One.' }, hidden, { text: 'Two.' }]);
    const deps = depsWith({ isInvisible: (segment) => (segment as { invisible?: boolean }).invisible === true });
    expect(upcomingSegmentTexts(reader, 'One.', 3, deps)).toEqual(['Two.']);
  });

  it('answers nothing, and logs nothing, for a reader whose window is gone (issue #116)', () => {
    const deps = depsWith();
    expect(upcomingSegmentTexts({ _internalReader: deadObject }, 'One.', 3, deps)).toEqual([]);
    expect(deps.error).not.toHaveBeenCalled();
  });

  it('answers nothing for an unknown anchor, an idle reader or no reader', () => {
    expect(upcomingSegmentTexts(readerWith([{ text: 'One.' }]), 'Missing.', 3, depsWith())).toEqual([]);
    expect(upcomingSegmentTexts(readerWith([]), 'One.', 3, depsWith())).toEqual([]);
    expect(upcomingSegmentTexts({}, 'One.', 3, depsWith())).toEqual([]);
    expect(upcomingSegmentTexts(null, 'One.', 3, depsWith())).toEqual([]);
  });

  it('logs an unexpected failure and answers nothing', () => {
    const deps = depsWith();
    const reader = { _internalReader: { _readAloudManager: { _controller: { get _segments() { throw new Error('unexpected'); } } } } };
    expect(upcomingSegmentTexts(reader, 'One.', 3, deps)).toEqual([]);
    expect(deps.error).toHaveBeenCalledTimes(1);
  });
});
