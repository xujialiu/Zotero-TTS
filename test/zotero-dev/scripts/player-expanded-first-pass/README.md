# Issue #81 first-pass scripts

These scripts were executed inline through `zotero_execute_js` on Windows
with Zotero 10.0.2-beta.9 and Zotero-TTS 1.12.3-beta. The archived source is
unchanged. They were not executed from these files. See the
[run report](../../runs/2026-09-12-1.12.3-beta/issue-81.md).

## Before reuse

The fixed attachment IDs 25428 and 25429 belonged to disposable PDF/EPUB
fixtures that were deleted. Never run these files unchanged on a new
session. Import fresh fixtures after suspending sync, verify ownership,
replace their IDs, and snapshot only the necessary preferences and reader
states before changing anything. Record both effective values and user-value
presence. Await asynchronous diagnostics before serializing their results.

The diagnostic and reader must be paired by array index plus window/tab
identity. Item ID alone is insufficient when a document has a tab and a
separate reader window. The PDF sampling script's item-ID lookup is valid
only with one reader for that attachment; adapt it before testing windows.

## Scope and expected observations

| Script | Permitted state change | Expected result |
| --- | --- | --- |
| pdf-first-frame.js | Close/open and pause only the disposable PDF player | Gate exists before opening; collected visible samples are expanded and ready |
| manual-collapse-pdf.js | Click only that fixture's Options button | Expanded becomes false, ready stays true, playback state unchanged |
| setting-disable.js | Set openExpanded false | Existing expanded popup remains expanded; gate CSS becomes empty |
| pending-disable.js | Temporarily replace fixture-window button click, then disable openExpanded | Pending popup is hidden, then visible and not pending; button patch restored |
| fixture-cleanup.js | Erase only verified IDs from the run-owned snapshot | Fixture items removed after their readers close |

The first-frame sampler polls at 20 ms and stops at the first successful
expanded state. It collected one visible sample per PDF/EPUB opening.
Those observations are not a recording of every rendered frame or a human
judgment that no flash is perceptible.

## Restoration

Restore fixture DOM patches even on failure. Close only owned fixture
readers, erase their items, and verify the position store is back to its
baseline. Restore voice preferences and plugin memory while transports
remain suspended; restore the verified original transport values last.
Re-read both values and user-value presence. Never use a temporary disabled
state as the original baseline. An originally enabled auto-upload may
upload normally when restored; record it rather than clearing the setting.

The first pass violated that last rule after a correct initial restoration.
Its failed snapshot-reporting and restore/clear source is retained as
non-executable `DO_NOT_RUN_*.txt` in the run's `harness-evidence/` directory.
Those files are incident evidence, not reusable cleanup instructions.
