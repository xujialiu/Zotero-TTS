[Checklist index](../README.md)

## 1a. Fish Audio: the cloud voices and the server block (issue #89, 1.11.8)

Touches `zotero-tts.fish.*` (`enabled`, `apiKey`, `freeOnly`, `voices`) and
`zotero-tts.fishspeech.*` (`enabled`, `baseURL`, `headers`), the settings
window, and a fixture tab. The account used for the first pass (2026-09-10)
is a free one with API credit 0: the free model (`s2.1-pro-free`) answers,
every paid model answers 402. One Test connection per item, never a loop —
each runs a real two-letter synthesis. The key is never printed and never
passed through a script; Zotero reads it into the pref itself.

1. **The section.** Between Speechify and Kokoro-FastAPI, one groupbox
   `ztts-provider-fish-audio`: `h2` `Fish Audio` over two
   `h3.ztts-subheading`, `Cloud (api.fish.audio)` and `Local`. The cloud block `ztts-provider-fish`: a password input on
   `fish.apiKey`, a checkbox `Use only the free model` on `fish.freeOnly`
   checked by default, a text input on `fish.voices` whose placeholder is
   `ids or links from fish.audio`, three `?` (`ztts-help-fish`,
   `ztts-help-fish-free-only`, `ztts-help-fish-voices`), `ztts-enable-fish`
   / `ztts-test-fish` / `ztts-test-result-fish`. The server block
   `ztts-provider-fishspeech`: a text input on `fishspeech.baseURL` showing
   `http://localhost:8080`, a **password** input on `fishspeech.headers`
   with placeholder `Name: value; Name: value`, two `?`
   (`ztts-help-fish-speech` and the shared `ztts-help-extra-headers`),
   `ztts-enable-fishspeech` / `ztts-test-fishspeech` /
   `ztts-test-result-fishspeech`. `diagnostics.l10n()` → `blank: []`,
   `questionless: []`. By eye: the field rows put their `?` in one column
   while the checkbox row's follows its label, as the checkbox rows of the
   Read Aloud sections do.
2. **Test connection with nothing pasted.** Key set, `freeOnly` true,
   `voices` empty, provider off. Click `ztts-test-fish`: `Testing…` within
   2 ms, then `Connected. N voices available. Synthesis works.` The
   count includes enabled official, own, and manual sources plus Default since #91;
   verify more than one with an ordinary working account. The earlier
   #89 pass (2026-09-10) returned only Default. No `[zotero-tts]` line:
   the pane's probe logs nothing.
3. **Pasted voices.** `fish.voices` =
   `https://fish.audio/m/179b5cc736974d96913c7849d0bb68c5/, ffffffffffffffffffffffffffffffff`
   (a real library voice and an id the library does not know). Test
   connection → the enabled official/own lists plus those IDs, without duplicates,
   with a successful synthesis probe (#91; the earlier #89 pass reported
   three). On a reader tab, `manager._allVoices` walked **by index** (a
   reader-realm `filter` from chrome answers `[]`) carries, all tier
   `local`: `Fish-cloud-jjk narrator` / `fish::en/179b…` / language `en`,
   `Fish-cloud-ffffffffffffffffffffffffffffffff (not found)` /
   `fish::mul/ffff…` / `mul`, and `Fish-cloud-Default` / `fish::mul/default` /
   `mul` (the prefixes since 1.11.8-beta3; `Fish-` before).
4. **The paid model with no credit.** Uncheck `Use only the free model`
   (the click writes the pref: true → false). Test connection →
   `Connected, but synthesis failed: Fish Audio s2.1-pro: Fish Audio
   refused the request (402) — Insufficient API credit. API credit is
   managed independently from platform credit…` — the model named in it
   (`s2.1-pro`, not `-free`) is what proves the switch reached the
   request. Check the box again before going on.
5. **Enable is a commit point.** Click `ztts-enable-fish`: button and
   line read `Checking…` within ~120 ms, then at ~1.6 s the label is
   `Disable`, `fish.enabled` is true, the line holds the connection
   message, and all three cloud fields — the checkbox included — are
   `disabled`.
6. **Word timestamps on an English fixture.** `fixture-a.pdf`, the
   memory pointed at `fish::en/179b…` before the popup opens so nothing
   metered can autostart. `toggleReadAloudPopup(true)` → `active`,
   `paused: false` on that voice at ~1.8 s. The debug store holds
   `[zotero-tts] fish: 6 word timestamps for 31 chars (s2.1-pro-free)`
   for the first sentence (then `10/53`, `10/69`, `8/46`, and
   `19/105 (cached)` on a repeat), the first ~1.5 s after the session
   starts, the rest prefetched 0.2–0.9 s ahead. `diagnostics.highlight()`
   on that tab: `activeWordTimestamp: "real"`, `granularity: "word"`,
   `state.wordPosition: true`, `primaryShown: true`,
   `sentenceSlot: "ours"`. A note with no `, N bridged` detail means every
   word the server returned was placed in the segment. Playback advances
   only after `reader._iframeWindow.document.notifyUserGestureActivation()`
   — a context built by a script stays `suspended` at `currentTime` 0;
   with the gesture it goes `running` and `_position` moves 0 → 1 in ~3 s.
7. **Chinese: one timestamp per character.**
   `test/fixtures/zh/zh.epub` (three sentences of 16, 24 and 11
   characters under a 6-character heading; `build.py` beside it) read
   with `Fish-cloud-Default`: `fish: 6 word timestamps for 6 chars`, `15 for
   16`, `22 for 24`, `10 for 11` — one segment per character, punctuation
   dropped, so N is the character count minus its punctuation. The
   remembered `mul` voice carries into the Chinese document by itself
   ("one voice everywhere").
8. **The Default voice sends no reference.** Select `fish::mul/default`
   — `setLanguage('mul')` **before** `selectVoice`, or Zotero's
   `_applyVoice` drops an id outside the current language, leaving the
   manager `active` with `_controller` null and no error (measured
   2026-09-10; a user cannot reach that state, the dropdown filters by
   language). Then one sentence: a fresh
   `fish: 6 word timestamps for 31 chars (s2.1-pro-free)` with no
   `(cached)` and no `Reference not found` (400) anywhere — a
   `reference_id: "default"` would have produced one.
9. **Fish Speech with no server.** Nothing listening on 8080 (`lsof
   -nP -iTCP:8080 -sTCP:LISTEN` empty). Test connection → within ~120 ms
   `Cannot reach Fish Speech at http://localhost:8080. Is the server
   running? (TypeError: NetworkError when attempting to fetch
   resource.)` — the throw site's own detail (issue #47). Then Enable:
   the message re-appears (17 ms; poll at 10 ms or the transition is
   invisible), `fishspeech.enabled` stays false, the label stays
   `Enable`, the fields stay unlocked, no `#ztts-notice` dialog.
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
11. **The server's references are the voices.** On a reader tab,
    `_allVoices` walked **by index**: `Fish-local-bella` /
    `fishspeech::bella` and `Fish-local-xiaobei` / `fishspeech::xiaobei`,
    both language `mul`, tier `local`, no title of their own — the
    server's list gives an id and nothing else.
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
14. **Leave the state as the owner had it**: the key and `fish.enabled` as
    before the pass, `fish.voices` without the bogus id,
    `fishspeech.enabled`, its address and its Extra headers as they were
    (the owner keeps a Cloudflare Access token there; the 2026-09-10 pass
    cleared it and put it back), the debug store back off, the fixtures
    erased. A pref write here fires the owner's settings auto-upload when
    it is on: the key travels with it.
