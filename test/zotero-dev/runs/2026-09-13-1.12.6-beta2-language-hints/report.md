# Fish cloud short-text language hints — live verification

Date: 2026-09-13

Environment: Zotero 10.0.2-beta.9+c77df79af, Firefox 140, macOS.

Build: Zotero-TTS 1.12.6-beta2.

XPI SHA256: 2bfdfa971b1c6dc59ac95b2e63203c6c4aa4e2ef4c9f437217b1c6ed8afdd761

Bundle SHA256: 0c96a94e9e996625f6a0d734d42e33707a455d0b0ab4a2dff0c81ff3154c0f81

Tests: 2217 passed / 117 files; typecheck and build passed.

## Results

| Check | Expected | Observed | Status |
| --- | --- | --- | --- |
| Baseline and startup | User reader remains active/paused at its saved position; startup version is beta2, every step ok, failed empty | User reader 24246 remained active=true, paused=true, Dax, position=6723; startup reported 1.12.6-beta2, 23 ok steps, failed=[] | PASS |
| Real requested locale and transport | Dax en-US reaches the Fish sandbox; short speech request contains [Speak in American English] and the debug marker | Real free-model requests used Dax/reference 9fa4..., model=s2.1-pro-free, /v1/tts/stream/with-timestamp; bodies were [Speak in American English] 100 exp and [Speak in American English] 2/50 HP ; two language-hint debug lines observed | PASS |
| Threshold and bracket preparation | 1–3 word-like segments cue; digits count; exactly four words and empty brackets do not cue | Real < 100 exp> and < 2/50 HP > were cued; <One two three four> was unchanged; <> made no request and returned a 400 ms pause | PASS |
| Real Fish timings and offsets | Returned timings refer to original text; enclosing brackets do not shift source coordinates | 100 range charStart=2,charEnd=5, exp 6..9; HP ranges 2..3, 4..6, 7..9; source slices were the original words | PASS |
| Cache identity | Same locale repeats make no fetch; en-US and en-GB are separate; replay timings are identical | Correct-LF valid-audio stub made one en-US fetch, one en-GB fetch, and same-locale repeat had identical timings | PASS |
| Concurrent requests | Matching calls coalesce; differing locales remain separate | Two distinct requests: American and British cue bodies; three callers produced two fetches | PASS |
| Prefetch locale snapshot | Prefetch uses the requested locale captured before a later voice mutation; cached playback makes no fetch | en-US primary then voice object changed to en-GB; prefetched bodies stayed American for 102 exp and 4/70 HP; replay added zero fetches; British request was separate | PASS |
| Locale exclusions | Missing, malformed, unknown, mul, und, zxx and private-extension locales leave prepared text unchanged | Seven cases all sent 100 exp with no cue | PASS |
| Other short-text cases | Single word cues; unspaced two-word Chinese cues; four-word Chinese does not | One → American cue; 你好世界 → Chinese (China) cue; 你好世界今天快乐 unchanged | PASS |
| Sample, native and Kokoro local provider | Sample, native and Kokoro Local requests receive no Fish cue | Sample body unchanged; Kokoro stub input 100 exp; native stub input 100 exp; bracket offsets restored | PASS |
| Fish Speech Local excluded path | Fish Speech Local is outside issue #98 and must not be inferred from the Kokoro check | No Fish Speech Local transport stub was run; issue #99 remains deferred; unit tests cover provider behavior | NOT RUN |
| Popup/production transport | Valid transport should decode and leave no provider error | Correct-LF valid MP3 popup stub selected Dax/en-US and ended paused with error=null; no real Fish request failed | PASS |
| Listening and moving highlight | Human confirms spoken cue is absent and pronunciation/highlight quality is correct | Existing owner listening confirmation covers the earlier cloud samples; this agent did not listen, and no user audio or moving highlight was driven | NOT TESTABLE (human) |
| Cleanup and restoration | Exact temporary state restored; fixture absent; user reader unchanged | Volume 100/user=false; syncPositions true/user=true; syncSettings false/user=false; autoUpload true/user=true; cache/prefetch true/user=false; memory restored; debug store false; fixture IDs 24424–24428 absent; position rows 66, queued 0; user reader still paused at 6723 | PASS |

## Intentional harness error

The first popup/cache harness used a synthetic SSE payload ending in literal backslash-n characters. Fish's parser requires real newline-delimited data JSON events. The raw check is in outputs/05-raw-sse-parser-check.json: bad response had one line, zero parsed events and zero parsed audio bytes; the same event with LF had three lines, one parsed event and 12 base64 characters. The original failed script is ../../scripts/fish-language-hints/04-popup-failing-sse-stub.js; its output is outputs/04-cache-locale-failing-stub.json. The user screenshot is timestamped 13:31:26, while the preserved earlier synthetic error is at 13:29:02 and the later cache-stub errors are at 13:32:09–10. The bridge cannot prove which event left the error visible in the screenshot; the screenshot correlation is therefore unconfirmed. All candidate errors are probe artifacts, not production failures.

## Error console

Final read retained the intentional synthetic stream-carried-no-audio entries, existing missing en-CA/en-AU/en-NZ locale resource entries, and pre-existing Zotero sync messages. No production Fish cloud error occurred after the real request capture. Debug store was restored from true to false.

Zotero native sync did POST imported disposable fixture metadata while fixtures were being created; plugin WebDAV temporary switches did not control Zotero native sync. All disposable fixture items and readers were erased/closed and no user reader state changed. The initial baseline artifact had a transcription error for webdav.autoUploadSettings; the actual bridge baseline was value=true,user=true, matching the final state. It was never a user change.

The baseline script did not capture the user's Read Aloud popupOpen/popup DOM state. Every toggleReadAloudPopup(false) call targeted only disposable fixture reader IDs, and no call targeted item 24246. Final user popupOpen=false/popupDOM=false is observed, but exact popup visibility restoration cannot be proven from the saved baseline; report this as a coverage limitation rather than a PASS claim.

## Retained artifacts

The root session copied the scripts and outputs from the tester scratch directory after reviewing the report. The preference-restore script is archived with its private memory snapshot redacted; it is not runnable as-is.

## Root review

The real Fish sample calls supplied the locale explicitly to the live remote
interface. The separate valid-transport popup test proves that the native
reader itself supplies the locale and produces the American English cue.
Neither test establishes listening quality or moving highlights.

The apparent auto-upload restoration mismatch was a transcription error
in the first baseline artifact. The independent pre-mutation snapshot in
outputs/02-mute-and-sync-off.json has true/user=true, matching the final
state. The correction is retained in outputs/17-baseline-correction.md.
User popup visibility was not captured initially and cannot be marked PASS.
Fish Speech Local was not live-tested; the local-provider stub was Kokoro.
