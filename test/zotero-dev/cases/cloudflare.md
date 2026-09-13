[Checklist index](../README.md) · [Scripts](../scripts/cloudflare/README.md)

## Cloudflare Workers AI (issue #72, 1.11.3)

The provider's section, its voices in the browser and a reading on it.

Items 1.14, 2.9 and 3.15 of the checklist, under their original numbers.

### 1.14

14. **Cloudflare Workers AI** (1.11.3, issue #72; needs an account id
    and a Workers AI API token in `cloudflare.accountId` /
    `cloudflare.apiToken` — NOT TESTABLE without them, said so). The
    groupbox `#ztts-provider-cloudflare` sits between
    `#ztts-provider-azure` and `#ztts-provider-local`, headed
    `Cloudflare Workers AI`, with an Account ID input (`type="text"`, 32
    characters) and an API token input (`type="password"`,
    `revealPassword` false) — report `type`, `disabled` and
    `value.length`, never a value, and **blank or crop the Account ID
    input before any screenshot of the section**: it is in the clear.
    The `?` opens `#ztts-help-tip` within 100 ms with the help text
    beginning `Both values are on the Workers AI page of your Cloudflare
    dashboard`. Test connection → `Connected. 66 voices available.
    Synthesis works.`, measured 1211–1409 ms: the model list (the four
    the plugin knows — `@cf/myshell-ai/melotts`, `@cf/deepgram/aura-1`,
    `aura-2-en`, `aura-2-es` → 4 + 12 + 40 + 10 voices), then two
    characters of `@cf/myshell-ai/melotts/en`, the first voice listed. A
    wrong account id (32 zeros; stash the real one and restore it byte
    for byte, compared by length) → `The server rejected the API key.
    (Cloudflare model list: Cloudflare rejected the API token or the
    account ID (403) — Authentication error)` within 431 ms; a wrong
    token gives the same sentence with `(401)` — the model list answers
    403 to the one and 401 to the other, the run route 401 to both, and
    the provider takes them in one `auth` branch. Enable is refused while
    any tab is reading, like every provider (section 3 item 9, issue
    #11): the click opens `#ztts-notice` in 8 ms and the pref stays
    false, so with sessions open this half runs on an idle profile or by
    a pref write. Enabled: switch `Disable`, both inputs `disabled`.
    **A single `Connected, but synthesis failed: … HTTP 500 — AiError:
    AiError: Internal server error (<request id>)` is Cloudflare, not
    the build**: MeloTTS 500ed one request in four on 2026-09-07 while
    Aura answered 6 of 6, the same request succeeded a moment later, and
    since 1.11.3 the provider retries a 5xx once after 500 ms
    (`RETRY_DELAY_MS`); a line that still fails names the second reply,
    and a segment the retry rescued says so in its debug line: `(audio
    from @cf/myshell-ai/melotts after a retry of HTTP 500)`.

### 2.9

9. **Cloudflare's voices in the browser** (1.11.3, issue #72). With the
   provider on, the Local tier grows by exactly 66 (787 → 853 on Windows,
   2026-09-07; the base is the profile's). Rows labeled `Cloudflare-`,
   by language entry: English (United States) 45, English (United
   Kingdom) 4, English (Ireland) 1, English (Australia) 2, English
   (Philippines) 1, Spanish (Mexico) 3, Spanish (Spain) 4, Spanish
   (Colombia) 1, Spanish (Latin America) 2, Chinese 1, Japanese 1,
   Korean 1 — 66, and none under Multiple languages. Labels read
   `Cloudflare-Aura-1 Angus (male)`, `Cloudflare-Aura-2 Amalthea
   (female)`, `Cloudflare-MeloTTS Chinese`. One sample of
   `Cloudflare-MeloTTS Chinese` → `audio/wav` (MeloTTS is uncompressed,
   about 88 KB per second: 216 422 bytes for 2.45 s), the glyph
   `▶` → `…` → `■` → `▶` within about 2.2 s, no `Sample failed:`; one
   sample of `Cloudflare-Aura-1 Angus (male)` → `audio/mpeg`, 17 084
   bytes for 2.85 s. **Two samples only**: Aura bills per character
   (about 1.4 Neurons on aura-1, 2.7 on aura-2, of 10,000 free a day),
   MeloTTS per second of audio.

### 3.15

15. **Cloudflare while reading** (1.11.3, issue #72). Point
    `readAloud.memory` at `cloudflare::@cf/myshell-ai/melotts/en` before
    the popup opens; the open starts the session on that voice, tier
    `local`, in about a second, and the tab's list is the profile's plus
    66 (2267 + 66 = 2333 on 2026-09-07). Per segment the log reads
    `[zotero-tts] cloudflare: no word timestamps for N chars (audio from
    @cf/myshell-ai/melotts), highlighting the sentence` — neither model
    family reports timing — with `[zotero-tts] prefetch: cloudflare: N
    chars ready ahead of playback` for the ones ahead and `(cached)` on
    a replay. `diagnostics.highlight()` on that view: `patched: true`,
    `granularity: "sentence"`, `activeWordTimestamp: "stand-in"`,
    `primaryShown: true`, `sentenceSlot: "ours"`, in word mode as in
    sentence mode — the whole-segment stand-in keeps the sentence lit.
    `selectVoice('cloudflare::@cf/deepgram/aura-1/angus')` then logs the
    same line naming `@cf/deepgram/aura-1`. **Budget**: read on MeloTTS.
    One played Aura sentence is five syntheses — Zotero's own read-ahead
    runs with `prefetchEnabled` off (304 characters, about 425 Neurons on
    2026-09-07) — so an Aura reading is a deliberate spend. `getAudio`
    with a wrong token (stashed, restored by length) resolves `{ audio:
    null, error: "unknown" }` in under 100 ms with `Cloudflare rejected
    the API token or the account ID (401) — Authentication error` in the
    log, never a hang; a segment Cloudflare 500s twice leaves the
    controller in `_error: "unknown"`, where only Retry or a voice
    re-pick moves it.
