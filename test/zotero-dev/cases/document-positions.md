[Checklist index](../README.md) · [Scripts](../scripts/document-positions/README.md)

## The Positions File shared with OpenReader (issue #126; 1.13.2)

Against the user's real WebDAV folder, under the same switch as the
plugin's own positions file (`Sync reading positions between computers`):
every crafted item and every test file deleted from the server at the end,
the switch restored, every tab closed. The file is
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

### 10

10. **Restoration.** The crafted items and the version-2 file deleted from
    the server, the file left as the run found it (or absent when the run
    created it), the switch as found, the fixture's tab closed, the rows
    the run created erased with the fixture (its Document Id row and item
    stay — nothing removes an item, by design).
