[Checklist index](../README.md) · [Scripts](../scripts/document-positions/README.md)

## The Positions File shared with OpenReader (issue #126; 1.13.2)

Against the test WebDAV folder (`MEMORY/testing.md`, Test WebDAV first),
never the owner's own, under the same switch as the plugin's own positions
file (`Sync reading positions between computers`): every crafted item and
every test file deleted from the server at the end, the switch restored,
every tab closed. The file is
`xujialiu-positions.json` (docs/spec/SYNC-FORMAT.md, section 6): items keyed
by Document Id, canonical compact JSON, nothing ever removed. The fixture
is an EPUB of the run's own — never a user document — and nothing plays
out loud: the simulator rule applies to the desktop too, volume down before
the first Read Aloud. Diagnostics: `Zotero.ZoteroTTS.diagnostics.positionSync()`
(`shared.documents`, `shared.transport`), `.position()` (`database`, `store`),
`.settingsFiles()`; the log lines are grepped for `[zotero-tts]`.

### 1

1. **Schema 3 at startup.** `position()` → `database.userVersion` 3,
   `store.schemaVersion` 3, `store.state` `open`, `database.rows` the
   count from before the update (nothing lost); `positionSync().shared`
   present with `file` `xujialiu-positions.json`, `documents.documents` a
   number, `transport` a stats object.

### 2

2. **The upgrade backfill** runs once before the first sync with the switch
   on: the log has `document ids backfilled: N named, M not, of K EPUB
   rows` with K the EPUB attachments that had a row, and one
   `document id for <lib>/<key>: <bytes> bytes read, <ms> ms` per named
   row — record the line for 仙逆 (34,453,009 bytes), the measurement the
   notes still lack. `shared.documents.documents` equals N afterwards;
   `unnamed` equals M; a second sync logs no backfill.

### 3

3. **Capture.** Open the fixture EPUB, Read Aloud two sentences, pause:
   `shared.documents.items` ≥ 1 within a tick; after the next sync the
   file (GET it) holds one item whose `id` is the fixture's Document Id —
   computed independently with `node -e` over `src/core/document-id`
   (`documentIdOf(bytesAsArchive(readFileSync(path)))`) — whose `locator`
   matches `^epubcfi\(/6/\d*[02468]!(/\d*[02468])+\)$` (no `[`, `:` or
   `,`), whose `anchor.exact` is the sentence the player showed, and whose
   `stamp.device` is this machine's id (`settingsUpload().machine`).

### 4

4. **Upload only on change, and carry-through.** With the file in place, a
   sync with nothing new (open and close a tab) → `shared.transport`:
   `lastOutcome` `ok`, `uploaded` false. Put an item with `format` `pdf`
   and a fresh id into the file by hand (canonical order is not required
   of the hand edit): the next sync uploads (`uploaded` true, `carried` 1)
   and the file still holds the pdf item, byte-identical fields, in id
   order. `settingsFiles()` lists the file.

### 5

5. **Adopt a phone's item and resume from it.** Craft an item for the
   fixture with `stamp.at` above the file's current one, `stamp.device`
   `iPhone-test`, the locator of a paragraph later in the book (an element
   CFI taken from `_sdt.mapper._blockEntries[i].path`) and `anchor.exact`
   equal to that paragraph's second sentence. Put it in the file, open or
   close a tab: `shared.transport.adopted` 1, `shared.documents.adopted`
   1, the log `… 1 adopted`. Then Shift+Space in the fixture's tab: the
   log shows `shared position sync (resume)` before `resumed from the
   shared position of iPhone-test: exact`, and the player's segment is
   that second sentence — not the paragraph's first, which is what the
   bare locator would have given. `transport.adopted` is per run: a later
   sync that takes nothing resets it to 0, while `documents.adopted` (the
   session's count) and `transport.lastAdoption` (when and how many, last
   time anything was taken) keep it (observed 2026-09-21).

### 6

6. **An item that cannot be found falls back and says so.** Craft an item
   newer again whose `anchor.exact` is a sentence not in the book: Shift+Space
   → the toast `The place reached on your other device was not found in
   this copy; resuming from this computer's last sentence.`, the log
   `shared position from iPhone-test not resolved: …, not-found`, and Read
   Aloud starts at this machine's own last sentence.

### 7

7. **A pause syncs after ten quiet seconds.** Read Aloud playing; pause:
   within 10–13 s the log shows `position sync (pause)` and `shared
   position sync (pause)`, and both transports' `lastTrigger` are `pause`.
   Two pauses within ten seconds produce one pair.

### 8

8. **A row from before this build gets its item on open.** For an EPUB
   read aloud before the update (a `positions` row, no item): open its
   tab → within a few seconds `shared.documents.items` rises by one and,
   after the next sync, the file's item for it carries `stamp.at` equal to
   the row's `ts` (compare with `position().readers[i].stored` timing or
   the row), with `anchor.exact` the sentence the row named. No error line
   from `deriveSharedFromNative` in the log (2026-09-21's beta5 threw
   `sdt.mapper.sourceToSDTPosition is not a function` here: the mapper is
   an Xray wrapper, waived since beta6).

### 9

9. **A newer version is left alone.** Replace the file with
   `{"format":"xujialiu-positions","version":2,"items":[]}`: the next sync
   → `shared.transport.lastOutcome` `error`, `lastError` naming `version
   2`, `uploaded` false and `adopted` 0 by construction (an erroring run
   reports its own numbers; `remoteItems`, `carried`, `dropped` null);
   the plugin's own positions file keeps syncing (`transport.lastOutcome`
   `ok`). Restore the file afterwards.

### 11

11. **The player's play pulls first.** With the fixture playing, pause it
    from the player; craft an item newer than the file's, `stamp.device`
    `iPhone-test`, for a later paragraph's second sentence (as in item 5),
    put it in the file; press the player's play: the log shows `shared
    position sync (resume)` (and `position sync (resume)`) before
    `resumed from the shared position of iPhone-test: exact`, the segment
    that speaks is the phone's sentence — not the one the pause left —
    and the player shows playing (`_readAloudManager.paused` false), with
    no second toggle: it does not fall back to paused. A second press on
    play within the two seconds does nothing extra. With the item's
    `anchor.exact` a sentence not in the book instead: the toast of item 6,
    then play continues from the paused sentence.

### 12

12. **Play with sync off is immediate.** Switch off, pause, press play:
    playback continues at once from the paused sentence, and the log has
    no `shared position sync (resume)` line after the press; the same with
    the switch on for a PDF (no Document Id, nothing to pull for).

### 13

13. **A book read on the phone alone resumes at the phone's place** (issue
    #129; 1.14.2). A fixture EPUB this computer has never opened — a fresh
    import, so `shared.documents.documents` does not count it — and, before
    its tab opens, an item for its Document Id in the file: `stamp.device`
    `iPhone-test`, a later paragraph's locator and its second sentence as
    `anchor.exact`, as in item 5. Open the tab: the log has `document id
    for <lib>/<key>: … bytes read, … ms`, then `document named on open:
    <lib>/<key>`, then `shared position sync (reader-open): N remote, N
    merged, 1 adopted`; `shared.documents.documents` rose by one and
    `shared.documents.adopted` by one. Shift+Space: `shared position sync
    (resume)` before `resumed from the shared position of iPhone-test:
    exact`, and the first spoken segment is that second sentence. On
    1.14.0 the same steps log no `document named` line, `0 adopted` on the
    open, no `resumed from` line, and Read Aloud starts at the book's first
    sentence — the bug.

### 14

14. **An item that arrives while the tab is open is pulled by Shift+Space**
    (issue #129; 1.14.2). A never-read fixture open with nothing held for it
    — the file had no item for it when the tab opened, `shared.documents.items`
    unchanged by the open — then the item of item 13 put into the file and
    no sync in between: Shift+Space logs `shared position sync (resume): …
    1 adopted` before `resumed from the shared position of iPhone-test:
    exact`, and the first spoken segment is the phone's sentence. On 1.14.0
    the key falls through to Zotero's own start with no `(resume)` sync line.

### 15

15. **A phone's item adopted while the document analysis loads stands**
    (issue #138; 1.14.4). The window is the derivation's wait for the
    document analysis at a tab's first open, which is long only when Zotero
    has not built it for the attachment yet. Set up, in this order: a
    fixture EPUB imported fresh and never opened, of a Document Id this
    machine has never held (a fixture an earlier run used keeps its item
    for good); a native row for it at `ts` T1, its `pos` Zotero's whole
    selector with its `type` (spec section 5; without it the derivation
    stops silently), put into `zotero-tts-positions.json` as another
    computer's row and taken by a sync of that file before anything else
    (`position()` shows it stored); only then an item for its Document Id in
    the Positions File at T2 > T1, `stamp.device` `iPhone-test`, a later
    paragraph's locator and its second sentence as `anchor.exact` (as in
    item 5), with no sync between that and the open. Open the fixture's tab
    and wait for both lines: `shared position sync (reader-open): … 1
    adopted` comes **before** `native row at T1 not derived for
    <lib>/<key>; held: iPhone-test at T2`. That order is the proof: the
    adoption landed inside the wait and the check at the write refused. The
    item held is then `iPhone-test` at T2 and nothing of this machine's;
    after the next sync (open and close another tab) the file's item for
    the Document Id is still `iPhone-test` at T2, and `uploaded` is false.
    The other order — `native row at T1 derived for …; held: <machine id>
    at T1` before `… 1 adopted` — means the analysis loaded before the sync
    landed: the end state is the same, but the window was not exercised, so
    the check is repeated with a longer fixture, and it passes only in the
    order above. Measured on beta4 (2026-09-24, an 80-chapter fixture):
    the sync's line at 648 ms, the row's at 690 ms after the open. Before
    1.14.4-beta4 the window's order ended with the row's sentence held at
    T2 + 1 by this machine and uploaded (a unit test, not run live).

### 16

16. **A file a third writer left is written back in the one form** (issue
    #139; 1.14.4). Save the server's `xujialiu-positions.json` as found (or
    note it absent), then put `test/fixtures/xujialiu-positions.v1.carried.json`
    there byte for byte: eight items with Document Ids no device holds — keys
    out of order, keys the spec does not list, missing fields, an empty `id`,
    a text-step locator, an empty `device` — and two with no string `id`.
    Nothing is adopted from it, so this machine's store is untouched
    (`shared.documents.items` the same before and after). Open and close a
    tab: the log has `shared position sync (…): 8 remote, N merged, 0
    adopted, 6 carried, 2 dropped, uploaded`, and `shared.transport` shows
    `dropped` 2, `carried` 6, `uploaded` true. GET the file: its items with
    the fixture's ids, the `""` one first, are in id order byte for byte the
    items of `test/fixtures/xujialiu-positions.v1.carried.canonical.json`
    (the file's other items are this machine's own, which every sync puts
    there). A second sync: `uploaded` false. 1.14.4-beta4 on the same file
    logs `7 remote` and `3 dropped`, leaves the `""` item out and writes
    `"publicationId":null` into the item that lacks it — the bug. The file
    goes back as found (item 10).

### 10

10. **Restoration.** The crafted items and the version-2 file deleted from
    the server, the file left as the run found it (or absent when the run
    created it), the switch as found, the fixture's tab closed, the rows
    the run created erased with the fixture (its Document Id row and item
    stay — nothing removes an item, by design). An item this machine
    adopted or derived for a fixture stays in its store, and the first
    sync after the owner's folder is restored uploads it there (2026-09-24:
    the first beta4 run's crafted `b` item did): the report names every
    fixture Document Id left held.
