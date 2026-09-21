import { describe, expect, it, vi } from 'vitest';
import { createResumeGuard, type ResumeControl } from '../../src/read-aloud/resume-guard';

describe('resume does not request following', () => {
  it('marks only the synchronous resume call and restores its method', () => {
    const error = vi.fn();
    const guard = createResumeGuard({ error });
    let during = false;
    const original = vi.fn(() => { during = guard.resuming(reader); return 'same result'; });
    const reader = { _internalReader: { toggleReadAloudPaused: original } };
    guard.attach(reader); guard.attach(reader);
    expect(guard.resuming(reader)).toBe(false);
    expect(reader._internalReader.toggleReadAloudPaused()).toBe('same result');
    expect(during).toBe(true);
    expect(guard.resuming(reader)).toBe(false);
    guard.dispose();
    expect(reader._internalReader.toggleReadAloudPaused).toBe(original);
    expect(error).not.toHaveBeenCalled();
  });
  it('clears its scope after a native error without swallowing the original exception', () => {
    const guard = createResumeGuard({ error: vi.fn() });
    const reader = { _internalReader: { toggleReadAloudPaused() { throw new Error('native'); } } };
    guard.attach(reader);
    expect(() => reader._internalReader.toggleReadAloudPaused()).toThrow('native');
    expect(guard.resuming(reader)).toBe(false);
    guard.dispose();
  });
});

describe('the pull before the player\'s play (docs/spec/SYNC-FORMAT.md 6.8)', () => {
  function paused(active = true, isPaused = true) {
    const calls: unknown[][] = [];
    const reader = {
      _internalReader: {
        _readAloudManager: { active, paused: isPaused },
        toggleReadAloudPaused(...args: unknown[]) { calls.push(args); return undefined; },
      },
    };
    return { reader, calls };
  }

  it('defers the un-pause of a paused session until the hook resumes it, ignoring a second press meanwhile', () => {
    const { reader, calls } = paused();
    let control: ResumeControl | null = null;
    const guard = createResumeGuard({ error: vi.fn(), beforeResume: (_reader, c) => { control = c; return true; } });
    guard.attach(reader);
    expect(reader._internalReader.toggleReadAloudPaused()).toBeUndefined();
    expect(calls).toEqual([]);
    expect(guard.pending(reader)).toBe(true);
    // The second press: ignored, nothing queued twice
    reader._internalReader.toggleReadAloudPaused();
    expect(calls).toEqual([]);
    control!.resume();
    expect(calls).toEqual([[]]);
    expect(guard.pending(reader)).toBe(false);
    // Settled once: resuming again is a no-op
    control!.resume();
    expect(calls).toEqual([[]]);
    guard.dispose();
  });

  it('marks the deferred original as resuming, for the following that watches it', () => {
    const { reader } = paused();
    let control: ResumeControl | null = null;
    const guard = createResumeGuard({ error: vi.fn(), beforeResume: (_reader, c) => { control = c; return true; } });
    let during: boolean | null = null;
    reader._internalReader.toggleReadAloudPaused = function() { during = guard.resuming(reader); };
    guard.attach(reader);
    reader._internalReader.toggleReadAloudPaused();
    expect(during).toBeNull();
    control!.resume();
    expect(during).toBe(true);
    expect(guard.resuming(reader)).toBe(false);
    guard.dispose();
  });

  it('releases without running the original when playback started another way, and takes the next press', () => {
    const { reader, calls } = paused();
    let control: ResumeControl | null = null;
    const guard = createResumeGuard({ error: vi.fn(), beforeResume: (_reader, c) => { control = c; return true; } });
    guard.attach(reader);
    reader._internalReader.toggleReadAloudPaused();
    control!.release();
    expect(calls).toEqual([]);
    expect(guard.pending(reader)).toBe(false);
    reader._internalReader.toggleReadAloudPaused();
    expect(guard.pending(reader)).toBe(true);
    guard.dispose();
  });

  it('runs the original at once for a pause, an idle reader, an explicit pause, a declining hook and a throwing hook', () => {
    const error = vi.fn();
    const beforeResume = vi.fn(() => true);
    const playing = paused(true, false);
    const guardA = createResumeGuard({ error, beforeResume });
    guardA.attach(playing.reader);
    playing.reader._internalReader.toggleReadAloudPaused();
    expect(playing.calls).toEqual([[]]);
    expect(beforeResume).not.toHaveBeenCalled();

    const idle = paused(false, false);
    guardA.attach(idle.reader);
    idle.reader._internalReader.toggleReadAloudPaused(false);
    expect(idle.calls).toEqual([[false]]);
    expect(beforeResume).not.toHaveBeenCalled();

    const explicit = paused();
    guardA.attach(explicit.reader);
    explicit.reader._internalReader.toggleReadAloudPaused(true);
    expect(explicit.calls).toEqual([[true]]);
    expect(beforeResume).not.toHaveBeenCalled();
    // `false` on a paused session is a resume and is offered
    explicit.reader._internalReader.toggleReadAloudPaused(false);
    expect(beforeResume).toHaveBeenCalledTimes(1);
    guardA.dispose();

    const declining = paused();
    const guardB = createResumeGuard({ error, beforeResume: () => false });
    guardB.attach(declining.reader);
    declining.reader._internalReader.toggleReadAloudPaused();
    expect(declining.calls).toEqual([[]]);
    expect(guardB.pending(declining.reader)).toBe(false);
    guardB.dispose();

    const throwing = paused();
    const guardC = createResumeGuard({ error, beforeResume: () => { throw new Error('hook'); } });
    guardC.attach(throwing.reader);
    throwing.reader._internalReader.toggleReadAloudPaused();
    expect(throwing.calls).toEqual([[]]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(guardC.pending(throwing.reader)).toBe(false);
    guardC.dispose();
  });

  it('does not offer a resume when no hook is wired', () => {
    const { reader, calls } = paused();
    const guard = createResumeGuard({ error: vi.fn() });
    guard.attach(reader);
    reader._internalReader.toggleReadAloudPaused();
    expect(calls).toEqual([[]]);
    guard.dispose();
  });
});
