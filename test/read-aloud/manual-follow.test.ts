import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualFollow, intersectsViewport } from '../../src/read-aloud/manual-follow';

afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  let visible: boolean | null = true;
  const deps = { enabled: () => true, following: () => true, capture: () => () => visible,
    stop: vi.fn(), disengage: vi.fn(), resume: vi.fn(), error: vi.fn() };
  const gate = createManualFollow(deps);
  return { gate, deps, visible: (v: boolean | null) => { visible = v; } };
}

describe('manual follow visibility gate (#100)', () => {
  it('requires a positive fragment intersection, not an enclosing whitespace box', () => {
    expect(intersectsViewport([0, -20, 40, 1], [0, 0, 100, 100])).toBe(true);
    expect(intersectsViewport([0, -20, 40, 0], [0, 0, 100, 100])).toBe(false);
    expect([[-20, 0, 0, 20], [100, 0, 120, 20]].some(b => intersectsViewport(b, [0, 0, 100, 100]))).toBe(false);
  });
  it('checks after movement and retains partial visibility', () => {
    const f = fixture(); f.gate.begin('wheel');
    expect(f.gate.active).toBe(true);
    expect(f.deps.stop).toHaveBeenCalledOnce();
    expect(f.deps.disengage).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(f.gate.active).toBe(false);
    expect(f.deps.resume).toHaveBeenCalledOnce();
  });
  it('waits outside without pulling back and resumes when any fragment reenters', () => {
    const f = fixture(); f.gate.begin('wheel'); f.visible(false); f.gate.scroll();
    expect(f.deps.disengage).toHaveBeenCalledWith('wheel');
    expect(f.gate.suspended).toBe(true);
    vi.runAllTimers(); expect(f.deps.resume).not.toHaveBeenCalled();
    f.visible(true); f.gate.scroll(); vi.runAllTimers();
    expect(f.deps.resume).toHaveBeenCalledOnce(); expect(f.gate.suspended).toBe(false);
  });
  it('waits through continuous input and a held pointer', () => {
    const f = fixture(); f.gate.hold(true); f.gate.begin('scrollbar');
    vi.advanceTimersByTime(1000); expect(f.gate.active).toBe(true);
    f.gate.hold(false); vi.runAllTimers(); expect(f.gate.active).toBe(false);
    expect(f.deps.resume).toHaveBeenCalledOnce();
  });
  it('remeasures the current sentence through playback advances', () => {
    const f = fixture(); const capture = vi.spyOn(f.deps, 'capture');
    f.gate.begin('wheel'); f.gate.scroll(); f.gate.scroll();
    expect(capture).toHaveBeenCalledTimes(2);
    f.gate.cancel(); vi.runAllTimers(); expect(f.deps.resume).not.toHaveBeenCalled();
  });
  it('does not treat unknown geometry as invisible and retries after restoration', () => {
    const f = fixture(); f.gate.begin('wheel'); f.visible(null); vi.runAllTimers();
    expect(f.deps.disengage).not.toHaveBeenCalled(); expect(f.gate.active).toBe(true);
    f.visible(true); f.gate.settle(); vi.runAllTimers(); expect(f.gate.active).toBe(false);
  });
  it('ignores automatic scrolling and retains immediate legacy behavior', () => {
    const f = fixture(); f.visible(false); f.gate.scroll(); vi.runAllTimers();
    expect(f.deps.disengage).not.toHaveBeenCalled();
    f.deps.enabled = () => false; f.gate.begin('keyboard');
    expect(f.deps.disengage).toHaveBeenCalledWith('keyboard'); expect(f.gate.active).toBe(false);
  });
  it('cancels pending callbacks on disposal or explicit return', () => {
    const f = fixture(); f.gate.begin('wheel'); f.gate.cancel(); vi.runAllTimers();
    expect(f.deps.resume).not.toHaveBeenCalled(); expect(f.gate.active).toBe(false);
  });
  it('protects asynchronous navigation and discards stale completion callbacks', () => {
    const f = fixture(); f.gate.begin('navigation'); const done = f.gate.task();
    vi.runAllTimers(); expect(f.gate.active).toBe(true);
    done(); vi.runAllTimers(); expect(f.gate.active).toBe(false);
    f.gate.begin('navigation'); const stale = f.gate.task(); f.gate.cancel();
    f.gate.begin('wheel'); stale(); vi.runAllTimers();
    expect(f.deps.resume).toHaveBeenCalledTimes(2);
  });
  it('does not postpone gesture settling on frequent playback pushes', () => {
    const f = fixture(); f.gate.begin('wheel');
    for (let i = 0; i < 6; i++) { vi.advanceTimersByTime(40); f.gate.retry(); }
    expect(f.gate.active).toBe(false); expect(f.deps.resume).toHaveBeenCalledOnce();
  });
  it('lets native navigation proceed if capturing or stopping throws', () => {
    const f = fixture();
    f.deps.capture = () => { throw new Error('layout unavailable'); };
    f.deps.stop.mockImplementation(() => { throw new Error('animation unavailable'); });
    expect(() => f.gate.begin('navigation')).not.toThrow();
    vi.runAllTimers(); expect(f.deps.disengage).not.toHaveBeenCalled();
    expect(f.deps.error).toHaveBeenCalledTimes(2);
    f.gate.cancel();
  });
  it('waits for a held return gesture to end before resuming', () => {
    const f = fixture(); f.gate.begin('wheel'); f.visible(false); f.gate.scroll();
    f.gate.hold(true); f.visible(true); f.gate.scroll(); vi.runAllTimers();
    expect(f.deps.resume).not.toHaveBeenCalled();
    f.gate.hold(false); vi.runAllTimers(); expect(f.deps.resume).toHaveBeenCalledOnce();
  });
  it('discards the visibility wait when disabled or disposed', () => {
    const f = fixture(); f.gate.begin('wheel'); f.visible(false); f.gate.scroll();
    f.deps.enabled = () => false; f.gate.retry(); vi.runAllTimers();
    expect(f.gate.suspended).toBe(false);
    f.deps.enabled = () => true; f.visible(true); f.gate.scroll(); vi.runAllTimers();
    expect(f.deps.resume).not.toHaveBeenCalled();
    f.gate.begin('wheel'); f.visible(false); f.gate.scroll(); f.gate.cancel();
    f.visible(true); f.gate.scroll(); vi.runAllTimers(); expect(f.deps.resume).not.toHaveBeenCalled();
  });
});


describe('manual sentence protection (#107)', () => {
  it('waits for a different visible sentence and keeps the same sentence protected on reentry', () => {
    vi.useFakeTimers(); let key = 'a'; let visible = true; let following = true;
    const resume = vi.fn(() => { following = true; });
    const gate = createManualFollow({ enabled: () => true, following: () => following,
      sentenceKey: () => key, capture: () => () => visible, stop: vi.fn(),
      disengage: () => { following = false; }, resume, error: vi.fn() });
    gate.begin('wheel'); vi.runAllTimers();
    expect(gate.sentenceProtected).toBe(true); expect(gate.interacting).toBe(false);
    visible = false; gate.scroll(); vi.runAllTimers();
    visible = true; gate.scroll(); vi.runAllTimers(); expect(resume).not.toHaveBeenCalled();
    key = 'b'; visible = false; gate.retry(); vi.runAllTimers(); expect(resume).not.toHaveBeenCalled();
    visible = true; gate.scroll(); vi.runAllTimers(); expect(resume).toHaveBeenCalledOnce();
    gate.cancel();
  });
  it('protects a new sentence when more manual input arrives and waits through pause and held tasks', () => {
    vi.useFakeTimers(); let key = 'a'; let paused = false; const resume = vi.fn();
    const gate = createManualFollow({ enabled: () => true, following: () => true,
      sentenceKey: () => key, paused: () => paused, capture: () => () => true,
      stop: vi.fn(), disengage: vi.fn(), resume, error: vi.fn() });
    gate.begin('wheel'); key = 'b'; gate.begin('wheel'); vi.runAllTimers();
    expect(resume).not.toHaveBeenCalled();
    key = 'c'; paused = true; gate.retry(); vi.runAllTimers(); expect(resume).not.toHaveBeenCalled();
    paused = false; gate.hold(true); const done = gate.task(); gate.retry(); vi.runAllTimers();
    gate.hold(false); vi.runAllTimers(); expect(resume).not.toHaveBeenCalled();
    done(); vi.runAllTimers(); expect(resume).toHaveBeenCalledOnce(); gate.cancel();
  });
});
