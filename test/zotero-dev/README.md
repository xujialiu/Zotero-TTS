# Live checks through zotero-dev

This is the entry point for checking Zotero-TTS in the running Zotero.
**Run the whole checklist only when the user asks.** A branch's own
verification runs its case plus the baseline.

## Run a check

1. Read [the tester workflow](../../.agents/zotero-tester.md) for driving
   the bridge, protecting state and reporting results. Delegation and the
   verification brief follow [the testing rules](../../MEMORY/testing.md).
2. Choose the behavior in the [case index](case-index.md), then read only
   that case and its linked script kit. For a requested full pass, cover
   every case in the index.
3. Run the [baseline](baseline.md) before each case. Run cases one at a
   time, restoring what each touched before starting the next. A case
   opening a fixture ends with [playback item 3.26](cases/playback.md).
4. Finish with [cleanup](cleanup.md). Consult [limitations](limitations.md)
   for checks requiring a human and known coverage gaps.

## Find a case

- [Plugin and settings pane](case-index.md#the-plugin-and-its-settings-pane)
- [Providers](case-index.md#providers)
- [Voices](case-index.md#voices)
- [Reading](case-index.md#reading)
- [Highlight and following](case-index.md#the-highlight-and-following)
- [Keys](case-index.md#keys)
- [Positions, sync and backup](case-index.md#positions-sync-and-backup)

## Maintain the checklist

- **Adding or changing behavior:** follow [the testing rules](../../MEMORY/testing.md)
  to draft its case before verification, update the [case index](case-index.md)
  and correct expected outputs from the tester's report. Every item names
  a check and its expected output; “derive” means take it from `src/` and
  say so. Paths in code spans are relative to the repository root.
- **Reusing or retaining scripts:** read [the script kit guide](scripts/README.md).
  Existing cases document coverage, not a fresh pass; backfill scripts
  during the next requested full pass from what actually ran.
- **Resolving an older report or case number:** read [the checklist history](history.md)
  for the old file mapping, renumbered items and early full passes.
