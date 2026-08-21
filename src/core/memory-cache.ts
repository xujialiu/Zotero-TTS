import type { AudioCache } from '../modes/hijack/remote-interface';
import type { SynthesisResult } from './providers/types';

/**
 * An in-process audio cache: a byte-bounded LRU map.
 *
 * This deliberately replaces the Cache API (`win.caches`). Every playback on a
 * real Zotero 10.0.1-beta.1 crashed the process with a Gecko release assert
 * (EXCEPTION_BREAKPOINT in xul.dll) on the `DOMCacheThread` — the Cache API's
 * own worker — reproducibly, across six minidumps, regardless of whether the
 * stored Blob was sandbox- or chrome-owned. Zotero's native Read Aloud uses
 * the Cache API from chrome-window JS; driving it from a plugin sandbox across
 * a compartment boundary is what differs, and it is not worth chasing: the
 * disk cache only saves the user's own TTS cost between sessions. A memory
 * cache crosses no compartment, touches no DOM thread, and cannot take the
 * process down.
 *
 * Pure JS, no globals — unit-testable and sandbox-safe by construction.
 */
export function createMemoryCache(opts: { maxBytes: number }): AudioCache & { clear(): void } {
  // Map preserves insertion order; deleting and re-inserting moves a key to
  // the most-recent end, which is all an LRU needs.
  const entries = new Map<string, { value: SynthesisResult; bytes: number }>();
  let total = 0;

  function evictUntilFits(incoming: number): void {
    for (const [key, entry] of entries) {
      if (total + incoming <= opts.maxBytes) break;
      entries.delete(key);
      total -= entry.bytes;
    }
  }

  return {
    async match(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      // Refresh recency.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    async put(key, value) {
      const bytes = value.audio.size;
      // An entry that cannot fit even in an empty cache is simply not cached;
      // evicting everything to make room for it would be strictly worse.
      if (bytes > opts.maxBytes) return;

      const existing = entries.get(key);
      if (existing) {
        entries.delete(key);
        total -= existing.bytes;
      }
      evictUntilFits(bytes);
      entries.set(key, { value, bytes });
      total += bytes;
    },

    clear() {
      entries.clear();
      total = 0;
    },
  };
}
