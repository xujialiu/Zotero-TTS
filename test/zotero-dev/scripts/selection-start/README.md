# Scripts: start Read Aloud at a text selection (issue #105)

[Case](../../cases/selection-start.md) · [Checklist index](../../README.md) · [Shared runner](../_shared/README.md)

This kit uses one disposable PDF and one disposable EPUB, one fixture reader
at a time. It checks the boundary diagnostic, real mapper positions, trusted
Shift+Space in the closed and paused states, pause-in-place, and cleanup.
Scripts run in Zotero chrome scope through `_shared/run.js`; the full result of
each script is saved under `.tmp/zotero-dev/<runId>/results/`.

## Scripts

| Script | What it checks | Expected output | Params read |
| --- | --- | --- | --- |
| `00-baseline.js` | Preferences, user flags, open readers, selected tab, settings window and debug state | Snapshot with secret-bearing strings represented by presence and length | none |
| `01-close-preferences.js` | Closes settings before installation | `closed: true` when it was open | none |
| `02-startup-owner-resolver.js` | Startup identity and read-only resolver on the requested owner attachment | Startup has no failed steps; owner boundary calls resolve to the `That said,` segment; correction counters advance | `ownerKey` |
| `03-mute-disable-sync.js` | Test mute and temporary sync/backup switches | Volume `0`; three WebDAV switches `false`; prior values retained in state | none |
| `04-import-fixtures.js` | Imports fresh PDF and EPUB attachments | New item IDs and keys | `fixturesDir` |
| `05-open-pdf.js` | Opens the PDF fixture and waits for the reader manager | PDF view, manager and reader ready | state fixtures |
| `06-pdf-selection.js` | PDF mapper selections at a non-first shared sentence boundary, closed starts, paused starts, no-selection resume and playing pause | First new controller targets the shared-boundary sentence for opening word, first character, middle word and cross-sentence selections; no earlier new controller targets a wrong segment; pause keeps position and no-selection resume stays in place | state fixtures |
| `07-open-epub.js` | Opens the EPUB fixture and sets scrolled flow | EPUB view and manager ready | state fixtures |
| `08-epub-selection.js` | DOM selections, closed starts and paused first-character restart | First observed active segment equals the selected sentence; real DOM target is present | state fixtures |
| `09-close-erase-fixtures.js` | Closes fixture players/readers and erases only the fresh items | `left: 0`, `erased: true`, no teardown error | state fixtures |
| `10-restore-audit.js` | Restores values and flags, selected tab and debug storage; audits owner readers | Restored values equal baseline; owner sessions equal baseline | state baseline |

## Before you start

- Run `zotero_ping`, list plugins, and prove the installed bundle by its
  SHA-256. Install the requested beta build, list plugins again, then run the
  startup diagnostic before opening or changing a fixture.
- Run the baseline first and keep the owner readers read-only. The owner PDF
  is used only by the resolver script; it is never played, paused, closed or
  repositioned.
- Use `test/fixtures/fixture-a.pdf` and
  `test/fixtures/return-key/return-key.epub`. The import script generates
  timestamped titles and stores the item IDs in runner state.
- The preparation script sets plugin volume to zero and disables position
  sync, settings upload and settings sync. It restores the exact values and
  user flags in the final audit, with volume restored before the sync switches.
- A fixture player may synthesize through the configured voice while muted.
  A suspended AudioContext makes natural advancement NOT TESTABLE; resolver
  and first-active-segment evidence still runs.
- Start the group with `kit: 'selection-start'`, the script order above,
  `params: { ownerKey: '<loaded owner attachment key>' }`, and a run ID
  containing the date and installed build. Reset the runner state after
  collecting the final audit.

## Limits

- Trusted key return values prove event delivery, while the hook and manager
  state prove the first active segment. Human hearing and highlight motion are
  outside bridge verification.
- The PDF selection uses the reader view's native selection range state with
  positions produced by the real PDF mapper. EPUB selections use a real DOM
  `Range` and the view's selection popup path.
- Unknown and malformed resolver positions are observed read-only; malformed
  structures, mapper throws, upstream fixes and prototype restoration remain
  unit-test concerns.
- If a script fails, stop the pass, record the failed line and clean up the
  fixture manually through the bridge before rerunning. Do not reuse a
  baseline after an interrupted run.
- An early EPUB revision (18:37) closed a reader while its first selection
  requests were still settling and produced six plugin dead-object lines.
  Their stack went through `wrapForWindow` in the plugin's pause, volume and
  text-settings attachment callbacks (`content/zotero-tts.js:13252`), after
  the fixture tab had already been torn down. The corrected revision waited
  for the target controller, restored temporary hooks, and only then closed;
  the corrected rerun and both later passes produced no new plugin
  dead-object line. Those six lines remain a failed-attempt limit, not a PASS
  row.

## Runs

| Run | Issue comment | Items |
| --- | --- | --- |
| `2026-09-14-1.12.8-beta4-selection-start-final` | [#105 evidence](https://github.com/xujialiu/Zotero-TTS/issues/105#issuecomment-5662809551) | startup, owner resolver, PDF 8/8 selection starts plus pause-in-place, EPUB 3/3 starts plus paused restart, cleanup and owner/state restoration PASS; no new plugin error or dead-object line in the final run; natural audio advancement and human hearing were not assessed because the fixture run was muted |
| `2026-09-14-1.12.8-beta4-selection-start-boundary-pdf` | [#105 evidence](https://github.com/xujialiu/Zotero-TTS/issues/105#issuecomment-5662809551) | target index 1 shared predecessor boundary `[0,0,32]`; PDF 8/8 starts, first-active traces and new-controller traces PASS; no-selection resume and playing pause PASS; owner/preferences/debug restoration PASS |
