import { describe, expect, it, vi } from 'vitest';
import { createWindowWrapper, LATE_RESULTS_KEPT } from '../../src/read-aloud/window-interface';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A reader window stand-in: its own Promise, and a flag the injected isDead reads. */
function fakeWindow() {
  return { Promise, dead: false } as { Promise: PromiseConstructor; dead: boolean };
}

function wrapperFor() {
  const cloneInto = vi.fn((value: unknown) => ({ cloned: value }));
  const error = vi.fn();
  const debug = vi.fn();
  const wrapper = createWindowWrapper({
    cloneInto,
    isDead: (value) => (value as { dead?: boolean } | null)?.dead === true,
    error,
    debug,
    now: () => 1_000,
  });
  return { wrapper, cloneInto, error, debug };
}

describe('the interface wrapped for a reader window', () => {
  it("clones a result into a live window and answers with the window's own promise", async () => {
    const win = fakeWindow();
    const { wrapper, cloneInto, error } = wrapperFor();
    const iface = wrapper.wrap(win, { getAudio: async (text: string) => ({ audio: text }) }) as { getAudio(text: string): Promise<unknown> };
    const answer = iface.getAudio('a sentence');
    expect(answer).toBeInstanceOf(win.Promise);
    await expect(answer).resolves.toEqual({ cloned: { audio: 'a sentence' } });
    expect(cloneInto).toHaveBeenCalledWith({ audio: 'a sentence' }, win);
    expect(error).not.toHaveBeenCalled();
    expect(wrapper.report()).toEqual({ dropped: 0, byMethod: {}, last: [] });
  });

  it('drops a result that lands after the window died: nothing cloned, nothing resolved, no error, one count (issue #116)', async () => {
    const win = fakeWindow();
    const { wrapper, cloneInto, error, debug } = wrapperFor();
    let finish!: (value: unknown) => void;
    const iface = wrapper.wrap(win, { getAudio: () => new Promise((resolve) => { finish = resolve; }) }) as { getAudio(): Promise<unknown> };
    const settled = vi.fn();
    void iface.getAudio().then(settled, settled);
    win.dead = true;
    finish({ audio: 'late' });
    await flush();
    expect(cloneInto).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('getAudio'));
    expect(wrapper.report()).toEqual({
      dropped: 1,
      byMethod: { getAudio: 1 },
      last: [{ method: 'getAudio', at: new Date(1_000).toISOString() }],
    });
  });

  it('logs a failure once and answers a live window with an error object', async () => {
    const win = fakeWindow();
    const { wrapper, error } = wrapperFor();
    const iface = wrapper.wrap(win, { getVoices: async () => { throw new Error('provider down'); } }) as { getVoices(): Promise<unknown> };
    await expect(iface.getVoices()).resolves.toEqual({ cloned: { error: 'unknown' } });
    expect(error).toHaveBeenCalledTimes(1);
    expect(wrapper.report().dropped).toBe(0);
  });

  it('logs a failure that lands after the window died once, and answers nothing', async () => {
    const win = fakeWindow();
    const { wrapper, cloneInto, error } = wrapperFor();
    let fail!: (e: unknown) => void;
    const iface = wrapper.wrap(win, { getVoices: () => new Promise((_resolve, reject) => { fail = reject; }) }) as { getVoices(): Promise<unknown> };
    const settled = vi.fn();
    void iface.getVoices().then(settled, settled);
    win.dead = true;
    fail(new Error('provider down'));
    await flush();
    expect(error).toHaveBeenCalledTimes(1);
    expect(cloneInto).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    expect(wrapper.report()).toMatchObject({ dropped: 1, byMethod: { getVoices: 1 } });
  });

  it('counts every drop and keeps only the last few for the report', async () => {
    const win = fakeWindow();
    const { wrapper } = wrapperFor();
    const finishers: ((value: unknown) => void)[] = [];
    const iface = wrapper.wrap(win, {
      getAudio: () => new Promise((resolve) => { finishers.push(resolve); }),
      getVoices: () => new Promise((resolve) => { finishers.push(resolve); }),
    }) as { getAudio(): Promise<unknown>; getVoices(): Promise<unknown> };
    for (let i = 0; i < LATE_RESULTS_KEPT + 2; i++) void iface.getAudio();
    void iface.getVoices();
    win.dead = true;
    for (const finish of finishers) finish({});
    await flush();
    const report = wrapper.report();
    expect(report.dropped).toBe(LATE_RESULTS_KEPT + 3);
    expect(report.byMethod).toEqual({ getAudio: LATE_RESULTS_KEPT + 2, getVoices: 1 });
    expect(report.last).toHaveLength(LATE_RESULTS_KEPT);
    expect(report.last[LATE_RESULTS_KEPT - 1]).toEqual({ method: 'getVoices', at: new Date(1_000).toISOString() });
  });
});
