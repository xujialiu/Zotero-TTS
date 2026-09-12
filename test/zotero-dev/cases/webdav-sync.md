[Checklist index](../README.md)

## 6. Sync — reading positions and settings over WebDAV (1.10.4; the settings sync 1.11.7)

Against the user's real WebDAV folder; every test file deleted from the
server at the end, every switch restored (bool prefs through
`zotero_execute_js` with `Zotero.Prefs.set(name, false, true)` and a
read-back — `zotero_set_pref` cannot write false). The profile decides
the starting state: on 2026-09-05 and 2026-09-06 both switches were on,
and the folder held five files — the pre-1.11 shared
`zotero-tts-settings.json`, this machine's `_win11`, another machine's
`_macos` (live on the folder: it rewrote its own file during the
2026-09-06 run), an orphan of an earlier rename of this machine, and the
positions file (45 entries on 09-05, 8 of them the erased fixtures of
earlier runs, issue #51; 57 on 09-06 with no fixture leftover) — all
left as found. Those eight predated the tombstones of 1.10.12 and left
the file by one hand-clean on 2026-09-05, which has stuck. Item 2's "first upload creates the
file" is not re-run from absence while the file holds other machines'
entries; the `not-found` branch is proved with a GET of a name that does
not exist (404). Items 3 and 4's crafted entries name the run's own
fixture, never a user document. `readAloud.memory` is not a settings
key, so items 6 and 7 take their settings change from a sync switch.
Items 11–20 (the settings sync, 1.11.7, issue #68) create
`zotero-tts-shared-settings.json` in the same folder and delete it at the
end, clear the undeclared `webdav.syncState` pref the run creates, and
restore every pref they change; the raw file is read and written with a
chrome `fetch` and Basic auth built inside the script, the password never
printed. **Any open Read Aloud player in any tab, paused included, defers
every provider-section item** — item 16 is that behavior, and items 17's
recovery and 20 need no player open anywhere: on 2026-09-10 the user's own
paused player, open in a different tab each time, blocked item 20 on two
passes before the third measured it — ask for it to be closed before the
run. Read the switch, `webdav.syncState` and the shared file at the
baseline and do not assume them clean: between two passes on 2026-09-10
the switch had been turned on again by hand, which re-seeded and put the
profile's keys back into the shared file. The file's raw items are
`{ key, value, ts, by }`; a crafted item is `by: "tester"`, `ts` a little
ahead of `Date.now()` when it should come down, behind this machine's
stamp (`webdav.syncState`) when it should not.

1. **Positions, switch off** (the default): every trigger runs and
   sends nothing — `diagnostics.positionSync()` → `enabled: false`;
   across a tab open and close the transport's `syncs` and
   `lastTrigger` move with `lastOutcome` `skipped` (the counter is
   bumped before the switch is read), while `remoteEntries`, `adopted`,
   `uploaded` and the file's `lastModified` do not.
2. **Switch on** syncs at once (the pref observer): the transport's
   `lastAt`/outcome move, the first upload creates
   `zotero-tts-positions.json` with the store's bookmarks in canonical
   order (`diagnostics.settingsFiles()` lists it); a second sync with
   nothing new uploads nothing.
3. **Merge by recency.** A crafted remote entry newer than the local one
   for a real attachment is adopted (the reader's resume target becomes
   it); a crafted entry for an attachment this machine lacks survives
   every merge in the file and never enters the local store (`rows`
   unchanged).
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
5. **Failure.** An unreachable URL: one reported error within the
   timeout, a back-off window, recovery when the URL is back; the local
   store untouched.
6. **Settings auto-upload, switch off**: a settings change queues
   nothing (`diagnostics.settingsUpload()` → `autoUpload.pending` false
   and `uploads` unmoved 30 s after the change; the machine file absent
   only on a folder that never had one — on a profile that already holds
   `zotero-tts-settings_<id>.json` its `lastModified` does not move).
7. **Switch on**: the change is itself uploaded ~10 s later —
   `autoUpload.uploads` rises, `zotero-tts-settings_<This computer>.json`
   appears in `settingsFiles()` with a `lastModified` matching the
   upload, the backup's `meta.machine` the id; a two-change burst is one
   upload carrying the settled value; *Back up to the server now* writes the
   same file without moving the auto-upload counter.
8. **This computer.** Renaming writes a fresh file and leaves the old
   machine's untouched; renaming back restores; the pre-1.11 unsuffixed
   `zotero-tts-settings.json` is listed as the shared file.
9. **Modal flows** — *Restore settings from server…* (the picker and the
   confirm), *Export/Import reading positions…*, *Backup/Restore
   settings…* — cannot be driven from the bridge (native dialogs block
   its event loop): their substrate is proved headlessly
   (`settingsFiles()` runs the very `list()` the button runs) and the
   click paths are section 8's.
10. **The shutdown flush** (both transports) needs a real quit: not
    testable here; unit-tested.
11. **Settings sync, switch off** (the default): a change of any synced
    setting is stamped at once and nothing leaves —
    `diagnostics.settingsSync()` right after a `Zotero.Prefs.set` of
    `readAloud.volume` → `state.stamps` 1, `state.stamped
    ["readAloud.volume"]`, `transport.pendingChange` false; a reader open
    and a reader close each bump `transport.syncs` with `lastOutcome`
    `skipped`, and 20 s later `sharedSettings()` is still the `not-found`
    WebDAVError.
12. **Switch on seeds the file** (`Zotero.Prefs.set('extensions.zotero.zotero-tts.webdav.syncSettings',
    true, true)`): within a second `lastTrigger "switch-on"`, `lastOutcome
    "ok"`, `uploaded true`, `state.seeded true`, `pushed` = `state.stamps`
    — whatever the profile has non-default at that moment (15 in the
    morning of 2026-09-10, 14 in the afternoon), exactly the synced
    settings that differ from `addon/prefs.js`'s defaults. `sharedSettings()` shows
    the same keys, every `by` the machine id, `apiKey`/`apiToken`/`headers`
    as `<N chars>`, and `settingsFiles()` lists
    `zotero-tts-shared-settings.json`. The exclusions are proved by
    non-default values that stay out: `webdav.syncPositions` and
    `webdav.autoUploadSettings` are both true against a default of false
    and neither is stamped; `system.enabled` never. A second sync with
    nothing new: `uploaded false`, `pushed 0`. The pane's status line
    (`#ztts-sync-settings-status`) reads `Settings synced <time>; nothing new for
    this computer.`
13. **A local change goes up after the quiet period.** A synced setting
    changed with the switch on → `pendingChange true` at once; at 6, 8 and
    9 s `syncs` has not moved; at ~10.8 s `lastTrigger "change"`, `pushed
    1`, `uploaded true`, `pendingChange false`, and the file's item carries
    the new value with `ts` equal to the key's stamp in `webdav.syncState`
    and `by` the machine id.
14. **Merge by recency, all three ways.** Two non-provider keys crafted
    newer (`readAloud.sentenceDelayMs`, `highlight.sentenceAlpha`) → the
    next trigger reports `adopted 2`, `uploaded false`, `lastApplied.applied`
    those keys, `from ["tester"]`; the prefs hold the crafted values, their
    stamps are **the file's** ts, and the file is byte-unchanged. A key
    crafted 5 s **older** than this machine's stamp → `adopted 0`, `pushed
    1`, `uploaded true`, the pref unchanged and the file's item back to
    this machine's value and stamp. Crafted with an **equal** ts and a
    different value → `adopted 0`, `pushed 0`, `uploaded false`, the file
    left exactly as crafted.
15. **A section at a local address neither goes up nor comes down.**
    `local.baseURL` set to `http://127.0.0.1:8880` →
    `settingsSync().heldSections ["local"]` in the same script; a change of
    `local.voice` is still stamped in `webdav.syncState` (stamping is
    unconditional; the filter is the merge's) but the next `change` sync
    reports `pushed 0, uploaded false` and the file gains no `local.voice`.
    A crafted newer `local.voice` → `adopted 0` **and `deferred 0`** — a
    held section never reaches the deferral. Putting a public address back
    is itself a stamped change: the following sync pushes the section again
    (`pushed 2, uploaded true`).
16. **While a tab reads, the player's settings wait.** With a Read Aloud
    player open in any tab (paused counts; `popupOpen` alone counts), a
    sync carrying a newer provider-section key (`azure.voice`) and a newer
    shortcut reports `lastOutcome "deferred"`, `adopted 1`, `deferred 1`,
    `pushed 0`: the shortcut pref is written, the provider key is not, and
    `lastApplied.applied` names only the shortcut; the status line appends
    `1 more wait until the reading stops.` Pushing is never deferred. Once
    no player is open anywhere, the next trigger applies the voice
    (`adopted 1`) and the provider's check runs and passes (`state.held`
    stays `{}`) — the second half is unmeasured as of 2026-09-10.
17. **Failure, back-off and the retry.** `webdav.url` pointed at
    `https://127.0.0.1:9/zotero-tts/`: the next trigger reports
    `lastOutcome "error"` within a second with `lastError` the `WebDAVError:
    Cannot reach …` line and one console entry; a second trigger inside the
    window is `skipped` and logs nothing; the status line reads `Settings
    sync failed <time>: <detail>`. A retry fires **on its own exactly 60 s**
    after the failure (`lastTrigger "retry"`), and with the URL restored
    the next one completes with `lastError` null (`"ok"`, or `"deferred"`
    while a player holds something back). Two console entries per window
    are expected on a profile with *Keep a backup of this computer's
    settings on the server* on: `webdav.url` is in the auto-upload's watched set
    too, and `diagnostics.settingsUpload().autoUpload.lastError` says
    which entry is whose.
18. **Switch off stops the syncing, not the reading.** With the switch
    false a trigger is `skipped` and the shared file's `lastModified` does
    not move, while `sharedSettings()` still downloads it (a plain GET,
    independent of the switch); the status line is empty and hidden.
19. **The status line names the last change here**, not only the last
    sync: opening the pane is itself a trigger whose sync usually finds
    nothing new, so after an adoption the line reads `Settings synced
    <time>; the last change here was <n> from <machine> at <when>.`
    (measured 2026-09-10 before the fix: the applied form lived ~100 ms
    before the pane's own sync replaced it with "nothing new"). The applied
    form itself, `Settings synced <time>: <n> from <machine> applied
    here.`, shows while the pane is already open when a sync adopts.
20. **A provider that fails its check goes off here only** — unmeasured
    live as of 2026-09-10 (blocked by the user's own paused player;
    unit-tested in test/core/settings-sync-transport.test.ts). With no
    player open: craft `<id>.apiKey: "not-a-key"` newer plus `<id>.enabled:
    true` with an older ts for an enabled provider (Azure's check is a free
    REST probe) → the next trigger applies both, the check fails, the pref
    `<id>.enabled` goes false, `state.held.<id>.reason` holds the 401
    wording, `state.stamps["<id>.enabled"]` equals the crafted enabled
    item's ts, `uploaded false` and `sharedSettings()` still shows
    `<id>.enabled: true` — the flip never travels; another trigger adopts
    and checks nothing. Then the real key crafted newer (read into the
    script from the pref, never printed) → applied, `<id>.enabled` back on,
    the check passes, `state.held` `{}`, `uploaded false`.
