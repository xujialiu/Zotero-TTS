[Checklist index](../README.md) · [Scripts](../scripts/fish-audio/README.md)

## 1a. Fish Audio: the cloud voices (issue #89, 1.11.8)

Touches `zotero-tts.fish.*` (`enabled`, `apiKey`, `freeOnly`, `voices`),
the settings window, and a fixture tab. The account used for the first
pass (2026-09-10) is a free one with API credit 0: the free model
(`s2.1-pro-free`) answers, every paid model answers 402. One Test
connection per item, never a loop — each runs a real two-letter
synthesis. The key is never printed and never passed through a script;
Zotero reads it into the pref itself. Item 1a.1 lays out both blocks of
the section; the server block's own items are
[Fish Speech](fish-speech.md).

Items 1a.1–1a.8 and 1a.14 of the checklist, under their original numbers.

### 1a.1

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

### 1a.2

2. **Test connection with nothing pasted.** Key set, `freeOnly` true,
   `voices` empty, provider off. Click `ztts-test-fish`: `Testing…` within
   2 ms, then `Connected. N voices available. Synthesis works.` The
   count includes enabled official, own, and manual sources plus Default since #91;
   verify more than one with an ordinary working account. The earlier
   #89 pass (2026-09-10) returned only Default. No `[zotero-tts]` line:
   the pane's probe logs nothing.

### 1a.3

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

### 1a.4

4. **The paid model with no credit.** Uncheck `Use only the free model`
   (the click writes the pref: true → false). Test connection →
   `Connected, but synthesis failed: Fish Audio s2.1-pro: Fish Audio
   refused the request (402) — Insufficient API credit. API credit is
   managed independently from platform credit…` — the model named in it
   (`s2.1-pro`, not `-free`) is what proves the switch reached the
   request. Check the box again before going on.

### 1a.5

5. **Enable is a commit point.** Click `ztts-enable-fish`: button and
   line read `Checking…` within ~120 ms, then at ~1.6 s the label is
   `Disable`, `fish.enabled` is true, the line holds the connection
   message, and all three cloud fields — the checkbox included — are
   `disabled`.

### 1a.6

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

### 1a.7

7. **Chinese: one timestamp per character.**
   `test/fixtures/zh/zh.epub` (three sentences of 16, 24 and 11
   characters under a 6-character heading; `build.py` beside it) read
   with `Fish-cloud-Default`: `fish: 6 word timestamps for 6 chars`, `15 for
   16`, `22 for 24`, `10 for 11` — one segment per character, punctuation
   dropped, so N is the character count minus its punctuation. The
   remembered `mul` voice carries into the Chinese document by itself
   ("one voice everywhere").

### 1a.8

8. **The Default voice sends no reference.** Select `fish::mul/default`
   — `setLanguage('mul')` **before** `selectVoice`, or Zotero's
   `_applyVoice` drops an id outside the current language, leaving the
   manager `active` with `_controller` null and no error (measured
   2026-09-10; a user cannot reach that state, the dropdown filters by
   language). Then one sentence: a fresh
   `fish: 6 word timestamps for 31 chars (s2.1-pro-free)` with no
   `(cached)` and no `Reference not found` (400) anywhere — a
   `reference_id: "default"` would have produced one.

### 1a.14

14. **Leave the state as the owner had it**: the key and `fish.enabled` as
    before the pass, `fish.voices` without the bogus id,
    `fishspeech.enabled`, its address and its Extra headers as they were
    (the owner keeps a Cloudflare Access token there; the 2026-09-10 pass
    cleared it and put it back), the debug store back off, the fixtures
    erased. A pref write here fires the owner's settings auto-upload when
    it is on: the key travels with it.
