[Checklist index](../README.md) · [Scripts](../scripts/playback/README.md)

## Playback on a fixture

A session on a plugin voice, its log per provider, and the teardown.

Items 3.4 and 3.26 of the checklist, under their original numbers.

### 3.4

4. **Playback and its mechanism.** `notifyUserGestureActivation()` +
   `toggleReadAloudPopup(true)` in one script; `active && !paused`
   within a few seconds; the log `[zotero-tts] <provider>: N word
   timestamps for M chars` per sentence (`azure`/`local` N > 0, `system`
   N > 0 on Windows; `openai: no word timestamps for M chars,
   highlighting the sentence`, and on macOS `system: no word timestamps
   for M chars (macOS voices come without word timings), highlighting
   the sentence`);
   `manager.speed` the memory's. One pick per provider through the
   popup's own path (`selectVoice`, on the voice's language), each
   speaking within 15 s; a voice with no audio in 15 s is a FAIL with
   the log. Every pick is learned: memory and Zotero's entry follow.

### 3.26

26. **Teardown**: popup closed, tab closed, the item erased, `rows` back.
