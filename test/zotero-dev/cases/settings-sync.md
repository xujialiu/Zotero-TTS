[Checklist index](../README.md) · [Scripts](../scripts/settings-sync/README.md)

## Settings sync over WebDAV (issue #68, 1.11.7)

Against the user's real WebDAV folder; every test file deleted from the
server at the end, every switch restored (bool prefs through
`zotero_execute_js` with `Zotero.Prefs.set(name, false, true)` and a
read-back — `zotero_set_pref` cannot write false). The items create
`zotero-tts-shared-settings.json` in the same folder and delete it at the
end, clear the undeclared `webdav.syncState` pref the run creates, and
restore every pref they change; the raw file is read and written with a
chrome `fetch` and Basic auth built inside the script, the password never
printed. Read the switch, `webdav.syncState` and the shared file at the
baseline and do not assume them clean: between two passes on 2026-09-10
the switch had been turned on again by hand, which re-seeded and put the
profile's keys back into the shared file. The file's raw items are
`{ key, value, ts, by }`; a crafted item is `by: "tester"`, `ts` a little
ahead of `Date.now()` when it should come down, behind this machine's
stamp (`webdav.syncState`) when it should not. Any open Read Aloud player
in any tab, paused included, defers every provider-section item
([synced settings wait while a tab reads](settings-sync-while-reading.md)),
and item 6.17's recovery needs no player open anywhere. Item 3.19 covers
the positions line beside the settings one.

Items 3.19, 6.11–6.15 and 6.17–6.19 of the checklist, under their original
numbers.

### 3.19

19. **Each switch has its own line** (1.11.7-beta5, measured 2026-09-10):
    `#ztts-sync-positions-status` under *Sync reading positions between
    computers*, `#ztts-sync-settings-status` under *Sync settings between
    computers*, each hidden (0 height) while its switch is off; opening
    the pane pokes both transports and both lines move to the new time
    within ~570 ms. With both switches on and nothing new: `Reading
    positions synced <time>; nothing new for this computer.` and `Settings
    synced <time>; nothing new for this computer.`, both `hidden false`.
    The settings line names the last change here, not only the last sync:
    on load the pane first draws the previous sync's form and the pane-open
    sync replaces it at ~200 ms (201 ms measured, then stable for 5 s) —
    after an adoption, `Settings synced 12:50:47 PM; the last change here
    was 1 from tester at 12:50:17 PM.`; while something waits, the
    deferred sentence is appended to whichever form the line carries
    (`… the last change here was 2 from tester at 12:48:07 PM. 1 more wait
    until the reading stops.`). Before the fix the applied form lived
    ~100 ms and "nothing new for this computer" replaced it. The positions
    line's other forms — `… : <n> taken from your other computers.` right
    after an adoption, `… ; the last one from another computer arrived
    <when>.` on later syncs (`positionSync().transport.lastAdoption`),
    `Reading positions sync failed <time>: <detail>` — are unmeasured live
    as of 2026-09-10.

### 6.11

11. **Settings sync, switch off** (the default): a change of any synced
    setting is stamped at once and nothing leaves —
    `diagnostics.settingsSync()` right after a `Zotero.Prefs.set` of
    `readAloud.volume` → `state.stamps` 1, `state.stamped
    ["readAloud.volume"]`, `transport.pendingChange` false; a reader open
    and a reader close each bump `transport.syncs` with `lastOutcome`
    `skipped`, and 20 s later `sharedSettings()` is still the `not-found`
    WebDAVError.

### 6.12

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

### 6.13

13. **A local change goes up after the quiet period.** A synced setting
    changed with the switch on → `pendingChange true` at once; at 6, 8 and
    9 s `syncs` has not moved; at ~10.8 s `lastTrigger "change"`, `pushed
    1`, `uploaded true`, `pendingChange false`, and the file's item carries
    the new value with `ts` equal to the key's stamp in `webdav.syncState`
    and `by` the machine id.

### 6.14

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

### 6.15

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

### 6.17

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

### 6.18

18. **Switch off stops the syncing, not the reading.** With the switch
    false a trigger is `skipped` and the shared file's `lastModified` does
    not move, while `sharedSettings()` still downloads it (a plain GET,
    independent of the switch); the status line is empty and hidden.

### 6.19

19. **The status line names the last change here**, not only the last
    sync: opening the pane is itself a trigger whose sync usually finds
    nothing new, so after an adoption the line reads `Settings synced
    <time>; the last change here was <n> from <machine> at <when>.`
    (measured 2026-09-10 before the fix: the applied form lived ~100 ms
    before the pane's own sync replaced it with "nothing new"). The applied
    form itself, `Settings synced <time>: <n> from <machine> applied
    here.`, shows while the pane is already open when a sync adopts.
