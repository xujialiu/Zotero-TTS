[Checklist index](../README.md)

## 3g. Enclosing angle brackets (issue #94)

Run the [baseline](../baseline.md), then import
`test/fixtures/angle-brackets/angle-brackets.epub` as a temporary standalone
attachment. Regenerate it with its `build.py`. Use only this fixture for
playback; leave the user's tabs alone. Snapshot preferences before changes,
disable automatic settings/position uploads for the run, and restore the
original values in the workflow's order, with reading memory last.

1. **Default and UI.** In Reading, the checkbox
   `ztts-strip-angle-brackets` is bound to
   `extensions.zotero.zotero-tts.readAloud.stripAngleBrackets`, default true.
   English and Chinese labels and the help text explain outside punctuation
   and stopping/reopening Read Aloud. The setting survives backup/restore
   and belongs to settings sync (also covered by unit tests).
2. **Outgoing speech.** With the setting enabled, `<Hello world>.` becomes
   `Hello world.` and `“<The quick brown fox jumps over the lazy dog>!”`
   becomes `“The quick brown fox jumps over the lazy dog!”`. Record the
   actual outgoing request; a debug line alone is not transport proof.
   Original segment text and source positions remain equal to the baseline.
   Internal comparisons and an unmatched bracket remain unchanged.
3. **Word coordinates and cache.** A provider with real word timing returns
   ranges over the original words. Repeat the request to exercise the cache;
   ranges must remain the same, without a second shift. The provider's
   cached data stays in speech-text coordinates. Prefetch uses the same
   speech text, and the next segment's request can reuse that entry.
4. **Session setting.** `diagnostics.textSettings()` reports `patched: true`
   and both `configured` and `effective`. Start with both true. Change the
   preference to false while the fixture is active (paused included):
   configured becomes false, effective stays true. Newly requested text
   still loses the pair. Stop and reopen: effective becomes false and the
   pair reaches synthesis unchanged. Set true and reopen again: stripping
   resumes and the cleaned cache entry remains correctly aligned.
5. **Empty pair.** A segment containing `<>` returns the short silent WAV
   without a provider request, and playback continues into the next
   sentence. If the installed segmenter drops the empty pair, record that
   observation and test the remote interface directly; do not invent a
   playback result for a segment that does not exist.
6. **Native voices.** The Standard/Premium route receives a copied segment
   with prepared text and intact metadata and returns mapped word ranges.
   Use a narrowly scoped, restored transport stub to avoid paid requests.
   Native `sample`, errors and `noStore` remain unchanged. Separate stubbed
   transport evidence from actual service synthesis.
7. **Cleanup.** Restore every probe, preference and debug-store flag, close
   and erase the fixture, remove its reading-position record, and compare
   the user's tabs and settings to the baseline. Report any mismatch.

Unit-only edge coverage includes nested pairs (one removal), punctuation
before and after the pair, fullwidth brackets, UTF-16 position mapping,
immutable cached timestamps, and concurrent cache/prefetch behavior.
Whether the resulting speech sounds natural and the moving highlight feels
in time remains a human observation. Save scripts actually used and sanitized
run evidence under the checklist's `scripts/` and `runs/` directories.

## Retained run

[1.12.4-beta2 evidence](../runs/2026-09-13-1.12.4-beta2/report.md) and
[recorded scripts](../scripts/angle-brackets/README.md): request preparation,
coordinate mapping, cache/prefetch and session behavior passed. Continuous
playback was not testable with the suspended AudioContext; native transport
was stubbed and Chinese locale rendering was not exercised live.
