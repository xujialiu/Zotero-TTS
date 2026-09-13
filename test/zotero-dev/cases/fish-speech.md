[Checklist index](../README.md) · [Scripts](../scripts/fish-speech/README.md)

## 1a. Fish Speech: a server of the owner's own (issue #89, 1.11.8)

Touches `zotero-tts.fishspeech.*` (`enabled`, `baseURL`, `headers`), the
settings window, and a fixture tab. One Test connection per item, never a
loop. The section's layout is item 1a.1 and the restore item 1a.14, both
in [Fish Audio](fish-audio.md).

Items 1a.9–1a.13 of the checklist, under their original numbers.

### 1a.9

9. **Fish Speech with no server.** Nothing listening on 8080 (`lsof
   -nP -iTCP:8080 -sTCP:LISTEN` empty). Test connection → within ~120 ms
   `Cannot reach Fish Speech at http://localhost:8080. Is the server
   running? (TypeError: NetworkError when attempting to fetch
   resource.)` — the throw site's own detail (issue #47). Then Enable:
   the message re-appears (17 ms; poll at 10 ms or the transition is
   invisible), `fishspeech.enabled` stays false, the label stays
   `Enable`, the fields stay unlocked, no `#ztts-notice` dialog.

### 1a.10

10. **A server of the owner's own.** `https://h200-fish-audio.xujialiu.top`
    (S2-Pro on an H200 behind a Cloudflare tunnel that needs no token, so
    `fishspeech.headers` may stay empty), the address in the field, the
    provider off. Test connection: `Testing…` at 4 ms, then `Connected. 2
    voices available.` at 159 ms — and nothing more: this provider has no
    synthesis probe (`prefs-pane.ts`, `probeSynthesis`). A wrong path
    (`…/nothing-here`) → `Connection failed: Fish Speech health returned
    404` at 53 ms. Enable → `Checking…` at 14 ms, at 77 ms the label
    `Disable`, `fishspeech.enabled` true, Address and Extra headers
    `disabled`, the line unchanged.

### 1a.11

11. **The server's references are the voices.** On a reader tab,
    `_allVoices` walked **by index**: `Fish-local-bella` /
    `fishspeech::bella` and `Fish-local-xiaobei` / `fishspeech::xiaobei`,
    both language `mul`, tier `local`, no title of their own — the
    server's list gives an id and nothing else.

### 1a.12

12. **A sentence read through `/v1/tts` is highlighted by sentence.**
    `fixture-a.pdf`, the memory pointed at `fishspeech::bella` before the
    popup opens: the manager moves `en -> mul` and starts on that voice at
    1.7 s. The debug store holds `[zotero-tts] fishspeech: no word
    timestamps for 31 chars, highlighting the sentence` 18.3 s after the
    controller was built (5.4 s of audio on a server without
    torch.compile), then `…for 53 chars`. `diagnostics.highlight()` while
    a segment plays: `activeWordTimestamp: "stand-in"`
    (`activeTimestamp {start: 0, end: 86400}`), `granularity: "sentence"`,
    `primaryShown: true`, `sentenceSlot: "ours"` on the PDF —
    `"empty"` with `sentencePieces {head: null, tail: null}` on an EPUB —
    and the log's `highlight: primary #ffff00b3` proves the primary drew
    in the sentence color. By eye: one flat band over the whole sentence,
    no word inside it. `test/fixtures/zh/zh.epub` with
    `fishspeech::xiaobei` behaves the same (`…for 24 chars` at 27.4 s,
    `…for 11 chars` prefetched 5.1 s later); the remembered `mul` voice
    carries into the Chinese document by itself.

### 1a.13

13. **A slow server outruns the 60 s bound through the prefetch queue.**
    A server that answers one request at a time makes the segments
    requested ahead of playback wait behind the one being synthesized,
    and a queued request burns its 60 s (`remote-interface.ts`):
    `SynthesisError: fishspeech: no audio within 60 s`, `ReaderTab "…":
    network`, and the player showing `Unable to connect to the Read Aloud
    service. Please check your internet connection.` with `Retry` while
    the audio the request asked for arrives seconds later. On the same
    server, a tab opened **while a synthesis is in flight** also loses the
    whole voice list — `Error: fishspeech: listing voices failed: no voice
    list within 15 s`, then `read-aloud memory: fishspeech::xiaobei is not
    offered by this reader's list; starting azure::… instead` — although
    `/v1/references/list` answers in 65–500 ms when the server is idle.
    Both are the server's pace, not a plugin failure (measured 2026-09-10
    without torch.compile, 4 tokens a second); they are here so a later
    pass recognizes them.
