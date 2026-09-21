[Checklist index](../../README.md) · [Case](../../cases/document-positions.md) · [Runner](../_shared/README.md)

# The Positions File shared with OpenReader — the kit

Items 1–14 of [document-positions](../../cases/document-positions.md), against the
owner's real WebDAV folder. Every server call is made from **inside** Zotero with the
plugin's own `webdav.url` / `webdav.username` / `webdav.password`, so no credential ever
reaches a command line, a script file or a report. **Last** is the run in the table at
the foot that executed the script; its measured values are the ones quoted.

| Script | What it checks | What it expects (measured) | Params | Last |
| --- | --- | --- | --- | --- |
| `01-import-and-open.js` | The run's EPUB imported and opened, polled to `_readAloudManager` | ready in 1,900 ms; leaves `state.fixture` | `fixturePath`, `fixtureTitle` | beta5 |
| `02-document-id.js` | The id the plugin named the fixture with, and its log line | `document id for 1/<key>: 3898 bytes read, 2 ms`; `documents.items` 1 | `expectedDocumentId` | beta5 |
| `03-read-two-sentences.js` | Item 3's playback: trusted Shift+Space, two sentences, pause — one script, because a round trip on a live session is billed audio | `consumed` 1; segments at 4.2 s and 5.5 s; `_audioContext` 0 → 0.373 s (a real sink); manager is **not** an Xray | `state.fixture` | beta5 |
| `04-pause-sync.js` | Item 7's two lines exist and both transports read `pause` | `position sync (pause)` + `shared position sync (pause)`, both `uploaded` | — | beta5 |
| `05-server-file.js` | Item 3's file: canonical, one item, every field | 365 bytes; `locator` `epubcfi(/6/2!/4/2/4)`; `stamp.device` = `settingsUpload().machine` | `expectedDocumentId` | beta5 |
| `06-blocks.js` | The fixture's leaf blocks, through `waiveXrays(sdt.mapper)` | 15 blocks, `/6/2!/4/2/2` … `/6/6!/4/2/10` | `state.fixture` | beta5 |
| `07-craft-phone-item.js` | A phone's item written into the file: a real block's path and a sentence from its own text | `putStatus` 204; `sentence` picks the block's *n*th sentence, `exact` overrides it | `craft {blockIndex, sentence\|exact, device, atDelta}` | beta3 |
| `08-pdf-tab.js` | The run's PDF imported and opened — a tab event, and item 12's id-less attachment | ready in 1,577 ms; leaves `state.pdf` | `pdfPath`, `pdfTitle` | beta3 |
| `09-tab-poke.js` | One close and one open, then a sync | `syncs` +1 per event; the shared log line for each | `state.pdf` | beta6 |
| `10-craft-carried-item.js` | Item 4's unusable item: `format` `pdf`, a fresh id, written **unsorted** | `putStatus` 204 | `carriedId` | beta5 |
| `11-file-state.js` | The file whole: canonical text, id order, every item's fields | `canonical` true, `sortedById` true | `expectedDocumentId`, `carriedId` | beta5 |
| `12-close-popup.js` | The session closed so Shift+Space takes the idle branch (`read-aloud-shortcuts.ts:340`), and the quiet period waited out | `active` false | `state.fixture` | beta3 |
| `13-resume-shift-space.js` | Items 5, 6, 13 and 14: the resume, its lines in order, the toast, the segment | `shared position sync (resume)` **before** `resumed from the shared position of …` | `state.crafted` | beta3 |
| `14-version-2.js` | Item 9: `version: 2` put in place, the file stashed first | `putStatus` 204, 2,450 bytes stashed; file byte-identical afterwards; its own stats read `skipped` (see Limits) | writes `state.positionsBefore` | beta6 |
| `15-restore-file.js` | The stashed file put back | `readBack` true, 2,450 bytes | `restoreText` (optional) | beta6 |
| `16-single-poke.js` | One sync, outside the 60 s failure window, read only once the flight has let go; `expectFileText` re-reads the file afterwards | `lastOutcome` belongs to that sync (`error`, 62,758 ms); `fileUnchanged` true | `waitMs`, `expectFileText` | beta6 |
| `17-player-play.js` | Item 11: the play press through `toggleReadAloudPaused` — the funnel the player button, Space and the plugin all reach (notes 2026-09-21 18:12) | one resume line, one resumed line, ends `paused: false` (unless the craft target is the book's last block — see Limits) | `secondPressMs` | beta3 |
| `18-immediate-play.js` | Item 12: the switch off, or a PDF with it on; `target` chooses the document independently of `mode` | `unpausedMs` 1; no resume line; switch restored in the `finally` | `mode` `sync-off`\|`pdf`, `target` `pdf`\|`fixture` | beta3 |
| `19-pause-timing.js` | Item 7: the ten quiet seconds, and two pauses inside them | pair at 10,900 ms; two pauses 3 s apart → **one** pair at 10,546 ms | `state.fixture` | beta5 |
| `20-final-position.js` | The place the desktop leaves for the phone | the paused sentence and the item that carries it | `expectedDocumentId` | beta6-phone |
| `21-cleanup.js` | Item 10 when the run crafted items: window waited out, tabs closed, PDF erased, **then** the crafted items deleted | nothing may sync after the edit, or a download carries them back | `keepIds`, `windowWaitMs` | beta5 |
| `22-item8-targets.js` | Item 8's starting point: the open EPUB readers, the file's items, and each row's `ts` from the plugin's own positions file (a GET) | 5 items / 2,450 bytes at the end of the beta6 run; `fileMatchesRow` true | — | beta6 |
| `23-item8-candidates.js` | The EPUB rows that have **no** item yet — the documents whose tab, opened, must derive one | 13 EPUB rows, 3 with items, 10 candidates, smallest first | — | beta6 |
| `24-item8-derive.js` | Item 8 live: each tab opened, `documents.items` polled, the log and console read for a derive error, the tab closed again | `rose` 1 per document, `derivedMs` 0 (ready in 792–1,932 ms); `errorLines` and `newConsoleErrors` empty | `derive` (itemIDs) | beta6 |
| `25-item8-file.js` | Item 8's second half: each derived item against its row — `stamp.at` = `ts`, locator = the row's CFI truncated to its block, `anchor.exact` length against the CFI's offsets | `stampEqualsRowTs` true, `locatorIsRowBlock` true, 172 chars for a `:76,:248` span | `derive` | beta6 |
| `26-volume.js` | Mute before the first playback and the byte-identical restore after | 100 / no user value → 0 → 100 / no user value | `volume` `mute`\|`restore` | beta6-phone |
| `27-cleanup-beta6.js` | Item 10 when the run crafted nothing: PDF tab closed, attachment erased, file re-read and left alone | `own.dropped` 1 (the erased PDF's row), shared `uploaded` false, 5 items | `expectIds`, `fixtureDocumentId` | beta6 |
| `28-file-snapshot.js` | The file read-only: bytes, SHA-256, a line per item; `before` keeps the text and the other device's item in `state.crafted`, `after` diffs every item against it | 2,336 bytes / `dbce5e9a…` → 2,349 / `7ac38be8…`; one item changed, four byte-identical, none gone | `snapshot` `before`\|`after`, `expectedDocumentId` | beta6-phone |
| `29-open-item.js` | A document the library already held, opened by item id — a cross-product fixture is found, not imported; the `reader-open` poke waited out on `running` false and a risen `lastAt` | ready in 701 ms, session idle; `shared position sync (reader-open): 5 remote, 5 merged, 1 adopted`, `uploaded` false | `openItemID`, `openKey` | beta6-phone |
| `30-close-fixture-tab.js` | The end of a run that imported nothing: the tab closed, **nothing erased**, the file read once more | `reader-close` sync `uploaded` false — the file stays as the pause left it | `expectedDocumentId` | beta6-phone |
| `31-craft-known-block.js` | Item 13's precondition: a phone's item for a KNOWN block path/text, no open reader needed (naming happens on open, issue #129) | `putStatus` 204; `sentences[sentence]` matches the live block text 07 reads once the tab later opens | `craft {documentId, path, blockText, sentence\|exact, device, atDelta}` | beta3 |
| `32-import-only.js` | Import an EPUB **without** opening it — item 13's fixture must exist before its item is crafted, and be named only by its first open | `documentsAfterImport` unchanged from before the import | `fixturePath`, `fixtureTitle`, `stateKey` | beta3 |
| `33-open-and-capture.js` | Items 13 and 14's open: `document id for … bytes read, … ms` → (if new) `document named on open: …` → `shared position sync (reader-open): … adopted` — imports first when `state[stateKey]` is absent | order `idIndex < namedIndex < syncIndex`; item 14 `after.items` unchanged, item 13 `after.items`/`.adopted` both +1 | `stateKey`, `fixturePath`, `fixtureTitle` | beta3 |
| `34-cleanup-two-fixtures.js` | Item 10 for a run with **two** fresh EPUB fixtures plus a PDF: closes/erases `state.fixture14`/`state.fixture13`/`state.pdf`, then deletes only `params.removeIds` from the file — a deny-list, not `21-cleanup.js`'s allow-list, safe against the owner's own devices changing the file mid-run | `finalCanonical` true; `removed` exactly the two crafted ids; every other item (including any item 8 derived) untouched | `removeIds` | beta3 |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_install`, `zotero_plugin_list` → the
  branch's `X.Y.Z-betaN`, then `diagnostics.startup()`. Prove the build from the **installed
  bundle**, not the version string — two betas of one version were both live on 2026-09-22:
  `AddonManager.getAddonByID(...).getResourceURI('content/zotero-tts.js')` and `fetch` it
  (a `jar:file://…` URI reads fine from chrome), then grep for the change under test.
- **Turn `webdav.syncSettings` off for the run** and restore it last; see the Limits.
- A run forbidden to touch the switches restores the volume **before** the last tab close
  instead, so a settings sync of the close carries the owner's own value, not the test 0.
- Fixtures: the EPUB is built by `.tmp/zotero-dev/document-positions/make-fixture.ts` from
  `test/core/document-id/zip-fixture.ts`'s `zip()` — three chapters, each an `<h1>` and four
  multi-sentence `<p>`s (15 leaf blocks, `/6/2!/4/2/2` … `/6/6!/4/2/10`), so "the second
  sentence of a later paragraph" is a real place; `node make-fixture.js <variant> <outPath>`
  takes a variant name and writes one EPUB with its own title and text, so items 13 and 14 (and
  a 1.14.0 reproduction, when one runs) each get a fresh, distinct fixture — reusing one book's
  content for two fixtures lets the second inherit the first's `documents` row and hides the
  bug (issue #129's evidence). Compile it with the installed `esbuild` (there is no `tsx`). It
  prints the Document Id, computed by `src/core/document-id`, which every later check compares
  against. The PDF is `test/fixtures/fixture-b.pdf`. **Never a user document for a crafted
  item**, and never playback on one: it would move a place the file is holding for another
  device. Item 8's derive is the one exception to "never a user document": it opens/closes the
  owner's own EPUBs read-only (see Limits), never crafting or playing on them.
- State it touches: the owner's real WebDAV folder (`xujialiu-positions.json` only — the
  plugin's own `zotero-tts-positions.json` and the settings files are read, never written),
  `webdav.syncPositions` (item 12 only, restored in the same script), `readAloud.volume`
  (0 before the first playback), `webdav.syncSettings` (off for the run),
  `Zotero.Debug.setStore(true)`, the run's own tabs and rows.
- Cleanup: `21-cleanup.js` (one fixture), `34-cleanup-two-fixtures.js` (two — items 13 and 14
  each need their own), `27-cleanup-beta6.js`, or `30-close-fixture-tab.js` (a run that imported
  nothing), then the prefs in order — volume first, settings sync last —
  `Zotero.Debug.setStore(false)`, the window minimized, `ZoteroTTSRun.api.reset()`.

## Limits

- **`autoUploadSettings: false` does not keep a test pref off the server.** The *shared*
  settings sync is gated by `webdav.syncSettings`, and with it on the next reader-close
  logged `settings sync (reader-close): 60 remote, 0 applied, 1 pushed, uploaded`. In the
  beta6 run the volume had already been restored, so the value that reached
  `zotero-tts-shared-settings.json` was the owner's own 100 — but its entry was re-stamped
  (`by macos`, `ts` the restore moment). Switch `webdav.syncSettings` off before muting.
- **The derive also runs at plugin start**, not only on a tab open: an in-place install
  re-attaches every open reader, so the documents the brief names may already have their
  items before the first diagnostic can be read. Watch the rise on a document that has none
  — `23-item8-candidates.js` lists them.
- **A second `Zotero.DBConnection('zotero-tts')` hangs.** Opening one to read the store's
  tables from chrome never returned and the bridge call came back a bare `undefined` with
  nothing in the error console; it also left the connection open. Read the store through
  `diagnostics.position()` instead.
- **`diagnostics.position()` can hang right after an in-place install.** One call came back
  a bare `undefined` with nothing in the error console while Zotero logged
  `PRAGMA wal_checkpoint(TRUNCATE)` … `database table is locked` for its own database in the
  same second; it answered in full a minute later. Race it against a timeout.
- **The two resume pulls finish in either order.** `pullBeforeResume` awaits both
  transports, so `position sync (resume)` and `shared position sync (resume)` appear in
  whichever order they complete — shared first on beta5, native first on beta6-phone. Only
  `shared position sync (resume)` **before** `resumed from the shared position of …` is a
  contract; the two syncs' order against each other is not.
- **The fixture EPUB and its five items are the owner's now.** A cross-product run neither
  imports nor erases: it opens item `1/S7TSK97P` (24640) and leaves every item genuine.
- **The toast persists.** `#ztts-speed-toast` stays in the document at `opacity: 0` with its
  old text (ui/speed-toast.ts), so only `opacity === '1'` is evidence, and only a poll
  during the 900 ms catches it.
- **The 60 s failure window.** After an errored sync every poke inside `SHARED_SYNC_RETRY_MS`
  is `skipped`, which overwrites `lastOutcome`; a `flush` (the resume pull) is forced and
  still runs. So `14-version-2.js`, which closes *and* reopens a tab, reads `skipped` — the
  erroring run's own numbers survive it (`uploaded` false, `adopted` 0, `remoteItems` /
  `carried` / `dropped` null), but the `error` reading needs `16-single-poke.js` after the
  wait, with `running` false first.
- **Item 12's switch-off half belongs on the PDF** (`target: 'pdf'`): `pullBeforePlay` tests
  the switch (`index.ts:1465`) before it looks for a Document Id, so the switch is the branch
  that answers, and the EPUB fixture's place stays where the phone expects it.
- **A second play press has to land early.** The pull can finish inside 600 ms, and a press
  on a session that is already playing is an ordinary pause. 106 ms showed the guard holding
  it; 616 ms measured nothing.
- **Item 11's craft target must not be the book's last block.** `/6/6!/4/2/10` (the last
  paragraph of the last chapter) reads to the end of the fixture within `17-player-play.js`'s
  own observation window, and the manager pauses itself there — indistinguishable in the
  script's `after` reading from a "second toggle" bug. `unpausedMs` and the segment at that
  timestamp (not `after.paused`) are the evidence for "no second toggle"; pick an earlier
  block for a clean `after.paused: false` (2026-09-22).
- **仙逆 (1/9ZY4DDSP) has no positions row**, so neither the backfill nor the derive path
  names it and the plugin logs no `document id for` line for it. Opening its reader does not
  produce one either. `IOUtils.read` of its 34,453,009 bytes measured 11 ms from chrome.
- Transient `WebDAVError: No reply … within 15 s` / `NetworkError` from this server cost two
  readings during the beta5 run; both were re-taken.

## Runs

| Date | Build | Items | Result |
| --- | --- | --- | --- |
| 2026-09-21 | 1.13.2-beta5 (`679460d`), Zotero 10.0.3-beta.3 | 1–7, 9–12 | PASS; **item 8 FAIL** (`sdt.mapper` crosses as an Xray, so `sourceToSDTPosition` is `undefined` and `deriveSharedFromNative` throws). Item 9 passed on substance with `shared.transport.uploaded` reading the previous sync's value. Scripts 01–21 all ran. |
| 2026-09-21 | 1.13.2-beta6 (`d86cc4e`), Zotero 10.0.3-beta.3 | baseline, 8, 9, 12 | PASS. **Item 8 fixed**: four documents derived — two at the install's reader re-attach, two on a tab open (`items` 3 → 4 → 5) — every `stamp.at` equal to its row's `ts`, no `sourceToSDTPosition` error anywhere. Item 9 now reports its own numbers (`uploaded` false, `adopted` 0, the three counts null) and left the file byte-identical. Item 12 (switch off, on the PDF) `unpausedMs` 1, no resume line. Scripts 08, 09, 14, 15, 16, 18, 22–27 ran. |
| 2026-09-21 | 1.13.2-beta6 (`d86cc4e`), Zotero 10.0.3-beta.3 | baseline, 5 with a genuine phone item | PASS. A **real** iPhone item (`iPhone-7xa7iot5`, `epubcfi(/6/6!/4/2/4)`, at 1789998483390) adopted by the `reader-open` poke (`5 remote, 5 merged, 1 adopted`), and Shift+Space spoke its sentence at 3,849 ms — not this machine's row. The desktop then claimed `/6/6!/4/2/6` as `macos` at 1790001263969 and uploaded; the other four items byte-identical, none gone. Item 11 NOT TESTED: the phone stayed idle, so no genuine item newer than the desktop's row ever appeared. Scripts 13, 20, 26, 28, 29, 30 ran. |
| 2026-09-22 | 1.14.1-beta3 (`7b5872e`, issue #129), Zotero 10.0.3-beta.3 | 13, 14, 5, 8, 11, 12 | PASS on every item. Reproduction skipped both checks (1.13.2-beta7, then this run's own earlier 1.14.1-beta install — never 1.14.0). **Item 14**: fixture opened with nothing held (`documents.items` 7→7 unchanged, `.documents` 15→16), craft with no sync between, Shift+Space → `shared position sync (resume): 8 remote, 8 merged, 1 adopted` **before** `resumed from the shared position of iPhone-test: exact`, first segment the crafted sentence exactly. **Item 13**: item crafted and PUT *before* the tab ever opened; the open logged, in order, `document id for 1/89L6N75W: 4413 bytes read, 2 ms` → `document named on open: 1/89L6N75W` → `shared position sync (reader-open): 9 remote, 9 merged, 1 adopted` (`documents` 16→17, `items` 8→9, `.adopted` 1→2); Shift+Space resumed at the crafted sentence. **Item 5**: a newer craft on the now-read fixture 13, adopted by an unrelated PDF tab's open (`shared position sync (reader-open): … 1 adopted`), Shift+Space resumed at the new sentence, not the bare locator's first sentence. **Item 8**: `ZTTS Return-Key EPUB` (24360, a standing fixture, opened/closed read-only) derived — `items` 9→10, `stampEqualsRowTs`/`locatorIsRowBlock` true, no `sourceToSDTPosition` error. **Item 11**: player play pulled a newer craft before resuming (`unpausedMs` 134; segment the crafted sentence at 134 ms, not the paused one); `after.paused` read `true` only because the craft targeted the book's last block — see Limits. **Item 12**: both halves on the PDF, `unpausedMs` 1, no resume line either time. Cleanup removed exactly the two crafted ids, left the item 8 derivation and every owner item (including one that arrived mid-run from the owner's own reading) untouched. Scripts 07, 08, 12, 13, 17, 18, 22–24, 31–34 ran. |
