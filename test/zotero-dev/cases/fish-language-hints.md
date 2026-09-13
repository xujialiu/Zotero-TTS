[Checklist index](../README.md)

## 3h. Fish cloud short-text language hints (issue #98)

**Verified mechanisms on 1.12.6-beta2.** See the
[run report](../runs/2026-09-13-1.12.6-beta2-language-hints/report.md) and
[retained scripts](../scripts/fish-language-hints/README.md). Listening and
moving highlights remain human checks. Initial user-popup visibility was
not captured, so exact visibility restoration is unproven. Fish Speech
Local was not live-tested; its repair and language policy are deferred to #99.

Run the [baseline](../baseline.md), then use a disposable EPUB/PDF fixture.
The existing angle-brackets EPUB can host direct interface probes; distinguish
these from real segment playback. Mute before playback, snapshot preferences,
disable automatic backup/sync before temporary changes, and restore everything
under the [cleanup](../cleanup.md) rules. Never drive the user's paused book.
Retain the actual scripts and sanitized results after running them; do not
label unrun scripts as verified.

1. **Locale reaches the sandbox.** Capture the real requested Fish voice's
   `locale`, including during a prepared voice switch. For en-US, the cue is
   `[Speak in American English]`; en-GB uses `[Speak in British English]`.
   Confirm the `fish: language hint` debug marker and the outgoing request.
   A debug marker alone does not prove transport. No UI switch is added.
2. **Threshold.** With bracket stripping effective, `< 100 exp>` requests
   `[Speak in American English] 100 exp` and `< 2/50 HP >` requests
   `[Speak in American English] 2/50 HP `. Digits count as words; the latter
   has three. Exactly four words (`One two three four`) receive no cue.
   Empty brackets synthesize nothing. Include a single-word example, a
   non-English locale and an unspaced-language fixture; word counts follow
   Intl.Segmenter, not spaces. Other-language pronunciation is human-only.
3. **Offsets.** Real Fish word ranges and their audio times describe the
   original stat words. The cue must not displace highlights; bracket
   removal still maps them into unchanged document text/sourcePosition.
   Repeat through the cache and confirm identical ranges without cumulative
   shifts. Returned audio and timings are not trimmed or estimated.
4. **Cache and prefetch.** Repeating a request makes no fetch. An uncued
   entry must not serve a cued request; en-US and en-GB cues must not share
   audio even with the same voice ID. Concurrent matching requests coalesce.
   Prefetch captures the requested locale and anchors on original text,
   reuses cued audio on playback, and cannot inherit a later voice change.
   Use restored transport stubs for artificial voice/locale combinations.
5. **Excluded paths.** Missing/invalid/unknown/mul locales send unchanged
   prepared text. Samples and four-word sentences remain uncued. A restored
   native stub and a Local stub receive no cue; neither requires paid or
   Local synthesis. No Fish Speech Local language inference is added.
6. **Listening.** The owner already confirmed both cloud examples correct
   with the cue and incorrect without it. Confirm the real fixture's audio
   has no spoken cue, changed content or new pronunciation error. Report
   listening and moving highlights separately from transport/offset proof.
7. **Restoration.** Compare user tabs, pause/position/voice, preference
   values and user-value flags, debug storage and all temporary hooks with
   the baseline. Remove fixture items and their position records. Restore
   volume before enabling automatic sync/backup. Record build hash and errors.
