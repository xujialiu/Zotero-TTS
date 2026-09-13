[Checklist index](../README.md)

# Retained bridge scripts

One folder per case file, of the same name: `cases/voice-switch.md` keeps its
scripts in `voice-switch/`, and nowhere else. A folder holds a `README.md` and
the scripts, nothing more: the case's current kit, which every run of the
case updates in place. What a run actually executed, failed attempts
included, stays with its evidence in `../runs/<run>/scripts/`. The rule is
MEMORY/MEMORY.md's "Retain live test methods incrementally".

## Moved on 2026-09-13

Notes and older reports name the folders the executed scripts first lived
in. Each is now its run's `scripts/` (paths from `test/zotero-dev/`), and the
cases' kits were built from them.

| Old folder | Now |
| --- | --- |
| `angle-brackets/` | `runs/2026-09-13-1.12.4-beta2/scripts/` |
| `multiple-angle-brackets/` | `runs/2026-09-13-1.12.5-beta4/scripts/` |
| `bracket-pairs/` | `runs/2026-09-13-1.12.6-beta3/scripts/` |
| `auto-scroll/` | `runs/2026-09-12-1.12.3-beta2/scripts/` |
| `auto-scroll-beta3/` | `runs/2026-09-12-1.12.3-beta3/scripts/` |
| `auto-scroll-help/` | `runs/2026-09-12-1.12.3-beta4/scripts/` |
| `fish-pronunciation/` | `runs/2026-09-13-1.12.5-pronunciation/scripts/` |
| `fish-language-hints/` | `runs/2026-09-13-1.12.6-beta2-language-hints/scripts/` |
| `manual-follow/beta2/` | `runs/2026-09-13-1.12.6-beta2-manual-follow/scripts/` |
| `manual-follow/beta3/` | `runs/2026-09-13-1.12.6-beta3-manual-follow/scripts/` |
| `manual-follow/beta4/` | `runs/2026-09-13-1.12.6-beta4-manual-follow/scripts/` |
| `manual-follow/merged-beta/` | `runs/2026-09-13-1.12.7-beta-manual-follow/scripts/` |
| `player-expanded-first-pass/` | `runs/2026-09-12-1.12.3-beta/scripts/first-pass/` |
| `player-expanded-follow-up/` | `runs/2026-09-12-1.12.3-beta/scripts/follow-up/` |
| `voice-switch/` | `runs/2026-09-13-1.12.5-beta3/scripts/` |
| `voice-switch-followup/` | `runs/2026-09-13-1.12.5-beta3-followup/scripts/` |
| `voice-switch-kokoro/` | `runs/2026-09-13-1.12.5-beta5/scripts/` |
| `voice-switch-kokoro-beta6/` | `runs/2026-09-13-1.12.5-beta6/scripts/` |
| `voice-switch-regional/` | `runs/2026-09-13-1.12.6-beta/scripts/` |
| `voice-switch-all-providers/` | `runs/2026-09-13-1.12.6-beta-all-providers/scripts/` |
