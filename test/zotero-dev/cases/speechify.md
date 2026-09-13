[Checklist index](../README.md) · [Scripts](../scripts/speechify/README.md)

## Speechify (issue #79, 1.11.7)

The provider's section, its voices in the browser and a reading on it. Item
3.28 opens the Speechify session that 3.22 and 3.23 probe, so it runs before
them; it was item 3.20 until 2026-09-10, when the checklist change for #68
wrote over it, and is back here under a new number.

Items 1.15, 2.10, 3.22, 3.23 and 3.28 of the checklist, under their
original numbers.

### 1.15

15. **Speechify** (1.11.7, issue #79; needs the owner's key in
    `speechify.apiKey` — NOT TESTABLE without it, said so). The groupbox
    `#ztts-provider-speechify` sits between `#ztts-provider-cloudflare`
    and `#ztts-provider-local`, headed `Speechify`, with one
    `html:input type="password"` bound to
    `extensions.zotero.zotero-tts.speechify.apiKey` and no other field —
    report `type`, `disabled`, `revealPassword` and `value.length`,
    never a value. Its `?` (`ztts-help-speechify`) opens
    `#ztts-help-tip` within 100 ms (33 ms on 2026-09-09) with a
    337-character text beginning `The key is on the API keys page of
    your Speechify workspace`, Zotero's own tooltip staying `closed`.
    Test connection with the key → `Connected. 992 voices available.
    Synthesis works.` in about 3 s (3025 ms on 2026-09-09: five
    paginated pages of 200 voices, then two characters on the first
    voice listed, `hi-IN/aadi`) — the count is the key's whole list and
    may move by a few; under 900 is a failure. With `sk_wrong` → `The
    server rejected the API key. (Speechify voice list: Speechify
    rejected the API key (401) — Unauthorized)` in about 0.3 s; with the
    field empty → `No API key set for this provider.` Enable while a tab
    reads is refused by the guard naming the tab (section 3 item 9,
    issue #11); on an idle profile, or after a pref write and a pane
    reopen, the switch reads `Disable` with the key field `disabled` and
    `revealPassword` false. **The key is a secret**: read it into the
    pref inside Zotero (`IOUtils.readUTF8` of the owner's file), never
    into the transcript, and report its length only. A profile with
    `webdav.autoUploadSettings` on uploads every pref write to the
    owner's WebDAV settings file — the key included, until the restore
    uploads the empty one again (2026-09-09: seven uploads).

### 2.10

10. **Speechify's voices in the browser** (1.11.7, issue #79). With the
    provider on, the Local tier grows by exactly **992** (700 → 1692 on
    macOS, 2026-09-09; the base is the profile's), every row labeled
    `Speechify-`; off again, none. By language entry: English (United
    States) 84, English (United Kingdom) 37, French (France) 51,
    Japanese 44, Korean 36, Cantonese 10, and **none** under Multiple
    languages or Chinese — every voice carries one locale, and Mandarin
    is not among them. Labels read `Speechify-George (male)`, and where
    a name and gender repeat the id follows: `Speechify-Dominic (male,
    dominic)` beside `Speechify-Dominic (male, dominic_32)`, likewise
    Edmund, Geffen and Harper. **One sample only** — the account is on
    the Free plan, 50,000 characters a month: `Speechify-George (male)`
    → `audio/mpeg`, 29 229 bytes for the 52-character sample (64 kbps
    MP3), the glyph `▶` → `…` → `■` → `▶` within about 3.8 s, no
    `Sample failed:`.

### 3.28

28. **Speechify while reading** (1.11.7, issue #79). Point
    `readAloud.memory` at `speechify::en-US/george` before the popup
    opens and start fixture-a with a trusted Shift+Space: the manager is
    `active` on that voice, tier `local`, in about 2 s, and the first
    segment's audio is ready about 1.7 s later. Per segment the log
    reads `[zotero-tts] speechify: N word timestamps for M chars
    (simba-3.2)` — the model in parentheses is the routing's proof,
    `simba-3.0` on a non-English voice — with `[zotero-tts] prefetch:
    speechify: M chars ready ahead of playback` for the ones ahead
    (2026-09-09: 31/53/69/46 characters synthesized, 53/46/105/55
    prefetched, 512 characters spent by the whole run).
    `diagnostics.highlight()` on that view: `patched: true`,
    `state.segmentGranularity: "sentence"`, `activeWordTimestamp:
    "real"`, `sentenceSlot: "ours"`. The debug store holds no `429`,
    `rate limit`, `rate-limit wait` or `after a retry`: the provider's
    shared queue sends one request at a time, which the Free plan
    requires (two of three parallel requests answered 429 on
    2026-09-09). A session the bridge starts may sit at `_position 0`
    with its AudioContext `suspended` — Gecko's autoplay gate, section
    0 — so "N segments heard" and the word highlight keeping pace are
    the owner's check, not the bridge's. **Budget**: one short reading;
    every segment Zotero fetches ahead is billed.

### 3.22

22. **Speechify: text with nothing to say** (issue #79). With that
    session open, `voice.provider.remote.getAudio({ text: '* * *' },
    voice.impl)` resolves within 100 ms (4 ms) with an `audio/wav` of
    6 444 bytes — the 400 ms pause — and `[{ start: 0, end: 86400,
    charStart: 0, charEnd: 5 }]`, logging `speechify: empty audio for 5
    chars; playing a 400 ms pause instead` and **no line naming
    `simba`**: no request went out (live, `* * *` cost a minute and a
    502).

### 3.23

23. **Speechify: a key that stops working mid-reading** (issue #79).
    With `speechify.apiKey` set to `sk_wrong` (the real one stashed,
    restored by length), `getAudio` on an uncached sentence answers
    `{ audio: null, error: "unknown" }` within a second (0.29 s), never
    a hang, and the error console gains `Speechify simba-3.2: Speechify
    rejected the API key (401) — Unauthorized`.
