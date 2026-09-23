[Checklist index](../README.md) · [Scripts](../scripts/prefetch-cache/README.md)

## Prefetch and cache

Item 3.8 of the checklist, under its original number.

### 3.8

8. **Prefetch and cache.** The log's `prefetch: <provider>: N chars
   ready ahead of playback` lines reach up to the setting plus Zotero's
   three ahead (measured 6 on a 17-segment fixture) — that is the upper
   bound: `prefetchAfter` warms exactly the setting's count after the
   segment just requested, one chain at a time, so the steady state
   while playing is `position + count` (measured 2026-09-05 with the
   setting at 5: 5, 7 and 11 ahead, all inside
   `[position + count, position + 3 + count]`); after the first
   pass every replayed segment logs `(cached)`. A skip back is answered
   by the Engine's decoded clips (`diagnostics.engine()` `store.clips`,
   Read Aloud's 32 kept since issue #133) before the plugin's cache — not
   a check.
