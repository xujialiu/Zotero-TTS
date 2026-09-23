/**
 * Read Aloud's `LRUCacheMap` (reader.js 39723-39746): a Map whose `get`
 * moves an entry to the most recent end and whose `set`, at capacity, drops
 * the oldest. The Engine keeps its decoded clips and their word timings in
 * two of these, 32 each, as Read Aloud's engine does (39901, 40148-40149):
 * for the Zotero voices, that clip cache is what stops a replayed `noStore`
 * answer from being fetched, and billed, twice (ADR 0005).
 */
export class LruMap<K, V> extends Map<K, V> {
  constructor(private readonly capacity = 500) {
    super();
  }

  override get(key: K): V | undefined {
    const value = super.get(key);
    if (value !== undefined) {
      super.delete(key);
      super.set(key, value);
    }
    return value;
  }

  override set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key);
    } else if (super.size === this.capacity) {
      super.delete(super.keys().next().value as K);
    }
    return super.set(key, value);
  }
}
