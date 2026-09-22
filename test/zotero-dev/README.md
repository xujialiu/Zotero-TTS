# The zotero-dev checklist — the whole plugin, live

The complete list of what a live check of Zotero-TTS covers, through the
zotero-dev bridge, so that a full pass leaves nothing out. **The whole
checklist runs only when the user asks for it** — a Zotero major update, a
batch of features landed, a release that carried either are the occasions
they may choose to ask on; no session runs it on its own. What runs
without being asked is **one case** plus the baseline, for a branch's
own verification. A feature adds its items here before it merges
(MEMORY/testing.md, "Driving Zotero live") — drafted by the main session
before verification, then corrected from the tester's report; a fix
that changed an expected output changes it here in the same commit.

How to run it is [the tester workflow](../../agents/zotero-tester.md) — the bridge's tools,
the polling windows, the state rules, the report. This directory is *what* to
check. The main session hands each case to the
`zotero-tester` agent as a verification brief and confirms the report
field by field. An explicit user request to test personally overrides
delegation; bug and feature research may be driven directly. Cases run
one at a time — there is one Zotero — and each restores what it touched
before the next starts; reuse or replace the tester according to MEMORY/testing.md's per-run context-cost rule. Every item names the check and the expected
output; "derive" means the agent takes the expected output from `src/`
and says so. The first full pass was the 1.10.1 bug hunt of 2026-08-31
(notes/NOTES_2026-08-31.md, 16:01), the second the 1.10.9 pass of
2026-09-05 on Windows (notes/NOTES_2026-09-05.md; issues #48, #49, #51),
the third the 1.11.0 pass of 2026-09-06 on Windows
(notes/NOTES_2026-09-06.md); the expected outputs below are what they
measured, updated for the fixes since where marked.

## Cases

One case, one behavior. The numbered sections the checklist grew up with
were split into cases on 2026-09-13, and every item kept its number as a
heading in its case (`### 3.9` is item 9 of section 3), so cross-references
such as §4.4, item 5.4 or §3a still resolve through the numbers listed here.
Paths written inside code spans are relative to the repository root. Run
cases one at a time, with the baseline and restoration for each; a case that
opens a fixture ends with item 3.26's teardown ([playback](cases/playback.md)).

- [0. Before every case — the baseline](baseline.md)

### The plugin and its settings pane

- [Install, in-place reinstall and reload](cases/plugin-lifecycle.md) — 1.1, 5.6, 5.7
- [The settings pane: its layout, the About group and the help icons](cases/settings-pane.md) — 1.2, 1.4
- [The plugin's strings in Zotero's language](cases/localization.md) — 1.10–1.12
- [The plugin's icon](cases/plugin-icon.md) — 1.13
- [The plugin player: layouts, real controls, favorites and following](cases/plugin-player.md)
- [A provider section: locked fields, Test connection and Enable](cases/provider-controls.md) — 1.3, 1.5, 1.6
- [The secret fields: covered, uncovered by the eye, and copyable](cases/secret-fields.md) — the masked half of 1.3

### Providers

- [Providers on first installation (issue #132)](cases/first-install-providers.md)

- [The OpenAI section split into OpenAI, Xiaomi MiMo and OpenAI Compatible, and the old settings carried over (issue #113)](cases/openai-split.md)
- [System voices](cases/system-voices.md) — 1.8
- [Cloudflare Workers AI](cases/cloudflare.md) — 1.14, 2.9, 3.15
- [Speechify](cases/speechify.md) — 1.15, 2.10, 3.22, 3.23, 3.28
- [1a. Fish Audio: the cloud voices](cases/fish-audio.md) — 1a.1–1a.8, 1a.14
- [1a. Fish Speech: a server of the owner's own](cases/fish-speech.md) — 1a.9–1a.13
- [1b. Fish Audio voice sources (issue #91)](cases/fish-voice-sources.md)
- [1c. Fish settings refinement (issue #91, beta5)](cases/fish-settings-refinement.md)
- [Fish English voices under their regions (issue #91, beta5)](cases/fish-english-regions.md)
- [3h. Fish cloud short-text language hints (issue #98)](cases/fish-language-hints.md)
- [Kokoro word timestamps on rewritten words](cases/kokoro-word-alignment.md) — 3.24, 3.25

### Voices

- [The voice browser: the listing, the default voice and speed](cases/voice-browser.md) — 1.9, 2.1, 2.2, 2.7
- [Favorite voices](cases/favorites.md) — 2.3–2.5, 2.8
- [Voice samples in the browser](cases/voice-samples.md) — 2.6
- [The player's voice list](cases/reader-voice-list.md) — 3.1, 3.3
- [One regional list for the player and shortcuts (issue #106)](cases/player-voice-list.md)
- [One entry per provider in the player's first dropdown (issue #110)](cases/provider-tiers.md)
- [Zotero's Standard and Premium behind switches of their own (issue #111)](cases/zotero-tiers.md)
- [The player without a Zotero account (issue #130)](cases/signed-out-voices.md)
- [A voice list landing on the playing voice keeps the controller](cases/unchanged-voice.md) — 3.27
- [The remembered voice](cases/remembered-voice.md) — 3.2, 3.11, 4.7
- [A PDF's raw /Lang tag](cases/raw-lang-tag.md) — 3.12–3.14
- [1d. Regional picks stay selected in PDF and EPUB (issue #91, beta6)](cases/regional-picks.md)
- [4a. Previous and next voice (issue #95)](cases/voice-switch.md)
- [4c. Voice-switch notice lifetime (issue #119)](cases/voice-notice.md)

### Reading

- [Playback on a fixture](cases/playback.md) — 3.4, 3.26
- [3l. Playback preparation notice (issue #120)](cases/playback-notice.md)
- [Invisible text and empty audio](cases/silent-segments.md) — 3.6, 3.7
- [Prefetch and cache](cases/prefetch-cache.md) — 3.8
- [The reading guard](cases/reading-guard.md) — 3.9
- [The pauses between sentences and paragraphs](cases/sentence-pauses.md) — 3.10
- [Text stored decomposed](cases/decomposed-text.md) — 3.16–3.18
- [3b. A page's first line put back (issue #87, 1.11.7)](cases/page-first-line.md)
- [3e. Open the player expanded (issue #81)](cases/player-expanded.md)
- [3g. Enclosing brackets (issues #94, #96, #101)](cases/angle-brackets.md)
- [3j. A sentence across Zotero's paragraph break, read as one (issue #104, 1.12.8)](cases/paragraph-parts.md)
- [3k. Audio that arrives after its tab closed is dropped (issue #116, 1.12.11)](cases/late-audio.md)
- [4b. The volume (issue #62)](cases/volume.md)

### The highlight and following

- [Player position shortcut (issue #122)](cases/player-position-key.md)
- [Player menus, floating controls and speed steps (issue #118)](cases/player-controls.md)
- [Player A/M follows the current document (issue #117)](cases/player-following.md)
- [The highlight and its colors](cases/highlight.md) — 3.5, 5.5
- [The Sentence and Word switches (issue #114, 1.12.11)](cases/highlight-levels.md)
- [3a. The whole sentence on screen (issue #83, 1.11.7)](cases/whole-sentence.md)
- [3c. The colors follow the first page (issue #88, 1.11.7)](cases/page-colors.md)
- [3d. Plugin-owned PDF following (issue #90, 1.12.1-beta3)](cases/pdf-follow.md)
- [3f. Auto-scroll modes (issue #93)](cases/auto-scroll.md)
- [3i. Manual navigation while the sentence remains visible (issue #100)](cases/manual-follow.md)
- [Scrolling stays smooth while the player is open (issue #125, 1.13.1)](cases/scroll-performance.md)

### Keys

- [The player keys and the tab they reach](cases/player-keys.md) — 4.1–4.3, 4.5, 4.6
- [Start at the selected sentence (issue #105)](cases/selection-start.md)
- [Shift+Enter — go to reading position](cases/return-key.md) — 4.4
- [The shortcut recorder](cases/shortcut-recorder.md) — 4.8
- [Stop reading everywhere](cases/stop-key.md) — 4.9
- [Word highlight on / off](cases/word-highlight-key.md) — 4.10

### Positions, sync and backup

- [Reading positions](cases/reading-positions.md) — 5.1–5.4, 5.8
- [Reading position sync over WebDAV](cases/position-sync.md) — 6.1–6.5, 6.10
- [The Positions File shared with OpenReader](cases/document-positions.md) — 1–14 (issues #126, #129)
- [Settings backup](cases/settings-backup.md) — 3.21, 6.6–6.9
- [Settings sync over WebDAV](cases/settings-sync.md) — 3.19, 6.11–6.15, 6.17–6.19
- [Synced settings wait while a tab reads](cases/settings-sync-while-reading.md) — 1.16, 6.16
- [A synced provider that fails its check goes off here only](cases/settings-sync-provider-check.md) — 3.20, 6.20

### The end of a pass

- [7. Errors and the end of a pass](cleanup.md)
- [8. What only a human can check](limitations.md)
- [9. Not covered, and why](limitations.md)

### Split on 2026-09-13

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

## Reusable checks

Keep fixtures in `test/fixtures/`. Every case file has one
[scripts folder](scripts/README.md) of the same name — `cases/voice-switch.md`
keeps its scripts in `scripts/voice-switch/` — holding only a `README.md` and
the scripts: the case's current kit, with its order, expected results,
allowed state changes, cleanup and runs, written by the tester during the
run and reviewed by the main session; [`scripts/_shared/`](scripts/_shared/README.md)
holds the runner, which has Zotero execute a kit's scripts from disk, and
the steps every kit uses. There is no run archive: a run's
table goes on its issue (a full pass's into that day's NOTES entry), and
`runs/`, which held reports and executed scripts until 2026-09-14, is in
the git history before that day — a case or kit that names a run's report
or archived script means that history. Never save credentials or raw
preference backups in this repository; the tester writes under `scripts/`
and nowhere else.

Existing cases are documentation, not a claim of a fresh pass. Backfill
their reusable scripts when the user next requests a full pass, using
what actually ran. Do not rerun tests just to populate these
directories. Human checks and coverage gaps both live in
[limitations](limitations.md).
