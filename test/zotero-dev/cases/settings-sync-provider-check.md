[Checklist index](../README.md) · [Scripts](../scripts/settings-sync-provider-check/README.md)

## A synced provider that fails its check goes off here only (issue #68, 1.11.7)

Runs on the setup of [settings sync](settings-sync.md): the same WebDAV
folder, shared file, `webdav.syncState` handling and crafted items. No
player may be open anywhere: on 2026-09-10 the user's own paused player,
open in a different tab each time, blocked the check on two passes before
the third measured it — ask for it to be closed before the run. Item 3.20
supersedes 6.20: the same behavior, measured on 1.11.7-beta5. Follow 3.20's
recipe (the file's `enabled` item left at the seed's ts); 6.20's older
`enabled` ts is not a resting state.

Items 3.20 and 6.20 of the checklist, under their original numbers.

### 3.20

20. **A provider that fails its check goes off here only** — measured
    2026-09-10 on 1.11.7-beta5 with no player open (blocked on the two
    passes before by the owner's own paused player). Keep the real key
    first — the file's own body at the baseline, or the machine backup —
    because the adoption overwrites the local pref and it cannot be read
    from `azure.apiKey` afterwards. Craft `azure.apiKey: "not-a-key"` at
    `Date.now()+1000`, `by: "tester"`, and **leave the file's own
    `azure.enabled: true` item at the seed's ts** (equal to the machine's
    stamp; an older ts is not a resting state — `mergeSharedSettings` would
    push the local `true` back up and the flip would repeat on every
    trigger). The `reader-open` trigger applies both within 1.2 s
    (`lastApplied.applied ["azure.apiKey","azure.enabled"]`, `adopted 1`),
    the pref `azure.enabled` goes false, `state.held.azure.reason` is
    `Connection failed: Azure voices returned 401`,
    `state.stamps["azure.enabled"]` equals the file item's ts, `pushed 0`,
    `uploaded false`, and `sharedSettings()` still shows `azure.enabled:
    true` — the flip never travels. The next trigger (`reader-close`) is
    `adopted 0`, `pushed 0`, `uploaded false`, `lastApplied` unchanged: no
    check ran. Then the real key at `Date.now()+2000` → applied again
    (`["azure.apiKey","azure.enabled"]`), `azure.enabled` true,
    `state.held {}`, `uploaded false`. On a profile with *Keep a backup of
    this computer's settings on the server* on, expect one `settings
    auto-upload: 62 settings …` per pref the run moves.

### 6.20

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
