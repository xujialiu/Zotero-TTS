# The zotero-dev checklist — the whole plugin, live

The complete list of what a live check of Zotero-TTS covers, through the
zotero-dev bridge, so that a full pass leaves nothing out. **The whole
checklist runs only when the user asks for it** — a Zotero major update, a
batch of features landed, a release that carried either are the occasions
they may choose to ask on; no session runs it on its own. What runs
without being asked is **one section** plus the baseline, for a branch's
own verification. A feature adds its items here before it merges
(MEMORY.md, "Driving Zotero live") — drafted by the tester at the end of
its report, from what the run measured, and pasted by the session; a fix
that changed an expected output changes it here in the same commit.

How to run it is [the tester workflow](../../agents/zotero-tester.md) — the bridge's tools,
the polling windows, the state rules, the report. This directory is *what* to
check. A session running Fable, Astra, or Opus hands each section to the
`zotero-tester` agent as a verification brief and confirms the report
field by field; any other model drives the bridge itself by the same
rulebook. Sections run
one at a time — there is one Zotero — and each restores what it touched
before the next starts; reuse or replace the tester according to MEMORY.md's per-run context-cost rule. Every item names the check and the expected
output; "derive" means the agent takes the expected output from `src/`
and says so. The first full pass was the 1.10.1 bug hunt of 2026-08-31
(notes/NOTES_2026-08-31.md, 16:01), the second the 1.10.9 pass of
2026-09-05 on Windows (notes/NOTES_2026-09-05.md; issues #48, #49, #51),
the third the 1.11.0 pass of 2026-09-06 on Windows
(notes/NOTES_2026-09-06.md); the expected outputs below are what they
measured, updated for the fixes since where marked.

## Sections

Original section and item numbers remain stable. Cross-references such as
section 3 or §3a refer to the entries below. Paths written inside code
spans are relative to the repository root. Run sections sequentially,
with the baseline and restoration for each.

- [0. Before every section — the baseline](baseline.md)
- [1. Startup, the settings pane, providers, system voices](cases/settings-providers.md)
- [1a. Fish Audio: the cloud voices and the server block (issue #89, 1.11.8)](cases/fish-audio.md)
- [1b. Fish Audio voice sources (issue #91)](cases/fish-voice-sources.md)
- [1c. Fish UI refinement and English regions (issue #91, beta5)](cases/fish-ui-regions.md)
- [1d. Regional picks stay selected in PDF and EPUB (issue #91, beta6)](cases/regional-picks.md)
- [2. The voice browser, favorites, the default voice](cases/voice-browser.md)
- [3. The Read Aloud integration on a fixture](cases/playback.md)
- [3a. The whole sentence on screen (issue #83, 1.11.7)](cases/whole-sentence.md)
- [3b. A page's first line put back (issue #87, 1.11.7)](cases/page-first-line.md)
- [3c. The colors follow the first page (issue #88, 1.11.7)](cases/page-colors.md)
- [3d. Plugin-owned PDF following (issue #90, 1.12.1-beta3)](cases/pdf-follow.md)
- [4. Shortcuts, the toast, the recorder, two tabs](cases/shortcuts.md)
- [4a. The volume (issue #62)](cases/volume.md)
- [5. Reading positions, colors, the lifecycle](cases/positions-lifecycle.md)
- [6. Sync — reading positions and settings over WebDAV (1.10.4; the settings sync 1.11.7)](cases/webdav-sync.md)
- [7. Errors and the end of a pass](cleanup.md)
- [8. What only a human can check](limitations.md)
- [9. Not covered, and why](limitations.md)

## Reusable checks

Keep fixtures in `test/fixtures/`. For future tests, retain verified bridge
scripts in `scripts/` here, with their prerequisites, expected results,
allowed state changes, and cleanup. Save a sanitized run report under
`runs/<date>-<build>/` with build identity, environment, case numbers,
observations, status, and any remaining cleanup. Never save credentials
or raw preference backups in this repository. The main session saves the
artifacts supplied by the tester; the tester remains read-only on code.

Existing cases are documentation, not a claim of a fresh pass. Backfill
their reusable scripts and run evidence when the user next requests a
full pass, using what actually ran. Do not rerun tests just to populate
these directories. Human checks and coverage gaps both live in
[limitations](limitations.md).
