[Checklist index](../README.md) · [Scripts](../scripts/openai-presets/README.md)

## The OpenAI section's server presets and Xiaomi MiMo (issues #34, #50, #52, #54)

Item 1.7 of the checklist, under its original number.

### 1.7

7. **Server preset** (OpenAI section, unlocked): the dropdown's preset
   grays exactly the fields its `uses` map says (`src/core/server-presets.ts`);
   switching to OpenAI and back **restores the address and model that
   server had** (issue #34, fixed in 1.10.2: `openai.presetValues`
   remembers each server's values; before that the preset's defaults
   overwrote them) **and, since 1.10.10, its key, Voices and Extra
   headers** (issue #52): with a token in Extra headers under Chatterbox,
   a switch to Other leaves `openai.headers` empty (report its length,
   never a value) and the switch back restores it byte-identical (compare
   a hash); a key typed under MiMo is gone under Other and back under
   MiMo the same way; a server never visited starts with all three
   empty. **A wrong address is named** (issue #54, 1.10.10): under MiMo,
   the Base URL input's `placeholder` is `https://api.xiaomimimo.com`;
   typing `https://api.xiaomimim.com` (an `input` event) puts
   `api.xiaomimim.com looks like a typo of api.xiaomimimo.com.` in the
   status line at once, and Test connection then answers `Not tested:
   api.xiaomimim.com looks like a typo of api.xiaomimimo.com.` within a
   few ms with no request made (no `Cannot reach` in the debug store);
   `https://mimo.corp.example` runs the test and its result ends
   `mimo.corp.example is not api.xiaomimimo.com: a mirror or a proxy?`;
   the own address gets no note. The `?` beside the dropdown carries the
   preset's note. Enable again at the end.
   **Xiaomi MiMo** (1.10.10, issue #50; needs a MiMo key in
   `openai.apiKey` — free at platform.xiaomimimo.com — and is NOT
   TESTABLE without one, said so): Disable → the dropdown to *Xiaomi
   MiMo* → Base URL `https://api.xiaomimimo.com` and Model
   `mimo-v2.5-tts` written, Extra headers grayed and nothing else (as
   for OpenAI), the `?` carrying the
   preset's note (derive from `PRESETS.mimo.note()`), Voices empty. Test
   connection → `Connected. Model mimo-v2.5-tts available. 9 voices
   available. Synthesis works.` — the probe is one two-character chat
   completion, and the model list also names `mimo-v2.5-tts-voiceclone`
   and `-voicedesign`, ranked first among the Model field's suggestions.
   Enable → the pref true, the section locked. In the voice browser and
   in a fixture's player the nine voices read `MiMo-mimo_default`,
   `MiMo-冰糖`, `MiMo-茉莉`, `MiMo-苏打`, `MiMo-白桦`, `MiMo-Mia`,
   `MiMo-Chloe`, `MiMo-Milo`, `MiMo-Dean` under Multiple languages, none
   of them `OpenAI-…`. One sentence of `fixture-b.pdf` read with
   `MiMo-冰糖` (`selectVoice`, paused in the same script) logs
   `[zotero-tts] openai: no word timestamps for N chars (audio through
   /v1/chat/completions), highlighting the sentence` — the note is the
   proof the chat route answered, since the speech route is a 404 on
   this server. A wrong voice id is told by the server's own words:
   Disable, Voices `alloy`, Test connection → `Connected, but synthesis
   failed: chat/completions audio: HTTP 400 — Unknown voice: alloy.
   Available voices: [mimo_default, 冰糖, 茉莉, 苏打, 白桦, Mia, Chloe,
   Milo, Dean]` (`serverReason` in `src/core/providers/openai.ts` quotes
   the longer of the error body's `message` and `param`); Voices back to
   empty. Then the dropdown back to the server it had (its address and
   model return through `presetValues`), Enable; the key is the user's
   to clear.
