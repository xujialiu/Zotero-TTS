[Checklist index](../README.md) · [Scripts](../scripts/system-voices/README.md)

## System voices

Item 1.8 of the checklist, under its original number.

### 1.8

8. **System voices.** `diagnostics.systemProvider()` → `enabled`,
   `platform` (`"win"` / `"mac"`), `unsupported: null`, `backend` with
   its `platform`, `wordTimestamps` and state, voices with
   `id`/`name`/`lang`/`zoteroId`; then with the first voice id →
   `synthesis.bytes` > 0, `type` audio, `backendAfter`. **On Windows**:
   `backend.running`, ids `sapi5/…` / `onecore/…`, `zoteroId`
   `local-urn:moz-tts:sapi:<desc>?<lang>`, `synthesis.words` > 0 (or
   `words: 0` with the SAPI-rate `note`); Test connection → `Connected.
   N voices available. Word timestamps available.`; the note beside the
   `?` reads `Your Windows voices, with word highlighting.` **On macOS**
   (issue #23, 1.11.0): `backend.wordTimestamps: false` and
   `backend.spawned` counting up (one `osascript` per listing, one `say`
   per sentence); every id `osx/<identifier>` with `zoteroId`
   `local-urn:moz-tts:osx:<identifier>`, the id set identical to
   `speechSynthesis.getVoices()` in the main window (191 = 191 on
   2026-09-06); `synthesis.words: 0` with `note: "macOS voices come
   without word timings"`; `diagnostics.systemProvider('osx/com.apple.voice.nosuch')`
   → `synthesisError` naming the voice and no `synthesis` — `say` alone
   would have spoken Samantha, exit 0; Test connection → `Connected. N
   voices available. Synthesis works. No word timestamps: macOS voices
   have none, so the sentence is highlighted.`; Enable turns
   `system.enabled` on and locks the section, and a planted
   `reader.readAloudVoices` entry naming `local-urn:moz-tts:osx:<id>` is
   rewritten to `system::osx/<id>` in `voice` and `tierVoices.local`
   about 0.5 s *after* the button reads Disable (the adoption is not
   awaited — poll the pref; and reset `readAloud.memory` after planting,
   since a chrome-scope write of that pref is a pick to memory-sync),
   with `adopted 1 remembered voice(s)` in the log; Disable off; the note
   reads `Your Mac's voices, highlighted by sentence.` with the Windows
   and Linux notes `hidden`. **On Linux** instead: `unsupported` is the
   platform sentence (`System voices are available on Windows and macOS
   only; this build has no speech helper for Linux.`), the note reads
   `Not available on Linux.`, and Test connection **and** Enable on the
   System voices section write that same sentence, word for word, to
   `#ztts-test-result-system` — never a sentence about an address, which
   that section does not have (issue #47); Enable leaves the pref false.
