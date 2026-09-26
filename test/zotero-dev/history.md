[Checklist](README.md)

# Checklist history

The first full pass was the 1.10.1 bug hunt of 2026-08-31
(notes/NOTES_2026-08-31.md, 16:01), the second the 1.10.9 pass of
2026-09-05 on Windows (notes/NOTES_2026-09-05.md; issues #48, #49, #51),
the third the 1.11.0 pass of 2026-09-06 on Windows
(notes/NOTES_2026-09-06.md); the cases retain their measured expected
outputs, updated for later fixes where marked.

## Split on 2026-09-13

Notes and older run reports name the case files these came from.

| Old case file | Now |
| --- | --- |
| `settings-providers.md` (section 1) | plugin-lifecycle, settings-pane, provider-controls, openai-split, system-voices, voice-browser (1.9), localization, plugin-icon, cloudflare, speechify, settings-sync-while-reading (1.16) |
| `fish-audio.md` (1a) | fish-audio, fish-speech |
| `fish-ui-regions.md` (1c) | fish-settings-refinement, fish-english-regions |
| `voice-browser.md` (section 2) | voice-browser, favorites, voice-samples, cloudflare (2.9), speechify (2.10) |
| `playback.md` (section 3) | reader-voice-list, remembered-voice, playback, highlight, silent-segments, prefetch-cache, reading-guard, sentence-pauses, cloudflare (3.15), raw-lang-tag, decomposed-text, settings-sync (3.19), settings-sync-provider-check (3.20), settings-backup (3.21), speechify (3.22, 3.23), kokoro-word-alignment |
| `shortcuts.md` (section 4) | player-keys, return-key, remembered-voice (4.7), shortcut-recorder, stop-key, word-highlight-key |
| `positions-lifecycle.md` (section 5) | reading-positions, highlight (5.5), plugin-lifecycle (5.6, 5.7) |
| `webdav-sync.md` (section 6) | position-sync, settings-backup (6.6–6.9), settings-sync (6.11–6.15, 6.17–6.19), settings-sync-while-reading (6.16), settings-sync-provider-check (6.20) |

Items 3.27 ([unchanged-voice](cases/unchanged-voice.md)) and 3.28
([speechify](cases/speechify.md)) were items 3.19 and 3.20 until
2026-09-10, when the checklist change for #68 wrote over them; they are
back under new numbers.
