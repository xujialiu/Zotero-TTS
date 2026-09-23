[Checklist index](../../README.md) · [Case](../../cases/document-positions.md) · [Runner](../_shared/README.md)

# The Positions File shared with OpenReader — the kit

Items 1–15 of [document-positions](../../cases/document-positions.md), against the test WebDAV
folder of the Test WebDAV rule, never the owner's. Every server call is made from **inside** Zotero with the plugin's own
`webdav.url`/`webdav.username`/`webdav.password`, so no credential ever reaches a command line, a
script file or a report. **Last** is the run in the table at the foot that executed the script.

| Script | What it checks | What it expects (measured) | Params | Last |
| --- | --- | --- | --- | --- |
| `01-import-and-open.js` | The run's EPUB imported and opened, polled to `_readAloudManager` | ready in 1,900 ms; leaves `state.fixture` | `fixturePath`, `fixtureTitle` | beta5 |
| `02-document-id.js` | The id the plugin named the fixture with, and its log line | `document id for 1/<key>: 3898 bytes read, 2 ms`; `documents.items` 1 | `expectedDocumentId` | beta5 |
| `03-read-two-sentences.js` | Item 3's playback: trusted Shift+Space, two sentences, pause — one script, because a round trip on a live session is billed audio | `consumed` 1; segments at 4.2 s and 5.5 s; `_audioContext` 0 → 0.373 s (a real sink); manager is **not** an Xray | `state.fixture` | beta5 |
| `04-pause-sync.js` | Item 7's two lines exist and both transports read `pause` | `position sync (pause)` + `shared position sync (pause)`, both `uploaded` | — | beta5 |
| `05-server-file.js` | Item 3's file: canonical, one item, every field | 365 bytes; `locator` `epubcfi(/6/2!/4/2/4)`; `stamp.device` = `settingsUpload().machine` | `expectedDocumentId` | beta5 |
| `06-blocks.js` | The fixture's leaf blocks, through `waiveXrays(sdt.mapper)` | 15 blocks, `/6/2!/4/2/2` … `/6/6!/4/2/10` | `state.fixture` | beta5 |
| `07-craft-phone-item.js` | A phone's item written into the file: a real block's path and a sentence from its own text | `putStatus` 204; `sentence` picks the block's *n*th sentence, `exact` overrides it | `craft {blockIndex, sentence\|exact, device, atDelta}` | beta3 |
| `08-pdf-tab.js` | The run's PDF imported and opened — a tab event, and item 12's id-less attachment | ready in 1,577 ms; leaves `state.pdf` | `pdfPath`, `pdfTitle` | beta4-r2 |
| `09-tab-poke.js` | One close and one open, then a sync | `syncs` +1 per event; the shared log line for each | `state.pdf` | beta4-r2 |
| `10-craft-carried-item.js` | Item 4's unusable item: `format` `pdf`, a fresh id, written **unsorted** | `putStatus` 204 | `carriedId` | beta5 |
| `11-file-state.js` | The file whole: canonical text, id order, every item's fields | `canonical` true, `sortedById` true | `expectedDocumentId`, `carriedId` | beta5 |
| `12-close-popup.js` | The session closed so Shift+Space takes the idle branch (`read-aloud-shortcuts.ts:340`), and the quiet period waited out | `active` false | `state.fixture` | beta3 |
| `13-resume-shift-space.js` | Items 5, 6, 13 and 14: the resume, its lines in order, the toast, the segment | `shared position sync (resume)` **before** `resumed from the shared position of …` | `state.crafted` | beta-phone |
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
| `28-file-snapshot.js` | The file read-only: bytes, SHA-256, a line per item; `before` keeps the text and the other device's item in `state.crafted`, `after` diffs every item against it | 4,495 bytes / `561c891b…` → 4,504 / `e09f0604…`; one item changed, ten byte-identical, none gone | `snapshot` `before`\|`after`, `expectedDocumentId` | beta-phone |
| `29-open-item.js` | A document the library already held, opened by item id — a cross-product fixture is found, not imported; the `reader-open` poke waited out on `running` false and a risen `lastAt` | ready in 701 ms, session idle; `shared position sync (reader-open): 5 remote, 5 merged, 1 adopted`, `uploaded` false | `openItemID`, `openKey` | beta6-phone |
| `30-close-fixture-tab.js` | The end of a run that imported nothing: the tab closed, **nothing erased**, the file read once more | `reader-close` sync `uploaded` false — the file stays as the pause left it | `expectedDocumentId` | beta4-r2 |
| `31-craft-known-block.js` | Item 13's precondition: a phone's item for a KNOWN block path/text, no open reader needed (naming happens on open, issue #129) | `putStatus` 204; `sentences[sentence]` matches the live block text 07 reads once the tab later opens | `craft {documentId, path, blockText, sentence\|exact, device, atDelta}` | beta4-r2 |
| `32-import-only.js` | Import an EPUB **without** opening it — item 13's fixture must exist before its item is crafted, and be named only by its first open | `documentsAfterImport` unchanged from before the import | `fixturePath`, `fixtureTitle`, `stateKey` | beta-phone |
| `33-open-and-capture.js` | Items 13 and 14's open: `document id for … bytes read, … ms` → (if new) `document named on open: …` → `shared position sync (reader-open): … adopted` — imports first when `state[stateKey]` is absent | order `idIndex < namedIndex < syncIndex`; item 14 `after.items` unchanged, item 13 `after.items`/`.adopted` both +1 | `stateKey`, `fixturePath`, `fixtureTitle` | beta-phone |
| `34-cleanup-two-fixtures.js` | Item 10 for a run with **two** fresh EPUB fixtures plus a PDF: closes/erases `state.fixture14`/`state.fixture13`/`state.pdf`, then deletes only `params.removeIds` from the file — a deny-list, not `21-cleanup.js`'s allow-list, safe against the owner's own devices changing the file mid-run | `finalCanonical` true; `removed` exactly the two crafted ids; every other item (including any item 8 derived) untouched | `removeIds` | beta3 |
| `35-read-on-then-pause.js` | Item 13/14 continued: after a resume, un-pauses through the play funnel (`pullBeforePlay`, item 11) and reads on `minExtraSegments` more segments before pausing again, then waits out the ten quiet seconds | 2 segments in 2,823 ms (ran into the third paragraph); both pause syncs at 10,994 ms, `uploaded` true on each | `minExtraSegments`, `maxWaitMs` | beta-phone |
| `36-sync-settings-switch.js` | `webdav.syncSettings` off for the run, on again after — mirrors `26-volume.js` | `off`: `true`/user-value → `false`; `restore`: snapshot `true`/user-value read back exactly, `now` `true` | `syncSettings` `off`\|`restore` | beta-phone |
| `38-harvest-positions.js` | Item 15/8's own fixtures: real block/sentence positions off an **open** reader's SDT, and a fine sentence-range source position via `mapper.sdtToSourcePosition` (round-trip verified against `sourceToSDTPosition`), kept **whole** (`type`/`conformsTo`/`value`) — a bare block-level CFI does **not** resolve (a live probe returned `null` for one) | e.g. b-long's block 700 `/6/156!/4/16`, `pos.value` `epubcfi(/6/156!/4/16/1,:102,:203)`; `roundTripMatches` true | `stateKey`, `requests[{label,blockIndex,sentenceIndex}]` | beta4-r2 |
| `39-craft-native-row.js` | A hand-written row in `zotero-tts-positions.json` (never `xujialiu-positions.json` — that is 07/31's file), as another computer's pre-upgrade row | `putStatus` 204; entry `{lib,key,pos:<whole object from 38>,ts}` — `pos.type` present, or `deriveSharedFromNative` never logs (Limits) | `craft{ts,positionsLabel,attachmentStateKey}` (or `pos`/`lib`/`key` direct), `stateKey` | beta4-r2 |
| `40-open-and-race.js` | Items 15/8's tested open: `deriveSharedFromNative`'s own log line against the shared sync's, timed by the debug store's own `(+NNN)` deltas summed from a logged marker (Zotero's clock, not a poll's) | item 15 (`b-long`): `sync-before-row` at 648/690 ms, held stays the phone's; item 8 (`c`): `row-before-sync` at 389/422 ms, `stamp.at` the row's `ts` exactly | `stateKey`, `expectedRowTs`, `waitMs` | beta4-r2 |
| `41-cleanup-item15-item8.js` | Item 10 for 15/8: closes/erases every `stateKeys` fixture, deny-lists `removeIds` off the shared file, confirms the native file self-healed (the erase's own tombstone) without rewriting it | `nativeRemainingForErased` `[]`; shared file holds the pre-existing items plus any legitimate item 8 derivation, deny-listed ids gone; native back to 85 | `stateKeys`, `removeIds`, `deleteSharedFileIfEmpty`, `deleteNativeFileIfEmpty` | beta4-r2 |
| `42-check-shared-item.js` | Read-only: one Document Id's item off the shared file plus both transports' stats, for item 15/8's end-state check after a poke sync | item 15's item byte-identical to what was crafted, `uploaded` false; item 8's `stamp.at`/`device`/`anchor.exact` match the row | `documentId` | beta4-r2 |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_install`, `zotero_plugin_list` → the branch's
  `X.Y.Z-betaN`, then `diagnostics.startup()`. Prove the build from the **installed bundle**, not
  the version string: `AddonManager.getAddonByID(...).getResourceURI('content/zotero-tts.js')`,
  `fetch` it (a `jar:file://…` URI reads fine from chrome), grep for the change under test.
- **Turn `webdav.syncSettings` off for the run** and restore it last; see the Limits.
- A run forbidden to touch the switches restores the volume **before** the last tab close
  instead, so a settings sync of the close carries the owner's own value, not the test 0.
- Fixtures: `.tmp/zotero-dev/document-positions/make-fixture.ts` (gitignored — recreated each
  run) builds a real EPUB off `test/core/document-id/zip-fixture.ts`'s `zip()`: chapters, each an
  `<h1>` and several `<p>`s directly in `<body>`, every sentence naming its own position.
  `node make-fixture.js <variant> <outPath>` (the installed `esbuild`, no `tsx`) prints the
  Document Id. Presets: `b`/`b-long` (item 15 — `b-long`, 80 chapters, is what actually outlasted
  the sync in beta4-r2) and `c` (item 8 — small, opened once to prime its analysis first). Items
  13/14 need their own small, distinct-content presets back (issue #129). A block's real
  path/text always comes off an **open** reader, never guessed (Limits). The PDF is
  `test/fixtures/fixture-b.pdf`. **Never a user document for a crafted item**, never playback on
  one. Item 8's derive with a *standing* fixture is the one exception: read-only, never crafting
  or playing on it.
- State it touches: `xujialiu-positions.json` for every item before 15; 15 and 8 also hand-write a
  row into `zotero-tts-positions.json` (`39-craft-native-row.js`), removed again by erasing the
  fixture (its own tombstone), never rewritten by hand — `webdav.syncPositions` (item 12, restored
  in-script), `readAloud.volume` (item 3+), `webdav.syncSettings` (off for the run), `Debug.setStore(true)`.
- Cleanup: `21-cleanup.js` (one fixture), `34-cleanup-two-fixtures.js` (two, items 13/14),
  `41-cleanup-item15-item8.js` (any number, by `stateKeys` — 15/8 used it for B, C, the PDF),
  `27-cleanup-beta6.js`, or `30-close-fixture-tab.js` (nothing imported), then the prefs — volume
  first, settings sync last — `Debug.setStore(false)`, window minimized, `ZoteroTTSRun.api.reset()`.

## Limits

- **`autoUploadSettings: false` does not keep a test pref off the server**: the *shared*
  settings sync is gated by `webdav.syncSettings` alone, and with it on the next reader-close
  logged `settings sync (reader-close): 60 remote, 0 applied, 1 pushed, uploaded` — the beta6
  run's already-restored volume reached the server re-stamped (`by macos`). Switch
  `webdav.syncSettings` off before muting.
- **The derive also runs at plugin start**, not only on a tab open: an in-place install
  re-attaches every open reader, so a named document may already have its item before the
  first diagnostic reads it. Watch the rise on one with none — `23-item8-candidates.js` lists them.
- **A native row's `pos` must carry `type`**: Zotero's `EPUBPositionMapper.sourceToSDTPosition`
  returns null for a position whose `type` isn't `'FragmentSelector'` (reader.js 62506-62509), so
  `deriveSharedFromNative` exits silently — no `derived`/`not derived` line at all. A first
  2026-09-24 attempt's rows carried `pos: {value: <cfi>}` alone (38/39's own bug) and neither
  fixture ever logged a line, which that day's README briefly and wrongly blamed on a missing
  `_internalReader` at `renderToolbar` — item 8 had already passed through that same open path on
  2026-09-22. With 38/39 fixed to keep `pos` whole (`{type, conformsTo, value}`), the beta4-r2
  re-run logged both orders cleanly (Runs).
- **A held shared item never expires locally**: once this machine adopts an item for a Document
  Id, `zotero-tts.sqlite` keeps it forever, and the next reader-open/close of ANY attachment with
  that content re-uploads it to whatever `webdav.url` is current — the owner's real folder, if the
  switch back happened first. Found live 2026-09-24: a beta4 session's crafted `b`-fixture phone
  item (`iPhone-test`, `sha256:493a622…`) was sitting in the owner's real file, from before this
  run (whose own transport stats never synced against the real URL — checked, not this run's
  doing). Left alone, outside the test-folder scope; reported instead. Use a fixture whose
  Document Id this machine has never held (`b-long`, not a short `b` a prior run already opened).
- **Two bridge calls hang with nothing in the error console**: a second
  `Zotero.DBConnection('zotero-tts')` opened from chrome never returns (also leaves the
  connection open — use `diagnostics.position()` instead); that call itself can hang right after
  an in-place install, while Zotero logs `database table is locked` for its own DB — it answered
  a minute later. Race the second one against a timeout.
- **The two resume pulls finish in either order**: `pullBeforeResume` awaits both transports,
  so `position sync (resume)`/`shared position sync (resume)` appear either way round (shared
  first on beta5, native first on beta6-phone) — only `shared position sync (resume)` **before**
  `resumed from the shared position of …` is a contract.
- **The fixture EPUB and its five items are the owner's now** (a cross-product run opens item
  `1/S7TSK97P`/24640, imports/erases nothing). **The toast persists** at `opacity: 0` with its old
  text (`#ztts-speed-toast`) — only `opacity === '1'`, polled during the 900 ms, is evidence.
- **The 60 s failure window**: after an errored sync every poke inside `SHARED_SYNC_RETRY_MS`
  is `skipped` (overwrites `lastOutcome`), though a `flush` (the resume pull) is forced and
  still runs. `14-version-2.js` (closes *and* reopens a tab) reads `skipped`, the erroring run's
  own numbers surviving it; the `error` reading needs `16-single-poke.js` after the wait, `running`
  false first.
- **Item 12's switch-off half belongs on the PDF** (`target: 'pdf'`, `pullBeforePlay` tests the
  switch before it looks for a Document Id). **A second play press has to land early**: the pull
  can finish inside 600 ms, and a press on a session already playing is an ordinary pause
  (106 ms held it; 616 ms measured nothing).
- **Item 11's craft target must not be the book's last block**: `/6/6!/4/2/10` reads to the end
  of the fixture within `17-player-play.js`'s own window, and the manager pauses itself there —
  indistinguishable from a "second toggle" bug in `after.paused`. `unpausedMs` and the segment at
  that timestamp are the real evidence; pick an earlier block for a clean `after.paused: false`.
- **仙逆 (1/9ZY4DDSP) has no positions row**, so neither the backfill nor the derive path names
  it, opened or not (`IOUtils.read` of its 34,453,009 bytes measured 11 ms from chrome). Transient
  `WebDAVError`/`NetworkError` cost two beta5 readings; both were re-taken.
- **A bare `toggleReadAloudPaused()` reads stale for a tick** (`35-read-on-then-pause.js`):
  `pullBeforePlay` runs its own resume pair first, so `paused` still reads `true` right after the
  call — poll it.

## Runs

| Date | Build | Items | Result |
| --- | --- | --- | --- |
| 2026-09-21 | 1.13.2-beta5 (`679460d`), Zotero 10.0.3-beta.3 | 1–7, 9–12 | PASS; **item 8 FAIL** (`sdt.mapper` crosses as an Xray, so `sourceToSDTPosition` is `undefined` and `deriveSharedFromNative` throws). Item 9 passed on substance with `shared.transport.uploaded` reading the previous sync's value. Scripts 01–21 all ran. |
| 2026-09-21 | 1.13.2-beta6 (`d86cc4e`), Zotero 10.0.3-beta.3 | baseline, 8, 9, 12 | PASS. **Item 8 fixed**: four documents derived — two at the install's reader re-attach, two on a tab open (`items` 3 → 4 → 5) — every `stamp.at` equal to its row's `ts`, no `sourceToSDTPosition` error anywhere. Item 9 now reports its own numbers (`uploaded` false, `adopted` 0, the three counts null) and left the file byte-identical. Item 12 (switch off, on the PDF) `unpausedMs` 1, no resume line. Scripts 08, 09, 14, 15, 16, 18, 22–27 ran. |
| 2026-09-21 | 1.13.2-beta6 (`d86cc4e`), Zotero 10.0.3-beta.3 | baseline, 5 with a genuine phone item | PASS. A **real** iPhone item (`iPhone-7xa7iot5`, `epubcfi(/6/6!/4/2/4)`, at 1789998483390) adopted by the `reader-open` poke (`5 remote, 5 merged, 1 adopted`), and Shift+Space spoke its sentence at 3,849 ms — not this machine's row. The desktop then claimed `/6/6!/4/2/6` as `macos` at 1790001263969 and uploaded; the other four items byte-identical, none gone. Item 11 NOT TESTED: the phone stayed idle, so no genuine item newer than the desktop's row ever appeared. Scripts 13, 20, 26, 28, 29, 30 ran. |
| 2026-09-22 | 1.14.1-beta3 (`7b5872e`, the same code merged as `3c6e32e` after 1.14.1 went to #130; issue #129), Zotero 10.0.3-beta.3 | 13, 14, 5, 8, 11, 12 | PASS on every item. Reproduction skipped both checks (1.13.2-beta7, then this run's own earlier 1.14.1-beta install — never 1.14.0). **Item 14**: fixture opened with nothing held (`documents.items` 7→7 unchanged, `.documents` 15→16), craft with no sync between, Shift+Space → `shared position sync (resume): 8 remote, 8 merged, 1 adopted` **before** `resumed from the shared position of iPhone-test: exact`, first segment the crafted sentence exactly. **Item 13**: item crafted and PUT *before* the tab ever opened; the open logged, in order, `document id for 1/89L6N75W: 4413 bytes read, 2 ms` → `document named on open: 1/89L6N75W` → `shared position sync (reader-open): 9 remote, 9 merged, 1 adopted` (`documents` 16→17, `items` 8→9, `.adopted` 1→2); Shift+Space resumed at the crafted sentence. **Item 5**: a newer craft on the now-read fixture 13, adopted by an unrelated PDF tab's open (`shared position sync (reader-open): … 1 adopted`), Shift+Space resumed at the new sentence, not the bare locator's first sentence. **Item 8**: `ZTTS Return-Key EPUB` (24360, a standing fixture, opened/closed read-only) derived — `items` 9→10, `stampEqualsRowTs`/`locatorIsRowBlock` true, no `sourceToSDTPosition` error. **Item 11**: player play pulled a newer craft before resuming (`unpausedMs` 134; segment the crafted sentence at 134 ms, not the paused one); `after.paused` read `true` only because the craft targeted the book's last block — see Limits. **Item 12**: both halves on the PDF, `unpausedMs` 1, no resume line either time. Cleanup removed exactly the two crafted ids, left the item 8 derivation and every owner item (including one that arrived mid-run from the owner's own reading) untouched. Scripts 07, 08, 12, 13, 17, 18, 22–24, 31–34 ran. |
| 2026-09-22 | 1.14.2-beta (`d57530c`, #130's fix already in, issue #129), Zotero 10.0.3-beta.3 | 13, 14 continued — a **genuine** iPhone 16 simulator item, desktop half only | PASS. `fixture-phone-129.epub` imported unopened (`documentsAfterImport` 17 docs/10 items, unchanged by the import) then opened: `document id for 1/AHNLXVZ9: 4296 bytes read, 2 ms` → `document named on open: 1/AHNLXVZ9` → `shared position sync (reader-open): 11 remote, 11 merged, 1 adopted, 0 carried` (`documents` 17→18, `items` 10→11, `.adopted` 0→1); the server file already held the phone's item (`iPhone-a1k1pgrf` at 1790043678191, `epubcfi(/6/2!/4/2/6)`, exact "The second paragraph follows a passenger to the rail.") byte-identical to what the brief reported. Shift+Space resumed at that exact sentence (1,799 ms) then two more ("She counts the buoys as they pass.", "The far shore is still a gray line.") inside `13-resume-shift-space.js`'s own window; `35-read-on-then-pause.js` read on two further segments ("A third paragraph turns to the engine room.", "Pistons rise and fall in oil-dark light.") and paused there — both `position sync (pause)` and `shared position sync (pause)` at 10,994 ms, `uploaded` true on each; the file's item now `stamp.device macos`, `stamp.at` 1790045010392 (later than the phone's), `anchor.exact` the paused sentence, the other ten items byte-identical, none gone. Left **paused, tab open** for a phone reverse-check; `readAloud.volume` 0, `webdav.syncSettings` off and the debug store left set for the follow-up cleanup. **The phone's reverse check** then passed too: it adopted the desktop's place on open and spoke "Pistons rise and fall in oil-dark light." first, and its own pause wrote `iPhone-a1k1pgrf` at 1790046101794, exact "The engineer wipes his hands on a rag." **Desktop cleanup** (`37-close-erase-only.js`, new — closes and erases one fixture without ever PUTting the file, unlike `21`/`34`): `readAloud.volume` restored first (100 / no user value); the fixture tab closed and its attachment erased — the document row and shared item stayed, by design (`documents` 18, `items` 11 unchanged); the close's own `reader-close` sync adopted the phone's newer item with no hand edit to the file (session `.adopted` 1→2); the file read afterward: 4,480 bytes, sha256 `7681518b…`, 11 items, only `11ee6d22…` changed (now the phone's final item), the other ten byte-identical, none gone. `webdav.syncSettings` restored last (`true`/user value, matching the owner's original), `Zotero.Debug.setStore(false)`, window minimized, `ZoteroTTSRun.api.reset()`. Final tabs: the original four, fixture tab gone; the owner's Four Thousand Weeks player untouched (`active:true, paused:true`) throughout. Scripts 13, 26, 28, 32, 33, 35, 36, 37 ran (35, 36, 37 new). |
| 2026-09-24 | 1.14.4-beta4 (`a829ce1`), Zotero 10.0.3-beta.3+80bc5565e | 15 (new, fixture `b-long`), 8 (fixture `c`) | Same-day first attempt NOT TESTABLE on a setup error (see Limits: `pos` missing `type`), superseded. **beta4-r2, PASS on both.** 38/39 fixed to keep `pos` whole. **Item 15**: `b`'s own Document Id came back locally held (a prior run's adoption, never cleared — Limits), so the race used a fresh `b-long` instead. Native row `rowB` T1=1790190162000 synced in first (PDF poke); phone item `iPhone-test` T2=1790190514140 (`epubcfi(/6/156!/4/16)`, chapter 78 paragraph 7 sentence 2) crafted with no sync between; opening `b-long`'s tab (first-ever open, `readyMs` 750) logged `shared position sync (reader-open): 9 remote, 9 merged, 1 adopted` at +648 ms **before** `native row at 1790190162000 not derived for 1/GD73KUDK; held: iPhone-test at 1790190514140` at +690 ms — the required order, first try; `documents.adopted` 1→2. After a further poke, the file's item was still byte-identical to what was crafted, `shared.transport.uploaded` false. **Item 8**: fixture `c` opened once (analysis primed) and closed; native row `rowC` T3=1790198323000 synced in; reopening logged `native row at 1790198323000 derived for 1/YRXHNPAD; held: Xujias-MacBook-Pro-5 at 1790198323000` at +389 ms, `shared position sync (reader-open): 9 remote, 10 merged` at +422 ms (`row-before-sync` — expected, analysis already cached), `shared.documents.items` 9→10; after a poke the file's item read `stamp.at` 1790198323000 exactly, `device` `Xujias-MacBook-Pro-5`, `anchor.exact` "In the c fixture, chapter 1 paragraph 3 sentence 2 moves the story forward a little more today." — no error line either check. A usage-limit pause fell between the two items; re-verified before continuing (build sha256 unchanged, WebDAV/switches/state/tabs all as left, no other run in `ZoteroTTSRun.api.status()`). Cleanup (`41`) erased both fixtures and the PDF, native self-healed 87→85, shared file deny-listed the crafted `b-long` id and a **stale `b`-fixture item this run's own helper-open resurrected onto the test server** (a prior run's local hold, unrelated to the type fix), landing on the pre-existing items plus item 8's own legitimate derivation. **Separately found, not caused by this run and left untouched (outside the test-folder scope): the same stale `b`-fixture phone item (`iPhone-test`, `sha256:493a622…`) already sitting in the owner's REAL `xujialiu-positions.json`** — confirmed pre-existing, since this run's shared-transport stats never recorded a sync against the real URL; reported for the owner/maintainer to remove by hand. Scripts 08, 09, 30–33, 38–42 ran (42 new). |
