import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../src/core/timeout';

const never = () => new Promise<never>(() => {});

describe('withTimeout', () => {
  it('passes a value through when it arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(1), 50, () => new Error('late'))).resolves.toBe(1);
  });

  it("rejects with the caller's error when time runs out, and tells the caller", async () => {
    const onTimeout = vi.fn();
    await expect(withTimeout(never(), 10, () => new Error('late'), onTimeout)).rejects.toThrow('late');
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('passes a rejection through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, () => new Error('late'))).rejects.toThrow('boom');
  });

  it('still rejects when the abort callback itself throws', async () => {
    await expect(
      withTimeout(never(), 10, () => new Error('late'), () => {
        throw new Error('abort failed');
      }),
    ).rejects.toThrow('late');
  });

  it('does not fire the callback once the promise has settled', async () => {
    const onTimeout = vi.fn();
    await withTimeout(Promise.resolve('ok'), 10, () => new Error('late'), onTimeout);
    await new Promise((r) => setTimeout(r, 30));
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
