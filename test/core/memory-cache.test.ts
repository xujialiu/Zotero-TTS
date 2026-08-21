import { describe, expect, it } from 'vitest';
import { createMemoryCache } from '../../src/core/memory-cache';

const blob = (s: string) => new Blob([s]);

describe('createMemoryCache', () => {
  it('returns null for a key it has never seen', async () => {
    const c = createMemoryCache({ maxBytes: 1000 });
    expect(await c.match('nope')).toBeNull();
  });

  it('returns exactly what was put, including timestamps', async () => {
    const c = createMemoryCache({ maxBytes: 1000 });
    const value = { audio: blob('abc'), timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 3 }] };
    await c.put('k', value);
    const hit = await c.match('k');
    expect(hit).not.toBeNull();
    expect(hit!.audio).toBe(value.audio);
    expect(hit!.timestamps).toBe(value.timestamps);
  });

  it('evicts the least recently used entry once the byte budget is exceeded', async () => {
    const c = createMemoryCache({ maxBytes: 10 });
    await c.put('a', { audio: blob('1234') }); // 4
    await c.put('b', { audio: blob('1234') }); // 8
    await c.put('c', { audio: blob('1234') }); // 12 -> evict a
    expect(await c.match('a')).toBeNull();
    expect(await c.match('b')).not.toBeNull();
    expect(await c.match('c')).not.toBeNull();
  });

  it('a match refreshes recency, so the touched entry survives eviction', async () => {
    const c = createMemoryCache({ maxBytes: 10 });
    await c.put('a', { audio: blob('1234') });
    await c.put('b', { audio: blob('1234') });
    await c.match('a'); // a is now most recent
    await c.put('c', { audio: blob('1234') }); // evict b, not a
    expect(await c.match('a')).not.toBeNull();
    expect(await c.match('b')).toBeNull();
  });

  it('never stores an entry larger than the whole budget', async () => {
    const c = createMemoryCache({ maxBytes: 5 });
    await c.put('big', { audio: blob('123456') });
    expect(await c.match('big')).toBeNull();
  });

  it('replacing a key does not double-count its bytes', async () => {
    const c = createMemoryCache({ maxBytes: 8 });
    await c.put('a', { audio: blob('1234') });
    await c.put('a', { audio: blob('1234') }); // same key, 4 bytes total, not 8
    await c.put('b', { audio: blob('1234') }); // 8 -> fits without evicting a
    expect(await c.match('a')).not.toBeNull();
    expect(await c.match('b')).not.toBeNull();
  });

  it('clear() empties it', async () => {
    const c = createMemoryCache({ maxBytes: 100 });
    await c.put('a', { audio: blob('x') });
    c.clear();
    expect(await c.match('a')).toBeNull();
  });
});
