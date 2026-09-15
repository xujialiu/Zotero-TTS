# One regional voice list in the player (issue #106)

[Checklist index](../README.md)

Run the baseline first. Use disposable PDF and EPUB readers, preserve the
owner's sessions, and mute before opening players or selecting menu voices
(native paused menu selection plays a sample). Restore preferences and
their user-value flags, volume, selected tab and fixture positions afterward.

## 1. The menu and shortcuts share a regional list

On each format, select English (United States) with regional, generic
English and wildcard voices available. `diagnostics.playerVoiceList()`
must report `patched: true`, `offered` smaller than `compatible`, and the
selected regional voice. Read the actual popup's options: every offered
voice has normalized language `en-US`; Fish Audio's Adrian (`en`) is absent.
The menu's IDs and ordering must match previous/next shortcut cycling,
including both wrap directions. Manual selection of another offered voice
keeps English (United States) displayed. Repeat with English (United Kingdom).

## 2. Generic English remains available

Select English, then Fish Audio's Adrian from the actual menu. It remains
selected and the language displays English. A stale requested US region
must not turn generic selection into an empty list. Confirm no provider
voice IDs, favorites or saved choices are rewritten by catalog filtering.

## 3. A singleton region and fallback

With a controlled native-manager catalog containing one regional voice
plus generic/wildcard neighbors, the regional menu has one voice and both
shortcuts keep it selected. Remove that regional voice and allow native
resolution to choose a compatible generic voice: it remains usable, with
no missing controller caused by the shared getter. Unit tests additionally
cover no selected voice, realm callbacks that silently return no results,
and restoring the original accessor at disposal.

## 4. Cleanup and boundaries

Read new errors and verify the accessor is active on every fixture.
Restore every temporary setting and user-value flag, close and erase only
the fixtures, and confirm owner reader states match the baseline. Report
sample requests separately from list checks. This case verifies grouping
and selection; accent quality and playback comfort require listening.

The [script kit](../scripts/player-voice-list/README.md) retains executed
methods, prerequisites, expected outputs and cleanup. The
[1.12.9-beta verification](https://github.com/xujialiu/Zotero-TTS/issues/106#issuecomment-5664976874)
passed these checks with a controlled catalog and a read-only check of the
owner's real Fish catalog. Reuse the methods, not that run's PASS results.
