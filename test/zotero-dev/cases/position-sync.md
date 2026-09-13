[Checklist index](../README.md) · [Scripts](../scripts/position-sync/README.md)

## Reading position sync over WebDAV (issues #40, #51; 1.10.4)

Against the user's real WebDAV folder; every test file deleted from the
server at the end, every switch restored (bool prefs through
`zotero_execute_js` with `Zotero.Prefs.set(name, false, true)` and a
read-back — `zotero_set_pref` cannot write false). The profile decides the
starting state: on 2026-09-05 and 2026-09-06 both switches — reading
position sync and the settings auto-upload — were on, and the folder held
five files — the pre-1.11 shared `zotero-tts-settings.json`, this machine's
`_win11`, another machine's `_macos` (live on the folder: it rewrote its own
file during the 2026-09-06 run), an orphan of an earlier rename of this
machine, and the positions file (45 entries on 09-05, 8 of them the erased
fixtures of earlier runs, issue #51; 57 on 09-06 with no fixture leftover) —
all left as found. Those eight predated the tombstones of 1.10.12 and left
the file by one hand-clean on 2026-09-05, which has stuck. Item 6.2's "first
upload creates the file" is not re-run from absence while the file holds
other machines' entries; the `not-found` branch is proved with a GET of a
name that does not exist (404). Items 6.3 and 6.4's crafted entries name the
run's own fixture, never a user document.

Items 6.1–6.5 and 6.10 of the checklist, under their original numbers.

### 6.1

1. **Positions, switch off** (the default): every trigger runs and
   sends nothing — `diagnostics.positionSync()` → `enabled: false`;
   across a tab open and close the transport's `syncs` and
   `lastTrigger` move with `lastOutcome` `skipped` (the counter is
   bumped before the switch is read), while `remoteEntries`, `adopted`,
   `uploaded` and the file's `lastModified` do not.

### 6.2

2. **Switch on** syncs at once (the pref observer): the transport's
   `lastAt`/outcome move, the first upload creates
   `zotero-tts-positions.json` with the store's bookmarks in canonical
   order (`diagnostics.settingsFiles()` lists it); a second sync with
   nothing new uploads nothing.

### 6.3

3. **Merge by recency.** A crafted remote entry newer than the local one
   for a real attachment is adopted (the reader's resume target becomes
   it); a crafted entry for an attachment this machine lacks survives
   every merge in the file and never enters the local store (`rows`
   unchanged).

### 6.4

4. **Deletion leaves the file** (issue #51, 1.10.12). With the switch on
   and the run's fixture read, closed and in the file: `eraseTx()` → at
   once `positionSync().localEntries` down by one and `tombstones` up by
   one (`position().store.deletions` the same count); the erase itself
   pokes one sync — `transport.lastTrigger` `delete`, `dropped` 1,
   `uploaded` true, the log line `… 1 dropped, uploaded` — and the file
   no longer holds the key; `database.rows` down by one within ~10 s.
   Then a copy of the entry put back into the file by hand: the next sync
   (a tab open or close) drops it again, `dropped` 1, `uploaded` true,
   `rows` unchanged. The same erase with the fixture's tab still open
   ends the same way — Zotero closes the tab first, the `trace` shows
   `tab.onClose fired` before the notifier, and the row and the entry are
   gone afterwards; which of the two syncs drops the entry is a race on
   where the notifier yields (2026-09-06: the `reader-close` sync logged
   `1 dropped, uploaded` and the trailing `delete` sync was a no-op), so
   check the pair, not the trigger name. The tombstone is this machine's
   alone: the
   downloaded file parses to real entries only. Before 1.10.12 the
   erased key came back from the sampler's map at the next sync.

### 6.5

5. **Failure.** An unreachable URL: one reported error within the
   timeout, a back-off window, recovery when the URL is back; the local
   store untouched.

### 6.10

10. **The shutdown flush** (both transports) needs a real quit: not
    testable here; unit-tested.
