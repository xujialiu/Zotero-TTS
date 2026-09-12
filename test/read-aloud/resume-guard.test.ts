import { describe, expect, it, vi } from 'vitest';
import { createResumeGuard } from '../../src/read-aloud/resume-guard';

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
