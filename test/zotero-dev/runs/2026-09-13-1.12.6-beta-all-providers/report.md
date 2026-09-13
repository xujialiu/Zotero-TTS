# All-provider voice-handoff research

Build: Zotero-TTS 1.12.6-beta; installed XPI SHA-256 DC53B8DBFEAB40E3D8DD218A5FDEEDB443E6D50B757CB6A07EB01DD70A7833F6; installed bundle SHA-256 EA7525379AD667EEEFA3BF2B8424290D9963F95C7B0FFFBB8E1021D1B23B92B7. Zotero 10.0.2-beta.9+c77df79af, Windows / Firefox 140.

The fixture volume was 0, position/settings sync was disabled during the run, and the user reader was never played.

| Case | Source → target | Outcome | Decision | Audio-ready records |
|---|---|---|---|---|
| Fish cloud within-source | fish::en/8634617958764b539e0cdd5eb6c7723e → fish::en/732ea755bd9e446eb31dc79966b50428 | PASS word | shared-word-boundary | 7@3168ms/21->23 |
| Xiaomi MiMo within-source | openai::白桦 → openai::冰糖 | PASS sentence fallback | no-remaining-word-boundary | 7@2614ms/1->1; 8@4023ms/1->1; 9@5513ms/1->1; 10@7768ms/1->1; 11@9521ms/1->1 |
| Azure within-source | azure::en-US-AIGenerate1Neural → azure::en-US-AIGenerate2Neural | PASS word | shared-word-boundary | 7@1257ms/24->24 |
| Speechify within-source | speechify::en-US/alfonso → speechify::en-US/alicia | PASS word | shared-word-boundary | 7@3628ms/24->24 |
| Fish Speech within-source | fishspeech::bella → fishspeech::xiaobei | PASS sentence fallback | audio-not-ready-for-current-segment | 7@7413ms/1->1; 14@13743ms/1->1 |
| Kokoro within-source | local::af_alloy → local::af_aoede | PASS word | shared-word-boundary | 7@388ms/24->24 |
| Windows System within-source | system::onecore/MSTTS_V110_enUS_DavidM → system::sapi5/TTS_MS_EN-US_DAVID_11.0 | PASS word | shared-word-boundary | 7@264ms/24->24 |
| Chatterbox within-source | openai::Abigail.wav → openai::Adrian.wav | PASS sentence fallback | old-source-not-playing | 7@2108ms/1->1; 8@3167ms/1->1; 9@4071ms/1->1 |
| Azure to Fish | azure::en-US-Tyler:DragonHDFlashLatestNeural → fish::en/8634617958764b539e0cdd5eb6c7723e | PASS word | shared-word-boundary | 7@148ms/24->21 |
| Fish to Azure | fish::en/8634617958764b539e0cdd5eb6c7723e → azure::en-US-Tyler:DragonHDFlashLatestNeural | PASS word | shared-word-boundary | 7@138ms/21->24 |
| Fish to Kokoro | fish::en/f3a2b90078d54a65af4b95f63bc7798e → local::af_alloy | PASS word | shared-word-boundary | 7@143ms/24->24 |
| Kokoro to Fish | local::af_alloy → fish::en/f3a2b90078d54a65af4b95f63bc7798e | PASS word | shared-word-boundary | 7@144ms/24->24 |
| Kokoro to Speechify | local::am_v0michael → speechify::en-US/alfonso | PASS word | shared-word-boundary | 7@142ms/24->24 |
| Speechify to Kokoro | speechify::en-US/alfonso → local::am_v0michael | PASS word | shared-word-boundary | 7@139ms/24->24 |
| Speechify to Windows System | speechify::en-US/wyatt_32 → system::onecore/MSTTS_V110_enUS_DavidM | PASS word | shared-word-boundary | 7@141ms/24->24 |
| Windows System to Speechify | system::onecore/MSTTS_V110_enUS_DavidM → speechify::en-US/wyatt_32 | PASS word | shared-word-boundary | 7@139ms/24->24 |
| Fish to Fish Speech | fish::mul/default → fishspeech::bella | PASS sentence fallback | no-remaining-word-boundary | 7@153ms/24->1; 8@167ms/24->1 |
| Fish Speech to Fish | fishspeech::bella → fish::mul/default | PASS sentence fallback | no-remaining-word-boundary | 7@138ms/1->24; 8@160ms/1->9 |
| Fish Speech to MiMo | fishspeech::xiaobei → openai::白桦 | PASS sentence fallback | no-remaining-word-boundary | 7@133ms/1->1; 8@154ms/1->1 |
| MiMo to Fish Speech | openai::白桦 → fishspeech::xiaobei | PASS sentence fallback | no-remaining-word-boundary | 7@140ms/1->1; 8@158ms/1->1 |
| Fish to Chatterbox | fish::mul/default → openai::Abigail.wav | PASS sentence fallback | no-remaining-word-boundary | 7@135ms/24->1; 8@155ms/24->1 |
| Chatterbox to Fish | openai::Abigail.wav → fish::mul/default | PASS sentence fallback | no-remaining-word-boundary | 7@151ms/1->24; 8@170ms/1->9 |

## Official tiers

Standard (28 voices, 1 credit/minute) and Premium (1452 voices, 10 credits/minute) each synthesized one bounded fixture sentence through manual tier selection. Standard's first request returned a native Zotero HTTP 500 and its retry returned 200; Premium returned 200. These are native manual tier changes and are deliberately excluded from the #95 shortcut handoff matrix.

The [official follow-up](official-followup/report.md) then verified actual
same-tier shortcut handoffs for both Standard and Premium. Both committed at
word boundaries in the current segment, with target audio ready at 2392 ms and
3168 ms, respectively. This brings the total to 24 successful handoff cases.
Live menus contained no voices from a different tier. Manual tier changes
rebuilt the native controller at the same segment position; they do not use
the #95 prepared handoff. Script revision status and cleanup are retained
beside the follow-up report.

## Configuration and coverage

All filled provider configurations were temporarily enabled in the all-configured mode. Cloudflare had no account/token and was excluded. The saved Chatterbox preset was tested separately with Fish. The detailed sanitized evidence and actual script list are in evidence.json; scripts.pending records files that were not executed or were superseded by a later revision.

This pass covers eight within-source cases and seven cross-source pairs in both
directions, not every possible pair or every voice/model. The cross-source runs
reuse real provider audio from the session cache; their short readiness times
prove cached controller preparation, not cold network latency. The main session
checked all 22 records: each committed to the expected target, recorded prepared
playback at the diagnostic's segment and offset, and had no instrumentation
patch errors. Muted playback verifies the mechanism, not subjective continuity.
Favorites-only filtering was not added to this run at the user's direction.
Official within-tier shortcut handoff checks passed in the linked follow-up.

## Initial user report

The pre-existing user diagnostic was a Fish Beau→Dax committed sentence handoff with audio-not-ready-for-current-segment: requested segments 3 and 6 became ready at 4517 ms and 7826 ms while the old reader had already advanced to segments 4 and 5.

Restoration completed: the fixture was removed, baseline preferences and user-value flags matched, and the original user reader/tab state was restored.
